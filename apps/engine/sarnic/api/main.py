"""FastAPI uygulaması — panel ve TUI'nin tek kapısı.

Frontend **yalnızca** buraya konuşur. Next.js'te iş mantığı, ORM veya DB bağlantısı
yoktur (CLAUDE.md stack kuralı).
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import func, select, text, update
from starlette.responses import Response

from sarnic.api.deps import CurrentUser, RedisDep, SessionDep, close_redis, get_redis
from sarnic.api.routes import (
    admin,
    auth,
    bots,
    kontrol,
    portfolio,
    scores,
    social,
    strategies,
    symbols,
)
from sarnic.api.routes import universe as universe_routes
from sarnic.api.ws import hub
from sarnic.api.ws import router as ws_router
from sarnic.config import settings
from sarnic.core.enums import BotState
from sarnic.core.logging import configure_logging, get_logger
from sarnic.core.observability import init_sentry
from sarnic.data.marketdata import data_is_stale
from sarnic.db.models import OHLCV, Backtest, Bot, Notification, UniverseSnapshot
from sarnic.db.session import dispose_engine, get_sessionmaker

log = get_logger(__name__)

REQUESTS = Counter("sarnic_http_requests_total", "HTTP istekleri", ["method", "path", "status"])
LATENCY = Histogram("sarnic_http_request_seconds", "HTTP gecikmesi", ["method", "path"])


async def _release_orphaned_backtests() -> None:
    """Açılışta yetim kalmış backtest koşularını serbest bırakır.

    Koşular API'nin **çocuk süreci** olarak yürütülür. API yeniden başlarsa
    (dağıtım, çökme, `systemctl restart`) çocuk da ölür ama satır `RUNNING`
    kalır. Uç aynı anda tek koşuya izin verdiği için bu satır kuyruğu
    **kalıcı olarak** tıkar: yeni koşu isteyen herkes "Zaten çalışan bir
    backtest var" alır ve durumu elle düzeltmeden kimse backtest çalıştıramaz.

    Ölçüldü: bir API yeniden başlatması kuyruğu 85 dakika boyunca kilitledi ve
    kimse fark etmedi — panel koşuyu "çalışıyor" diye gösterdi.

    Yeniden başlatan sürecin çocuğu hayatta olamaz, o yüzden açılışta gördüğümüz
    her `RUNNING` satırı tanım gereği yetimdir.
    """
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        result = await session.execute(
            update(Backtest)
            .where(Backtest.status == "RUNNING")
            .values(
                status="FAILED",
                finished_at=datetime.now(UTC),
                error=(
                    "API yeniden başlatıldı; koşu süreci onunla birlikte sonlandı. "
                    "Sonuç üretilmedi — koşuyu yeniden başlatın."
                ),
            )
        )
        await session.commit()
        if result.rowcount:
            log.warning("orphaned_backtests_released", count=result.rowcount)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    init_sentry("api")
    log.info("api_starting", env=settings.env)
    await _release_orphaned_backtests()
    await hub.start()
    yield
    await hub.stop()
    await close_redis()
    await dispose_engine()
    log.info("api_stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title="SARNIÇ",
        version="0.1.0",
        description=(
            "Havuz tabanlı kesitsel puanlama ve kağıt üstü işlem sistemi. "
            "Canlı para yoktur; tüm emirler dahili paper motorundan geçer."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def metrics_middleware(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        elapsed = time.perf_counter() - started
        REQUESTS.labels(request.method, path, response.status_code).inc()
        LATENCY.labels(request.method, path).observe(elapsed)
        return response

    for router in (
        auth.router,
        universe_routes.router,
        scores.router,
        symbols.router,
        bots.router,
        portfolio.router,
        strategies.router,
        social.router,
        admin.router,
        kontrol.router,
        ws_router,
    ):
        app.include_router(router)

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        checks: dict[str, str] = {}
        try:
            async with get_sessionmaker()() as session:
                await session.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception as exc:
            checks["database"] = f"hata: {exc}"
        try:
            redis = await get_redis()
            await redis.ping()
            checks["redis"] = "ok"
        except Exception as exc:
            checks["redis"] = f"hata: {exc}"
        healthy = all(v == "ok" for v in checks.values())
        return {"status": "ok" if healthy else "degraded", "checks": checks}

    @app.get("/system/status", tags=["system"])
    async def system_status(session: SessionDep, redis: RedisDep) -> dict:
        """Üst çubuğun dört sinyali: havuz boyutu, çalışan bot, alarm, bağlantı (DESIGN §3).

        Oturum ve Redis **bağımlılık** olarak alınır. Önceden `get_sessionmaker()`
        doğrudan çağrılıyordu; bu, ucu FastAPI'nin yaşam döngüsünün dışına
        çıkarıyor, test edilemez kılıyor ve diğer bütün uçlardan ayrışıyordu.
        """
        snap = (
            await session.execute(
                select(UniverseSnapshot).order_by(UniverseSnapshot.taken_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        bots = (await session.execute(select(Bot))).scalars().all()

        try:
            stale = await data_is_stale(redis)
        except Exception:
            stale = True

        running = sum(1 for b in bots if b.state in (BotState.PAPER_RUNNING, BotState.DEGRADED))
        alarms = sum(1 for b in bots if b.state in (BotState.ERROR, BotState.DEGRADED))
        return {
            "universe_size": len(snap.symbols) if snap else 0,
            "universe_taken_at": snap.taken_at.isoformat() if snap else None,
            "running_bots": running,
            "total_bots": len(bots),
            "alarms": alarms,
            "market_data_stale": stale,
            "mode": "paper",
            "message": (
                "Canlı veri kesildi — yeni emir gönderilmiyor."
                if stale
                else "Piyasa verisi akıyor."
            ),
        }

    @app.get("/system/attention", tags=["system"])
    async def system_attention(session: SessionDep, redis: RedisDep, user: CurrentUser) -> dict:
        """Tek dikkat yüzeyi: "sistem sağlıklı mı, benden bir şey istiyor mu?"

        /system/status bot 4 giriş yasağındayken "alarm 0" diyordu — alarm
        sayacı yalnız ERROR/DEGRADED sayıyordu. Dikkat isteyen her şey burada
        tek listede: kesici durdurmaları, giriş yasakları, nabızsız worker,
        bayat akış, seansı eksik pazar, okunmamış kritik bildirim. Panel bu
        listeyi aynen gösterir; ayrıca sayaç türetmez (tek kaynak).
        """
        from sarnic.core.calendar import ExchangeSessionCalendar, calendar_for
        from sarnic.core.markets import BIST, US

        now = datetime.now(UTC)
        items: list[dict] = []

        def ekle(level: str, kind: str, title: str, detail: str, href: str, **extra) -> None:
            items.append(
                {
                    "id": f"{kind}:{extra.get('bot_id', extra.get('market', ''))}",
                    "level": level,
                    "kind": kind,
                    "title": title,
                    "detail": detail,
                    "href": href,
                    **extra,
                }
            )

        bots = (await session.execute(select(Bot))).scalars().all()
        blocked = halted = 0
        for b in bots:
            kosuyor = b.state in (BotState.PAPER_RUNNING, BotState.DEGRADED)
            if b.state == BotState.ERROR:
                ekle(
                    "CRITICAL",
                    "bot_error",
                    f"{b.name} hata verdi",
                    b.halt_reason or "sebep kaydedilmedi",
                    f"/botlar/{b.id}",
                    bot_id=b.id,
                )
            elif b.state == BotState.DEGRADED:
                ekle(
                    "WARN",
                    "bot_degraded",
                    f"{b.name} DEGRADED",
                    "API hata oranı yüksek — girişler kısıtlı.",
                    f"/botlar/{b.id}",
                    bot_id=b.id,
                )
            elif b.state == BotState.STOPPED and b.halt_reason:
                halted += 1
                ekle(
                    "WARN",
                    "bot_halted",
                    f"{b.name} kesiciyle durdu",
                    f"{b.halt_reason} — elle yeniden başlatma gerekiyor.",
                    f"/botlar/{b.id}",
                    bot_id=b.id,
                )
            if kosuyor and b.entries_blocked_until is not None and b.entries_blocked_until > now:
                blocked += 1
                kalan = int((b.entries_blocked_until - now).total_seconds() // 60)
                ekle(
                    "WARN",
                    "entries_blocked",
                    f"{b.name} giriş yasağında",
                    f"{kalan} dk daha yeni giriş yok; açık pozisyonlar yönetiliyor.",
                    f"/botlar/{b.id}",
                    bot_id=b.id,
                    until=b.entries_blocked_until.isoformat(),
                )
            if kosuyor and (
                b.last_heartbeat_at is None or (now - b.last_heartbeat_at).total_seconds() > 90
            ):
                ekle(
                    "CRITICAL",
                    "no_heartbeat",
                    f"{b.name} nabız vermiyor",
                    "Worker 90 sn'dir yazmadı — süpervizör yeniden başlatır; "
                    "sürerse servise bakın.",
                    f"/botlar/{b.id}",
                    bot_id=b.id,
                )

        try:
            stale = await data_is_stale(redis)
        except Exception:
            stale = True
        if stale:
            ekle(
                "CRITICAL",
                "market_data_stale",
                "Kripto akışı bayat",
                "Marketdata nabız vermiyor; yeni emir gönderilmiyor, stoplar aktif.",
                "/gunluk?tab=kalite",
                market="CRYPTO",
            )

        # Pazar akışları — referans sembolün son barı (ucuz nokta sorgusu).
        feeds: list[dict] = []
        for market, symbol, tf, expected in (
            ("CRYPTO", "BTCUSDT", "1h", 2 * 3600),
            ("BIST", "THYAO.IS", "1d", None),
            ("US", "AAPL.US", "1d", None),
        ):
            son = (
                await session.execute(
                    select(OHLCV.open_time)
                    .where(OHLCV.symbol == symbol, OHLCV.timeframe == tf)
                    .order_by(OHLCV.open_time.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            age = (now - son).total_seconds() if son else None
            if expected is not None:
                ok = age is not None and age <= expected
                detail = "son 1h barı beklenen aralıkta." if ok else "son bar 2 saatten eski."
            else:
                cal = calendar_for((BIST if market == "BIST" else US).calendar)
                assert isinstance(cal, ExchangeSessionCalendar)
                beklenen = cal.last_closed_session(now)
                ok = son is not None and beklenen is not None and son >= beklenen
                detail = (
                    "son kapanan seans depoda."
                    if ok
                    else "beklenen seans "
                    f"{beklenen.date().isoformat() if beklenen else '—'} henüz gelmedi."
                )
            feeds.append(
                {
                    "market": market,
                    "symbol": symbol,
                    "timeframe": tf,
                    "last_bar_at": son.isoformat() if son else None,
                    "age_seconds": age,
                    "ok": ok,
                    "detail": detail,
                }
            )
            if not ok and market != "CRYPTO":
                ekle(
                    "WARN",
                    "feed_lagging",
                    f"{market} seansı eksik",
                    detail,
                    "/gunluk?tab=kalite",
                    market=market,
                )

        # Sayım ve tek başlık — tüm satırları yüklemek değil (112k okunmamış
        # ERROR/CRITICAL satırı her 20 sn'de ORM'e alınıyordu; API'nin bellek
        # baskısının kaynağı buydu).
        kritik_kosul = (
            Notification.read_at.is_(None),
            Notification.level.in_(("ERROR", "CRITICAL")),
        )
        kritik_n = (
            await session.execute(
                select(func.count()).select_from(Notification).where(*kritik_kosul)
            )
        ).scalar_one()
        if kritik_n:
            baslik = (
                await session.execute(
                    select(Notification.title)
                    .where(*kritik_kosul)
                    .order_by(Notification.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            ekle(
                "INFO",
                "unread_critical",
                f"{kritik_n} okunmamış kritik bildirim",
                baslik or "",
                "/gunluk?tab=bildirimler",
            )

        sira = {"CRITICAL": 0, "WARN": 1, "INFO": 2}
        items.sort(key=lambda i: sira[i["level"]])
        running = sum(1 for b in bots if b.state in (BotState.PAPER_RUNNING, BotState.DEGRADED))
        return {
            "at": now.isoformat(),
            "items": items,
            "feeds": feeds,
            "fleet": {"running": running, "total": len(bots), "blocked": blocked, "halted": halted},
        }

    @app.get("/system/marathon", tags=["system"])
    async def system_marathon() -> dict:
        """Maraton meta'sı — sabitler panele buradan gelir, kopyalanmaz.

        (TUI tasarım incelemesinin uyarısı: meydan okuma sabitleri panelde
        gömülüydü ve ikinci bir arayüz açılınca kopyalanacaktı. Maraton
        başlangıcı/tutarı tek yerde: `settings` tablosu, grup `marathon`.)
        """
        from sarnic.core.settings_store import load_group
        from sarnic.db.session import session_scope

        async with session_scope() as session:
            meta = await load_group(session, "marathon")
        return {
            "start": meta.get("start"),
            "days": meta.get("days", 30),
            "stake_usd": meta.get("stake_usd", 400),
            "note": meta.get("note", ""),
        }

    @app.get("/system/load", tags=["system"])
    async def system_load() -> dict:
        """Makinenin yük durumu — hangi botun durdurulacağına karar verirken.

        Backtest koşuları ve bot işçileri aynı çekirdekleri paylaşır. Yük
        çekirdek sayısını aştığında karar barları gecikmeye başlar; panel bunu
        göstermeden kullanıcı ancak işlemler geç açıldığında fark eder.

        `psutil` yok, `/proc` da her yerde yok: ikisi de olmayabileceği için
        okuma savunmalı yapılır ve eksik alanlar `None` döner. Eksik veriyi
        sıfır göstermek "yük yok" diye okunurdu.
        """
        cores = os.cpu_count() or 1
        try:
            one, five, fifteen = os.getloadavg()
        except (OSError, AttributeError):
            return {
                "cores": cores,
                "load_1": None,
                "load_5": None,
                "load_15": None,
                "pressure": None,
                "message": "Yük bilgisi bu platformda okunamıyor.",
            }

        pressure = one / cores
        return {
            "cores": cores,
            "load_1": round(one, 2),
            "load_5": round(five, 2),
            "load_15": round(fifteen, 2),
            # 1.0 = her çekirdek dolu. Üstü, işlerin sıraya girmeye başladığı yer.
            "pressure": round(pressure, 2),
            "message": (
                "Çekirdekler dolu — karar barları gecikebilir."
                if pressure >= 1.0
                else "Yük normal."
            ),
        }

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    "Beklenmeyen bir hata oluştu. Loglar kaydedildi; "
                    "yönetici paneli → Loglar sayfasından bakılabilir."
                )
            },
        )

    return app


app = create_app()
