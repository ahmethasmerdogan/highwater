"""Bot yönetimi — §15 / §10.

Durum geçişleri burada yapılır; süreçleri `BotSupervisor` yönetir. API bir botu
"çalıştır" dediğinde yaptığı tek şey durumu `PAPER_RUNNING` yapmaktır; süpervizör
10 saniye içinde süreci ayağa kaldırır. Bu ayrım bilinçlidir — API'nin çökmesi
çalışan botları etkilemez.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from sarnic.api.deps import BusDep, CurrentUser, RedisDep, RequireTrader, SessionDep, write_audit
from sarnic.api.schemas import BotCreate, BotEventOut, BotOut, BotUpdate
from sarnic.core.enums import BotState, EventKind, PositionStatus, Role
from sarnic.data.marketdata import read_tickers
from sarnic.db.models import Bot, BotEvent, Position, StrategyVersion

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
    exposure = sum(float(p.qty) * prices.get(p.symbol, float(p.entry_price)) for p in positions)
    return BotOut(
        id=bot.id,
        name=bot.name,
        owner_id=bot.owner_id,
        strategy_version_id=bot.strategy_version_id,
        mode=str(bot.mode),
        state=bot.state,
        timeframe=bot.timeframe,
        market=str(
            ((bot.strategy_version.definition or {}).get("universe") or {}).get("market", "CRYPTO")
        ),
        capital=float(bot.capital),
        cash=float(bot.cash),
        equity=float(bot.cash) + exposure,
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
