"""Bot worker — MASTER-SPEC §10.

Her bot ayrı bir **işlemde** çalışır. Bir botun çökmesi diğerlerini etkilemez.

Karar döngüsü (bar kapanışında):
  havuz → özellikler → puanlama → çıkış yönetimi → risk → boyutlandırma → emir

Bu sıralama pazarlığa kapalıdır: risk kontrolü boyutlandırmadan **önce**,
çıkış yönetimi girişten **önce** gelir. Sermaye önce korunur, sonra dağıtılır.
"""

from __future__ import annotations

import asyncio
import contextlib
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import redis.asyncio as aioredis
from sqlalchemy import select

from sarnic.bots.portfolio import (
    OpenPosition,
    PortfolioSnapshot,
    load_snapshot,
    record_equity,
)
from sarnic.config import settings
from sarnic.core.clock import Clock, RealClock
from sarnic.core.enums import (
    TIMEFRAME_MINUTES,
    BotState,
    EventKind,
    ExitReason,
    OrderSide,
    OrderType,
    PositionStatus,
)
from sarnic.core.events import EventBus, get_event_bus
from sarnic.core.logging import get_logger
from sarnic.core.memory import bellek_iade
from sarnic.core.observability import DECISION_ERRORS
from sarnic.data.marketdata import data_is_stale, read_last_bars, read_tickers
from sarnic.data.store import last_closed_bar, load_frame
from sarnic.db.models import Bot, BotEvent, Order, Position, Score, Trade
from sarnic.db.session import session_scope
from sarnic.execution.accounting import (
    net_pnl,
    price_points,
    risk_per_unit,
    total_fees,
    weighted_r,
)
from sarnic.execution.base import OrderRequest, OrderResult
from sarnic.execution.exits import (
    ExitDecision,
    MarketView,
    PositionView,
    evaluate_exit,
    rotation_candidate,
)
from sarnic.execution.gapfill import adverse_extreme, stop_fill_price, stop_hit
from sarnic.execution.paper import PaperAdapter, PaperConfig, RedisBookSource
from sarnic.features.indicators import realized_vol
from sarnic.features.pipeline import load_bundles
from sarnic.features.sr import stop_from_sr
from sarnic.risk.engine import RiskEngine, RiskState
from sarnic.scoring.engine import ScoreResult, ScoringEngine
from sarnic.sizing.clusters import cluster_exposure, latest_clusters
from sarnic.sizing.engine import SizingEngine, SizingInput, stop_anchored_to_fill
from sarnic.sizing.leverage import LeverageSpec, borrow_cost, decide_leverage
from sarnic.strategy.definition import StrategyDefinition, entry_hour_allowed
from sarnic.universe.engine import UniverseEngine

log = get_logger(__name__)

HEARTBEAT_INTERVAL = 10  # saniye (§10)
MANAGE_INTERVAL = 15  # açık pozisyon gözetimi


@dataclass(slots=True)
class BarContext:
    """Bir bar kapanışında karar için gereken her şey."""

    bar_time: datetime
    symbols: list[str]
    scores: dict[str, ScoreResult]
    stops: dict[str, float]
    atr: dict[str, float]
    prices: dict[str, float]
    realized_vol: dict[str, float]
    adv_1h: dict[str, float]
    #: Kaldıraç teyidi (sizing/leverage.py): dirence uzaklık (ATR) ve
    #: formasyon düzeltmesi. Kaldıraç kapalıyken de doldurulur — ucuz.
    sr_headroom_atr: dict[str, float] = field(default_factory=dict)
    pattern_mod: dict[str, float] = field(default_factory=dict)
    btc_below_ema200: bool = False
    btc_vol_above_p90: bool = False
    #: Kısa yön (tanım opt-in): kısa puan, direnç üstü stop, desteğe uzaklık.
    short_scores: dict[str, ScoreResult] = field(default_factory=dict)
    short_stops: dict[str, float] = field(default_factory=dict)
    sr_support_room_atr: dict[str, float] = field(default_factory=dict)

    def score_for(self, symbol: str, direction: int) -> ScoreResult | None:
        return (self.short_scores if direction < 0 else self.scores).get(symbol)

    def stop_for(self, symbol: str, direction: int) -> float | None:
        return (self.short_stops if direction < 0 else self.stops).get(symbol)

    def room_for(self, symbol: str, direction: int) -> float | None:
        """İşlem yönündeki yer: uzun dirence, kısa desteğe uzaklık (ATR)."""
        return (self.sr_support_room_atr if direction < 0 else self.sr_headroom_atr).get(symbol)

    @property
    def scored(self) -> int:
        return len(self.scores) or len(self.short_scores)


class BotWorker:
    def __init__(
        self,
        bot_id: int,
        *,
        bus: EventBus | None = None,
        clock: Clock | None = None,
        redis_url: str | None = None,
    ) -> None:
        self.bot_id = bot_id
        self.bus = bus or get_event_bus()
        self.clock = clock or RealClock()
        self._redis_url = redis_url or settings.redis_url
        self._redis: aioredis.Redis | None = None
        self._stop = asyncio.Event()
        # Karar ve gözetim döngüleri aynı botun nakit/pozisyon durumunu
        # DEĞİŞTİRİR; ikisi aynı anda koşarsa son yazan kazanır. 2026-09-04
        # 12:30Z, bot 4: gözetim ADA+DASH'i kapatıp nakdi 307'ye yazdı, karar
        # döngüsü botu 12:30:07'de (nakit 140) okumuş, pozisyonları kapanmış
        # bulmuş, özsermayeyi 214 sanıp kill switch'i tetiklemiş ve 214'ü
        # üstüne yazmış: 167 $ satış geliri buharlaştı, bot hayalet zararla
        # durdu. Tek kilit: bar kararı ile gözetim turu sırayla koşar.
        self._bot_kilidi = asyncio.Lock()
        self._adapter: PaperAdapter | None = None
        self._definition: StrategyDefinition | None = None
        self._last_bar: datetime | None = None
        self._definition_sv: int | None = None
        self._empty_universe_warned_for: datetime | None = None
        #: Önceki barda giriş kapısının üstünde olan semboller — "eşik aşıldı"
        #: olayı bir geçiştir ve geçişi görmek için önceki durum gerekir.
        self._above_gate: set[str] = set()
        self.universe = UniverseEngine()

    # ------------------------------------------------------------------ #
    async def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    async def _load_bot(self, session) -> Bot:
        bot = (await session.execute(select(Bot).where(Bot.id == self.bot_id))).scalar_one()
        return bot

    def _definition_of(self, bot: Bot) -> StrategyDefinition:
        # Sürüm değişirse (PATCH /bots/{id}) yeniden okunur; eskiden süreç ömrü
        # boyunca ilk tanım kalıyordu ve değişiklik ancak restart'ta görülüyordu.
        if self._definition is None or self._definition_sv != bot.strategy_version_id:
            self._definition = StrategyDefinition.from_dict(
                bot.strategy_version.definition
            ).require_valid()
            self._definition_sv = bot.strategy_version_id
        return self._definition

    async def _emit(self, session, kind: EventKind | str, level: str = "INFO", **payload) -> None:
        """Olay hem `bot_events` tablosuna hem Redis Streams'e gider."""
        session.add(BotEvent(bot_id=self.bot_id, kind=str(kind), level=level, payload=payload))
        await self.bus.emit(kind, level=level, bot_id=self.bot_id, **payload)

    # ------------------------------------------------------------------ #
    #  Yaşam döngüsü
    # ------------------------------------------------------------------ #
    async def run(self) -> None:
        log.info("worker_starting", bot_id=self.bot_id)
        tasks = [
            asyncio.create_task(self._heartbeat_loop(), name=f"bot{self.bot_id}-heartbeat"),
            asyncio.create_task(self._decision_loop(), name=f"bot{self.bot_id}-decide"),
            asyncio.create_task(self._manage_loop(), name=f"bot{self.bot_id}-manage"),
        ]
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.exception("worker_crashed", bot_id=self.bot_id)
            await self._fail(str(exc))
            raise
        finally:
            for t in tasks:
                t.cancel()
            for t in tasks:
                with contextlib.suppress(asyncio.CancelledError):
                    await t

    def stop(self) -> None:
        self._stop.set()

    async def _fail(self, message: str) -> None:
        async with session_scope() as session:
            bot = await self._load_bot(session)
            bot.state = BotState.ERROR
            bot.halt_reason = message[:64]
            await self._emit(
                session,
                EventKind.BOT_STATE_CHANGED,
                level="ERROR",
                state=str(BotState.ERROR),
                message=message,
            )

    async def _heartbeat_loop(self) -> None:
        while not self._stop.is_set():
            try:
                async with session_scope() as session:
                    bot = await self._load_bot(session)
                    bot.last_heartbeat_at = self.clock.now()
            except Exception:
                log.exception("heartbeat_failed", bot_id=self.bot_id)
            await asyncio.sleep(HEARTBEAT_INTERVAL)

    # ------------------------------------------------------------------ #
    #  Bar kapanışı döngüsü
    # ------------------------------------------------------------------ #
    async def _decision_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self._maybe_run_bar()
            except asyncio.CancelledError:
                raise
            except Exception:
                DECISION_ERRORS.labels(str(self.bot_id)).inc()
                log.exception("decision_loop_error", bot_id=self.bot_id)
            await asyncio.sleep(20)

    async def _maybe_run_bar(self) -> None:
        async with session_scope() as session:
            bot = await self._load_bot(session)
            if bot.state not in (BotState.PAPER_RUNNING, BotState.DEGRADED):
                return
            definition = self._definition_of(bot)
            timeframe = definition.timeframe
            # Yeniden doğuşta bellek boş; DB'deki iz tüketilmiş barı yeniden
            # koşmayı önler (çıkış/giriş/rotasyon idempotent değil).
            if self._last_bar is None and bot.last_bar_at is not None:
                self._last_bar = bot.last_bar_at

        bar = last_closed_bar(self.clock.now(), timeframe, market_code=definition.universe.market)
        if self._last_bar is not None and bar <= self._last_bar:
            return

        # Bar yalnızca **gerçekten işlendiyse** tüketilmiş sayılır. Aksi hâlde
        # geçici bir aksaklık (henüz kurulmamış havuz, eksik veri) bir saatlik
        # kararı sessizce atlatırdı: `_last_bar` ilerler, bir sonraki deneme
        # ancak bir sonraki bar kapanışında olurdu.
        if await self.run_bar(bar):
            self._last_bar = bar
        # Bar başına 100+ sembolün çerçeveleri geçicidir; arenayı geri ver.
        bellek_iade()

    async def run_bar(self, bar_time: datetime) -> bool:
        async with self._bot_kilidi:
            return await self._run_bar_kilitli(bar_time)

    async def _run_bar_kilitli(self, bar_time: datetime) -> bool:
        """Bir bar kapanışının tam karar zinciri.

        Döner: bar işlendiyse `True`; atlandıysa `False` (çağıran yeniden dener).
        """
        started = self.clock.now()
        async with session_scope() as session:
            bot = await self._load_bot(session)
            if bot.state not in (BotState.PAPER_RUNNING, BotState.DEGRADED):
                return False
            definition = self._definition_of(bot)

            symbols = await self.universe.current_symbols(
                session, at=bar_time, market=definition.universe.market
            )
            if not symbols:
                # Bar tüketilmediği için bu kontrol 20 sn'de bir tekrarlanıyor;
                # her seferinde olay yazmak `bot_events`'i boğardı. Bar başına
                # bir kez uyarmak yeterli.
                if self._empty_universe_warned_for != bar_time:
                    self._empty_universe_warned_for = bar_time
                    await self._emit(
                        session,
                        EventKind.LOG,
                        level="WARN",
                        message=(
                            f"{bar_time:%Y-%m-%d %H:%M} barı için havuz yok — puanlama "
                            "atlandı. Havuz o bardan önce kurulmuş olmalı; "
                            "sonraki barda yeniden denenecek."
                        ),
                    )
                return False

            ctx = await self._build_context(session, symbols, bar_time, definition)

            if not ctx.scores and not ctx.short_scores:
                # Havuz dolu ama tek sembol bile puanlanamadı (veri gecikmesi
                # ya da yetersiz bar). Barı tüketmek denemeyi YARINA atardı —
                # 15:00'te tam bunu yaşadık: "0 sembol puanlandı" yazıp bar
                # yendi. Açık pozisyonların bar-stop denetimi yine çalışır;
                # uyarı bar başına bir kez, dönüş False → 20 sn sonra yeniden.
                snapshot = await load_snapshot(session, bot, ctx.prices, now=bar_time)
                if definition.universe.market != "CRYPTO":
                    await self._bar_stop_exits(session, bot, definition, snapshot, bar_time)
                if self._empty_universe_warned_for != bar_time:
                    self._empty_universe_warned_for = bar_time
                    await self._emit(
                        session,
                        EventKind.LOG,
                        level="WARN",
                        message=(
                            f"{bar_time:%Y-%m-%d %H:%M} barında {len(symbols)} sembolden "
                            "hiçbiri puanlanamadı (taze veri/yetersiz bar). Bar "
                            "tüketilmedi; yeniden denenecek."
                        ),
                    )
                return False

            await self._persist_scores(session, ctx, definition)

            snapshot = await load_snapshot(session, bot, ctx.prices, now=bar_time)

            # 1) Çıkışlar önce — sermaye önce korunur.
            if definition.universe.market != "CRYPTO":
                # Seanslı pazarda stop tetiği barın KENDİSİNDEN okunur:
                # `low <= stop` ise dolum `min(stop, open)` — backtest ile
                # birebir (kural 1). Kapanışa bakan sürekli yol bunu
                # göremezdi: gün içi delip kapanışta toparlayan bar stopu
                # sessizce atlar, boşlukta açılan bar da kapanış fiyatından
                # (çoğu kez daha kötü) dolardı.
                await self._bar_stop_exits(session, bot, definition, snapshot, bar_time)
            await self._manage_exits(session, bot, definition, snapshot, ctx, bar_closed=True)

            # 2) Risk kapısı
            verdict = await self._check_risk(session, bot, definition, snapshot)

            # 3) Girişler
            # DEGRADED: puanlar, çıkışları yönetir, özsermaye kaydeder — giriş yok.
            if verdict.allow_entry and bot.state == BotState.PAPER_RUNNING:
                await self._consider_entries(session, bot, definition, snapshot, ctx)

            await record_equity(session, bot, snapshot, bar_time)
            bot.cash = Decimal(str(round(snapshot.cash, 8)))
            bot.last_bar_at = bar_time

            elapsed_ms = (self.clock.now() - started).total_seconds() * 1000
            await self._emit(
                session,
                EventKind.SCORES_UPDATED,
                # Bot adı mesajın içinde: üç bot aynı barı puanlıyor ve panelde
                # üç özdeş satır görünüyordu — hangisinin konuştuğu belirsizdi.
                message=(
                    f"{bot.name}: {definition.timeframe} barı kapandı, "
                    f"{ctx.scored} sembol puanlandı"
                ),
                bar_time=bar_time.isoformat(),
                scored=ctx.scored,
                duration_ms=round(elapsed_ms, 1),
            )
            return True

    # ------------------------------------------------------------------ #
    async def _build_context(
        self, session, symbols: list[str], bar_time: datetime, definition: StrategyDefinition
    ) -> BarContext:
        # Karar çerçevesi botun kendi dilimidir. Geçilmediğinde hat her zaman
        # 1h okuyordu: 15m bir bot 15 dakikada bir uyanıp **aynı** 1h barını
        # yeniden puanlıyor, yeni bilgi olmadan daha sık işlem açıyordu.
        bundles = await load_bundles(
            session, symbols, at=bar_time, decision_tf=definition.timeframe
        )
        if definition.universe.market != "CRYPTO":
            # Sağlayıcı gün sonunu gecikmeli basar (İş Yatırım T+dakikalar…
            # saatler). Karar barının KENDİ satırı gelmemiş sembolü puanlamak,
            # dünkü kapanışla bugünkü bar adına karar vermek olur — fiyat da
            # sentetik defter de bayat kalır. Taze olmayan atlanır; bar
            # tüketilmediği için 20 sn sonra yeniden denenir.
            #
            # KRİPTOYA UYGULANMAZ (2026-09-04 20:00Z geri alındı): kontrol
            # kriptoda hiçbir sembolü taze saymadı ve 1h kollarının hepsi
            # 18:00 barında dondu — bir saatlik karar kaybı. Kriptonun bayat-bar
            # riski `stop_anchored_to_fill` ile zaten kapalı (dolum stopun
            # yanlış tarafındaysa stop dolumdan yeniden çapalanır).
            taze = []
            for b in bundles:
                base = b.indicators.get(definition.timeframe)
                if (
                    base is not None
                    and base.bar_time is not None
                    and base.bar_time.to_pydatetime().timestamp() == bar_time.timestamp()
                ):
                    taze.append(b)
            # Kısmi tazelik kesiti sakatlar: İş Yatırım günü KADEMELİ basıyor
            # ve ilk turda 5 sembol gelmişti — 5 kişilik yüzdelik sıralamayla
            # kapı kararı vermek anlamsız. Kesitin en az %60'ı (ve ≥ 10
            # sembol) tazelenene dek bundles BOŞ bırakılır → 0-puan yolu barı
            # tüketmez, 20 sn sonra yeniden denenir.
            yeterli = max(10, int(len(bundles) * 0.6))
            bundles = taze if len(taze) >= yeterli else []
        engine = ScoringEngine(
            weights=definition.scoring.weights,
            use_pattern=definition.scoring.modifiers.get("pattern", True),
            use_candle=definition.scoring.modifiers.get("candle", True),
            use_crowding=definition.scoring.modifiers.get("crowding", True),
        )
        yonler = definition.entry.directions()
        feats = [b.features for b in bundles]
        results = engine.score_cross_section(feats) if 1 in yonler else []
        scores = {r.symbol: r for r in results}
        # Kısa puan: aynı özellikler, yönlü aileler ters (backtest ile aynı çağrı).
        short_scores = (
            {r.symbol: r for r in engine.score_cross_section(feats, -1)} if -1 in yonler else {}
        )

        prices: dict[str, float] = {}
        stops: dict[str, float] = {}
        short_stops: dict[str, float] = {}
        atr: dict[str, float] = {}
        rvol_map: dict[str, float] = {}
        adv: dict[str, float] = {}
        sr_headroom: dict[str, float] = {}
        sr_support_room: dict[str, float] = {}
        pattern_mod: dict[str, float] = {}

        for b in bundles:
            # Karar çerçevesi botun kendi dilimidir; burada `"1h"` sabiti
            # kullanmak 15m/30m botlarda sözlüğü **sessizce boş bırakıyordu**:
            # `indicators` anahtarları o botlarda ("15m","4h","1d") olduğu için
            # `get("1h")` None dönüyor, döngü `continue` ediyor ve fiyat/stop/ATR
            # hiç dolmuyordu. Sonuç: aday bulunmasına rağmen tek giriş bile
            # açılmıyor ve hiçbir yere iz düşmüyordu.
            base = b.indicators.get(definition.timeframe)
            if base is None or not math.isfinite(base.close):
                continue
            prices[b.symbol] = base.close
            atr[b.symbol] = base.atr if math.isfinite(base.atr) else 0.0
            rvol_map[b.symbol] = base.realized_vol if math.isfinite(base.realized_vol) else 0.0
            if b.sr is not None:
                stop = stop_from_sr(b.sr, definition.exit.stop_atr_multiple, entry=base.close)
                if stop is not None:
                    stops[b.symbol] = stop
                headroom = b.sr.resistance_distance_atr
                if headroom is not None:
                    sr_headroom[b.symbol] = headroom
                if -1 in yonler:
                    kisa_stop = stop_from_sr(
                        b.sr, definition.exit.stop_atr_multiple, entry=base.close, direction=-1
                    )
                    if kisa_stop is not None:
                        short_stops[b.symbol] = kisa_stop
                    oda = b.sr.support_distance_atr
                    if oda is not None:
                        sr_support_room[b.symbol] = oda
            if b.patterns is not None:
                pattern_mod[b.symbol] = b.patterns.modifier()

        # Likidite tavanı için 1 saatlik ortalama quote hacmi.
        tickers = await read_tickers(await self.redis())
        for symbol in symbols:
            t = tickers.get(symbol)
            adv[symbol] = float(t["quote_volume"]) / 24 if t else 0.0

        btc_below, btc_vol_high = await self._btc_regime(session, bar_time)

        return BarContext(
            bar_time=bar_time,
            symbols=symbols,
            scores=scores,
            stops=stops,
            atr=atr,
            prices=prices,
            realized_vol=rvol_map,
            adv_1h=adv,
            sr_headroom_atr=sr_headroom,
            pattern_mod=pattern_mod,
            btc_below_ema200=btc_below,
            btc_vol_above_p90=btc_vol_high,
            short_scores=short_scores,
            short_stops=short_stops,
            sr_support_room_atr=sr_support_room,
        )

    async def _btc_regime(self, session, at: datetime) -> tuple[bool, bool]:
        """§6.2 adım 5 — rejim çarpanının iki girdisi.

        Bayat veriyle **sessizce** karar vermez: referans sembolün son barı iki
        günden eskiyse uyarır. Bu kontrol yokken 1d verisi üç gün donmuşken rejim
        hesabı yapılmaya devam etti ve kimse görmedi (`SYSTEM-REVIEW` §2).
        """
        symbol = settings.reference_symbol
        df = await load_frame(session, symbol, "1d", end=at, limit=400)
        if len(df) < 210:
            log.warning("regime_reference_insufficient", symbol=symbol, bars=len(df))
            return False, False

        last_bar = df["open_time"].iloc[-1].to_pydatetime()
        age_days = (at - last_bar).total_seconds() / 86400
        if age_days > 2:
            log.warning(
                "regime_reference_stale",
                symbol=symbol,
                last_bar=last_bar.isoformat(),
                age_days=round(age_days, 2),
                message="Rejim çarpanı bayat veriyle hesaplanıyor.",
            )

        from sarnic.features.indicators import ema

        close = df["close"].astype(float)
        ema200 = ema(close, 200).iloc[-1]
        below = bool(math.isfinite(ema200) and close.iloc[-1] < ema200)

        vol = realized_vol(close, period=30, bars_per_year=365).dropna()
        high = bool(len(vol) > 60 and vol.iloc[-1] > vol.quantile(0.90))
        return below, high

    async def _persist_scores(
        self, session, ctx: BarContext, definition: StrategyDefinition
    ) -> None:
        """Her puan `scores` tablosuna gerekçesiyle yazılır (§5.4 zorunlu)."""
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows = [
            r.as_row(definition.timeframe)
            for r in [*ctx.scores.values(), *ctx.short_scores.values()]
        ]
        if not rows:
            return
        from sarnic.data.store import chunk_size_for, chunks

        for batch in chunks(rows, chunk_size_for(len(rows[0]))):
            stmt = pg_insert(Score).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["symbol", "bar_time", "timeframe", "config_hash"],
                set_={
                    "score": stmt.excluded.score,
                    "families": stmt.excluded.families,
                    "modifiers": stmt.excluded.modifiers,
                    "rationale": stmt.excluded.rationale,
                },
            )
            await session.execute(stmt)

        # "Eşik aşıldı" bir **geçiştir**, bir durum değil. Kod eşiğin üstünde
        # sembol *olup olmadığına* bakıyordu; kapıyı geçen bir sembol havuzda
        # durduğu sürece her bar yeniden bildirim üretiyordu. Ölçüldü
        # (2026-08-19): 24 saatte 588 bildirim, hiçbiri okunmamış — üstelik
        # 15 dakikalık bot tek başına günde 96 bar üretiyor. Bu hacim panelin
        # gelen kutusunu kullanılamaz hâle getiriyor ve gerçek olayları
        # (pozisyon açıldı, devre kesici) gömüyor.
        #
        # Doğrusu: **yeni** geçenler. Önceki barda eşiğin altındayken bu barda
        # üstüne çıkanlar bildirilir. Süreç yeniden başlarsa küme boşalır ve
        # bir kerelik fazladan bildirim olur; sessizce yanlış davranmaktan iyi.
        gate = definition.entry.min_score
        tum = {**ctx.short_scores, **ctx.scores}
        above = {s.symbol for s in tum.values() if s.score >= gate}
        newly = above - self._above_gate
        self._above_gate = above
        if newly:
            crossed = [tum[sym] for sym in newly if sym in tum]
            await self.bus.emit(
                EventKind.SCORE_THRESHOLD_CROSSED,
                bot_id=self.bot_id,
                threshold=gate,
                symbols=[
                    {"symbol": s.symbol, "score": s.score}
                    for s in sorted(crossed, key=lambda x: -x.score)[:10]
                ],
            )

    # ------------------------------------------------------------------ #
    #  Risk
    # ------------------------------------------------------------------ #
    async def _check_risk(
        self, session, bot: Bot, definition: StrategyDefinition, snapshot: PortfolioSnapshot
    ):
        stale = await data_is_stale(await self.redis())
        state = RiskState(
            equity=snapshot.equity,
            equity_start_of_day=snapshot.equity_start_of_day,
            equity_start_of_week=snapshot.equity_start_of_week,
            equity_peak=max(snapshot.equity_peak, snapshot.equity),
            consecutive_losses=snapshot.consecutive_losses,
            data_stale=stale,
            entries_blocked_until=bot.entries_blocked_until,
        )
        verdict = RiskEngine(definition.risk_limits()).evaluate(state, self.clock.now())

        for trip in verdict.trips:
            # `level` ayrıca geçilmez: `trip.as_dict()` onu zaten taşıyor ve iki
            # kez vermek `TypeError` üretiyordu. Sonuç: bir kesici tetiklendiği
            # anda karar barı çöküyor, altındaki durum değişiklikleri (DEGRADED,
            # entries_blocked_until, kill switch) hiç uygulanmıyordu.
            await self._emit(session, EventKind.RISK_CIRCUIT_BREAKER, **trip.as_dict())
            if trip.entries_blocked_until is not None:
                bot.entries_blocked_until = trip.entries_blocked_until
            if trip.requires_manual_restart:
                bot.state = BotState.STOPPED
                bot.halt_reason = str(trip.breaker)
            elif trip.degrade and bot.state == BotState.PAPER_RUNNING:
                bot.state = BotState.DEGRADED

        if verdict.kill:
            await self._close_all(session, bot, snapshot, ExitReason.KILL_SWITCH)
        return verdict

    # ------------------------------------------------------------------ #
    #  Çıkışlar
    # ------------------------------------------------------------------ #
    async def _bar_stop_exits(
        self,
        session,
        bot: Bot,
        definition: StrategyDefinition,
        snapshot: PortfolioSnapshot,
        bar_time: datetime,
    ) -> None:
        """Kapanan karar barına karşı stop denetimi (yalnız seanslı pazar)."""
        for position in list(snapshot.positions):
            df = await load_frame(
                session,
                position.symbol,
                definition.timeframe,
                end=bar_time,
                limit=1,
            )
            if df.empty:
                continue
            row = df.iloc[-1]
            if row["open_time"].to_pydatetime().timestamp() != bar_time.timestamp():
                continue  # bu sembolün barı henüz yazılmadı
            d = position.direction
            uc = adverse_extreme(float(row["low"]), float(row["high"]), d)
            if not stop_hit(position.stop, uc, d):
                continue
            fill = stop_fill_price(position.stop, float(row["open"]), d)
            reason = (
                ExitReason.BREAKEVEN
                if position.breakeven_locked
                and math.isclose(position.stop, position.entry_price, rel_tol=1e-9)
                else ExitReason.TRAILING
                if position.breakeven_locked
                else ExitReason.STOP
            )
            await self._close_position(
                session,
                bot,
                snapshot,
                position,
                reason,
                message=(
                    f"bar stopu deldi: {'düşük' if d > 0 else 'yüksek'} {uc:.6f} "
                    f"{'≤' if d > 0 else '≥'} stop {position.stop:.6f}, dolum {fill:.6f}"
                ),
                gap_fill_price=fill,
            )

    async def _manage_exits(
        self,
        session,
        bot: Bot,
        definition: StrategyDefinition,
        snapshot: PortfolioSnapshot,
        ctx: BarContext,
        *,
        bar_closed: bool,
    ) -> None:
        for position in list(snapshot.positions):
            price = ctx.prices.get(position.symbol)
            if price is None:
                continue
            score = ctx.score_for(position.symbol, position.direction)
            market = MarketView(
                price=price,
                atr=ctx.atr.get(position.symbol, 0.0),
                score=score.score if score else None,
                bar_closed=bar_closed,
            )
            decision = evaluate_exit(_view(position), market, definition.exit, self.clock.now())
            await self._apply_exit_decision(session, bot, snapshot, position, decision, price)

    async def _apply_exit_decision(
        self,
        session,
        bot: Bot,
        snapshot: PortfolioSnapshot,
        position: OpenPosition,
        decision: ExitDecision,
        price: float,
    ) -> None:
        # MFE/MAE takibi — her gözetim turunda güncellenir.
        # Sayısal tavan: NUMERIC(14,8) 10^6'yı taşır; 1R≈0 bir pozisyonda r
        # sonsuza gider ve döngü her turda çökerdi (bot 5, 2026-09-04).
        r = max(-9_999.0, min(9_999.0, _view(position).r_multiple(price)))
        position.mfe = max(position.mfe, r)
        position.mae = min(position.mae, r)

        if decision.partial_fraction > 0 and not position.partial_done:
            # Kısmi kâr alma (H2): kesri sat, kalan iz sürer. Aynı kararda stop
            # güncellemesi de gelebilir; aşağıda uygulanır.
            await self._close_position(
                session,
                bot,
                snapshot,
                position,
                ExitReason.PARTIAL,
                decision.message,
                qty=position.qty * decision.partial_fraction,
            )

        if decision.stop_moved and decision.new_stop is not None:
            position.stop = decision.new_stop
            position.breakeven_locked = True
            await session.execute(
                Position.__table__.update()
                .where(Position.id == position.id)
                .values(
                    stop=Decimal(str(round(decision.new_stop, 10))),
                    breakeven_locked=True,
                    mfe=Decimal(str(round(position.mfe, 8))),
                    mae=Decimal(str(round(position.mae, 8))),
                )
            )
            await self._emit(
                session,
                EventKind.LOG,
                level="INFO",
                message=f"{position.symbol} {decision.message}",
                symbol=position.symbol,
            )
            return

        await session.execute(
            Position.__table__.update()
            .where(Position.id == position.id)
            .values(
                mfe=Decimal(str(round(position.mfe, 8))),
                mae=Decimal(str(round(position.mae, 8))),
            )
        )

        if decision.should_exit and decision.reason is not None:
            await self._close_position(
                session, bot, snapshot, position, decision.reason, decision.message
            )

    async def _close_position(
        self,
        session,
        bot: Bot,
        snapshot: PortfolioSnapshot,
        position: OpenPosition,
        reason: ExitReason,
        message: str = "",
        gap_fill_price: float | None = None,
        qty: float | None = None,
    ) -> None:
        """Pozisyonu kapatır; `qty` verilirse yalnız o kadarını satar (kısmi kâr
        alma, H2). Kısmi satışın muhasebesi istemsiz kısmi dolumla AYNI
        koldan geçer: kalanla açık kal, dilimin sonucunu realized_*'da biriktir.
        """
        gonullu_kismi = qty is not None
        d = position.direction
        adapter = await self._get_adapter(session, bot)
        # Yön adaptöre gider: kısa kapanışı ALIŞ emridir (ödünç varlık iade).
        meta: dict = {"direction": d}
        if gap_fill_price is not None:
            # Bar-kapanış çıkışı: dolum barın gerçeğinden (kural 1 —
            # backtest ile aynı stop_fill_price). Kayma/komisyon yine işler.
            meta["gap_fill_price"] = gap_fill_price
        result = await adapter.submit(
            OrderRequest(
                symbol=position.symbol,
                side=OrderSide.from_direction(-d),
                type=OrderType.MARKET,
                qty=qty if qty is not None else position.qty,
                bot_id=bot.id,
                position_id=position.id,
                meta=meta,
            )
        )
        await self._record_order(session, bot, result, position.id)

        if not result.accepted:
            await self._emit(
                session,
                EventKind.ORDER_REJECTED,
                level="ERROR",
                symbol=position.symbol,
                reason=result.reject_reason,
                message=f"{position.symbol} çıkış emri reddedildi: {result.reject_reason}",
            )
            return

        exit_price = result.avg_price
        now = self.clock.now()
        dilim_puan = price_points(position.entry_price, exit_price, result.filled_qty, d)
        dilim_pnl = dilim_puan - result.fees
        kalan = position.qty - result.filled_qty

        # Emir defteri tükenmişse çıkış **kısmi** dolar. Pozisyonu yine de
        # kapatmak sessiz bir muhasebe ayrışması yaratır: adaptörün elinde
        # kalan miktar durur, botun kaydı yoktur, o miktar bir daha satılamaz
        # ve nakit hiç geri gelmez. Doğrusu: kalanla açık kal, sonucu biriktir,
        # bir sonraki turda tekrar dene. Çıkış koşulu hâlâ geçerlidir.
        if kalan > 1e-9:
            # Satılan dilimin borç maliyeti burada tahakkuk eder — aksi hâlde
            # kapanışta yalnız KALAN miktarın borcu ödenir ve dilimin girişten
            # bu yana taşıdığı borç sessizce silinirdi (kaldıraçlı kollar için
            # gerçek bir muhasebe deliği; 1× pozisyonda sıfırdır).
            dilim_lev = float(position.leverage or 1.0)
            # 1× uzun dilimde borç yoktur; tanım okunmaz (kısa 1× de borçludur).
            dilim_borc = (
                borrow_cost(
                    notional=position.entry_price * result.filled_qty,
                    leverage=dilim_lev,
                    hold_hours=(now - position.entry_time).total_seconds() / 3600,
                    hourly_rate=LeverageSpec.from_sizing(
                        self._definition_of(bot).sizing
                    ).hourly_rate,
                    direction=d,
                )
                if dilim_lev > 1.0 or d < 0
                else 0.0
            )
            position.qty = kalan
            position.realized_pnl += dilim_pnl - dilim_borc
            position.realized_fees += result.fees + dilim_borc
            position.realized_points += dilim_puan
            await session.execute(
                Position.__table__.update()
                .where(Position.id == position.id)
                .values(
                    qty=Decimal(str(round(kalan, 10))),
                    realized_pnl=Decimal(str(round(position.realized_pnl, 8))),
                    realized_fees=Decimal(str(round(position.realized_fees, 8))),
                    realized_points=Decimal(str(round(position.realized_points, 8))),
                )
            )
            snapshot.cash += d * exit_price * result.filled_qty - result.fees - dilim_borc
            bot.cash = Decimal(str(round(snapshot.cash, 8)))
            if gonullu_kismi:
                position.partial_done = True
                await session.execute(
                    Position.__table__.update()
                    .where(Position.id == position.id)
                    .values(partial_done=True)
                )
                await self._emit(
                    session,
                    EventKind.LOG,
                    level="INFO",
                    symbol=position.symbol,
                    message=(
                        f"{position.symbol} kısmi kâr alındı: {result.filled_qty:.4f} satıldı "
                        f"@ {exit_price:.6f} ({dilim_pnl - dilim_borc:+.2f}), "
                        f"{kalan:.4f} iz sürüyor."
                    ),
                )
                return
            await self._emit(
                session,
                EventKind.ORDER_REJECTED,
                level="WARN",
                symbol=position.symbol,
                message=(
                    f"{position.symbol} çıkışı kısmi doldu: {result.filled_qty:.4f} satıldı, "
                    f"{kalan:.4f} kaldı. Emir defterinde likidite yetmedi; pozisyon açık "
                    "kaldı ve bir sonraki turda yeniden denenecek."
                ),
            )
            return

        gross = price_points(position.entry_price, exit_price, result.filled_qty, d)
        hold_hours_now = (now - position.entry_time).total_seconds() / 3600
        # Borç maliyeti: kaldıraçlı girişte borç alınan kısım için, tutulan
        # saat kadar. Bedava kaldıraç yalanı yok — maliyet komisyon kalemine
        # tahakkuk eder ve net kârdan düşer.
        borc = borrow_cost(
            notional=position.entry_price * result.filled_qty,
            leverage=float(position.leverage or 1.0),
            hold_hours=hold_hours_now,
            hourly_rate=LeverageSpec.from_sizing(self._definition_of(bot).sizing).hourly_rate,
            direction=d,
        )
        fees = (
            total_fees(
                entry_fees=position.entry_fees,
                exit_fees=result.fees,
                realized_fees=position.realized_fees,
            )
            + borc
        )
        pnl = (
            net_pnl(
                gross=gross,
                entry_fees=position.entry_fees,
                exit_fees=result.fees,
                realized_pnl=position.realized_pnl,
            )
            - borc
        )
        risk_birim = risk_per_unit(position.entry_price, position.initial_stop, d)
        pnl_r = weighted_r(
            position.entry_price,
            exit_price,
            result.filled_qty,
            risk_birim,
            realized_points=position.realized_points,
            entry_qty=position.entry_qty,
            direction=d,
        )

        await session.execute(
            Position.__table__.update()
            .where(Position.id == position.id)
            .values(status=PositionStatus.CLOSED)
        )
        session.add(
            Trade(
                position_id=position.id,
                bot_id=bot.id,
                symbol=position.symbol,
                side=OrderSide.from_direction(d),
                exit_price=Decimal(str(round(exit_price, 10))),
                exit_time=now,
                exit_reason=str(reason),
                pnl=Decimal(str(round(pnl, 8))),
                pnl_r=round(pnl_r, 6),
                fees=Decimal(str(round(fees, 8))),
                slippage_bps=round(result.slippage_bps, 4),
                mfe=Decimal(str(round(position.mfe, 8))),
                mae=Decimal(str(round(position.mae, 8))),
                hold_hours=round(hold_hours_now, 4),
                leverage=Decimal(str(round(float(position.leverage or 1.0), 2))),
                strategy_version_id=bot.strategy_version_id,
            )
        )

        snapshot.cash += d * exit_price * result.filled_qty - result.fees - borc
        snapshot.positions = [p for p in snapshot.positions if p.id != position.id]
        bot.cash = Decimal(str(round(snapshot.cash, 8)))

        await self._emit(
            session,
            EventKind.POSITION_CLOSED,
            level="INFO",
            symbol=position.symbol,
            reason=str(reason),
            exit_price=exit_price,
            pnl=round(pnl, 4),
            pnl_r=round(pnl_r, 3),
            message=(
                f"{position.symbol} kapandı · {reason} · {pnl:+.2f} USDT ({pnl_r:+.2f}R)"
                + (f" · {message}" if message else "")
            ),
        )

    async def _close_all(
        self, session, bot: Bot, snapshot: PortfolioSnapshot, reason: ExitReason
    ) -> None:
        for position in list(snapshot.positions):
            await self._close_position(session, bot, snapshot, position, reason)

    # ------------------------------------------------------------------ #
    #  Girişler
    # ------------------------------------------------------------------ #
    async def _consider_entries(
        self,
        session,
        bot: Bot,
        definition: StrategyDefinition,
        snapshot: PortfolioSnapshot,
        ctx: BarContext,
    ) -> None:
        # Adaylar (puan, yön) çiftleri — backtest ile aynı kural: iki yön açıksa
        # puana göre tek sırada; tutulan sembol hiçbir yönde aday olmaz (hedge yok).
        kapi = definition.entry.min_score
        candidates: list[tuple[ScoreResult, int]] = []
        for d in definition.entry.directions():
            kaynak = ctx.scores if d > 0 else ctx.short_scores
            candidates += [
                (s, d)
                for s in kaynak.values()
                if s.score >= kapi and s.symbol not in snapshot.symbols
            ]
        candidates.sort(key=lambda x: -x[0].score)
        if not candidates or not entry_hour_allowed(definition.entry, ctx.bar_time):
            return

        clusters = await latest_clusters(session, at=ctx.bar_time)
        sizing = SizingEngine(definition.sizing_params())
        butce_red_sayisi = 0

        for candidate, d in candidates:
            if candidate.symbol in snapshot.symbols:
                continue
            if len(snapshot.positions) >= definition.entry.max_positions:
                victim = rotation_candidate(
                    snapshot.score_pairs(),
                    candidate.symbol,
                    candidate.score,
                    definition.rotation,
                    definition.entry.max_positions,
                )
                if victim is None:
                    break
                target = snapshot.find(victim)
                if target is not None:
                    await self._close_position(
                        session,
                        bot,
                        snapshot,
                        target,
                        ExitReason.ROTATION,
                        f"{candidate.symbol} {candidate.score:.1f} puanla devraldı",
                    )

            stop = ctx.stop_for(candidate.symbol, d)
            entry = ctx.prices.get(candidate.symbol)
            if stop is None or entry is None:
                # Sessiz atlamak bir kusuru tam olarak gizlemişti: karar
                # çerçevesi yanlış okunduğunda bu sözlükler boş kalıyor ve bot
                # "aday var ama hiç giriş yok" durumuna düşüyordu — hiçbir iz
                # bırakmadan. Artık sebebi yazıyor.
                await self._emit(
                    session,
                    EventKind.LOG,
                    level="WARN",
                    symbol=candidate.symbol,
                    message=(
                        f"{candidate.symbol} giriş atlandı: "
                        f"{'stop' if stop is None else 'fiyat'} hesaplanamadı "
                        f"({definition.timeframe} çerçevesi)"
                    ),
                )
                continue

            lev_spec = LeverageSpec.from_sizing(definition.sizing)
            lev = decide_leverage(
                lev_spec,
                score=candidate.score,
                pattern_modifier=ctx.pattern_mod.get(candidate.symbol),
                headroom_atr=ctx.room_for(candidate.symbol, d),
                entry=entry,
                stop=stop,
                direction=d,
            )
            if lev_spec.enabled and lev.leverage <= 1.0:
                # Kaldıraç istendi ama teyit yok: giriş SPOT devam eder,
                # sebep loglanır — sessiz varsayım yok.
                await self._emit(
                    session,
                    EventKind.LOG,
                    level="INFO",
                    symbol=candidate.symbol,
                    message=f"{candidate.symbol} kaldıraçsız (1×): {lev.reason}",
                )

            decision = sizing.size(
                SizingInput(
                    symbol=candidate.symbol,
                    score=candidate.score,
                    entry=entry,
                    stop=stop,
                    leverage=lev.leverage,
                    risk_scale=lev.leverage if lev_spec.scale_risk else 1.0,
                    direction=d,
                    equity=snapshot.equity,
                    free_cash=snapshot.cash,
                    current_exposure=snapshot.exposure,
                    cluster_exposure=cluster_exposure(
                        clusters, snapshot.exposures(), candidate.symbol
                    ),
                    realized_vol_20d=ctx.realized_vol.get(candidate.symbol, 0.0),
                    adv_1h=ctx.adv_1h.get(candidate.symbol, 0.0),
                    open_positions=len(snapshot.positions),
                    btc_below_ema200=ctx.btc_below_ema200,
                    btc_vol_above_p90=ctx.btc_vol_above_p90,
                )
            )
            if not decision.accepted:
                # Bütçe tükendiyse (maruziyet tavanı dolu ya da nakit bitti)
                # kalan adaylar da aynı cevabı alır: sizing'i 100 kez daha
                # çağırmak barın CPU'sunu yer, her ret ayrı satır olarak
                # bot_events'i şişirir. Ölçüldü (2026-09-04): M1 kolu 24 saatte
                # 420 böyle satır yazdı. Üçüncüden sonra döngü tek özetle biter;
                # ADAYA ÖZGÜ retler (stop çok uzak, likidite, küme) sayılmaz.
                butce_reddi = "boyut sıfır" in decision.reject_reason or (
                    "hedefin %" in decision.reject_reason and "slot boş" in decision.reject_reason
                )
                if butce_reddi:
                    butce_red_sayisi += 1
                    if butce_red_sayisi >= 3:
                        await self._emit(
                            session,
                            EventKind.LOG,
                            level="INFO",
                            message=(
                                f"bütçe tükendi: {butce_red_sayisi} aday kısıtlara takıldı "
                                f"({decision.reject_reason}); bu barda giriş aranmıyor."
                            ),
                        )
                        return
                await self._emit(
                    session,
                    EventKind.LOG,
                    level="INFO",
                    symbol=candidate.symbol,
                    message=f"{candidate.symbol} giriş reddedildi: {decision.reject_reason}",
                )
                continue

            await self._open_position(
                session,
                bot,
                snapshot,
                ctx,
                candidate,
                decision,
                definition.timeframe,
                leverage=lev.leverage,
                direction=d,
            )

    async def _open_position(
        self,
        session,
        bot: Bot,
        snapshot: PortfolioSnapshot,
        ctx: BarContext,
        candidate: ScoreResult,
        decision,
        timeframe: str,
        leverage: float = 1.0,
        direction: int = 1,
    ) -> None:
        adapter = await self._get_adapter(session, bot)
        yon = OrderSide.from_direction(direction)
        result = await adapter.submit(
            OrderRequest(
                symbol=candidate.symbol,
                side=yon,
                type=OrderType.MARKET,
                qty=decision.qty,
                bot_id=bot.id,
                meta={
                    "realized_vol": ctx.realized_vol.get(candidate.symbol),
                    # 1'den büyükse adaptör marj kuralıyla çalışır: nakit
                    # notional/lev kadar yeter; kalan borçtur ve nakit
                    # eksiye düşerek görünür (borç saklanmaz).
                    "leverage": leverage,
                    # Kısa açılış SATIŞ emridir; adaptör defterde negatif tutar.
                    "direction": direction,
                },
            )
        )
        await self._record_order(session, bot, result, None)

        if not result.accepted:
            await self._emit(
                session,
                EventKind.ORDER_REJECTED,
                level="WARN",
                symbol=candidate.symbol,
                reason=result.reject_reason,
                message=f"{candidate.symbol} giriş emri reddedildi: {result.reject_reason}",
            )
            return

        score_id = (
            await session.execute(
                select(Score.id).where(
                    Score.symbol == candidate.symbol,
                    Score.bar_time == candidate.bar_time,
                    Score.config_hash == candidate.config_hash,
                    # `timeframe` şart: puan satırının kimliği
                    # (sembol, bar, dilim, ayar) dörtlüsüdür — `scores` tablosunun
                    # benzersiz indeksi de öyle. Dilim atlandığında aynı ayarla
                    # çalışan 15m ve 30m botlar çakışıyordu: 16:00 hem 15m hem 30m
                    # barı olduğu için sorgu iki satır döndürüyor ve
                    # `MultipleResultsFound` ile worker çöküyordu.
                    Score.timeframe == timeframe,
                )
            )
        ).scalar_one_or_none()

        entry_price = result.avg_price
        stop = stop_anchored_to_fill(
            entry_price, ctx.prices.get(candidate.symbol, entry_price), decision.stop, direction
        )
        if stop != decision.stop:
            await self._emit(
                session,
                EventKind.LOG,
                level="WARN",
                symbol=candidate.symbol,
                message=(
                    f"{candidate.symbol} dolum {entry_price:.6f} stopun "
                    f"{'altında' if direction > 0 else 'üstünde'} kaldı "
                    f"(karar {ctx.prices.get(candidate.symbol, entry_price):.6f}, stop "
                    f"{decision.stop:.6f}); stop dolumdan aynı mesafeye çekildi → {stop:.6f}"
                ),
            )
        position = Position(
            bot_id=bot.id,
            symbol=candidate.symbol,
            side=yon,
            qty=Decimal(str(round(result.filled_qty, 10))),
            entry_qty=Decimal(str(round(result.filled_qty, 10))),
            entry_price=Decimal(str(round(entry_price, 10))),
            entry_time=self.clock.now(),
            stop=Decimal(str(round(stop, 10))),
            initial_stop=Decimal(str(round(stop, 10))),
            score_at_entry=round(candidate.score, 2),
            rationale_id=score_id,
            entry_fees=Decimal(str(round(result.fees, 8))),
            leverage=Decimal(str(round(leverage, 2))),
            status=PositionStatus.OPEN,
        )
        session.add(position)
        await session.flush()

        # Stop borsada gerçek bir emir olarak durur (paper'da simüle edilir).
        await adapter.submit(
            OrderRequest(
                symbol=candidate.symbol,
                side=yon.opposite,
                type=OrderType.STOP_LOSS_LIMIT,
                qty=result.filled_qty,
                stop_price=stop,
                bot_id=bot.id,
                position_id=position.id,
            )
        )

        snapshot.cash -= direction * entry_price * result.filled_qty + result.fees
        snapshot.positions.append(
            OpenPosition(
                id=position.id,
                symbol=candidate.symbol,
                qty=result.filled_qty,
                entry_price=entry_price,
                entry_time=position.entry_time,
                stop=stop,
                initial_stop=stop,
                score_at_entry=candidate.score,
                leverage=leverage,
                breakeven_locked=False,
                entry_fees=result.fees,
                direction=direction,
            )
        )
        bot.cash = Decimal(str(round(snapshot.cash, 8)))

        risk_pct = decision.risk_amount / snapshot.equity if snapshot.equity else 0.0
        rr = candidate.rationale.get("sr", {}).get("rr_geometry")
        await self._emit(
            session,
            EventKind.POSITION_OPENED,
            level="INFO",
            symbol=candidate.symbol,
            qty=round(result.filled_qty, 8),
            entry=round(entry_price, 8),
            stop=round(stop, 8),
            score=candidate.score,
            rationale=candidate.rationale,
            message=(
                f"{candidate.symbol} qty {result.filled_qty:.4f} @ {entry_price:.6f} · "
                f"stop {stop:.6f} · risk %{risk_pct * 100:.1f}"
                + (" · KISA" if direction < 0 else "")
                + (f" · {leverage:g}× kaldıraç" if leverage > 1.0 else "")
                + (f" · R {rr:.2f}" if isinstance(rr, int | float) else "")
            ),
        )

    async def _record_order(
        self, session, bot: Bot, result: OrderResult, position_id: int | None
    ) -> None:
        session.add(
            Order(
                bot_id=bot.id,
                position_id=position_id,
                symbol=result.symbol,
                type=result.type,
                side=result.side,
                qty=Decimal(str(round(result.requested_qty, 10))),
                filled_qty=Decimal(str(round(result.filled_qty, 10))),
                avg_fill_price=(
                    Decimal(str(round(result.avg_price, 10))) if result.avg_price else None
                ),
                status=result.status,
                reject_reason=result.reject_reason or None,
                exchange_order_id=result.order_id,
                fees=Decimal(str(round(result.fees, 8))),
                slippage_bps=round(result.slippage_bps, 4),
                created_at=result.submitted_at or self.clock.now(),
                filled_at=result.filled_at,
            )
        )

    # ------------------------------------------------------------------ #
    #  Bar arası gözetim: stop'lar barı beklemez
    # ------------------------------------------------------------------ #
    async def _manage_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self._manage_open_positions()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("manage_loop_error", bot_id=self.bot_id)
            await asyncio.sleep(MANAGE_INTERVAL)

    async def _manage_open_positions(self) -> None:
        async with self._bot_kilidi:
            await self._manage_open_positions_kilitli()

    async def _manage_open_positions_kilitli(self) -> None:
        async with session_scope() as session:
            bot = await self._load_bot(session)
            if bot.state not in (BotState.PAPER_RUNNING, BotState.DEGRADED):
                return
            definition = self._definition_of(bot)

            redis = await self.redis()
            last_bars = await read_last_bars(redis, definition.timeframe)
            prices = {s: float(d["close"]) for s, d in last_bars.items()}
            if not prices:
                return

            snapshot = await load_snapshot(session, bot, prices, now=self.clock.now())
            if not snapshot.positions:
                return

            # Bar içi ATR yerine son kapanmış barın ATR'si kullanılır — bar
            # kapanmadan o barın verisiyle stop taşımak look-ahead olurdu.
            atr_map = await self._atr_for(session, snapshot.symbols, definition.timeframe)

            for position in list(snapshot.positions):
                price = prices.get(position.symbol)
                if price is None:
                    continue
                decision = evaluate_exit(
                    _view(position),
                    MarketView(
                        price=price,
                        atr=atr_map.get(position.symbol, 0.0),
                        score=None,
                        bar_closed=False,
                    ),
                    definition.exit,
                    self.clock.now(),
                )
                await self._apply_exit_decision(session, bot, snapshot, position, decision, price)

            bot.cash = Decimal(str(round(snapshot.cash, 8)))

    async def _atr_for(self, session, symbols: set[str], timeframe: str) -> dict[str, float]:
        from sarnic.features.indicators import atr as atr_fn

        out: dict[str, float] = {}
        for symbol in symbols:
            df = await load_frame(session, symbol, timeframe, limit=60)
            if len(df) < 20:
                continue
            value = atr_fn(df).iloc[-1]
            if value is not None and math.isfinite(float(value)):
                out[symbol] = float(value)
        return out

    # ------------------------------------------------------------------ #
    async def _get_adapter(self, session, bot: Bot) -> PaperAdapter:
        if self._adapter is None:
            redis = await self.redis()
            self._adapter = PaperAdapter(
                book_source=RedisBookSource(redis),
                balance=float(bot.cash),
                config=PaperConfig(),
                clock=self.clock,
            )
            # Defteri DB'den kurtar: adaptör süreçle ölür, pozisyon ölmez.
            rows = await session.execute(
                select(Position.symbol, Position.qty, Position.side).where(
                    Position.bot_id == bot.id, Position.status == PositionStatus.OPEN
                )
            )
            # Kısa pozisyon defterde negatif (ödünç varlık).
            self._adapter.restore_positions(
                {s: float(q) * OrderSide(side).direction for s, q, side in rows}
            )
        self._adapter.set_balance(float(bot.cash))
        return self._adapter

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None
        await self.bus.close()


def _view(position: OpenPosition) -> PositionView:
    return PositionView(
        symbol=position.symbol,
        qty=position.qty,
        entry_price=position.entry_price,
        entry_time=position.entry_time,
        stop=position.stop,
        initial_stop=position.initial_stop,
        breakeven_locked=position.breakeven_locked,
        partial_done=position.partial_done,
        direction=position.direction,
    )


def next_bar_close(now: datetime, timeframe: str) -> datetime:
    minutes = TIMEFRAME_MINUTES[timeframe]
    floored = last_closed_bar(now, timeframe) + timedelta(minutes=minutes)
    return floored + timedelta(minutes=minutes)


async def run_worker(bot_id: int) -> None:
    """Süreç giriş noktası — `python -m sarnic.cli worker <id>`."""
    from sarnic.core.logging import configure_logging

    configure_logging()
    worker = BotWorker(bot_id)
    try:
        await worker.run()
    finally:
        await worker.close()


__all__ = ["BarContext", "BotWorker", "run_worker"]


def _utcnow() -> datetime:
    return datetime.now(UTC)
