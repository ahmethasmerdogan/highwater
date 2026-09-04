"""BotSupervisor — MASTER-SPEC §10.

Her bot **ayrı bir işlemde** çalışır; bir botun çökmesi diğerlerini etkilemez.
Süpervizör 10 sn'de bir heartbeat bekler; 3 kaçırılan heartbeat → yeniden başlatır.

Ayrıca havuz yenilemesini ve haftalık korelasyon kümelemesini o çalıştırır —
bunlar bot başına değil, sistem başına işlerdir.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import signal
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from sqlalchemy import select

from sarnic.config import settings
from sarnic.core.clock import utcnow
from sarnic.core.deadman import Deadman
from sarnic.core.enums import BotState, EventKind, PositionStatus
from sarnic.core.events import EventBus, get_event_bus
from sarnic.core.logging import get_logger
from sarnic.core.observability import UNIVERSE_SIZE
from sarnic.db.models import Bot, BotEvent, Position
from sarnic.db.session import session_scope
from sarnic.scoring.observations import backfill_observations
from sarnic.scoring.retention import prune_scores
from sarnic.sizing.clusters import clusters_are_stale, compute_clusters
from sarnic.universe.engine import UniverseEngine, UniverseInputUnavailable

log = get_logger(__name__)

HEARTBEAT_TIMEOUT = timedelta(seconds=35)  # 3 kaçırılan heartbeat + tampon
POLL_INTERVAL = 10
MAX_RESTARTS = 5
# Havuz boş kaldığında yeniden deneme aralığı (spread örnekleri birikirken).
UNIVERSE_RETRY_INTERVAL = 180
# Havuz hedefe ulaşamıyorsa yeniden deneme aralığı katlanarak büyür.
#
# Yeniden deneme "girdiler olgunlaşırken sık dene" için var; olgunlaştıktan
# sonra ise sonsuza kadar dönüyordu. Havuz üç gündür 86–88 arasında ve 100'e
# **ulaşamıyor** — filtreler bu piyasada o kadar sembol bırakmıyor. Her tur
# sınırdaki bir sembolü bir yana savurup snapshot yazıyordu (günde 31–68).
#
# Katlama, eski "ilerleme kapısı"nın hatasına düşmez: kapı denemeyi tamamen
# durduruyordu ve iki kez yanlış zamanda kapandı. Burada deneme hiç durmaz,
# yalnızca seyrekleşir; boyut her değiştiğinde aralık başa döner.
UNIVERSE_RETRY_MAX_INTERVAL = 3600
RESTART_WINDOW = timedelta(minutes=10)
# Budama aralığı. Günde bir yeterli olurdu; altı saat, süpervizör sık yeniden
# başlatıldığında da işin bir kez çalışmasını garantiler.
RETENTION_INTERVAL = 6 * 3600
# Kalibrasyon besleyicisinin aralığı. En kısa ufuk 4 saat, ama saatlik koşmak
# yeni puanları ufku dolar dolmaz yakalar ve maliyeti düşüktür (upsert).
OBSERVATIONS_INTERVAL = 3600
# Besleyicinin geriye bakış penceresi. Ufku yeni dolan puanlar için 30 gün
# fazlasıyla yeter; uzun ufuk (72s) dolduğunda satır güncellenir.
OBSERVATIONS_LOOKBACK_DAYS = 30

RUNNING_STATES = (BotState.PAPER_RUNNING, BotState.DEGRADED)


@dataclass(slots=True)
class ManagedProcess:
    bot_id: int
    process: asyncio.subprocess.Process
    started_at: datetime
    restarts: list[datetime] = field(default_factory=list)

    @property
    def alive(self) -> bool:
        return self.process.returncode is None


class BotSupervisor:
    def __init__(self, bus: EventBus | None = None) -> None:
        self.bus = bus or get_event_bus()
        self.processes: dict[int, ManagedProcess] = {}
        self.universe = UniverseEngine()
        self._redis: aioredis.Redis | None = None
        self._stop = asyncio.Event()

    async def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    # ------------------------------------------------------------------ #
    async def run(self) -> None:
        log.info("supervisor_starting")
        self.deadman = Deadman("supervisor", threshold_seconds=900)
        self.deadman.start()
        await self._recover_state()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            with contextlib.suppress(NotImplementedError):
                loop.add_signal_handler(sig, self._stop.set)

        tasks = [
            asyncio.create_task(self._supervise_loop(), name="sup-bots"),
            asyncio.create_task(self._universe_loop(), name="sup-universe"),
            asyncio.create_task(self._clusters_loop(), name="sup-clusters"),
            asyncio.create_task(self._retention_loop(), name="sup-retention"),
            asyncio.create_task(self._observations_loop(), name="sup-observations"),
        ]
        await self._stop.wait()
        log.info("supervisor_stopping")
        for t in tasks:
            t.cancel()
        for t in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await t
        await self.shutdown()

    async def _recover_state(self) -> None:
        """Yeniden başlatmada durum DB'den kurtarılır (§10)."""
        async with session_scope() as session:
            running = (
                (await session.execute(select(Bot).where(Bot.state.in_(RUNNING_STATES))))
                .scalars()
                .all()
            )
            open_positions = (
                (
                    await session.execute(
                        select(Position).where(Position.status == PositionStatus.OPEN)
                    )
                )
                .scalars()
                .all()
            )
        log.info(
            "state_recovered",
            running_bots=len(running),
            open_positions=len(open_positions),
        )

    # ------------------------------------------------------------------ #
    async def _supervise_loop(self) -> None:
        while not self._stop.is_set():
            self.deadman.beat()
            try:
                await self._reconcile()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("supervisor_reconcile_failed")
            await asyncio.sleep(POLL_INTERVAL)

    async def _reconcile(self) -> None:
        async with session_scope() as session:
            bots = (
                (await session.execute(select(Bot).where(Bot.state.in_(RUNNING_STATES))))
                .scalars()
                .all()
            )
            wanted = {b.id: b for b in bots}

            # Fırtına limiti kalıcı ölüm değildir: 30 dk soğuduktan sonra bir
            # şans daha (sayaç pencere dışına çıkmıştır). Sürekli hızlı çöken
            # yine ERROR'a döner; insan müdahalesi gerekiyorsa kayıt orada.
            for b in (
                await session.execute(
                    select(Bot).where(
                        Bot.state == BotState.ERROR, Bot.halt_reason == "tekrarlayan çökme"
                    )
                )
            ).scalars():
                son = b.last_heartbeat_at or b.created_at
                if son is not None and utcnow() - son > timedelta(minutes=30):
                    b.state = BotState.PAPER_RUNNING
                    b.halt_reason = None
                    log.warning("worker_storm_cooldown_retry", bot_id=b.id)
                    session.add(
                        BotEvent(
                            bot_id=b.id,
                            kind=str(EventKind.BOT_STATE_CHANGED),
                            level="WARN",
                            payload={
                                "state": str(BotState.PAPER_RUNNING),
                                "message": "30 dk soğuma sonrası yeniden deneniyor.",
                            },
                        )
                    )
                    wanted[b.id] = b

            # Çalışmaması gerekenleri durdur.
            for bot_id in list(self.processes):
                if bot_id not in wanted:
                    await self._terminate(bot_id, "durum değişti")

            for bot_id, bot in wanted.items():
                managed = self.processes.get(bot_id)
                if managed is None or not managed.alive:
                    hizli_cokme = False
                    if managed is not None:
                        code = managed.process.returncode
                        # Fırtına sayacı yalnız HIZLI çökmeleri sayar (60 sn içinde
                        # ölen worker). Nabız zaman aşımı restart'ları sayılmaz:
                        # 3 Eylül'de swap tıkanması 9 botu aynı saniyede nabızsız
                        # bıraktı; bu sayılsaydı tüm filo ERROR'a düşer, maraton
                        # sessizce biterdi.
                        hizli_cokme = (utcnow() - managed.started_at) < timedelta(seconds=60)
                        log.warning("worker_exited", bot_id=bot_id, code=code)
                        session.add(
                            BotEvent(
                                bot_id=bot_id,
                                kind="worker.exited",
                                level="ERROR",
                                payload={"exit_code": code},
                            )
                        )
                    await self._spawn(session, bot, count_restart=hizli_cokme)
                    continue

                # Heartbeat gözetimi
                last = bot.last_heartbeat_at
                if last is None:
                    if utcnow() - managed.started_at > HEARTBEAT_TIMEOUT:
                        await self._restart(session, bot, "hiç heartbeat gelmedi")
                elif utcnow() - last > HEARTBEAT_TIMEOUT:
                    await self._restart(
                        session, bot, f"heartbeat {int((utcnow() - last).total_seconds())} sn önce"
                    )

    async def _spawn(self, session, bot: Bot, count_restart: bool = True) -> None:
        managed = self.processes.get(bot.id)
        restarts = managed.restarts if managed else []
        cutoff = utcnow() - RESTART_WINDOW
        recent = [t for t in restarts if t > cutoff]
        if len(recent) >= MAX_RESTARTS:
            bot.state = BotState.ERROR
            bot.halt_reason = "tekrarlayan çökme"
            log.error("worker_restart_storm", bot_id=bot.id, restarts=len(recent))
            session.add(
                BotEvent(
                    bot_id=bot.id,
                    kind=str(EventKind.BOT_STATE_CHANGED),
                    level="CRITICAL",
                    payload={
                        "state": str(BotState.ERROR),
                        "message": (
                            f"{len(recent)} kez yeniden başlatıldı ve yine çöktü. "
                            "Otomatik yeniden başlatma durduruldu."
                        ),
                    },
                )
            )
            await self.bus.emit(
                EventKind.BOT_STATE_CHANGED,
                level="CRITICAL",
                bot_id=bot.id,
                state=str(BotState.ERROR),
                message="Bot tekrar tekrar çöktü, otomatik yeniden başlatma durduruldu.",
            )
            self.processes.pop(bot.id, None)
            return

        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "sarnic.cli",
            "worker",
            str(bot.id),
            env={**os.environ, "SARNIC_BOT_ID": str(bot.id)},
        )
        self.processes[bot.id] = ManagedProcess(
            bot_id=bot.id,
            process=process,
            started_at=utcnow(),
            restarts=[*recent, utcnow()] if count_restart else recent,
        )
        log.info("worker_spawned", bot_id=bot.id, pid=process.pid)
        session.add(BotEvent(bot_id=bot.id, kind="worker.spawned", payload={"pid": process.pid}))

    async def _restart(self, session, bot: Bot, reason: str) -> None:
        log.warning("worker_restarting", bot_id=bot.id, reason=reason)
        session.add(
            BotEvent(bot_id=bot.id, kind="worker.restart", level="WARN", payload={"reason": reason})
        )
        await self.bus.emit(
            EventKind.BOT_HEARTBEAT,
            level="WARN",
            bot_id=bot.id,
            message=f"Yeniden başlatılıyor: {reason}",
        )
        await self._terminate(bot.id, reason, keep_history=True)
        await self._spawn(session, bot, count_restart=False)

    async def _terminate(self, bot_id: int, reason: str, keep_history: bool = False) -> None:
        managed = self.processes.get(bot_id)
        if managed is None:
            return
        if managed.alive:
            managed.process.terminate()
            try:
                await asyncio.wait_for(managed.process.wait(), timeout=10)
            except TimeoutError:
                managed.process.kill()
                await managed.process.wait()
        log.info("worker_terminated", bot_id=bot_id, reason=reason)
        if keep_history:
            managed.process = managed.process  # geçmiş korunur, _spawn restarts'ı okur
        else:
            self.processes.pop(bot_id, None)

    # ------------------------------------------------------------------ #
    #  Sistem işleri
    # ------------------------------------------------------------------ #
    async def _universe_loop(self) -> None:
        """Planlı yenileme her gün 00:05 UTC; acil yenileme delist/stale ile.

        Ek olarak: havuz hedefin altındaysa planlı zamanı beklemeden yeniden
        denenir. Girdiler olgunlaşıyor olabilir (spread örnekleri birikiyor,
        geçmiş dolgu sürüyor) ve ertesi güne kadar beklemek sistemi yarım
        bırakır.

        **Neden bir "ilerleme" kapısı yok.** Önce vardı: boyut iki denemede aynı
        kalırsa durulurdu. O kapı iki kez yanlış davrandı (2026-08-16 kesintisi,
        `OPEN-QUESTIONS` §10.2): boş havuzda 0 ile 0 arasında ilerleme göremedi,
        ve 40'ta donduğunda üç dakikalık pencerede "bitti" sanıp bir saat boyunca
        denemeyi bıraktı — oysa bağlayıcı kısıt spread örneklerinin olgunlaşmasıydı
        ve o bir saatlik bir süreç. Kapı yerine **yazma** tarafı kısıtlandı:
        sonuç bir öncekiyle birebir aynıysa snapshot yazılmaz. Böylece deneme
        serbest, kayıt temiz kalır.
        """
        last_size = -1
        best_size = -1
        bekleme = UNIVERSE_RETRY_INTERVAL
        while not self._stop.is_set():
            try:
                async with session_scope() as session:
                    snapshot = await self.universe.latest_snapshot(session)
                    size = len(snapshot.symbols) if snapshot else 0
                    # Gösterge her turda mevcut anlık görüntüden yazılır.
                    # Yalnızca yenileme anında yazılsaydı, süpervizör yeniden
                    # başladığında bir sonraki yenilemeye kadar 0 görünür ve
                    # "havuz küçüldü" alarmı sahte olarak çalardı.
                    UNIVERSE_SIZE.set(size)
                    due = await self.universe.is_due(session)
                    underfilled = size < self.universe.config.top_n

                    if due or underfilled:
                        redis = await self.redis()
                        result = await self.universe.refresh(
                            session,
                            redis,
                            reason="scheduled" if due else "retry",
                            skip_if_unchanged=not due,
                        )
                        new_size = len(result.symbols)
                        # Boyut değişmediyse susulur: aksi hâlde havuz hedefin
                        # altında kaldığı sürece her 3 dakikada bir aynı satır loglanır.
                        if new_size != last_size:
                            if new_size == 0:
                                log.warning(
                                    "universe_empty",
                                    message=(
                                        "Havuz boş kaldı — büyük olasılıkla spread örnekleri "
                                        "henüz yeterli değil (sembol başına 10 gerekiyor). "
                                        "Birkaç dakika sonra yeniden denenecek."
                                    ),
                                )
                            elif new_size < self.universe.config.top_n:
                                log.info(
                                    "universe_underfilled",
                                    size=new_size,
                                    target=self.universe.config.top_n,
                                    message=(
                                        "Havuz hedefin altında; veri olgunlaştıkça büyüyecek."
                                    ),
                                )
                        # Sıfırlama ölçütü **monoton** olmalı: havuz sınırda
                        # 87↔88 salınırken "boyut değişti" her turda doğru olur
                        # ve katlama hiç devreye girmezdi. Yalnızca şimdiye
                        # kadarki en iyiyi aşmak, girdilerin gerçekten
                        # olgunlaştığını gösterir.
                        if new_size > best_size:
                            best_size = new_size
                            bekleme = UNIVERSE_RETRY_INTERVAL
                        elif not due:
                            bekleme = min(bekleme * 2, UNIVERSE_RETRY_MAX_INTERVAL)
                        last_size = new_size
                    else:
                        # Havuz hedefe ulaştı: bir sonraki planlı yenilemeye
                        # kadar sık denemeye gerek yok.
                        bekleme = UNIVERSE_RETRY_INTERVAL
            except asyncio.CancelledError:
                raise
            except UniverseInputUnavailable as exc:
                # Kusur değil, sıralama: piyasa verisi servisi henüz ilk ticker'ı
                # yazmamış. Yığın açılışında beklenen durum; bir sonraki turda geçer.
                log.warning("universe_input_unavailable", message=str(exc))
            except Exception:
                log.exception("universe_refresh_failed")

            await asyncio.sleep(bekleme)

    async def _clusters_loop(self) -> None:
        while not self._stop.is_set():
            try:
                async with session_scope() as session:
                    if await clusters_are_stale(session):
                        symbols = await self.universe.current_symbols(session)
                        if symbols:
                            await compute_clusters(session, symbols)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("cluster_recompute_failed")
            await asyncio.sleep(3600)

    async def _retention_loop(self) -> None:
        """Puan geçmişini budar. Gözlemli puanlara dokunmaz (`scoring/retention.py`)."""
        while not self._stop.is_set():
            try:
                async with session_scope() as session:
                    await prune_scores(session, retention_days=settings.scores_retention_days)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("scores_prune_failed")
            await asyncio.sleep(RETENTION_INTERVAL)

    async def _observations_loop(self) -> None:
        """Kalibrasyon besleyicisi.

        Bu döngü olmadan `backfill_observations` yalnızca elle
        (`sarnic observations`) çalışıyordu ve kimse çalıştırmayınca kalibrasyon
        sessizce eskiyordu. Ölçüldü: puanlar 21 Ağustos'a kadar yazılmışken en
        yeni gözlem 18 Ağustos'tu — **2 gün 9 saat** gerilik. Sayfa yine dolu
        görünüyordu, yalnızca son üç günü göstermiyordu; sistemin varlık nedeni
        olan ölçüm, fark edilmeden durmuştu.
        """
        while not self._stop.is_set():
            try:
                async with session_scope() as session:
                    await backfill_observations(
                        session,
                        since=utcnow() - timedelta(days=OBSERVATIONS_LOOKBACK_DAYS),
                    )
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("observations_backfill_failed")
            await asyncio.sleep(OBSERVATIONS_INTERVAL)

    # ------------------------------------------------------------------ #
    async def shutdown(self) -> None:
        for bot_id in list(self.processes):
            await self._terminate(bot_id, "süpervizör kapanıyor")
        if self._redis is not None:
            await self._redis.aclose()
        await self.bus.close()


async def run_supervisor() -> None:
    from sarnic.core.logging import configure_logging

    configure_logging()
    await BotSupervisor().run()


def _now() -> datetime:
    return datetime.now(UTC)
