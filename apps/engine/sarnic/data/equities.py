"""Hisse verisi — BIST (İş Yatırım) ve ABD (Yahoo) günlük barları.

Bozulmaz kural 5'in hisse ayağı: hisse verisi de TEK yerden çekilir — bu
servis. Botlar hiçbir sağlayıcıya doğrudan istek atmaz.

Kaynak kararları (araştırma: oturum raporları + docs/OPEN-QUESTIONS.md):

* **BIST** — İş Yatırım açık ucu. 2000'e kadar günlük seri; hem ham (HG_*)
  hem sermaye-işlemi düzeltilmiş (HGDG_*) fiyat verir; delist edilmiş
  sembollerin geçmişi durur. Düzeltilmiş seri (HGDG) saklanır: bölünme günü
  ham seride −%50'lik sahte getiri üretir ve momentum ailesini zehirler.
  Bunun bedeli dürüstçe not edildi: geçmiş bir sermaye işleminde satıcı
  seriyi geriye dönük değiştirir; `upsert` eski barların üstüne yazar.
* **ABD** — Yahoo chart API (bu IP'den ABD sembollerine açık; kişisel,
  ticari olmayan kullanım — proje zaten satılmaz). Seri bölünme-düzeltilmiş;
  delist geçmişi YOKTUR (hayatta kalma yanlılığı yapısal) — ölçüm notu
  olarak damgalanır. 1 saatlik hisse verisi için meşru ücretsiz kaynak
  bulunamadı; iki pazar da **1d** karar birimiyle çalışır.

Saatlik kripto akışının aksine burada WebSocket yok: günde bir kapanış,
seans sonrası bir REST çekimiyle gelir. Servis ayrıca paper motorunun
çalışabilmesi için sentetik emir defteri yazar — kapanış ± yarım spread.
Bu bir yaklaşımdır ve emir kayıtlarında `synthetic_book` olarak görünür.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx

from sarnic.core.calendar import ExchangeSessionCalendar, calendar_for
from sarnic.core.clock import utcnow
from sarnic.core.logging import get_logger
from sarnic.core.markets import BIST, US, Market
from sarnic.data.binance import Kline
from sarnic.data.marketdata import KEY_BOOK, KEY_TICKERS
from sarnic.data.quality import find_gaps
from sarnic.data.store import load_frame, upsert_klines
from sarnic.db.models import UniverseSnapshot
from sarnic.db.session import session_scope

log = get_logger(__name__)

#: Sentetik defterin yarım spread'i (baz puan). BIST likit isimlerde ölçülen
#: tipik spread ~10-20 bp, ABD büyük isimlerde ~2-5 bp; temkinli taraf seçildi.
HALF_SPREAD_BPS = {"BIST": 15.0, "US": 5.0}

#: Başlangıç evreni — bugünün likit isimleri. DÜRÜSTLÜK NOTU: bu listeler
#: bugünden geriye bakarak seçildi; geçmişe dönük bir ölçüm için kullanılamaz.
#: Dürüst evren bugünden itibaren `universe_snapshots` ile kurulur (kripto
#: tarafında 19 Haz–14 Ağu ölçüm zemininin çürümesine yol açan hatanın aynısını
#: hisselerde baştan yapmamak için).
BIST_SEED = [
    "THYAO",
    "GARAN",
    "ISCTR",
    "AKBNK",
    "YKBNK",
    "EREGL",
    "ASELS",
    "KCHOL",
    "SAHOL",
    "SISE",
    "TUPRS",
    "BIMAS",
    "TCELL",
    "PGSUS",
    "FROTO",
    "TOASO",
    "ARCLK",
    "PETKM",
    "KOZAL",
    "HEKTS",
    "SASA",
    "ENKAI",
    "TAVHL",
    "MGROS",
    "VESTL",
    "TTKOM",
    "AKSEN",
    "ODAS",
    "KRDMD",
    "EKGYO",
    "GUBRF",
    "ALARK",
    "OYAKC",
    "TKFEN",
    "DOHOL",
    "ISDMR",
    "CIMSA",
    "BRSAN",
    "ULKER",
    "AEFES",
    "ASTOR",
    "KONTR",
    "MIATK",
    "ENJSA",
    "AGHOL",
    "AKSA",
    "CCOLA",
    "DOAS",
    "EGEEN",
    "GESAN",
    "IPEKE",
    "KOZAA",
    "MAVI",
    "OTKAR",
    "SMRTG",
    "SOKM",
    "TSKB",
    "TTRAK",
    "VAKBN",
    "YEOTK",
]
US_SEED = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "TSLA",
    "AVGO",
    "BRK-B",
    "JPM",
    "LLY",
    "V",
    "UNH",
    "XOM",
    "MA",
    "COST",
    "HD",
    "PG",
    "JNJ",
    "ABBV",
    "WMT",
    "NFLX",
    "CRM",
    "BAC",
    "ORCL",
    "CVX",
    "MRK",
    "KO",
    "AMD",
    "PEP",
    "ADBE",
    "TMO",
    "CSCO",
    "ACN",
    "MCD",
    "LIN",
    "ABT",
    "INTU",
    "DIS",
    "WFC",
    "QCOM",
    "GE",
    "CAT",
    "TXN",
    "VZ",
    "IBM",
    "AMGN",
    "PM",
    "NOW",
    "ISRG",
    "SPGI",
    "GS",
    "NEE",
    "UBER",
    "PFE",
    "RTX",
    "HON",
    "AMAT",
    "T",
    "BLK",
    "UNP",
    "LOW",
    "BKNG",
    "ELV",
    "SYK",
    "TJX",
    "PLTR",
    "VRTX",
    "C",
    "BA",
    "PANW",
    "MU",
    "LRCX",
    "MDT",
    "SCHW",
    "ADP",
    "ANET",
    "DE",
    "KLAC",
    "SBUX",
]

REFRESH_CHECK_SECONDS = 300
STATE_REWRITE_SECONDS = 30
#: 1d BARS_NEEDED=300; pay bırakılır.
BACKFILL_SESSIONS = 420


@dataclass(slots=True)
class DailyBar:
    symbol: str  # ekli kanonik ad (THYAO.IS / AAPL.US)
    day: datetime  # UTC gece yarısı (seans günü)
    open: float
    high: float
    low: float
    close: float
    volume: float  # baz adet (yaklaşık olabilir — kaynak notuna bak)
    quote_volume: float  # pazar para biriminde ciro

    def as_kline(self) -> Kline:
        d = Decimal
        return Kline(
            symbol=self.symbol,
            timeframe="1d",
            open_time=self.day,
            open=d(str(self.open)),
            high=d(str(self.high)),
            low=d(str(self.low)),
            close=d(str(self.close)),
            volume=d(str(round(self.volume, 4))),
            quote_volume=d(str(round(self.quote_volume, 4))),
            trades=0,
            taker_buy_base=d("0"),
            taker_buy_quote=d("0"),
            is_closed=True,
        )


class IsYatirimClient:
    """İş Yatırım günlük seri istemcisi (BIST)."""

    URL = "https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/HisseTekil"

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def fetch_daily(self, base_symbol: str, start: datetime, end: datetime) -> list[DailyBar]:
        params = {
            "hisse": base_symbol,
            "startdate": start.strftime("%d-%m-%Y"),
            "enddate": end.strftime("%d-%m-%Y"),
        }
        resp = await self.client.get(self.URL, params=params)
        resp.raise_for_status()
        payload = resp.json()
        rows = payload.get("value") or []
        out: list[DailyBar] = []
        for row in rows:
            close = row.get("HGDG_KAPANIS")
            if close is None or close <= 0:
                continue
            day = datetime.strptime(row["HGDG_TARIH"], "%d-%m-%Y").replace(tzinfo=UTC)
            # HGDG_* düzeltilmiş seridir; MIN/MAX o günün aralığı, AOF ağırlıklı
            # ortalama. Açılış verilmez — AOF açılış YERİNE kullanılmaz; open'ı
            # bir önceki kapanışla doldurmak sahte boşluk üretirdi. Open=AOF
            # yerine open'ı da kapanışa eşitlemek gün içi şekli düzleştirir.
            # Karar: open = min/max aralığına kırpılmış AOF — gün içi tek
            # referans fiyat olarak en dürüst aday (docs/OPEN-QUESTIONS.md).
            aof = row.get("HGDG_AOF") or close
            low = float(row.get("HGDG_MIN") or close)
            high = float(row.get("HGDG_MAX") or close)
            open_ = min(max(float(aof), low), high)
            ciro = float(row.get("HGDG_HACIM") or 0.0)  # TL ciro
            out.append(
                DailyBar(
                    symbol=f"{base_symbol}{BIST.suffix}",
                    day=day,
                    open=open_,
                    high=high,
                    low=low,
                    close=float(close),
                    volume=ciro / float(close) if close else 0.0,
                    quote_volume=ciro,
                )
            )
        return out


class YahooDailyClient:
    """Yahoo chart API (ABD günlük). Kişisel kullanım; ToS notu modül başında."""

    URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def fetch_daily(self, base_symbol: str, sessions: int) -> list[DailyBar]:
        # range param: seans sayısını takvim gününe çevir (hafta sonu payı).
        days = max(30, int(sessions * 1.6))
        resp = await self.client.get(
            self.URL.format(symbol=base_symbol),
            params={"range": f"{days}d", "interval": "1d"},
        )
        resp.raise_for_status()
        result = (resp.json().get("chart", {}).get("result") or [None])[0]
        if not result:
            return []
        stamps = result.get("timestamp") or []
        quote = (result.get("indicators", {}).get("quote") or [{}])[0]
        out: list[DailyBar] = []
        for i, ts in enumerate(stamps):
            o, h, lo, c, v = (
                (quote.get("open") or [None])[i],
                (quote.get("high") or [None])[i],
                (quote.get("low") or [None])[i],
                (quote.get("close") or [None])[i],
                (quote.get("volume") or [None])[i],
            )
            if None in (o, h, lo, c) or c <= 0:
                continue
            day_local = datetime.fromtimestamp(ts, tz=UTC)
            # Yahoo damgası seans açılışıdır (13:30 UTC); seans GÜNÜNE indir.
            day = datetime(day_local.year, day_local.month, day_local.day, tzinfo=UTC)
            out.append(
                DailyBar(
                    symbol=f"{base_symbol}{US.suffix}",
                    day=day,
                    open=float(o),
                    high=float(h),
                    low=float(lo),
                    close=float(c),
                    volume=float(v or 0.0),
                    quote_volume=float(v or 0.0) * float(c),
                )
            )
        return out


class EquityDataService:
    """Günlük hisse barlarını çeker, DB + Redis durumunu tazeler.

    Döngü: her seans kapanışından sonra bir kez pazar başına tam çekim;
    aralarda yalnızca Redis durumu (ticker + sentetik defter) tazelenir ki
    TTL'ler dolmasın. Kapalı piyasada fiyat DEĞİŞMEZ — panel son seansın
    kapanışını görür, bu bir arıza değil piyasanın gerçeğidir.
    """

    def __init__(self, redis_factory) -> None:
        self._redis_factory = redis_factory
        self._redis = None
        self._stop = asyncio.Event()
        self._http: httpx.AsyncClient | None = None
        self._last_close: dict[str, float] = {}
        self._last_bar_day: dict[str, datetime] = {}
        self._refreshed_session: dict[str, datetime | None] = {"BIST": None, "US": None}
        #: Sağlayıcı gecikmesi görüldüğünde bir sonraki deneme bu ana ertelenir.
        self._lag_until: dict[str, datetime] = {}

    async def redis(self):
        if self._redis is None:
            self._redis = await self._redis_factory()
        return self._redis

    async def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(
                timeout=30,
                headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) sarnic/paper"},
            )
        return self._http

    def stop(self) -> None:
        self._stop.set()

    # ------------------------------------------------------------------ #
    async def run(self) -> None:
        log.info("equitydata_started", bist=len(BIST_SEED), us=len(US_SEED))
        # İlk açılışta iki pazarı da doldur (eksik olanı tamamlar).
        for market in (BIST, US):
            try:
                await self.refresh_market(market)
            except Exception:
                log.exception("equity_backfill_failed", market=market.code)
        rewrite = asyncio.create_task(self._state_rewriter())
        try:
            while not self._stop.is_set():
                await asyncio.sleep(REFRESH_CHECK_SECONDS)
                for market in (BIST, US):
                    try:
                        if await self._due(market):
                            await self.refresh_market(market)
                    except Exception:
                        log.exception("equity_refresh_failed", market=market.code)
        finally:
            rewrite.cancel()
            if self._http is not None:
                await self._http.aclose()

    async def _due(self, market: Market) -> bool:
        """Kapanmış son seans henüz çekilmediyse çekim zamanıdır."""
        bekleme = self._lag_until.get(market.code)
        if bekleme is not None and utcnow() < bekleme:
            return False
        cal = calendar_for(market.calendar)
        assert isinstance(cal, ExchangeSessionCalendar)
        son = cal.last_closed_session(utcnow())
        if son is None:
            return False
        return self._refreshed_session[market.code] != son

    # ------------------------------------------------------------------ #
    async def refresh_market(self, market: Market) -> None:
        http = await self.http()
        seeds = BIST_SEED if market.code == "BIST" else US_SEED
        cal = calendar_for(market.calendar)
        assert isinstance(cal, ExchangeSessionCalendar)
        son_seans = cal.last_closed_session(utcnow())

        # Artımlı çekim: ilk dolum bir kez tam pencere; günlük tazeleme son
        # ~12 seansı çeker (60+80 sembol × 672 gün her gün 79 bin satırı
        # yeniden yazıyordu — sağlayıcıya da bize de saygısızlık). Pazartesi
        # TAM yeniden eşitleme: sermaye işlemi (bölünme/temettü) düzeltilmiş
        # seriyi geriye dönük değiştirir; haftalık tam çekim onu yakalar
        # (OPEN-QUESTIONS §Çok-pazar madde 4'ün bilinen bedeli).
        ilk_dolum = self._refreshed_session[market.code] is None and not await self._has_history(
            market
        )
        tam = ilk_dolum or utcnow().weekday() == 0

        yazilan = 0
        basarili: list[tuple[str, float, float]] = []  # (sembol, kapanış, ciro)
        for base in seeds:
            try:
                bars = await self._fetch(market, http, base, full=tam)
            except Exception as exc:
                log.warning("equity_fetch_failed", market=market.code, symbol=base, error=str(exc))
                continue
            if not bars:
                continue
            async with session_scope() as session:
                yazilan += await upsert_klines(session, [b.as_kline() for b in bars])
            last = max(bars, key=lambda b: b.day)
            self._last_close[last.symbol] = last.close
            self._last_bar_day[last.symbol] = last.day
            basarili.append((last.symbol, last.close, last.quote_volume))
            # Nazik ol: iki kaynak da resmi API değil.
            await asyncio.sleep(0.35)

        await self._write_state()
        await self._snapshot_universe(market, basarili)
        await self._audit(market, [s for s, _, _ in basarili])

        # Seans ancak VERİSİ GERÇEKTEN GELDİYSE tazelendi sayılır. İş Yatırım
        # gün sonunu gecikmeli basabiliyor: 15:08'de 798 satır yazıldı ama
        # 28.08 satırı içlerinde yoktu; seans yine de işaretlenince döngü bir
        # daha denemedi ve günün barı hiç gelmedi. Veri eksikse işaret KONMAZ,
        # 15 dk sonra yeniden denenir (sağlayıcıyı 5 dk'da bir dövmemek için).
        en_yeni = max(
            (d for s, d in self._last_bar_day.items() if s.endswith(market.suffix)),
            default=None,
        )
        if son_seans is not None and (en_yeni is None or en_yeni < son_seans):
            log.warning(
                "equity_session_lagging",
                market=market.code,
                expected=son_seans.date().isoformat(),
                newest=en_yeni.date().isoformat() if en_yeni else None,
            )
            self._lag_until[market.code] = utcnow() + timedelta(minutes=15)
        else:
            self._refreshed_session[market.code] = son_seans
        log.info(
            "equity_market_refreshed",
            market=market.code,
            symbols=len(basarili),
            bars_written=yazilan,
            mode="full" if tam else "incremental",
            session=son_seans.date().isoformat() if son_seans else None,
        )

    async def _has_history(self, market: Market) -> bool:
        """Pazarın deposunda anlamlı geçmiş var mı? (yeniden başlatma ≠ ilk dolum)"""
        from sqlalchemy import func, select

        from sarnic.db.models import OHLCV

        ek = market.suffix
        async with session_scope() as session:
            adet = (
                await session.execute(
                    select(func.count())
                    .select_from(OHLCV)
                    .where(OHLCV.symbol.like(f"%{ek}"), OHLCV.timeframe == "1d")
                )
            ).scalar_one()
        return int(adet or 0) > 1000

    async def _fetch(
        self, market: Market, http: httpx.AsyncClient, base: str, *, full: bool
    ) -> list[DailyBar]:
        sessions = BACKFILL_SESSIONS if full else 12
        if market.code == "BIST":
            end = utcnow()
            start = end - timedelta(days=int(sessions * 1.6))
            return await IsYatirimClient(http).fetch_daily(base, start, end)
        return await YahooDailyClient(http).fetch_daily(base, sessions)

    # ------------------------------------------------------------------ #
    async def _write_state(self) -> None:
        """Ticker + sentetik defter. TTL'ler kısa; sık yeniden yazılır."""
        if not self._last_close:
            return
        r = await self.redis()
        now = utcnow().isoformat()
        mapping = {}
        for symbol, close in self._last_close.items():
            mapping[symbol] = json.dumps(
                {
                    "symbol": symbol,
                    "last_price": str(close),
                    "quote_volume": "0",
                    "price_change_pct": "0",
                    "high": str(close),
                    "low": str(close),
                    "at": now,
                }
            )
        await r.hset(KEY_TICKERS, mapping=mapping)
        await r.expire(KEY_TICKERS, 600)

        for symbol, close in self._last_close.items():
            half = HALF_SPREAD_BPS["BIST" if symbol.endswith(".IS") else "US"] / 10_000
            bid, ask = close * (1 - half), close * (1 + half)
            payload = {
                "symbol": symbol,
                # Derin sentetik kademeler: paper boyutları kapanış cirosunun
                # yanında küçüktür; kademe başına 10.000 adet fazlasıyla yeter.
                "bids": [[f"{bid:.6f}", "10000"]],
                "asks": [[f"{ask:.6f}", "10000"]],
                "at": now,
                "synthetic": True,
            }
            await r.set(KEY_BOOK.format(symbol=symbol), json.dumps(payload), ex=90)

    async def _state_rewriter(self) -> None:
        while not self._stop.is_set():
            try:
                await self._write_state()
            except Exception:
                log.exception("equity_state_rewrite_failed")
            await asyncio.sleep(STATE_REWRITE_SECONDS)

    # ------------------------------------------------------------------ #
    async def _snapshot_universe(
        self, market: Market, rows: list[tuple[str, float, float]]
    ) -> None:
        """Pazarın havuzunu snapshot'lar (bozulmaz kural 3).

        Basit huni: tohum listesi → ciroya göre sıralama → ilk 100. Kripto
        havuzunun spread/yaş/oynaklık filtreleri hisse v1'de yok; bu bilinçli
        bir eksiklik ve OPEN-QUESTIONS'ta kayıtlı.
        """
        if not rows:
            return
        sirali = sorted(rows, key=lambda r: r[2], reverse=True)[:100]
        async with session_scope() as session:
            son = (
                await session.execute(
                    UniverseSnapshot.__table__.select()
                    .where(UniverseSnapshot.market == market.code)
                    .order_by(UniverseSnapshot.taken_at.desc())
                    .limit(1)
                )
            ).first()
            onceki = {s["symbol"] for s in son.symbols} if son else set()
            simdiki = {s for s, _, _ in sirali}
            added = sorted(simdiki - onceki)
            removed = sorted(onceki - simdiki)
            if son is not None and not added and not removed:
                return
            session.add(
                UniverseSnapshot(
                    taken_at=utcnow(),
                    reason="scheduled",
                    market=market.code,
                    config_hash=f"equity-seed-{market.code.lower()}-v1",
                    symbols=[
                        {
                            "symbol": s,
                            "rank": i + 1,
                            "quote_volume": qv,
                            "price": close,
                            "spread_pct": None,
                            "age_days": None,
                            "volatility_ann_pct": None,
                            "range_3d_pct": None,
                            "protected": False,
                            "placeholder": False,
                        }
                        for i, (s, close, qv) in enumerate(sirali)
                    ],
                    funnel=[
                        {
                            "index": 1,
                            "name": "SeedList",
                            "kept": len(rows),
                            "dropped": 0,
                            "examples": [],
                        },
                        {
                            "index": 2,
                            "name": "QuoteVolumeFilter",
                            "kept": len(sirali),
                            "dropped": len(rows) - len(sirali),
                            "examples": [],
                        },
                    ],
                    added=added,
                    removed=removed,
                )
            )
        log.info(
            "equity_universe_snapshotted",
            market=market.code,
            size=len(sirali),
            added=len(added),
            removed=len(removed),
        )

    async def _audit(self, market: Market, symbols: list[str]) -> None:
        """Takvim-farkında boşluk denetimi — bulgular loglanır."""
        bulgu = 0
        async with session_scope() as session:
            for symbol in symbols:
                df = await load_frame(session, symbol, "1d", limit=BACKFILL_SESSIONS)
                if df.empty:
                    continue
                for gap in find_gaps(df, symbol, "1d"):
                    bulgu += 1
                    log.warning(
                        "equity_gap",
                        symbol=symbol,
                        start=gap.start.date().isoformat(),
                        end=gap.end.date().isoformat(),
                        missing=gap.missing_bars,
                    )
        if bulgu:
            log.info("equity_audit_completed", market=market.code, findings=bulgu)
