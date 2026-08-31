"""MarketDataService — bozulmaz kural 5: piyasa verisi tek yerden çekilir.

Tek örnek çalışır. Görevleri:
  * `!ticker@arr` akışını dinler → Redis'e 24s istatistik yazar
  * izlenen sembollerin `kline_1h` / `kline_15m` akışlarını dinler → kapanan barı DB'ye yazar
  * açık pozisyon ve aday coinler için `depth20` akışını dinler → Redis'e emir defteri yazar
  * `exchangeInfo`'yu 6 saatte bir tazeler
  * spread örneklerini toplar (havuz filtresi 7 için)
  * boşlukları REST ile kapatır, kalite denetçisini çalıştırır
  * 60 sn sessizlikte `data.stale` yayınlar

Botlar Binance'e değil, buraya (Redis + Postgres) bakar.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from sqlalchemy import delete, func, select, update

from sarnic.config import settings
from sarnic.core.clock import utcnow
from sarnic.core.deadman import Deadman
from sarnic.core.enums import TIMEFRAME_MINUTES, EventKind
from sarnic.core.events import EventBus, get_event_bus
from sarnic.core.logging import get_logger
from sarnic.data.archive import ArchiveDownloader
from sarnic.data.binance import BinanceRest, BinanceWebSocket, Kline, OrderBook, Ticker24h
from sarnic.data.quality import audit_frame, persist_report
from sarnic.data.ratelimiter import IPBannedError, get_rate_limiter
from sarnic.data.store import (
    first_bar_time,
    last_bar_time,
    load_frame,
    upsert_klines,
    upsert_symbol_info,
)
from sarnic.db.models import OHLCV, DataQualityReport, SpreadSample
from sarnic.db.session import session_scope

log = get_logger(__name__)


def _monotonic() -> float:
    """Duvar saatinden bağımsız süre — sistem saati geri alınırsa şaşmaz."""
    return asyncio.get_running_loop().time()


@dataclass(slots=True)
class _BarBatch:
    """Aynı (zaman dilimi, bar) için biriken kapanış sayısı."""

    count: int
    updated: float


# Redis anahtarları — tek isimlendirme yeri.
KEY_TICKERS = "sarnic:md:tickers"  # hash symbol -> json
KEY_BOOK = "sarnic:md:book:{symbol}"  # json
KEY_LAST_BAR = "sarnic:md:lastbar:{tf}"  # hash symbol -> json
KEY_HEARTBEAT = "sarnic:md:heartbeat"
KEY_STATUS = "sarnic:md:status"

EXCHANGE_INFO_TTL = timedelta(hours=6)
# `!ticker@arr` bu süre boyunca sessiz kalırsa REST yedeğine düşülür.
TICKER_SILENCE_LIMIT = 90
TICKER_FALLBACK_INTERVAL = 60
# Akış sağlıklıyken bile bu aralıkta bir tam REST anlık görüntüsü alınır.
# Ağırlık 80; 15 dakikada bir ≈ dakikada 5, 6000'lik bütçenin binde biri.
TICKER_FULL_REFRESH_INTERVAL = 900
# Arka plan görevlerinin sağlık kontrolü aralığı.
TASK_WATCHDOG_INTERVAL = 30
# §3.2 filtre 7: "10 örnek, 1 saat boyunca". 6 dakikalık aralıkta 10 örnek tam
# 54 dakika sürüyor ve 1 saatlik pencerede yalnızca 6 dakika pay bırakıyordu —
# servisin her yeniden başlaması sayacı sıfırladığı için havuz kurulamıyordu.
# 5 dakika ile 10 örnek 45 dakikada tamamlanıyor; örnekler yine saate yayılıyor.
SPREAD_SAMPLE_INTERVAL = timedelta(minutes=5)
# Havuz yalnızca son 1 saatin örneklerini kullanır; gerisini saklamak
# günde ~56 bin satır biriktirip sorguyu yavaşlatır. Denetim izi kalsın
# diye yine de bir haftalık geçmiş tutuluyor.
SPREAD_RETENTION = timedelta(days=7)
SPREAD_PRUNE_INTERVAL = timedelta(hours=6)
# Saatlik kalite denetimi, bar kapanışından bu kadar sonra çalışır — kapanan
# barın yazılmasına zaman tanır, aksi halde her turda sahte bir boşluk görürüz.
AUDIT_DELAY = timedelta(minutes=2)
# Bar kapanış olayları toplu yayınlanır; grup bu kadar süre sessiz kalınca boşalır.
BAR_FLUSH_INTERVAL = 2.0
BAR_FLUSH_QUIET = 4.0


def _json(obj) -> str:
    def default(o):
        if isinstance(o, datetime):
            return o.isoformat()
        if hasattr(o, "__float__"):
            return float(o)
        return str(o)

    return json.dumps(obj, default=default)


class MarketDataService:
    def __init__(
        self,
        rest: BinanceRest | None = None,
        bus: EventBus | None = None,
        redis_url: str | None = None,
    ) -> None:
        self.rest = rest or BinanceRest(limiter=get_rate_limiter())
        self.archive = ArchiveDownloader()
        self.bus = bus or get_event_bus()
        self._redis_url = redis_url or settings.redis_url
        self._redis: aioredis.Redis | None = None
        self.deadman = Deadman("marketdata", threshold_seconds=900)

        self.ws_ticker = BinanceWebSocket()
        self.ws_kline = BinanceWebSocket()
        self.ws_depth = BinanceWebSocket()

        self.tracked_symbols: set[str] = set()
        self.book_symbols: set[str] = set()
        # Karar dilimi 1h; 4h ve 1d **tüketiciler tarafından zorunlu** olduğu için
        # burada. Yalnızca 15m/1h dinlendiği sürece 1d ve 4h satırları tek seferlik
        # backfill'de ne yazıldıysa o kalıyordu ve 15 Ağustos'tan beri donmuştu
        # (`SYSTEM-REVIEW` §2). Donmuş 1d üç yeri sessizce besliyordu: havuzun
        # volatilite + aralık filtreleri, BTC rejim çarpanı (bir risk kontrolü) ve
        # puanlamanın `trend_4h` / `trend_1d` özellikleri.
        self.timeframes: list[str] = ["15m", "30m", "1h", "4h", "1d"]

        self._last_message_at: datetime | None = None
        self._last_ticker_at: datetime | None = None
        self._stale_announced = False
        self._exchange_info_at: datetime | None = None
        self._last_spread_sample: datetime | None = None
        self._last_spread_prune: datetime | None = None
        # (zaman dilimi, bar açılışı) → o an kapanan sembol sayısı.
        self._bar_batches: dict[tuple[str, str], _BarBatch] = {}
        # İsim → görev. Sözlük olması **kasıtlı**: liste kullanıldığında
        # `restart_streams` yenisini ekleyip eskisini bırakıyor, gözcü de
        # ölmüş kaydı görüp sürekli yeni Binance bağlantısı açıyordu.
        self._tasks: dict[str, asyncio.Task] = {}
        self._stop = asyncio.Event()

    # ------------------------------------------------------------------ #
    async def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    # ------------------------------------------------------------------ #
    #  exchangeInfo
    # ------------------------------------------------------------------ #
    async def refresh_exchange_info(self, force: bool = False) -> int:
        now = utcnow()
        if (
            not force
            and self._exchange_info_at is not None
            and now - self._exchange_info_at < EXCHANGE_INFO_TTL
        ):
            return 0

        data = await self.rest.exchange_info()
        rows: list[dict] = []
        for s in data.get("symbols", []):
            tick_size = step_size = min_notional = 0.0
            for f in s.get("filters", []):
                if f["filterType"] == "PRICE_FILTER":
                    tick_size = float(f["tickSize"])
                elif f["filterType"] == "LOT_SIZE":
                    step_size = float(f["stepSize"])
                elif f["filterType"] in ("MIN_NOTIONAL", "NOTIONAL"):
                    min_notional = float(f.get("minNotional", f.get("notional", 0)))
            rows.append(
                {
                    "symbol": s["symbol"],
                    "base_asset": s["baseAsset"],
                    "quote_asset": s["quoteAsset"],
                    "status": s["status"],
                    "is_spot_allowed": "SPOT" in s.get("permissions", [])
                    or s.get("isSpotTradingAllowed", False),
                    "tick_size": tick_size,
                    "step_size": step_size,
                    "min_notional": min_notional,
                    "updated_at": now,
                }
            )

        async with session_scope() as session:
            await upsert_symbol_info(session, rows)
        self._exchange_info_at = now
        log.info("exchange_info_refreshed", symbols=len(rows))
        return len(rows)

    async def backfill_listing_dates(self, symbols: list[str]) -> None:
        """AgeFilter için listelenme tarihi = en eski 1d barın zamanı."""
        async with session_scope() as session:
            from sqlalchemy import update

            from sarnic.db.models import SymbolInfo

            for symbol in symbols:
                first = await first_bar_time(session, symbol, "1d")
                if first is not None:
                    await session.execute(
                        update(SymbolInfo)
                        .where(SymbolInfo.symbol == symbol, SymbolInfo.listed_at.is_(None))
                        .values(listed_at=first)
                    )

    # ------------------------------------------------------------------ #
    #  Geçmiş dolgu
    # ------------------------------------------------------------------ #
    async def backfill(
        self,
        symbol: str,
        timeframe: str,
        days: int = 400,
        audit: bool = True,
        archive_only: bool = False,
    ) -> int:
        """Arşivden toplu indir, sonra REST ile son deliği kapat.

        `archive_only=True` REST adımını atlar ve dolgu **sıfır ağırlık**
        harcar: `data.binance.vision` statik bir CDN'dir, IP başına ağırlık
        bütçesine tabi değildir.

        Bu, çalışan servisin dışından toplu dolgu yapabilmenin anahtarıdır.
        Hız sınırlayıcı süreç içi bir tekildir (Redis ile koordine değil), yani
        ikinci bir süreçten REST'e gitmek aynı IP bütçesini iki yerden
        harcamak olurdu — bozulmaz kural 5'in koruduğu şey tam olarak budur.
        Arşiv yolunda o sorun yoktur.

        Bedeli: arşiv dünden öteye gitmez, yani son bir-iki bar eksik kalır.
        Havuz filtreleri için bu önemsizdir (volatilite 40 barlık çerçevenin
        15+ barından hesaplanır); sembol havuza girdiğinde WS akışı zaten
        onu izlemeye başlar ve kuyruk kendiliğinden kapanır.
        """
        end = datetime.now(UTC).date()
        start = end - timedelta(days=days)

        klines = await self.archive.download(symbol, timeframe, start, end)
        written = 0
        if klines:
            async with session_scope() as session:
                written += await upsert_klines(session, klines)

        # Arşiv dünden öteye gitmez; kalanı REST ile tamamla.
        if not archive_only:
            async with session_scope() as session:
                last = await last_bar_time(session, symbol, timeframe)
            rest_start = last + timedelta(minutes=TIMEFRAME_MINUTES[timeframe]) if last else None
            if rest_start is None or rest_start < datetime.now(UTC):
                try:
                    recent = await self.rest.klines(symbol, timeframe, start=rest_start, limit=1000)
                    async with session_scope() as session:
                        written += await upsert_klines(session, recent)
                except IPBannedError:
                    raise
                except Exception as exc:
                    log.warning("backfill_rest_failed", symbol=symbol, error=str(exc))

        if audit:
            await self.audit_symbol(symbol, timeframe)
        return written

    async def audit_symbol(self, symbol: str, timeframe: str, limit: int = 2000) -> int:
        async with session_scope() as session:
            df = await load_frame(session, symbol, timeframe, limit=limit)
            # `now` geçilince çerçevenin sonuna da bakılır: bir dilim tamamen
            # durduğunda iç boşluk oluşmaz ve denetim "temiz" derdi.
            report = audit_frame(df, symbol, timeframe, now=utcnow())
            written = await persist_report(session, report)

        if report.gaps:
            await self.repair_gaps(symbol, timeframe, report)
        else:
            # Temiz bir denetim, eski boşlukların **kapandığının kanıtıdır**.
            # `resolved` alanı modelde vardı ama hiçbir yer doldurmuyordu;
            # panel onarılmış boşlukları güncel sorunmuş gibi listeliyordu.
            await self.close_resolved_gaps(symbol, timeframe)
        return written

    async def close_resolved_gaps(self, symbol: str, timeframe: str) -> int:
        """Bu sembol/zaman dilimi için açık kalan boşluk bulgularını kapatır."""
        async with session_scope() as session:
            result = await session.execute(
                update(DataQualityReport)
                .where(
                    DataQualityReport.kind == "gap",
                    DataQualityReport.symbol == symbol,
                    DataQualityReport.timeframe == timeframe,
                    DataQualityReport.resolved.is_(False),
                )
                .values(resolved=True)
            )
        closed = result.rowcount or 0
        if closed:
            log.info("quality_gaps_closed", symbol=symbol, timeframe=timeframe, count=closed)
        return closed

    @staticmethod
    def _gap_time(value: str) -> datetime:
        """Bulgu detayındaki ISO damgasını okur (her zaman UTC yazılır)."""
        return datetime.fromisoformat(value)

    async def verify_open_gaps(self) -> int:
        """Açık kalan **tüm** boşluk bulgularını verinin kendisine karşı doğrular.

        `close_resolved_gaps` yalnızca o sembol denetlenirken çalışır, denetim
        de yalnızca `tracked_symbols` üzerinde döner. Bir sembol havuzdan
        çıkınca bulguları sonsuza dek açık kalır: ölçüldüğünde panelde duran
        21 ERROR boşluğun **tamamı** çoktan onarılmıştı ve hiçbiri havuzda
        değildi. Kalıcı hayalet hatalar, kullanıcıya sayfayı yok saymayı
        öğretir — boş sayfa kadar zararlıdır.

        Burada varsayım yok, sayım var: bulgunun aralığındaki barlar artık
        mevcutsa bulgu kapanır.
        """
        closed = 0
        async with session_scope() as session:
            rows = (
                (
                    await session.execute(
                        select(DataQualityReport).where(
                            DataQualityReport.kind == "gap",
                            DataQualityReport.resolved.is_(False),
                        )
                    )
                )
                .scalars()
                .all()
            )
            for row in rows:
                start, end = row.detail.get("start"), row.detail.get("end")
                if not start or not end:
                    continue
                minutes = TIMEFRAME_MINUTES.get(row.timeframe)
                if not minutes:
                    continue
                aralik = self._gap_time(end) - self._gap_time(start)
                beklenen = int(aralik.total_seconds() // (minutes * 60)) + 1
                mevcut = (
                    await session.execute(
                        select(func.count())
                        .select_from(OHLCV)
                        .where(
                            OHLCV.symbol == row.symbol,
                            OHLCV.timeframe == row.timeframe,
                            OHLCV.open_time >= self._gap_time(start),
                            OHLCV.open_time <= self._gap_time(end),
                        )
                    )
                ).scalar_one()
                if mevcut >= beklenen:
                    row.resolved = True
                    closed += 1
        if closed:
            log.info("quality_gaps_verified_closed", count=closed)
        return closed

    async def repair_gaps(self, symbol: str, timeframe: str, report) -> int:
        """Boşlukları REST ile otomatik yeniden çeker (§2.3)."""
        filled = 0
        for gap in report.gaps:
            try:
                klines = await self.rest.klines_range(symbol, timeframe, gap.start, gap.end)
            except IPBannedError:
                raise
            except Exception as exc:
                log.warning("gap_repair_failed", symbol=symbol, error=str(exc))
                continue
            if klines:
                async with session_scope() as session:
                    filled += await upsert_klines(session, klines)
        if filled:
            log.info("gaps_repaired", symbol=symbol, timeframe=timeframe, bars=filled)
        return filled

    # ------------------------------------------------------------------ #
    #  Akışlar
    # ------------------------------------------------------------------ #
    def set_tracked(self, symbols: list[str]) -> None:
        self.tracked_symbols = set(symbols)

    def set_book_symbols(self, symbols: list[str]) -> None:
        """Yalnızca açık pozisyon ve aday coinler için derinlik akışı (§2.1)."""
        self.book_symbols = set(symbols)

    async def _mark_alive(self) -> None:
        self._last_message_at = utcnow()
        if self._stale_announced:
            self._stale_announced = False
            await self.bus.emit(EventKind.DATA_STALE, level="INFO", recovered=True)
            log.info("stale_recovered")
        r = await self.redis()
        await r.set(KEY_HEARTBEAT, self._last_message_at.isoformat(), ex=300)

    async def run_ticker_stream(self) -> None:
        """Tüm piyasa 24s özeti — `!miniTicker@arr`.

        **`!ticker@arr` kullanılmıyor, çünkü Binance onu göndermiyor.** Abonelik
        kabul ediliyor, bağlantı kuruluyor ve tek bir mesaj bile gelmiyor.
        Ölçüldü (2026-08-18): 9443, 443 ve `data-stream.binance.vision`
        uçlarının üçünde de 25 saniyede 0 mesaj. Aynı davranış `!bookTicker`'da
        da var — ikisi de en ağır tüm-piyasa akışları. Buna karşılık tek
        sembollü `btcusdt@ticker` ve tüm piyasa `!miniTicker@arr` sorunsuz
        çalışıyor, yani sorun bizim ağımızda ya da kodumuzda değil.

        `miniTicker` yükünde yüzde değişim alanı (`P`) yoktur; açılış (`o`) ve
        kapanıştan (`c`) hesaplanır. Diğer alanlar birebir aynıdır.

        Bir fark daha: `miniTicker` her saniye **yalnızca o saniyede işlem
        gören** sembolleri gönderir, hepsini birden değil. Bu yüzden periyodik
        REST tazelemesi korundu (`run_ticker_fallback`) — hiç işlem görmeyen
        bir sembol aksi hâlde Redis'te hiç oluşmazdı.
        """
        async for msg in self.ws_ticker.stream(["!miniTicker@arr"]):
            tickers = BinanceWebSocket.parse_ticker_array(msg)
            if not tickers:
                continue
            self._last_ticker_at = utcnow()
            await self._store_tickers(tickers)
            await self._mark_alive()

    async def run_ticker_fallback(self) -> None:
        """REST ile 24s istatistikleri: akış sustuğunda **ve** periyodik olarak.

        Bu akış Binance tarafında bazen hiç mesaj göndermiyor (bağlantı kurulur,
        veri gelmez). Havuz sıralaması ve panel fiyatları buna bağlı olduğu için
        sessiz kalmak sistemi kör bırakır — bu yüzden bir yedek yol var.

        Maliyet kabul edilebilir: `ticker/24hr` ağırlığı 80, dakikada bir çağrı
        6000'lik bütçenin %1,3'ü. Yedeğe düşüldüğü **açıkça loglanır**; sessizce
        REST'e kaymak, veri yolunu belirsiz hâle getirirdi.
        """
        announced = False
        last_full: datetime | None = None
        while not self._stop.is_set():
            await asyncio.sleep(TICKER_FALLBACK_INTERVAL)

            fresh = (
                self._last_ticker_at is not None
                and (utcnow() - self._last_ticker_at).total_seconds() < TICKER_SILENCE_LIMIT
            )
            # Akış sağlıklıyken bile ara sıra tam bir anlık görüntü gerekir:
            # `miniTicker` yalnızca işlem gören sembolleri gönderir, dolayısıyla
            # sessiz bir sembol akışta hiç görünmez. Havuz adaylarının eksiksiz
            # olması buna bağlı.
            due_full = (
                last_full is None
                or (utcnow() - last_full).total_seconds() >= TICKER_FULL_REFRESH_INTERVAL
            )
            if fresh:
                if announced:
                    log.info("ticker_stream_recovered")
                    announced = False
                if not due_full:
                    continue

            try:
                tickers = await self.rest.ticker_24h()
            except IPBannedError:
                raise
            except Exception as exc:
                log.warning("ticker_fallback_failed", error=str(exc))
                continue

            if not fresh and not announced:
                log.warning(
                    "ticker_fallback_active",
                    message=(
                        "Ticker akışından veri gelmiyor; 24s istatistikleri "
                        "REST'ten çekiliyor (dakikada bir, ağırlık 80)."
                    ),
                )
                announced = True

            last_full = utcnow()
            await self._store_tickers(tickers)
            if not fresh:
                await self._mark_alive()

    async def _store_tickers(self, tickers: list[Ticker24h]) -> None:
        r = await self.redis()
        mapping = {t.symbol: _json(asdict(t)) for t in tickers}
        if mapping:
            await r.hset(KEY_TICKERS, mapping=mapping)
            await r.expire(KEY_TICKERS, 600)

    async def run_kline_streams(self) -> None:
        # Sembol listesi boşken `return` etmek görevi bitirir ve gözcü bunu
        # "öldü" sayıp durmadan yeniden başlatır. Beklemek doğrusu.
        if not await self._await_symbols(lambda: self.tracked_symbols):
            return
        streams = [
            f"{s.lower()}@kline_{tf}"
            for s in sorted(self.tracked_symbols)
            for tf in self.timeframes
        ]
        async for msg in self.ws_kline.stream(streams):
            kline = BinanceWebSocket.parse_kline_event(msg)
            if kline is None:
                continue
            await self._mark_alive()
            await self._store_last_bar(kline)
            if kline.is_closed:
                async with session_scope() as session:
                    await upsert_klines(session, [kline])
                self._note_bar_close(kline)

    def _note_bar_close(self, kline: Kline) -> None:
        """Kapanan barı sayar; olay **toplu** yayınlanır.

        Her sembol için ayrı olay yayınlanıyordu: 45 sembol × 2 zaman dilimi =
        çeyrek saatte 90 olay. Son 500 olayın 484'ü buydu — pozisyon açılışı,
        puan eşiği ve risk olayları bu gürültüde kayboluyor, 50.000'lik akış
        tamponu birkaç saatte doluyordu. Panelin "bugünkü olaylar" kutusu
        işe yaramaz haldeydi.

        Sembol düzeyindeki ayrıntı `journal`'da kalır; olay veriyolu insanın
        bakacağı şeyler içindir.
        """
        key = (kline.timeframe, kline.open_time.isoformat())
        batch = self._bar_batches.get(key)
        if batch is None:
            self._bar_batches[key] = _BarBatch(count=1, updated=_monotonic())
        else:
            batch.count += 1
            batch.updated = _monotonic()

    async def run_bar_event_flusher(self) -> None:
        """Toplanan bar kapanışlarını tek olayda yayınlar."""
        while not self._stop.is_set():
            await asyncio.sleep(BAR_FLUSH_INTERVAL)
            now = _monotonic()
            for key, batch in list(self._bar_batches.items()):
                # Grup hâlâ büyüyorsa bekle — bütün semboller gelsin.
                if now - batch.updated < BAR_FLUSH_QUIET:
                    continue
                del self._bar_batches[key]
                timeframe, _open_time = key
                await self.bus.emit(
                    EventKind.LOG,
                    message=f"{timeframe} bar kapandı — {batch.count} sembol",
                )

    async def _store_last_bar(self, kline: Kline) -> None:
        """Kapanmamış bar Redis'te durur; DB'ye ve karara girmez."""
        r = await self.redis()
        await r.hset(KEY_LAST_BAR.format(tf=kline.timeframe), kline.symbol, _json(kline.as_row()))

    async def run_depth_stream(self) -> None:
        if not await self._await_symbols(lambda: self.book_symbols):
            return
        # 100ms yerine 1000ms: karar birimi 15 dakika ve üzeri olan bir sistemde
        # emir defterinin saniyede on kez tazelenmesinin karşılığı yok. Saniyelik
        # akış, sembol başına trafiği onda bire indiriyor ve bu sayede defter
        # havuzun tamamını kapsayabiliyor (bkz. `_book_selection`).
        streams = [f"{s.lower()}@depth20@1000ms" for s in sorted(self.book_symbols)]
        async for msg in self.ws_depth.stream(streams):
            book = BinanceWebSocket.parse_depth(msg)
            if book is None:
                continue
            await self._mark_alive()
            await self._store_book(book)

    async def _store_book(self, book: OrderBook) -> None:
        r = await self.redis()
        payload = {
            "symbol": book.symbol,
            "bids": [[str(lv.price), str(lv.qty)] for lv in book.bids],
            "asks": [[str(lv.price), str(lv.qty)] for lv in book.asks],
            "at": book.at.isoformat(),
        }
        await r.set(KEY_BOOK.format(symbol=book.symbol), _json(payload), ex=60)

    # ------------------------------------------------------------------ #
    #  Spread örnekleme (havuz filtresi 7)
    # ------------------------------------------------------------------ #
    async def sample_spreads(self, symbols: list[str]) -> int:
        """Spread örneği toplar (§3.2 filtre 7).

        Birincil kaynak REST `bookTicker`: tek çağrı, ağırlık 4, tüm evren.
        Derinlik akışı (`@depth20`) yalnızca emir dolumu için gerekli; onu
        spread örneklemesine bağlamak kırılgandı — akış sessizce ölünce
        örnekleme de duruyor ve havuz asla kurulamıyordu.

        Redis'te taze defter varsa o tercih edilir (daha yeni veri); yoksa
        REST anlık görüntüsü kullanılır.
        """
        now = utcnow()
        wanted = set(symbols)

        try:
            book_tickers = await self.rest.book_ticker()
        except IPBannedError:
            raise
        except Exception as exc:
            log.warning("book_ticker_failed", error=str(exc))
            book_tickers = {}

        r = await self.redis()
        rows: list[SpreadSample] = []
        for symbol in sorted(wanted):
            spread = await self._spread_from_book(r, symbol)
            if spread is None:
                quote = book_tickers.get(symbol)
                if quote is None:
                    continue
                bid, ask = float(quote[0]), float(quote[1])
                mid = (bid + ask) / 2
                if mid <= 0:
                    continue
                spread = (ask - bid) / mid * 100
            rows.append(SpreadSample(symbol=symbol, spread_pct=spread, sampled_at=now))

        if rows:
            async with session_scope() as session:
                session.add_all(rows)
        self._last_spread_sample = now
        log.info("spread_sampled", symbols=len(rows), from_rest=len(book_tickers) > 0)
        return len(rows)

    async def spread_candidates(self, count: int = 260) -> list[str]:
        """Spread örneği toplanacak semboller.

        Havuz ön elemesi hacme göre ilk 250 adayı alıyor (§3.2 filtre 5) ve
        `SpreadFilter` bunların **hepsi** için örnek istiyor. Yalnızca izlenen
        40 sembolü örneklemek havuzu 40'a hapsederdi. `bookTicker` tek çağrıda
        tüm evreni döndürdüğü için geniş örneklemenin ek maliyeti yok.
        """
        from sarnic.universe.filters import STABLECOINS, is_leveraged_token

        r = await self.redis()
        tickers = await read_tickers(r)
        ranked: list[tuple[float, str]] = []
        for symbol, data in tickers.items():
            if not symbol.endswith("USDT"):
                continue
            base = symbol[: -len("USDT")]
            if base in STABLECOINS or is_leveraged_token(base):
                continue
            try:
                ranked.append((float(data["quote_volume"]), symbol))
            except (KeyError, TypeError, ValueError):
                continue
        ranked.sort(reverse=True)
        candidates = {symbol for _, symbol in ranked[:count]}
        # Açık pozisyonu olan semboller sıralamadan düşse de örneklenmeye devam eder.
        candidates |= self.book_symbols
        return sorted(candidates)

    async def _spread_from_book(self, r, symbol: str) -> float | None:
        """Redis'teki canlı defterden spread; defter yoksa `None`."""
        raw = await r.get(KEY_BOOK.format(symbol=symbol))
        if not raw:
            return None
        d = json.loads(raw)
        if not d.get("bids") or not d.get("asks"):
            return None
        bid, ask = float(d["bids"][0][0]), float(d["asks"][0][0])
        mid = (bid + ask) / 2
        return (ask - bid) / mid * 100 if mid > 0 else None

    # ------------------------------------------------------------------ #
    #  Bayat veri gözcüsü
    # ------------------------------------------------------------------ #
    async def run_stale_watchdog(self) -> None:
        while not self._stop.is_set():
            await asyncio.sleep(10)
            if self._last_message_at is None:
                continue
            silence = (utcnow() - self._last_message_at).total_seconds()
            if silence > settings.stale_data_seconds and not self._stale_announced:
                self._stale_announced = True
                log.error("data_stale", silence_s=round(silence, 1))
                await self.bus.emit(
                    EventKind.DATA_STALE,
                    level="CRITICAL",
                    silence_seconds=round(silence, 1),
                    message=(
                        f"Piyasa verisi {silence:.0f} saniyedir gelmiyor. "
                        "Yeni emir gönderilmiyor; mevcut stop'lar aktif."
                    ),
                )
                r = await self.redis()
                await r.set(KEY_STATUS, "STALE", ex=600)

    async def prune_spread_samples(self) -> int:
        """Saklama süresini aşan spread örneklerini siler."""
        cutoff = utcnow() - SPREAD_RETENTION
        async with session_scope() as session:
            result = await session.execute(
                delete(SpreadSample).where(SpreadSample.sampled_at < cutoff)
            )
        self._last_spread_prune = utcnow()
        removed = result.rowcount or 0
        if removed:
            log.info("spread_samples_pruned", removed=removed, older_than=cutoff.isoformat())
        return removed

    async def run_quality_audit(self) -> None:
        """Saatlik veri kalitesi denetimi — §2.3.

        Spec denetimi "her backfill **ve her saatlik döngü sonrası**" ister.
        Yalnızca backfill'de çalışıyordu; ilk dolgudan sonra hiçbir bar
        denetlenmiyor, panelin veri kalitesi sayfası kalıcı olarak boş
        kalıyordu. Boş bir sayfa "sorun yok" ile "hiç bakılmadı"yı aynı
        gösterir — dürüstlük kuralına aykırı.

        Bar kapanışından sonra çalışır (`AUDIT_DELAY`), çünkü kapanan barın
        yazılması birkaç saniye sürer. Denetim boşluk bulursa `audit_symbol`
        zaten REST ile onarımı tetikler; onarım tek merkezden (bu servis)
        gittiği için kural 5 korunur.

        **Topladığımız her dilim denetlenir.** Önce yalnızca karar dilimi (1h)
        denetleniyordu; 1d ve 4h iki gün boyunca donmuşken denetim "0 bulgu"
        raporluyor ve panel temiz görünüyordu (`SYSTEM-REVIEW` §2). Denetlenmeyen
        bir dilim, sessizce durabilen bir dilimdir.
        """
        ilk_tur = True
        while not self._stop.is_set():
            if ilk_tur:
                # Açılıştan 2 dk sonra BİR KEZ erken denetim: uzun bir
                # kesintiden dönüldüyse boşluklar saat başını beklemeden
                # onarılsın (24 saatlik kesinti sonrası 25 barlık delik
                # bir saat daha açık kalmasın).
                ilk_tur = False
                await asyncio.sleep(120)
            else:
                await asyncio.sleep(self._seconds_to_next_audit())
            if self._stop.is_set():
                return
            try:
                symbols = sorted(self.tracked_symbols)
                per_tf: dict[str, int] = {}
                for timeframe in self.timeframes:
                    found = 0
                    for symbol in symbols:
                        found += await self.audit_symbol(symbol, timeframe)
                    per_tf[timeframe] = found
                kapanan = await self.verify_open_gaps()
                log.info(
                    "quality_audit_completed",
                    symbols=len(symbols),
                    findings=sum(per_tf.values()),
                    per_timeframe=per_tf,
                    closed=kapanan,
                )
            except IPBannedError:
                raise
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("quality_audit_failed")

    @staticmethod
    def _seconds_to_next_audit() -> float:
        """Bir sonraki saat başı + `AUDIT_DELAY` anına kalan süre."""
        now = utcnow()
        next_hour = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        return max(1.0, (next_hour + AUDIT_DELAY - now).total_seconds())

    async def run_periodic_maintenance(self) -> None:
        while not self._stop.is_set():
            try:
                await self.refresh_exchange_info()
                if (
                    self._last_spread_sample is None
                    or utcnow() - self._last_spread_sample >= SPREAD_SAMPLE_INTERVAL
                ):
                    await self.sample_spreads(await self.spread_candidates())

                if (
                    self._last_spread_prune is None
                    or utcnow() - self._last_spread_prune >= SPREAD_PRUNE_INTERVAL
                ):
                    await self.prune_spread_samples()
            except IPBannedError:
                await self.bus.emit(
                    EventKind.API_BANNED,
                    level="CRITICAL",
                    message=(
                        "Binance IP yasağı (418). Tüm istekler durdu, insan müdahalesi gerekiyor."
                    ),
                )
            except Exception:
                log.exception("maintenance_failed")
            await asyncio.sleep(60)

    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        # Deadman en önce: açılışta asılı kalmak da (ör. ölü ağda
        # refresh_exchange_info) donmadır ve aynı sigortaya tabidir.
        self.deadman.start()
        get_rate_limiter().set_ban_callback(
            lambda retry: asyncio.create_task(
                self.bus.emit(EventKind.API_BANNED, level="CRITICAL", retry_after=retry)
            )
        )
        await self.refresh_exchange_info(force=True)
        self._spawn_all()
        self._tasks["md-watchdog"] = asyncio.create_task(
            self.run_task_watchdog(), name="md-watchdog"
        )
        log.info("marketdata_started", tracked=len(self.tracked_symbols))

    # Görev adı → onu üreten fabrika. Gözcü ölenleri buradan diriltir.
    def _task_factories(self) -> dict[str, object]:
        return {
            "md-ticker": self.run_ticker_stream,
            "md-ticker-fallback": self.run_ticker_fallback,
            "md-kline": self.run_kline_streams,
            "md-depth": self.run_depth_stream,
            "md-stale": self.run_stale_watchdog,
            "md-maint": self.run_periodic_maintenance,
            "md-quality": self.run_quality_audit,
            "md-bar-events": self.run_bar_event_flusher,
        }

    def _spawn_all(self) -> None:
        for name, factory in self._task_factories().items():
            self._replace_task(name, factory)

    async def _await_symbols(self, getter, poll: int = 15) -> bool:
        """Sembol listesi dolana kadar bekler. Servis durursa `False` döner."""
        while not self._stop.is_set():
            if getter():
                return True
            await asyncio.sleep(poll)
        return False

    def _replace_task(self, name: str, factory) -> None:
        """Aynı isimli görevi iptal edip yerine yenisini koyar.

        Her isimden **tek** görev olmasını garanti eder; aksi hâlde kopyalar
        birikip her biri ayrı bir WebSocket bağlantısı açıyordu.
        """
        existing = self._tasks.get(name)
        if existing is not None and not existing.done():
            existing.cancel()
        self._tasks[name] = asyncio.create_task(factory(), name=name)

    async def run_task_watchdog(self) -> None:
        """Ölen arka plan görevlerini fark eder, loglar ve yeniden başlatır.

        Bu olmadan bir görev sessizce ölebiliyordu: `asyncio` görev istisnasını
        kimse `await` etmediği için yutuyor, servis "çalışıyor" görünüyor ama
        veri akmıyordu. Gerçekte yaşanan buydu — kline ve derinlik akışları
        durdu, kimse fark etmedi, spread örneklemesi 9 örnekte dondu ve havuz
        hiç kurulamadı.
        """
        factories = self._task_factories()
        while not self._stop.is_set():
            # Döngü dönüyorsa süreç canlı — internet kesik olsa bile deadman
            # tetiklenmemeli; hedef çevrimdışılık değil DONMADIR.
            self.deadman.beat()
            await asyncio.sleep(TASK_WATCHDOG_INTERVAL)

            for name, factory in factories.items():
                task = self._tasks.get(name)
                if task is None or not task.done():
                    continue

                error: BaseException | None = None
                with contextlib.suppress(asyncio.CancelledError, asyncio.InvalidStateError):
                    error = task.exception()

                log.error(
                    "task_died",
                    task=name,
                    error=repr(error) if error else "istisna olmadan sonlandı",
                )
                await self.bus.emit(
                    EventKind.LOG,
                    level="ERROR",
                    message=f"Piyasa verisi görevi durdu ve yeniden başlatılıyor: {name}",
                )
                self._replace_task(name, factory)

    async def stop(self) -> None:
        self._stop.set()
        for ws in (self.ws_ticker, self.ws_kline, self.ws_depth):
            ws.stop()
        for task in self._tasks.values():
            task.cancel()
        for task in self._tasks.values():
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._tasks.clear()
        await self.rest.close()
        await self.archive.close()
        if self._redis is not None:
            await self._redis.aclose()
        log.info("marketdata_stopped")

    async def restart_streams(self) -> None:
        """Havuz değişince kline/depth aboneliklerini yeniler."""
        for ws in (self.ws_kline, self.ws_depth):
            ws.stop()
        await asyncio.sleep(0.2)
        self.ws_kline = BinanceWebSocket()
        self.ws_depth = BinanceWebSocket()
        self._replace_task("md-kline", self.run_kline_streams)
        self._replace_task("md-depth", self.run_depth_stream)


# --------------------------------------------------------------------------- #
#  Okuma yardımcıları — botlar ve API bunları kullanır
# --------------------------------------------------------------------------- #
async def read_tickers(redis: aioredis.Redis) -> dict[str, dict]:
    """Önbellekteki son fiyatlar. Redis cevap vermezse **boş** döner.

    Bu okuma `/positions`, `/portfolio/live` ve `/portfolio/metrics` uçlarının
    içindedir ve 210 sembollük bir hash getirir. Redis meşgulken (15 dakikada
    bir yapılan tam ticker tazelemesi sırasında) zaman aşımına uğrayabiliyor;
    o zaman istek 500 ile düşüyordu — kullanıcı pozisyon listesini hiç
    göremiyordu. Oysa canlı fiyat bu uçların **süsü**, iskeleti değil:
    çağıranların hepsi `last_price=None` durumunu zaten taşıyor.

    Hata yutulmuyor, günlüğe yazılıyor: sessiz varsayım yok. `CancelledError`
    ise yeniden fırlatılır — iptal edilen bir istek "veri yok" değildir.
    """
    try:
        raw = await redis.hgetall(KEY_TICKERS)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        log.warning("ticker_cache_unavailable", error=str(exc))
        return {}
    return {k: json.loads(v) for k, v in raw.items()}


async def read_book(redis: aioredis.Redis, symbol: str) -> dict | None:
    raw = await redis.get(KEY_BOOK.format(symbol=symbol))
    return json.loads(raw) if raw else None


async def read_last_bars(redis: aioredis.Redis, timeframe: str) -> dict[str, dict]:
    raw = await redis.hgetall(KEY_LAST_BAR.format(tf=timeframe))
    return {k: json.loads(v) for k, v in raw.items()}


async def data_is_stale(redis: aioredis.Redis) -> bool:
    beat = await redis.get(KEY_HEARTBEAT)
    if not beat:
        return True
    last = datetime.fromisoformat(beat)
    return (utcnow() - last).total_seconds() > settings.stale_data_seconds


async def bulk_backfill(
    symbols: list[str],
    timeframes: list[str],
    days: int = 400,
    *,
    archive_only: bool = False,
    audit: bool = True,
    progress=None,
) -> dict:
    """CLI'dan çağrılan toplu dolgu.

    `archive_only=True` iken hiçbir REST çağrısı yapılmaz — `exchange_info`
    tazelemesi de atlanır, çünkü o da REST'tir ve çalışan servis zaten
    periyodik olarak tazeliyor.

    `backfill_listing_dates` her hâlükârda çalışır: REST değil, saf DB işidir
    (en eski 1d barın zamanını `SymbolInfo.listed_at`'e yazar). 1d dolduktan
    sonra `AgeFilter` doğru yaşla elemeye başlar.

    `progress` verilirse her sembolden sonra `(index, toplam, sembol, yazılan)`
    ile çağrılır; 500 sembollük bir dolguda sessiz beklemek kabul edilemez.
    """
    service = MarketDataService()
    stats: dict[str, int] = {}
    try:
        if not archive_only:
            await service.refresh_exchange_info(force=True)

        total = len(timeframes) * len(symbols)
        done = 0
        for tf in timeframes:
            for symbol in symbols:
                written = 0
                try:
                    written = await service.backfill(
                        symbol, tf, days=days, audit=audit, archive_only=archive_only
                    )
                    stats[f"{symbol}:{tf}"] = written
                except IPBannedError:
                    log.critical("backfill_aborted_ip_ban")
                    return stats
                except Exception as exc:
                    log.warning("backfill_failed", symbol=symbol, tf=tf, error=str(exc))
                done += 1
                if progress is not None:
                    progress(done, total, f"{symbol}:{tf}", written)

        await service.backfill_listing_dates(symbols)
    finally:
        await service.rest.close()
        await service.archive.close()
    return stats


__all__ = [
    "KEY_BOOK",
    "KEY_LAST_BAR",
    "KEY_TICKERS",
    "MarketDataService",
    "bulk_backfill",
    "data_is_stale",
    "read_book",
    "read_last_bars",
    "read_tickers",
]
