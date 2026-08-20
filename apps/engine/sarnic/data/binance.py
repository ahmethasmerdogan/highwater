"""Binance Spot adaptörü — MASTER-SPEC §2.1.

Bu modül **yalnızca** `MarketDataService` tarafından kullanılır (bozulmaz kural 5).
Botlar buraya doğrudan erişmez.

İmzalı uçlar (hesap/emir) `BinanceSpotAdapter` içindedir ve v1'de devre dışıdır.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import httpx
import websockets

from sarnic.config import settings
from sarnic.core.enums import TIMEFRAME_MINUTES
from sarnic.core.logging import get_logger
from sarnic.data.ratelimiter import IPBannedError, RateLimitedError, RateLimiter, get_rate_limiter

log = get_logger(__name__)

# Binance kline dizisi alan sırası.
KLINE_FIELDS = (
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_volume",
    "trades",
    "taker_buy_base",
    "taker_buy_quote",
    "ignore",
)


@dataclass(slots=True)
class Kline:
    symbol: str
    timeframe: str
    open_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    quote_volume: Decimal
    trades: int
    taker_buy_base: Decimal
    taker_buy_quote: Decimal
    is_closed: bool = True

    def as_row(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "open_time": self.open_time,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "quote_volume": self.quote_volume,
            "trades": self.trades,
            "taker_buy_base": self.taker_buy_base,
            "taker_buy_quote": self.taker_buy_quote,
            "is_closed": self.is_closed,
        }


@dataclass(slots=True)
class Ticker24h:
    symbol: str
    last_price: Decimal
    quote_volume: Decimal
    price_change_pct: Decimal
    high: Decimal
    low: Decimal
    at: datetime


@dataclass(slots=True)
class BookLevel:
    price: Decimal
    qty: Decimal


@dataclass(slots=True)
class OrderBook:
    symbol: str
    bids: list[BookLevel]
    asks: list[BookLevel]
    at: datetime

    @property
    def best_bid(self) -> Decimal | None:
        return self.bids[0].price if self.bids else None

    @property
    def best_ask(self) -> Decimal | None:
        return self.asks[0].price if self.asks else None

    @property
    def mid(self) -> Decimal | None:
        if self.best_bid is None or self.best_ask is None:
            return None
        return (self.best_bid + self.best_ask) / 2

    @property
    def spread_pct(self) -> Decimal | None:
        mid = self.mid
        if mid is None or mid == 0:
            return None
        return (self.best_ask - self.best_bid) / mid * 100


def _symbol_from_stream(stream: str) -> str:
    """`btcusdt@depth20@100ms` → `BTCUSDT`. Bilinmeyen biçimde boş döner."""
    name = stream.split("@", 1)[0]
    return name.upper() if name else ""


def _ms_to_dt(ms: int | str) -> datetime:
    return datetime.fromtimestamp(int(ms) / 1000, tz=UTC)


def parse_kline_row(symbol: str, timeframe: str, row: list) -> Kline:
    d = dict(zip(KLINE_FIELDS, row, strict=False))
    return Kline(
        symbol=symbol,
        timeframe=timeframe,
        open_time=_ms_to_dt(d["open_time"]),
        open=Decimal(str(d["open"])),
        high=Decimal(str(d["high"])),
        low=Decimal(str(d["low"])),
        close=Decimal(str(d["close"])),
        volume=Decimal(str(d["volume"])),
        quote_volume=Decimal(str(d["quote_volume"])),
        trades=int(d["trades"]),
        taker_buy_base=Decimal(str(d["taker_buy_base"])),
        taker_buy_quote=Decimal(str(d["taker_buy_quote"])),
        is_closed=True,
    )


class BinanceRest:
    """REST istemcisi. Yalnızca geçmiş dolgu ve `exchangeInfo` için (§2.1)."""

    def __init__(self, limiter: RateLimiter | None = None, base: str | None = None) -> None:
        self.base = base or settings.binance_rest_base
        self.limiter = limiter or get_rate_limiter()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base, timeout=httpx.Timeout(20.0), http2=False
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _request(
        self, path: str, params: dict | None = None, weight: int = 1, retries: int = 4
    ) -> Any:
        client = await self._get_client()
        attempt = 0
        while True:
            await self.limiter.before_request(weight)
            try:
                resp = await client.get(path, params=params)
            except httpx.HTTPError as exc:
                attempt += 1
                if attempt > retries:
                    raise
                await asyncio.sleep(min(2**attempt, 30))
                log.warning("binance_http_retry", path=path, attempt=attempt, error=str(exc))
                continue

            self.limiter.observe_headers(resp.headers)

            if resp.status_code == 418:
                retry_after = float(resp.headers.get("Retry-After", 300))
                self.limiter.note_418(retry_after)
                raise IPBannedError(retry_after)

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", 60))
                self.limiter.note_429(retry_after)
                attempt += 1
                if attempt > retries:
                    raise RateLimitedError(retry_after)
                await asyncio.sleep(retry_after)
                continue

            if resp.status_code >= 500:
                attempt += 1
                if attempt > retries:
                    resp.raise_for_status()
                await asyncio.sleep(min(2**attempt, 30))
                continue

            resp.raise_for_status()
            return resp.json()

    # ------------------------------------------------------------------ #
    async def exchange_info(self) -> dict:
        return await self._request("/api/v3/exchangeInfo", weight=20)

    async def ticker_24h(self) -> list[Ticker24h]:
        data = await self._request("/api/v3/ticker/24hr", weight=80)
        now = datetime.now(UTC)
        return [
            Ticker24h(
                symbol=d["symbol"],
                last_price=Decimal(d["lastPrice"]),
                quote_volume=Decimal(d["quoteVolume"]),
                price_change_pct=Decimal(d["priceChangePercent"]),
                high=Decimal(d["highPrice"]),
                low=Decimal(d["lowPrice"]),
                at=now,
            )
            for d in data
        ]

    async def book_ticker(self) -> dict[str, tuple[Decimal, Decimal]]:
        """Tüm sembollerin en iyi alış/satışı — tek çağrı, ağırlık 4.

        Spread örneklemesinin birincil kaynağıdır. 40 ayrı `@depth20@100ms`
        akışını ayakta tutmak saniyede yüzlerce mesaj demek; o akışlar sessizce
        ölünce spread örneklemesi de duruyordu. Bu uç nokta hem çok daha ucuz
        hem de tek bir çağrıda tüm evreni kapsıyor.

        Döner: {sembol: (en_iyi_alış, en_iyi_satış)}
        """
        data = await self._request("/api/v3/ticker/bookTicker", weight=4)
        out: dict[str, tuple[Decimal, Decimal]] = {}
        for d in data:
            try:
                bid, ask = Decimal(d["bidPrice"]), Decimal(d["askPrice"])
            except (KeyError, ArithmeticError):
                continue
            if bid > 0 and ask > 0:
                out[d["symbol"]] = (bid, ask)
        return out

    async def klines(
        self,
        symbol: str,
        timeframe: str,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 1000,
    ) -> list[Kline]:
        params: dict[str, Any] = {"symbol": symbol, "interval": timeframe, "limit": limit}
        if start is not None:
            params["startTime"] = int(start.timestamp() * 1000)
        if end is not None:
            params["endTime"] = int(end.timestamp() * 1000)
        rows = await self._request("/api/v3/klines", params=params, weight=2)
        return [parse_kline_row(symbol, timeframe, r) for r in rows]

    async def klines_range(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Kline]:
        """Sayfalayarak tam aralığı çeker. Boşluk doldurmada kullanılır."""
        step_ms = TIMEFRAME_MINUTES[timeframe] * 60_000 * 1000
        out: list[Kline] = []
        cursor = start
        while cursor < end:
            chunk_end = min(
                end, datetime.fromtimestamp(cursor.timestamp() + step_ms / 1000, tz=UTC)
            )
            batch = await self.klines(symbol, timeframe, start=cursor, end=chunk_end, limit=1000)
            if not batch:
                break
            out.extend(batch)
            last = batch[-1].open_time
            if last <= cursor:
                break
            cursor = datetime.fromtimestamp(
                last.timestamp() + TIMEFRAME_MINUTES[timeframe] * 60, tz=UTC
            )
        return out

    async def depth(self, symbol: str, limit: int = 20) -> OrderBook:
        data = await self._request("/api/v3/depth", {"symbol": symbol, "limit": limit}, weight=2)
        return OrderBook(
            symbol=symbol,
            bids=[BookLevel(Decimal(p), Decimal(q)) for p, q in data["bids"]],
            asks=[BookLevel(Decimal(p), Decimal(q)) for p, q in data["asks"]],
            at=datetime.now(UTC),
        )


class BinanceWebSocket:
    """Kimlik doğrulamasız akışlar. Otomatik yeniden bağlanır."""

    def __init__(self, base: str | None = None) -> None:
        self.base = base or settings.binance_ws_base
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def stream(self, streams: list[str]) -> AsyncIterator[dict]:
        """Birleşik akış. Bağlantı koparsa üstel geri çekilmeyle yeniden bağlanır."""
        backoff = 1.0
        while not self._stop.is_set():
            url = f"{self.base}/stream?streams={'/'.join(streams)}"
            try:
                async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                    log.info("ws_connected", stream_count=len(streams))
                    backoff = 1.0
                    while not self._stop.is_set():
                        raw = await ws.recv()
                        msg = json.loads(raw)
                        data = msg.get("data", msg)
                        # Kısmi derinlik (`@depth20`) yükünde sembol alanı YOKTUR;
                        # sembol yalnızca sarmalayıcının `stream` adında bulunur.
                        # Bunu enjekte etmezsek tüm defterler aynı (boş) anahtara
                        # yazılır ve spread örneklemesi hiç çalışmaz.
                        if isinstance(data, dict) and "s" not in data:
                            symbol = _symbol_from_stream(msg.get("stream", ""))
                            if symbol:
                                data["s"] = symbol
                        yield data
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("ws_disconnected", error=str(exc), reconnect_in=backoff)
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                backoff = min(backoff * 2, 60.0)

    @staticmethod
    def parse_kline_event(msg: dict) -> Kline | None:
        k = msg.get("k")
        if not k:
            return None
        return Kline(
            symbol=k["s"],
            timeframe=k["i"],
            open_time=_ms_to_dt(k["t"]),
            open=Decimal(k["o"]),
            high=Decimal(k["h"]),
            low=Decimal(k["l"]),
            close=Decimal(k["c"]),
            volume=Decimal(k["v"]),
            quote_volume=Decimal(k["q"]),
            trades=int(k["n"]),
            taker_buy_base=Decimal(k["V"]),
            taker_buy_quote=Decimal(k["Q"]),
            is_closed=bool(k["x"]),
        )

    @staticmethod
    def parse_ticker_array(msg: list | dict) -> list[Ticker24h]:
        """`!ticker@arr` ve `!miniTicker@arr` yüklerinin ikisini de okur.

        `miniTicker` daha küçük bir sözlük gönderir ve yüzde değişim alanı
        (`P`) **yoktur**; açılış (`o`) ve kapanıştan hesaplanır. Sistem
        `miniTicker` kullanıyor çünkü Binance `!ticker@arr` aboneliğini kabul
        edip hiç veri göndermiyor (bkz. `MarketDataService.run_ticker_stream`).
        """
        items = msg if isinstance(msg, list) else [msg]
        now = datetime.now(UTC)
        out: list[Ticker24h] = []
        for d in items:
            if "s" not in d or "c" not in d:
                continue
            close = Decimal(d["c"])
            if "P" in d:
                change = Decimal(d["P"])
            else:
                opened = Decimal(d.get("o", "0"))
                change = ((close - opened) / opened * 100) if opened > 0 else Decimal("0")
            out.append(
                Ticker24h(
                    symbol=d["s"],
                    last_price=close,
                    quote_volume=Decimal(d["q"]),
                    price_change_pct=change,
                    high=Decimal(d["h"]),
                    low=Decimal(d["l"]),
                    at=now,
                )
            )
        return out

    @staticmethod
    def parse_depth(msg: dict) -> OrderBook | None:
        if "bids" not in msg and "b" not in msg:
            return None
        bids = msg.get("bids") or msg.get("b") or []
        asks = msg.get("asks") or msg.get("a") or []
        return OrderBook(
            symbol=msg.get("s", ""),
            bids=[BookLevel(Decimal(p), Decimal(q)) for p, q in bids],
            asks=[BookLevel(Decimal(p), Decimal(q)) for p, q in asks],
            at=datetime.now(UTC),
        )
