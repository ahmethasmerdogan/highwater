"""Pozisyon, işlem, emir ve portföy uçları — §15."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from sarnic.api.deps import CurrentUser, RedisDep, SessionDep
from sarnic.api.schemas import OrderOut, PositionOut, TradeOut
from sarnic.bots.benchmark import build_benchmark, normalize
from sarnic.bots.portfolio import combine_curves, equity_curve, trade_stats
from sarnic.config import settings
from sarnic.core.clock import utcnow
from sarnic.core.enums import PositionStatus
from sarnic.data.marketdata import read_tickers
from sarnic.db.models import Bot, Order, Position, SpreadSample, Trade
from sarnic.universe.engine import UniverseEngine

METRICS_CACHE_KEY = "sarnic:cache:portfolio-metrics"

router = APIRouter(tags=["portfolio"])


@router.get("/positions", response_model=list[PositionOut])
async def positions(
    session: SessionDep,
    redis: RedisDep,
    user: CurrentUser,
    bot_id: int | None = None,
    status_filter: str = "OPEN",
    limit: int = 500,
) -> list[PositionOut]:
    stmt = select(Position)
    if bot_id is not None:
        stmt = stmt.where(Position.bot_id == bot_id)
    if status_filter in ("OPEN", "CLOSED"):
        stmt = stmt.where(Position.status == status_filter)
    # Kardeşleri /trades ve /orders limit alıyor; burası sessizce 500'de
    # kesiyordu. Üst sınır sabit: tek istekle tabloyu boşaltmak yok.
    limit = max(1, min(limit, 2000))
    rows = (await session.execute(stmt.order_by(Position.entry_time.desc()).limit(limit))).scalars()

    tickers = await read_tickers(redis)
    out: list[PositionOut] = []
    for p in rows:
        last = tickers.get(p.symbol)
        price = float(last["last_price"]) if last else None
        entry = float(p.entry_price)
        unrealized = (price - entry) * float(p.qty) if price is not None else None
        out.append(
            PositionOut(
                id=p.id,
                bot_id=p.bot_id,
                symbol=p.symbol,
                qty=float(p.qty),
                entry_price=entry,
                entry_time=p.entry_time,
                stop=float(p.stop),
                initial_stop=float(p.initial_stop),
                score_at_entry=float(p.score_at_entry),
                breakeven_locked=p.breakeven_locked,
                leverage=float(p.leverage or 1.0),
                status=str(p.status),
                last_price=price,
                unrealized_pnl=unrealized,
                unrealized_pct=(price / entry - 1) if price and entry else None,
                rationale_id=p.rationale_id,
            )
        )
    return out


@router.get("/trades", response_model=list[TradeOut])
async def trades(
    session: SessionDep, user: CurrentUser, bot_id: int | None = None, limit: int = 200
) -> list[TradeOut]:
    stmt = select(Trade)
    if bot_id is not None:
        stmt = stmt.where(Trade.bot_id == bot_id)
    rows = (
        await session.execute(stmt.order_by(Trade.exit_time.desc()).limit(min(limit, 1000)))
    ).scalars()
    return [
        TradeOut(
            id=t.id,
            bot_id=t.bot_id,
            symbol=t.symbol,
            exit_price=float(t.exit_price),
            exit_time=t.exit_time,
            exit_reason=t.exit_reason,
            pnl=float(t.pnl),
            pnl_r=float(t.pnl_r),
            fees=float(t.fees),
            leverage=float(t.leverage or 1.0),
            slippage_bps=float(t.slippage_bps),
            mfe=float(t.mfe),
            mae=float(t.mae),
            hold_hours=float(t.hold_hours),
        )
        for t in rows
    ]


@router.get("/orders", response_model=list[OrderOut])
async def orders(
    session: SessionDep, user: CurrentUser, bot_id: int | None = None, limit: int = 200
) -> list[OrderOut]:
    stmt = select(Order)
    if bot_id is not None:
        stmt = stmt.where(Order.bot_id == bot_id)
    rows = (
        await session.execute(stmt.order_by(Order.created_at.desc()).limit(min(limit, 1000)))
    ).scalars()
    return [
        OrderOut(
            id=o.id,
            bot_id=o.bot_id,
            symbol=o.symbol,
            type=str(o.type),
            side=str(o.side),
            qty=float(o.qty),
            filled_qty=float(o.filled_qty),
            avg_fill_price=float(o.avg_fill_price) if o.avg_fill_price else None,
            status=str(o.status),
            reject_reason=o.reject_reason,
            fees=float(o.fees),
            slippage_bps=float(o.slippage_bps),
            created_at=o.created_at,
            filled_at=o.filled_at,
        )
        for o in rows
    ]


@router.get("/portfolio/equity")
async def equity(session: SessionDep, user: CurrentUser, bot_id: int | None = None) -> dict:
    if bot_id is not None:
        return {"bot_id": bot_id, "curve": await equity_curve(session, bot_id)}

    bots = (await session.execute(select(Bot.id, Bot.name).order_by(Bot.id))).all()
    per_bot = [
        {"bot_id": bid, "name": name, "curve": await equity_curve(session, bid)}
        for bid, name in bots
    ]
    # Toplam eğri **sunucuda** hesaplanır: panelin yaptığı "aynı zaman
    # damgalarını topla" yaklaşımı, botların noktaları hizalanmadığında
    # portföyü olduğundan düşük gösteriyordu. Tek doğru hesap, tek yerde.
    return {"bots": per_bot, "total": combine_curves([b["curve"] for b in per_bot])}


@router.get("/portfolio/benchmark")
async def benchmark(
    session: SessionDep, redis: RedisDep, user: CurrentUser, since: datetime | None = None
) -> dict:
    """Botlar, aynı havuzun eşit ağırlıklı sepetini yenebiliyor mu? (§5.5)

    Faz 0a'nın 3. testi buydu ve sistem o testte kaybetmişti; canlı panel ise
    yalnızca "+%0,29" diyordu. Bir getiri, alternatifi olmadan hiçbir şey ifade
    etmez. Bu uç alternatifi aynı pencerede, aynı veriyle hesaplar.

    Sepete maliyet uygulanmaz — al-ve-tut bir kez alır; devir maliyeti
    stratejinin kendi yüküdür ve kıyastan düşülmesi tabloyu botların lehine
    çevirirdi.
    """
    # 60 sn Redis önbelleği (metrics ile aynı desen): bot × 5000 nokta hesabı
    # üç sayfadan 120-300 sn'de bir yoklanıyordu.
    cache_key = f"{METRICS_CACHE_KEY}:benchmark:{since.isoformat() if since else 'all'}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    payload = await _benchmark_compute(session, since)
    await redis.set(cache_key, json.dumps(payload, default=str), ex=60)
    return payload


async def _benchmark_compute(session, since: datetime | None) -> dict:
    bots = (await session.execute(select(Bot.id, Bot.name).order_by(Bot.id))).all()
    curves = {bid: await equity_curve(session, bid) for bid, _ in bots}

    # `since`: tüm eğriler aynı ana yeniden tabanlanır. Bunsuz her bot kendi
    # İLK noktasından normalize edilir — 15 Ağustos'ta başlayan kontrollerle
    # 26 Ağustos'ta fonlanan meydan okuma aynı grafiğe konunca kontrollere
    # 11 günlük avans veriliyordu.
    if since is not None:
        since_iso = since.isoformat()
        curves = {bid: [p for p in curve if p["at"] >= since_iso] for bid, curve in curves.items()}
    points = [p for curve in curves.values() for p in curve]
    if not points:
        return {"start": None, "end": None, "benchmark": [], "bots": [], "note": NO_DATA_NOTE}

    # `equity_curve` zamanı ISO **dizesi** olarak döndürür (API sözleşmesi);
    # burada gerçek `datetime` gerekiyor çünkü sorgu ve fiyat penceresi
    # zamanla karşılaştırılıyor.
    start = datetime.fromisoformat(min(p["at"] for p in points))
    end = datetime.fromisoformat(max(p["at"] for p in points))

    # Havuz **başlangıç anındaki** hâliyle alınır: bugünün havuzunu geçmişe
    # uygulamak hayatta kalma yanlılığı üretir (§11).
    symbols = await UniverseEngine().current_symbols(session, at=start)
    curve = await build_benchmark(session, symbols, start, end)

    # Örneklem yeterli mi? Bir günlük fark, altı işlemle "strateji çalışıyor"
    # demek için hiçbir dayanak sunmaz. Kalibrasyon sayfası bu disiplini
    # uyguluyor; kıyas kutusu da uygulamak zorunda — aksi halde panel gürültüyü
    # başarı diye gösterir.
    span_days = (end - start).total_seconds() / 86_400
    trade_count = (await session.execute(select(func.count()).select_from(Trade))).scalar_one() or 0
    sufficient = span_days >= MIN_BENCHMARK_DAYS and trade_count >= MIN_BENCHMARK_TRADES

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "span_days": round(span_days, 2),
        "trades": trade_count,
        "sufficient": sufficient,
        "verdict": (
            None
            if sufficient
            else (
                f"Örneklem yetersiz — {MIN_BENCHMARK_DAYS} gün ve "
                f"{MIN_BENCHMARK_TRADES} işlem gerekiyor; şu an "
                f"{span_days:.1f} gün ve {trade_count} işlem var. "
                "Aşağıdaki fark gürültü olabilir."
            )
        ),
        "universe_size": len(symbols),
        "benchmark": [
            {"at": p.at.isoformat(), "value": p.value, "symbols": p.symbols} for p in curve
        ],
        "bots": [
            {
                "bot_id": bid,
                "name": name,
                # `at` zaten ISO dizesi (`equity_curve`); `normalize` ona
                # dokunmaz. Tekrar `isoformat()` çağırmak hataydı.
                "curve": normalize(curves[bid]),
            }
            for bid, name in bots
        ],
        "note": (
            "Sepet: havuzdaki her sembolden eşit miktarda alıp tutmak, yeniden "
            "dengeleme yok, maliyet yok. Botlar bunu yenemiyorsa sıralama değer "
            "katmıyor demektir."
        ),
    }


NO_DATA_NOTE = "Henüz özsermaye kaydı yok; kıyas için en az bir bar kapanışı gerekiyor."

# Kıyas sonucunun bir şey ifade etmesi için gereken en az örneklem.
# Kalibrasyondaki (500 gözlem / 30 gün) mantığın portföy karşılığı: birkaç
# saatlik fark tamamen gürültüdür ve panel bunu başarı diye göstermemeli.
MIN_BENCHMARK_DAYS = 30
MIN_BENCHMARK_TRADES = 30


@router.get("/portfolio/costs")
async def costs(session: SessionDep, user: CurrentUser) -> dict:
    """İşlem maliyetinin brüt kâra oranı — "maliyet mi yiyor?" sorusunun cevabı.

    Faz 0a maliyetin 478 günde sermayenin dörtte üçünü yediğini ölçmüştü.
    Canlı sistemde bu oranın **sürekli görünmesi** gerekir; aksi halde net
    sonuca bakıp "strateji kötü" ya da "strateji iyi" demek yanıltıcı olur.
    """
    rows = (
        await session.execute(
            select(Trade.bot_id, Trade.pnl, Trade.fees, Trade.slippage_bps, Trade.symbol)
        )
    ).all()
    if not rows:
        return {"trades": 0, "gross_pnl": 0.0, "fees": 0.0, "net_pnl": 0.0, "cost_ratio": None}

    fees = sum(float(r[2]) for r in rows)
    net = sum(float(r[1]) for r in rows)
    # `pnl` komisyon **düşülmüş** hâldir; brüt = net + komisyon.
    gross = net + fees
    slippage = [float(r[3]) for r in rows if r[3] is not None]

    return {
        "trades": len(rows),
        "gross_pnl": gross,
        "fees": fees,
        "net_pnl": net,
        # Brüt kârın yüzde kaçı maliyete gitti? Brüt zarardaysa oran anlamsız.
        "cost_ratio": (fees / gross) if gross > 0 else None,
        "avg_slippage_bps": (sum(slippage) / len(slippage)) if slippage else None,
        "max_slippage_bps": max(slippage) if slippage else None,
        # **Önemli ayrım:** yukarıdaki kayma, kağıt motorun kendi modelinden
        # gelir (`paper_extra_slippage_bps` varsayımı dahil) — bağımsız bir
        # ölçüm değildir. Aşağıdaki spread ise Binance'ten toplanan gerçek
        # `bookTicker` verisidir ve varsayım içermez.
        "measured_spread": await spread_stats(session),
        "note": (
            "Kayma, kağıt motorun modelinden gelir; varsayım içerir. Spread "
            "gerçek emir defterinden ölçülür."
        ),
    }


async def spread_stats(session, hours: int = 24) -> dict:
    """Havuzdaki sembollerin gerçek spread dağılımı (baz puan).

    Faz 0a maliyet modeli 15 bps tek yön **varsayıyordu** ve bu varsayım
    `TRIAL-LEDGER.md` #4'te "doğrulanmalı" diye işaretlenmişti. Sistem artık
    her 5 dakikada bir gerçek `bookTicker` örneği topluyor; varsayımı ölçümle
    değiştirmemek için bir sebep kalmadı.

    `spread_pct` yüzde olarak saklanır (`(ask−bid)/mid × 100`); baz puana
    çevirmek için 100 ile çarpılır.
    """
    symbols = await UniverseEngine().current_symbols(session)
    if not symbols:
        return {"samples": 0}

    since = utcnow() - timedelta(hours=hours)
    values = (
        (
            await session.execute(
                select(SpreadSample.spread_pct).where(
                    SpreadSample.symbol.in_(symbols), SpreadSample.sampled_at >= since
                )
            )
        )
        .scalars()
        .all()
    )
    if not values:
        return {"samples": 0}

    bps = sorted(float(v) * 100 for v in values)

    def percentile(fraction: float) -> float:
        return bps[min(len(bps) - 1, int(len(bps) * fraction))]

    median = percentile(0.5)
    return {
        "samples": len(bps),
        "symbols": len(symbols),
        "hours": hours,
        "avg_bps": sum(bps) / len(bps),
        "median_bps": median,
        "p90_bps": percentile(0.9),
        # Mid'den karşı tarafa geçmenin maliyeti spread'in **yarısıdır**.
        "half_spread_bps": median / 2,
        # Gerçekçi tek yön maliyet: komisyon + yarı spread.
        "one_way_bps": settings.paper_taker_fee * 10_000 + median / 2,
        "assumed_one_way_bps": 15.0,
    }


@router.get("/portfolio/live")
async def live(session: SessionDep, redis: RedisDep, user: CurrentUser) -> dict:
    """Canlı kâr/zarar — yüksek frekansla çağrılmak için **hafif** uç.

    `/portfolio/metrics` her bot için işlem istatistiği (kazanma oranı, profit
    factor, çıkış dağılımı) hesaplıyor; bu saniyede bir çağrılamayacak kadar
    pahalı. Panelin üst şeridi "şu an ne kadar kârdayım" sorusunu sürekli
    cevaplamak zorunda (Bloomberg şeridi gibi), bu yüzden yalnızca fiyatla
    değişen alanlar burada.

    Gerçekleşmemiş k/z **canlı fiyattan** hesaplanır; gerçekleşen k/z bugün
    kapanan işlemlerin toplamıdır. İkisi ayrı tutulur: açık pozisyonun kârı
    henüz cebe girmemiştir ve bunu tek sayıda birleştirmek yanıltıcı olur.
    """
    tickers = await read_tickers(redis)
    prices = {s: float(t["last_price"]) for s, t in tickers.items()}

    bots = (await session.execute(select(Bot))).scalars().all()
    open_rows = (
        (await session.execute(select(Position).where(Position.status == PositionStatus.OPEN)))
        .scalars()
        .all()
    )

    day_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    realized_today = float(
        (
            await session.execute(
                select(func.coalesce(func.sum(Trade.pnl), 0)).where(Trade.exit_time >= day_start)
            )
        ).scalar_one()
        or 0
    )

    per_bot = []
    equity = cash = exposure = unrealized = 0.0
    for bot in bots:
        rows = [p for p in open_rows if p.bot_id == bot.id]
        bot_exposure = sum(float(p.qty) * prices.get(p.symbol, float(p.entry_price)) for p in rows)
        bot_unrealized = sum(
            (prices.get(p.symbol, float(p.entry_price)) - float(p.entry_price)) * float(p.qty)
            for p in rows
        )
        bot_cash = float(bot.cash)
        bot_equity = bot_cash + bot_exposure
        capital = float(bot.capital) or 1.0
        per_bot.append(
            {
                "bot_id": bot.id,
                "name": bot.name,
                "state": str(bot.state),
                "equity": bot_equity,
                "unrealized_pnl": bot_unrealized,
                "open_positions": len(rows),
                "total_return": bot_equity / capital - 1,
            }
        )
        equity += bot_equity
        cash += bot_cash
        exposure += bot_exposure
        unrealized += bot_unrealized

    capital_total = sum(float(b.capital) for b in bots) or 1.0
    return {
        "at": utcnow().isoformat(),
        "equity": equity,
        "cash": cash,
        "exposure": exposure,
        "unrealized_pnl": unrealized,
        "realized_today": realized_today,
        "open_positions": len(open_rows),
        "total_return": equity / capital_total - 1,
        "capital": capital_total,
        "bots": per_bot,
        # Fiyatı bilinmeyen pozisyon varsa gerçekleşmemiş k/z eksik demektir;
        # sessizce yanlış sayı göstermektense bunu taşıyoruz.
        "stale_symbols": sorted({p.symbol for p in open_rows if p.symbol not in prices}),
    }


@router.get("/portfolio/metrics")
async def metrics(session: SessionDep, redis: RedisDep, user: CurrentUser) -> dict:
    """Panel özeti. Kötü haber saklanmaz — drawdown kazanç kadar görünür (DESIGN §1).

    60 sn Redis önbelleği: uç her bot için tüm işlemler üzerinde kazanma
    oranı / profit factor / çıkış dağılımı hesaplar. Meydan okuma sayfası,
    bot detayları ve TUI filosu aynı anda çekince aynı ağır hesap dakikada
    onlarca kez koşuyor ve bot işçileriyle çekirdek yarışıyordu. Metrikler
    bar kapanışıyla değişir; bir dakikalık tazelik fazlasıyla dürüst.
    """
    cached = await redis.get(METRICS_CACHE_KEY)
    if cached:
        return json.loads(cached)

    bots = (await session.execute(select(Bot))).scalars().all()
    tickers = await read_tickers(redis)
    prices = {s: float(t["last_price"]) for s, t in tickers.items()}

    per_bot = []
    total_equity = total_cash = total_exposure = 0.0
    for bot in bots:
        open_rows = (
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
        exposure = sum(float(p.qty) * prices.get(p.symbol, float(p.entry_price)) for p in open_rows)
        cash = float(bot.cash)
        eq = cash + exposure
        # `eq` canlı fiyatlarla şimdi hesaplanır, `equity_peak` ise yalnızca
        # çalışan bir bot bar kapanışında yazdığında güncellenir. Durdurulmuş
        # bir botta `eq` tepeyi geçebiliyor ve uç POZİTİF drawdown döndürüyordu.
        # Drawdown tanımı gereği ≤ 0'dır; tepe en az bugünkü özsermaye kadardır.
        peak = max(float(bot.equity_peak) or eq, eq)
        stats = await trade_stats(session, bot.id)
        per_bot.append(
            {
                "bot_id": bot.id,
                "name": bot.name,
                "state": str(bot.state),
                "equity": eq,
                "cash": cash,
                "exposure": exposure,
                "exposure_pct": exposure / eq if eq else 0.0,
                "drawdown": min(0.0, eq / peak - 1) if peak else 0.0,
                "total_return": (eq / float(bot.capital) - 1) if bot.capital else 0.0,
                "open_positions": len(open_rows),
                **stats,
            }
        )
        total_equity += eq
        total_cash += cash
        total_exposure += exposure

    payload = {
        "total": {
            "equity": total_equity,
            "cash": total_cash,
            "exposure": total_exposure,
            "bots": len(bots),
        },
        "bots": per_bot,
    }
    await redis.set(METRICS_CACHE_KEY, json.dumps(payload), ex=60)
    return payload
