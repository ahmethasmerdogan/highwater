"""Portföy muhasebesi — DB'den okunur, bellekte tutulmaz.

Bozulmaz kural (§10): "Yeniden başlatmada durum DB'den kurtarılır — bellekte
pozisyon tutulmaz." Bu modül o kurtarmanın tek kaynağıdır.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.enums import OrderSide, PositionStatus
from sarnic.db.models import Bot, EquityPoint, Position, Trade


@dataclass(slots=True)
class OpenPosition:
    id: int
    symbol: str
    qty: float
    entry_price: float
    entry_time: datetime
    stop: float
    initial_stop: float
    score_at_entry: float
    breakeven_locked: bool
    mfe: float = 0.0
    mae: float = 0.0
    entry_fees: float = 0.0
    #: Kısmi çıkışlardan birikmiş net sonuç ve ödenen komisyon.
    realized_pnl: float = 0.0
    realized_fees: float = 0.0
    leverage: float = 1.0
    partial_done: bool = False
    entry_qty: float = 0.0
    realized_points: float = 0.0
    #: +1 uzun, −1 kısa (positions.side). Notional brüttür; değer ve kâr işaretli.
    direction: int = 1

    def notional(self, price: float) -> float:
        return self.qty * price

    def market_value(self, price: float) -> float:
        """Özsermayeye katkı: kısa pozisyon negatif (ödünç varlık borcu)."""
        return self.direction * self.qty * price

    def unrealized(self, price: float) -> float:
        return self.direction * (price - self.entry_price) * self.qty


@dataclass(slots=True)
class PortfolioSnapshot:
    bot_id: int
    cash: float
    positions: list[OpenPosition] = field(default_factory=list)
    prices: dict[str, float] = field(default_factory=dict)
    equity_start_of_day: float = 0.0
    equity_start_of_week: float = 0.0
    equity_peak: float = 0.0
    consecutive_losses: int = 0

    @property
    def exposure(self) -> float:
        return sum(p.notional(self.prices.get(p.symbol, p.entry_price)) for p in self.positions)

    @property
    def equity(self) -> float:
        return self.cash + sum(
            p.market_value(self.prices.get(p.symbol, p.entry_price)) for p in self.positions
        )

    @property
    def symbols(self) -> set[str]:
        return {p.symbol for p in self.positions}

    def exposures(self) -> dict[str, float]:
        return {
            p.symbol: p.notional(self.prices.get(p.symbol, p.entry_price)) for p in self.positions
        }

    def score_pairs(self) -> list[tuple[str, float]]:
        return [(p.symbol, p.score_at_entry) for p in self.positions]

    def find(self, symbol: str) -> OpenPosition | None:
        return next((p for p in self.positions if p.symbol == symbol), None)


async def load_open_positions(session: AsyncSession, bot_id: int) -> list[OpenPosition]:
    rows = (
        await session.execute(
            select(Position)
            .where(Position.bot_id == bot_id, Position.status == PositionStatus.OPEN)
            .order_by(Position.entry_time)
        )
    ).scalars()
    return [
        OpenPosition(
            id=p.id,
            symbol=p.symbol,
            qty=float(p.qty),
            entry_price=float(p.entry_price),
            entry_time=p.entry_time,
            stop=float(p.stop),
            initial_stop=float(p.initial_stop),
            score_at_entry=float(p.score_at_entry),
            breakeven_locked=p.breakeven_locked,
            direction=OrderSide(p.side).direction if p.side else 1,
            partial_done=bool(getattr(p, "partial_done", False)),
            entry_qty=float(p.entry_qty or 0),
            realized_points=float(p.realized_points or 0),
            mfe=float(p.mfe),
            mae=float(p.mae),
            entry_fees=float(p.entry_fees),
            realized_pnl=float(p.realized_pnl),
            realized_fees=float(p.realized_fees),
            leverage=float(p.leverage or 1.0),
        )
        for p in rows
    ]


async def consecutive_losses(
    session: AsyncSession,
    bot_id: int,
    limit: int = 20,
    strategy_version_id: int | None = None,
    since: datetime | None = None,
) -> int:
    """Son kapanan işlemlerden geriye doğru kaç tanesi zararla kapandı?

    `strategy_version_id` verilirse seri **yalnızca o sürümün** işlemlerini
    sayar. Bir zarar serisi ancak tek bir kural kümesi içinde anlamlıdır;
    sürüm değiştiğinde eski kuralların kayıpları yeni kuralı cezalandırmamalı.
    Bu tam olarak yaşandı: dar stop ayarının 9 kaybı yüzünden yeni ayar daha
    ilk barında 6 saat duraklatıldı.
    """
    stmt = select(Trade.pnl).where(Trade.bot_id == bot_id)
    if strategy_version_id is not None:
        stmt = stmt.where(Trade.strategy_version_id == strategy_version_id)
    if since is not None:
        # Çekilmiş ceza SERİYİ AFFEDER: blokaj süresi dolduktan sonra sayaç
        # blokaj anından sonraki işlemlerle başlar. Aksi hâlde 6 saatlik
        # duraklatma biter bitmez aynı eski seri kesiciyi yeniden tetikler ve
        # bot bir daha hiç işlem yapamazdı (sürüm-değişimi affı ile aynı ilke).
        stmt = stmt.where(Trade.exit_time > since)
    rows = (await session.execute(stmt.order_by(Trade.exit_time.desc()).limit(limit))).scalars()
    streak = 0
    for pnl in rows:
        if float(pnl) < 0:
            streak += 1
        else:
            break
    return streak


async def equity_at(
    session: AsyncSession,
    bot_id: int,
    moment: datetime,
    fallback: float,
    not_before: datetime | None = None,
) -> float:
    """`moment` anındaki (veya öncesindeki son) özsermaye.

    `not_before`: sermaye re-base'inden ÖNCEKİ noktalar farklı taban
    cinsindendir ve çapa olamaz — süzülür, bulunamazsa `fallback` (yeni
    sermaye) döner.
    """
    stmt = (
        select(EquityPoint.equity)
        .where(EquityPoint.bot_id == bot_id, EquityPoint.at <= moment)
        .order_by(EquityPoint.at.desc())
        .limit(1)
    )
    if not_before is not None:
        stmt = stmt.where(EquityPoint.at > not_before)
    value = (await session.execute(stmt)).scalar_one_or_none()
    return float(value) if value is not None else fallback


async def load_snapshot(
    session: AsyncSession,
    bot: Bot,
    prices: dict[str, float],
    *,
    now: datetime | None = None,
) -> PortfolioSnapshot:
    now = now or datetime.now(UTC)
    positions = await load_open_positions(session, bot.id)
    snapshot = PortfolioSnapshot(
        bot_id=bot.id,
        cash=float(bot.cash),
        positions=positions,
        prices=prices,
        equity_peak=float(bot.equity_peak),  # re-base varsa aşağıda klemplenir
    )
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = day_start - timedelta(days=day_start.weekday())
    # Sermaye tabanı dıştan değiştiyse (ör. maraton sıfırlaması) eski taban
    # cinsinden özsermaye noktaları kayıp çapası OLAMAZ: 2985→400 sıfırlaması
    # WEEKLY_LOSS'a "−%87 kayıp" gibi göründü ve 8 botu maratonun ikinci
    # dakikasında durdurdu. Re-base anı bot.config.rebased_at'ta kayıtlıdır;
    # çapalar bu anın gerisine bakmaz (re-base anına taze nokta yazılır).
    rebase_raw = (bot.config or {}).get("rebased_at")
    rebase_at = datetime.fromisoformat(rebase_raw) if rebase_raw else None

    async def _anchor(moment: datetime) -> float:
        # Çapa re-base'in gerisindeyse dürüst taban yeni sermayenin kendisidir;
        # ilerisindeyse de re-base ÖNCESİ noktalar (eski taban) süzülür.
        if rebase_at is not None and moment <= rebase_at:
            return float(bot.capital)
        return await equity_at(session, bot.id, moment, float(bot.capital), not_before=rebase_at)

    snapshot.equity_start_of_day = await _anchor(day_start)
    snapshot.equity_start_of_week = await _anchor(week_start)
    if rebase_at is not None:
        # Eski taban cinsinden tepe, MAX_DRAWDOWN kill'ini ilk barda tetiklerdi
        # (2985→400'de −%87 "düşüş"). Tepe = re-base sonrası noktaların en yükseği,
        # en az yeni sermaye.
        tepe = (
            await session.execute(
                select(func.max(EquityPoint.equity)).where(
                    EquityPoint.bot_id == bot.id, EquityPoint.at >= rebase_at
                )
            )
        ).scalar_one_or_none()
        snapshot.equity_peak = max(float(bot.capital), float(tepe or 0.0))
    snapshot.consecutive_losses = await consecutive_losses(
        session,
        bot.id,
        strategy_version_id=bot.strategy_version_id,
        since=bot.entries_blocked_until,
    )
    return snapshot


async def record_equity(
    session: AsyncSession, bot: Bot, snapshot: PortfolioSnapshot, at: datetime
) -> None:
    """Özsermaye eğrisine bir nokta ekler ve tepe değerini günceller.

    **Upsert**, `insert` değil: bot yeniden başladığında aynı bar yeniden
    işlenebilir. Eskiden her işleyiş yeni bir satır yazıyor, panel eğrileri
    topladığı için özsermaye o anda üç katına fırlıyordu (`uq_equity_point`).
    Aynı an için son hesap doğru olandır; üzerine yazılır.
    """
    equity = snapshot.equity
    stmt = pg_insert(EquityPoint).values(
        bot_id=bot.id,
        at=at,
        equity=Decimal(str(round(equity, 8))),
        cash=Decimal(str(round(snapshot.cash, 8))),
        exposure=Decimal(str(round(snapshot.exposure, 8))),
        open_positions=len(snapshot.positions),
    )
    await session.execute(
        stmt.on_conflict_do_update(
            constraint="uq_equity_point",
            set_={
                "equity": stmt.excluded.equity,
                "cash": stmt.excluded.cash,
                "exposure": stmt.excluded.exposure,
                "open_positions": stmt.excluded.open_positions,
            },
        )
    )
    if equity > float(bot.equity_peak):
        bot.equity_peak = Decimal(str(round(equity, 8)))
        snapshot.equity_peak = equity


async def trade_stats(session: AsyncSession, bot_id: int, *, since: datetime | None = None) -> dict:
    """Panel için özet — kazanma oranı, profit factor, ortalama R, çıkış dağılımı.

    `since` verilmezse botun **katılım damgası** (`config.rebased_at`) kullanılır.
    Bu şart: re-base bir kolun sermayesini ve ölçüm penceresini sıfırlar; öncesindeki
    işlemleri karneye katmak paneli yanıltır. Ölçüldü (2026-09-04, bot 1): filtresiz
    karne 32 işlem / +483,41 $ / +1,264R gösteriyordu, maraton gerçeği 3 işlem /
    +0,95 $ / −0,068R. Kullanıcı bu sayıya bakarak kol karşılaştırıyor.
    """
    if since is None:
        bot = (await session.execute(select(Bot).where(Bot.id == bot_id))).scalar_one_or_none()
        damga = (bot.config or {}).get("rebased_at") if bot is not None else None
        if damga:
            since = datetime.fromisoformat(damga)
    stmt = select(Trade.pnl, Trade.pnl_r, Trade.exit_reason, Trade.fees).where(
        Trade.bot_id == bot_id
    )
    if since is not None:
        stmt = stmt.where(Trade.exit_time >= since)
    rows = (await session.execute(stmt)).all()
    if not rows:
        return {
            "trades": 0,
            "win_rate": None,
            "profit_factor": None,
            "expectancy_r": None,
            "avg_r": None,
            "total_pnl": 0.0,
            "total_fees": 0.0,
            "exit_reasons": {},
        }

    pnls = [float(r[0]) for r in rows]
    r_multiples = [float(r[1]) for r in rows]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    gross_win, gross_loss = sum(wins), abs(sum(losses))

    reasons: dict[str, int] = {}
    for _, _, reason, _ in rows:
        reasons[reason] = reasons.get(reason, 0) + 1

    return {
        "trades": len(rows),
        "win_rate": len(wins) / len(rows),
        "profit_factor": (gross_win / gross_loss) if gross_loss > 0 else None,
        "expectancy_r": sum(r_multiples) / len(r_multiples),
        "avg_r": sum(r_multiples) / len(r_multiples),
        "total_pnl": sum(pnls),
        "total_fees": sum(float(r[3]) for r in rows),
        "exit_reasons": reasons,
    }


def combine_curves(curves: list[list[dict]]) -> list[dict]:
    """Bot eğrilerini tek portföy eğrisine toplar.

    **Sadece çakışan zaman damgalarını toplamak yanlıştır.** Bir bot diğerinden
    sonra başladıysa (ya da bir barı kaçırdıysa), o anda yalnızca mevcut
    noktalar toplanır ve portföy özsermayesi gerçekte olmayan bir düşüş
    gösterir. Doğrusu **ileri doldurmadır**: her botun bilinen son değeri, yeni
    bir noktası gelene kadar geçerlidir.

    Bir bot henüz hiç nokta yazmamışsa toplama katılmaz — sıfır saymak,
    başlamamış bir botu "her şeyini kaybetmiş" gibi gösterirdi.

    `at` alanı `equity_curve`'den **ISO dizesi** olarak gelir. Sıralama ve
    karşılaştırma dize üzerinde yapılır; sabit ofsetli ISO-8601 damgalarında
    sözlük sırası kronolojik sırayla aynıdır. (`datetime` de kabul edilir.)
    """

    # Damga biçimi tek olmalı: Pydantic "Z", elle isoformat() "+00:00"
    # üretir ve iki biçim tek eğride karışırsa DİZE sıralaması sessizce
    # bozulur ("Z" > "+"). Normalize et — sıralama varsayımı ancak böyle
    # güvenli.
    def _norm(at: str) -> str:
        return at.replace("Z", "+00:00") if isinstance(at, str) else at

    for curve in curves:
        for point in curve:
            point["at"] = _norm(point["at"])
    moments = sorted({point["at"] for curve in curves for point in curve})
    if not moments:
        return []

    cursors = [0] * len(curves)
    last: list[dict | None] = [None] * len(curves)

    out: list[dict] = []
    for moment in moments:
        for index, curve in enumerate(curves):
            while cursors[index] < len(curve) and curve[cursors[index]]["at"] <= moment:
                last[index] = curve[cursors[index]]
                cursors[index] += 1
        live = [point for point in last if point is not None]
        out.append(
            {
                "at": moment,
                "equity": sum(p["equity"] for p in live),
                "cash": sum(p["cash"] for p in live),
                "exposure": sum(p["exposure"] for p in live),
            }
        )
    return out


async def equity_curve(session: AsyncSession, bot_id: int, limit: int = 5000) -> list[dict]:
    rows = (
        await session.execute(
            select(EquityPoint.at, EquityPoint.equity, EquityPoint.cash, EquityPoint.exposure)
            .where(EquityPoint.bot_id == bot_id)
            .order_by(EquityPoint.at)
            .limit(limit)
        )
    ).all()
    return [
        {
            "at": at.isoformat(),
            "equity": float(equity),
            "cash": float(cash),
            "exposure": float(exposure),
        }
        for at, equity, cash, exposure in rows
    ]


async def portfolio_totals(session: AsyncSession) -> dict:
    """Tüm botların toplamı — panel üst çubuğu için."""
    open_count = (
        await session.execute(
            select(func.count(Position.id)).where(Position.status == PositionStatus.OPEN)
        )
    ).scalar_one()
    return {"open_positions": int(open_count)}
