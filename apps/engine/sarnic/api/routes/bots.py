"""Bot yönetimi — §15 / §10.

Durum geçişleri burada yapılır; süreçleri `BotSupervisor` yönetir. API bir botu
"çalıştır" dediğinde yaptığı tek şey durumu `PAPER_RUNNING` yapmaktır; süpervizör
10 saniye içinde süreci ayağa kaldırır. Bu ayrım bilinçlidir — API'nin çökmesi
çalışan botları etkilemez.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from sarnic.api.deps import BusDep, CurrentUser, RedisDep, RequireTrader, SessionDep, write_audit
from sarnic.api.schemas import BotCreate, BotEventOut, BotOut, BotUpdate, FleetRowOut
from sarnic.core.enums import BotState, EventKind, OrderSide, PositionStatus, Role
from sarnic.data.marketdata import read_tickers
from sarnic.db.models import Bot, BotEvent, Position, StrategyVersion, Trade

router = APIRouter(prefix="/bots", tags=["bots"])

# Panelde gösterilen geçiş kuralları — geçersiz geçiş 409 döner.
ALLOWED: dict[str, set[BotState]] = {
    "start": {BotState.DRAFT, BotState.PAUSED, BotState.STOPPED, BotState.DEGRADED},
    "pause": {BotState.PAPER_RUNNING, BotState.DEGRADED},
    "stop": {BotState.PAPER_RUNNING, BotState.PAUSED, BotState.DEGRADED, BotState.ERROR},
    "kill": {
        BotState.PAPER_RUNNING,
        BotState.PAUSED,
        BotState.DEGRADED,
        BotState.ERROR,
        BotState.STOPPED,
    },
}


def _yon(p: Position) -> int:
    """positions.side → +1 uzun / −1 kısa (eski satırlar BUY)."""
    return OrderSide(p.side).direction if p.side else 1


async def _to_out(
    session, bot: Bot, prices: dict[str, float], positions: list[Position] | None = None
) -> BotOut:
    if positions is None:
        positions = (
            (
                await session.execute(
                    select(Position).where(
                        Position.bot_id == bot.id, Position.status == PositionStatus.OPEN
                    )
                )
            )
            .scalars()
            .all()
        )
    # Özsermaye işaretli değerle: kısa pozisyon negatif (ödünç varlık borcu).
    deger = sum(
        _yon(p) * float(p.qty) * prices.get(p.symbol, float(p.entry_price)) for p in positions
    )
    tanim = bot.strategy_version.definition or {}
    return BotOut(
        id=bot.id,
        name=bot.name,
        owner_id=bot.owner_id,
        strategy_version_id=bot.strategy_version_id,
        mode=str(bot.mode),
        state=bot.state,
        timeframe=bot.timeframe,
        market=str((tanim.get("universe") or {}).get("market", "CRYPTO")),
        direction=str((tanim.get("entry") or {}).get("direction", "LONG")),
        capital=float(bot.capital),
        cash=float(bot.cash),
        equity=float(bot.cash) + deger,
        open_positions=len(positions),
        last_heartbeat_at=bot.last_heartbeat_at,
        halt_reason=bot.halt_reason,
        entries_blocked_until=bot.entries_blocked_until,
        created_at=bot.created_at,
    )


async def _prices(redis) -> dict[str, float]:
    tickers = await read_tickers(redis)
    return {s: float(t["last_price"]) for s, t in tickers.items()}


def _owns(user, bot: Bot) -> bool:
    return user.role == Role.ADMIN or bot.owner_id == user.id


@router.get("", response_model=list[BotOut])
async def list_bots(session: SessionDep, redis: RedisDep, user: CurrentUser) -> list[BotOut]:
    bots = (await session.execute(select(Bot).order_by(Bot.id))).scalars().all()
    prices = await _prices(redis)
    # N+1 yerine tek sorgu: 20 bot × 15 sn = dakikada 80 gereksiz tur.
    acik = (
        (await session.execute(select(Position).where(Position.status == PositionStatus.OPEN)))
        .scalars()
        .all()
    )
    bot_pozisyon: dict[int, list[Position]] = {b.id: [] for b in bots}
    for p in acik:
        bot_pozisyon.setdefault(p.bot_id, []).append(p)
    return [await _to_out(session, b, prices, bot_pozisyon.get(b.id, [])) for b in bots]


#: Maraton başlangıcı — `settings` grubu `marathon` yoksa bu (defter: 2026-08-31).
MARATHON_START_FALLBACK = datetime(2026, 8, 31, 22, 15, 29, tzinfo=UTC)


def _iso(value, default: datetime) -> datetime:
    """ISO damga → datetime; boş ya da bozuksa `default` (sessizce sıfır değil)."""
    if not value:
        return default
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return default


def _rebase_of(bot: Bot, marathon_start: datetime) -> datetime:
    return _iso((bot.config or {}).get("rebased_at"), marathon_start)


def _streak(pnls_desc: list[float], limit: int = 20) -> int:
    """`portfolio.consecutive_losses` ile aynı kural, bellekte (N+1 yok)."""
    streak = 0
    for pnl in pnls_desc[:limit]:
        if pnl < 0:
            streak += 1
        else:
            break
    return streak


@router.get("/fleet", response_model=list[FleetRowOut])
async def fleet(session: SessionDep, redis: RedisDep, user: CurrentUser) -> list[FleetRowOut]:
    """Filo defteri — her kol için bir satır, üç sorguyla (bot, açık pozisyon, işlem).

    `/bots` yalnız kimlik ve özsermaye verir; Köprü'nün tablosu getiri
    pencereleri, kazanma oranı, seri ve nabız istiyor. Bunları panelde
    işlem listesinden türetmek 1000 satırlık `/trades` çekmek demekti ve
    kol sayısı arttıkça kesiliyordu. Tek uç, tek doğruluk.
    """
    from sarnic.core.settings_store import load_group

    now = datetime.now(UTC)
    meta = await load_group(session, "marathon")
    marathon_start = _iso(meta.get("start"), MARATHON_START_FALLBACK)

    bots = (await session.execute(select(Bot).order_by(Bot.id))).scalars().all()
    prices = await _prices(redis)
    acik = (
        (await session.execute(select(Position).where(Position.status == PositionStatus.OPEN)))
        .scalars()
        .all()
    )
    pozisyonlar: dict[int, list[Position]] = {}
    for p in acik:
        pozisyonlar.setdefault(p.bot_id, []).append(p)

    # İşlemler: en eski pencere başlangıcından (re-base'lerin en erkeni ya da
    # 7 gün) bu yana; kol başına bellekte ayrıştırılır.
    rebases = {b.id: _rebase_of(b, marathon_start) for b in bots}
    alt_sinir = min([now - timedelta(days=7), *rebases.values()])
    # Pozisyonun AÇILIŞ zamanı da alınır: re-base tasfiyesi damgadan hemen sonra
    # kaydedildiği için yalnız çıkışa bakan bir süzgeç eski dönemin zararını yeni
    # kola yazıyordu (bot 5: +7,16 $ yerine +25,43 $).
    islemler = (
        await session.execute(
            select(Trade.bot_id, Trade.pnl, Trade.pnl_r, Trade.exit_time, Position.entry_time)
            .join(Position, Position.id == Trade.position_id)
            .where(Trade.exit_time >= alt_sinir)
            .order_by(Trade.exit_time.desc())
        )
    ).all()
    bot_islem: dict[int, list[tuple[float, float, datetime, datetime]]] = {}
    for bot_id, pnl, pnl_r, at, giris in islemler:
        bot_islem.setdefault(bot_id, []).append((float(pnl), float(pnl_r or 0), at, giris))

    gun_basi = now.replace(hour=0, minute=0, second=0, microsecond=0)
    out: list[FleetRowOut] = []
    for bot in bots:
        tanim = bot.strategy_version.definition or {}
        sizing = tanim.get("sizing") or {}
        cfg = bot.config or {}
        rebase = rebases[bot.id]
        rows = pozisyonlar.get(bot.id, [])
        deger = sum(
            _yon(p) * float(p.qty) * prices.get(p.symbol, float(p.entry_price)) for p in rows
        )
        brut = sum(float(p.qty) * prices.get(p.symbol, float(p.entry_price)) for p in rows)
        unrealized = sum(
            _yon(p)
            * (prices.get(p.symbol, float(p.entry_price)) - float(p.entry_price))
            * float(p.qty)
            for p in rows
        )
        cash = float(bot.cash)
        equity = cash + deger
        capital = float(bot.capital)
        peak = max(float(bot.equity_peak or 0), equity, capital if rebase else 0.0)

        # İşlem pencereleri: liste zaten yeniye göre sıralı.
        tum = bot_islem.get(bot.id, [])
        # Katılımdan beri: pozisyon damgadan SONRA açılmış olmalı (tasfiye hariç).
        since = [t for t in tum if t[3] >= rebase]
        pnls = [t[0] for t in since]
        rs = [t[1] for t in since]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]
        gross_loss = abs(sum(losses))

        isim = bot.name or ""
        group = (
            "arsiv" if isim.startswith("ARŞİV") else ("deney" if cfg.get("deney") else "maraton")
        )
        out.append(
            FleetRowOut(
                id=bot.id,
                name=bot.name,
                state=bot.state,
                group=group,
                market=str((tanim.get("universe") or {}).get("market", "CRYPTO")),
                timeframe=bot.timeframe,
                direction=str((tanim.get("entry") or {}).get("direction", "LONG")),
                deney=bool(cfg.get("deney")),
                agresif=bool(cfg.get("agresif")),
                kisa=bool(cfg.get("kisa")),
                capital=capital,
                cash=cash,
                equity=equity,
                exposure=brut,
                exposure_pct=(brut / equity) if equity > 0 else None,
                open_positions=len(rows),
                open_long=sum(1 for p in rows if _yon(p) > 0),
                open_short=sum(1 for p in rows if _yon(p) < 0),
                open_leveraged=sum(1 for p in rows if float(p.leverage or 1) > 1),
                unrealized_pnl=unrealized,
                realized_today=sum(t[0] for t in tum if t[2] >= gun_basi),
                realized_24h=sum(t[0] for t in tum if t[2] >= now - timedelta(hours=24)),
                realized_7d=sum(t[0] for t in tum if t[2] >= now - timedelta(days=7)),
                realized_since_rebase=sum(pnls),
                return_pct=(equity / capital - 1) if capital > 0 else None,
                drawdown_pct=(equity / peak - 1) if peak > 0 else None,
                trades=len(since),
                win_rate=(len(wins) / len(since)) if since else None,
                avg_r=(sum(rs) / len(rs)) if rs else None,
                profit_factor=(sum(wins) / gross_loss) if gross_loss > 0 else None,
                consecutive_losses=_streak(pnls),
                max_leverage=float((sizing.get("leverage") or {}).get("max_leverage", 1.0)),
                risk_pct=float(sizing.get("risk_pct", 0.01)),
                rebased_at=rebase,
                last_bar_at=bot.last_bar_at,
                last_heartbeat_at=bot.last_heartbeat_at,
                heartbeat_age_s=(
                    (now - bot.last_heartbeat_at).total_seconds() if bot.last_heartbeat_at else None
                ),
                entries_blocked_until=bot.entries_blocked_until,
                halt_reason=bot.halt_reason,
            )
        )
    return out


@router.post("", response_model=BotOut, status_code=status.HTTP_201_CREATED)
async def create_bot(
    payload: BotCreate,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    user: RequireTrader,
) -> BotOut:
    version = (
        await session.execute(
            select(StrategyVersion).where(StrategyVersion.id == payload.strategy_version_id)
        )
    ).scalar_one_or_none()
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Strateji versiyonu bulunamadı.")

    bot = Bot(
        name=payload.name,
        owner_id=user.id,
        strategy_version_id=version.id,
        timeframe=payload.timeframe,
        capital=Decimal(str(payload.capital)),
        cash=Decimal(str(payload.capital)),
        equity_peak=Decimal(str(payload.capital)),
        state=BotState.DRAFT,
    )
    session.add(bot)
    await session.flush()
    await write_audit(session, request, user.id, "bot.create", target=str(bot.id))
    await session.commit()
    return await _to_out(session, bot, await _prices(redis))


@router.get("/{bot_id}", response_model=BotOut)
async def get_bot(bot_id: int, session: SessionDep, redis: RedisDep, user: CurrentUser) -> BotOut:
    bot = await _load(session, bot_id)
    return await _to_out(session, bot, await _prices(redis))


@router.patch("/{bot_id}", response_model=BotOut)
async def update_bot(
    bot_id: int,
    payload: BotUpdate,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    user: RequireTrader,
) -> BotOut:
    bot = await _load(session, bot_id)
    if not _owns(user, bot):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu bot size ait değil.")
    if bot.state == BotState.PAPER_RUNNING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Çalışan bot düzenlenemez. Önce duraklatın.")
    if payload.name is not None:
        bot.name = payload.name
    if payload.capital is not None:
        bot.capital = Decimal(str(payload.capital))
        if bot.state == BotState.DRAFT:
            bot.cash = Decimal(str(payload.capital))
            bot.equity_peak = Decimal(str(payload.capital))
    if payload.strategy_version_id is not None:
        # Strateji sürümünü değiştirmek, botun işlem geçmişini ve açık
        # pozisyonlarını koruyarak kural setini değiştirir. Yeni bot açmak da
        # aynı sonucu verirdi ama özsermaye eğrisini böler; uzun bir deneyde
        # ölçüm sürekliliği bundan daha değerlidir.
        #
        # Yalnızca dondurulmuş sürüm bağlanır: taslak sürüm altımızdan
        # değişebilir ve o botun hangi kurallarla işlem yaptığı geriye dönük
        # olarak belirsizleşir.
        version = await session.get(StrategyVersion, payload.strategy_version_id)
        if version is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Strateji sürümü bulunamadı.")
        if not version.frozen:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Yalnızca dondurulmuş sürüm bağlanabilir. Önce sürümü dondurun.",
            )
        bot.strategy_version_id = version.id
    await write_audit(session, request, user.id, "bot.update", target=str(bot.id))
    await session.commit()
    return await _to_out(session, bot, await _prices(redis))


@router.post("/{bot_id}/start", response_model=BotOut)
async def start_bot(
    bot_id: int,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    bus: BusDep,
    user: RequireTrader,
) -> BotOut:
    return await _transition(
        session,
        redis,
        bus,
        request,
        user,
        bot_id,
        "start",
        BotState.PAPER_RUNNING,
        "Bot başlatıldı.",
    )


@router.post("/{bot_id}/pause", response_model=BotOut)
async def pause_bot(
    bot_id: int,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    bus: BusDep,
    user: RequireTrader,
) -> BotOut:
    return await _transition(
        session,
        redis,
        bus,
        request,
        user,
        bot_id,
        "pause",
        BotState.PAUSED,
        "Bot duraklatıldı. Yeni giriş yapılmayacak; açık pozisyonlar çıkış "
        "kurallarına göre yönetilmeye devam ediyor.",
    )


@router.post("/{bot_id}/stop", response_model=BotOut)
async def stop_bot(
    bot_id: int,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    bus: BusDep,
    user: RequireTrader,
) -> BotOut:
    return await _transition(
        session,
        redis,
        bus,
        request,
        user,
        bot_id,
        "stop",
        BotState.STOPPED,
        "Bot durduruldu. Açık pozisyonlar korunuyor.",
    )


@router.post("/{bot_id}/kill", response_model=BotOut)
async def kill_bot(
    bot_id: int,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    bus: BusDep,
    user: RequireTrader,
) -> BotOut:
    """Sert durdurma: worker durur. Pozisyonlar KAPATILMAZ (kapatma worker'ın
    işidir; öksüz kalır — OPEN-QUESTIONS §re-base). Metin gerçeği söyler.
    """
    bot = await _load(session, bot_id)
    if not _owns(user, bot):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu bot size ait değil.")

    bot.state = BotState.STOPPED
    bot.halt_reason = "KILL"
    session.add(
        BotEvent(
            bot_id=bot.id,
            kind="bot.kill",
            level="CRITICAL",
            payload={"by": user.email, "at": datetime.now(UTC).isoformat()},
        )
    )
    await bus.emit(
        EventKind.BOT_STATE_CHANGED,
        level="CRITICAL",
        bot_id=bot.id,
        state=str(BotState.STOPPED),
        message=(
            f"{bot.name} sert durduruldu. Açık pozisyonlar KAPATILMADI — öksüz kaldı; "
            "Pozisyonlar sayfasından elle kapatın."
        ),
    )
    await write_audit(session, request, user.id, "bot.kill", target=str(bot.id))
    await session.commit()
    return await _to_out(session, bot, await _prices(redis))


@router.get("/{bot_id}/events", response_model=list[BotEventOut])
async def bot_events(
    bot_id: int, session: SessionDep, user: CurrentUser, limit: int = 200
) -> list[BotEventOut]:
    rows = (
        await session.execute(
            select(BotEvent)
            .where(BotEvent.bot_id == bot_id)
            .order_by(BotEvent.created_at.desc())
            .limit(min(limit, 1000))
        )
    ).scalars()
    return [BotEventOut.model_validate(r) for r in rows]


@router.get("/{bot_id}/metrics")
async def bot_metrics(bot_id: int, session: SessionDep, user: CurrentUser) -> dict:
    from sarnic.bots.portfolio import equity_curve, trade_stats

    return {
        "stats": await trade_stats(session, bot_id),
        "equity_curve": await equity_curve(session, bot_id),
    }


# --------------------------------------------------------------------------- #
async def _load(session, bot_id: int) -> Bot:
    bot = (await session.execute(select(Bot).where(Bot.id == bot_id))).scalar_one_or_none()
    if bot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot bulunamadı.")
    return bot


async def _transition(
    session,
    redis,
    bus,
    request,
    user,
    bot_id: int,
    action: str,
    target: BotState,
    message: str,
) -> BotOut:
    bot = await _load(session, bot_id)
    if not _owns(user, bot):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu bot size ait değil.")
    if bot.state not in ALLOWED[action]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{bot.state} durumundaki bir bot için '{action}' geçerli değil.",
        )
    if action == "start" and bot.halt_reason in ("WEEKLY_LOSS", "MAX_DRAWDOWN"):
        # §8: bu iki devre kesici manuel yeniden başlatma gerektirir — ama bu
        # bilinçli bir insan kararı olduğu için engellemiyor, kaydediyoruz.
        session.add(
            BotEvent(
                bot_id=bot.id,
                kind="bot.manual_restart_after_breaker",
                level="WARN",
                payload={"breaker": bot.halt_reason, "by": user.email},
            )
        )
    if action == "start":
        bot.halt_reason = None
        bot.entries_blocked_until = None

    bot.state = target
    session.add(
        BotEvent(
            bot_id=bot.id,
            kind=str(EventKind.BOT_STATE_CHANGED),
            payload={"state": str(target), "by": user.email, "message": message},
        )
    )
    await bus.emit(
        EventKind.BOT_STATE_CHANGED,
        bot_id=bot.id,
        state=str(target),
        message=f"{bot.name}: {message}",
    )
    await write_audit(session, request, user.id, f"bot.{action}", target=str(bot.id))
    await session.commit()
    return await _to_out(session, bot, await _prices(redis))


async def running_count(session) -> int:
    return int(
        (
            await session.execute(
                select(func.count(Bot.id)).where(
                    Bot.state.in_([BotState.PAPER_RUNNING, BotState.DEGRADED])
                )
            )
        ).scalar_one()
    )
