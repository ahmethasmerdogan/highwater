"""`data.binance.vision` arşiv indirici — MASTER-SPEC §2.1.

100 sembol × 2 yıl veriyi REST ile çekmek IP yasağıyla biter. Toplu tarihsel
dolgu **her zaman** buradan yapılır; REST yalnızca son birkaç günün deliklerini
kapatmak için kullanılır.

Arşiv yolu:  /data/spot/monthly/klines/{SYMBOL}/{INTERVAL}/{SYMBOL}-{INTERVAL}-{YYYY-MM}.zip
             /data/spot/daily/klines/{SYMBOL}/{INTERVAL}/{SYMBOL}-{INTERVAL}-{YYYY-MM-DD}.zip
"""

from __future__ import annotations

import asyncio
import csv
import io
import zipfile
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import httpx

from sarnic.config import settings
from sarnic.core.logging import get_logger
from sarnic.data.binance import Kline

log = get_logger(__name__)


@dataclass(slots=True)
class ArchiveFile:
    symbol: str
    timeframe: str
    period: str  # "2026-07" veya "2026-07-13"
    monthly: bool

    @property
    def path(self) -> str:
        scope = "monthly" if self.monthly else "daily"
        return (
            f"/data/spot/{scope}/klines/{self.symbol}/{self.timeframe}/"
            f"{self.symbol}-{self.timeframe}-{self.period}.zip"
        )


def months_between(start: date, end: date) -> list[str]:
    out: list[str] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def days_between(start: date, end: date) -> list[str]:
    out: list[str] = []
    cur = start
    while cur <= end:
        out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def plan_files(symbol: str, timeframe: str, start: date, end: date) -> list[ArchiveFile]:
    """Aylık arşivler + içinde bulunulan ayın günlük arşivleri.

    Binance içinde bulunulan ayın aylık dosyasını ay bitmeden yayınlamaz.
    """
    today = datetime.now(UTC).date()
    files: list[ArchiveFile] = []

    monthly_end = min(end, (today.replace(day=1) - timedelta(days=1)))
    if monthly_end >= start:
        files += [
            ArchiveFile(symbol, timeframe, p, monthly=True)
            for p in months_between(start, monthly_end)
        ]

    daily_start = max(start, today.replace(day=1))
    # Bugünün dosyası gün bitmeden yayınlanmaz.
    daily_end = min(end, today - timedelta(days=1))
    if daily_end >= daily_start:
        files += [
            ArchiveFile(symbol, timeframe, p, monthly=False)
            for p in days_between(daily_start, daily_end)
        ]
    return files


def parse_zip(content: bytes, symbol: str, timeframe: str) -> list[Kline]:
    """Zip içindeki CSV'yi Kline listesine çevirir.

    Binance 2025'ten sonra bazı dosyalara başlık satırı ekledi; ikisi de desteklenir.
    """
    out: list[Kline] = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        name = zf.namelist()[0]
        with zf.open(name) as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8")
            for row in csv.reader(text):
                if not row or len(row) < 11:
                    continue
                if not row[0].lstrip("-").isdigit():  # başlık satırı
                    continue
                out.append(_row_to_kline(symbol, timeframe, row))
    return out


def _row_to_kline(symbol: str, timeframe: str, row: list[str]) -> Kline:
    open_ms = int(row[0])
    # Binance 2025'te mikrosaniye damgasına geçti; iki formatı da kabul et.
    divisor = 1_000_000 if open_ms > 10**14 else 1000
    return Kline(
        symbol=symbol,
        timeframe=timeframe,
        open_time=datetime.fromtimestamp(open_ms / divisor, tz=UTC),
        open=Decimal(row[1]),
        high=Decimal(row[2]),
        low=Decimal(row[3]),
        close=Decimal(row[4]),
        volume=Decimal(row[5]),
        quote_volume=Decimal(row[7]),
        trades=int(row[8]),
        taker_buy_base=Decimal(row[9]),
        taker_buy_quote=Decimal(row[10]),
        is_closed=True,
    )


class ArchiveDownloader:
    """Arşiv indirici. Binance'in ağırlık limitine tabi değildir (statik CDN)."""

    def __init__(self, base: str | None = None, concurrency: int = 6) -> None:
        self.base = base or settings.binance_vision_base
        self._sem = asyncio.Semaphore(concurrency)
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base, timeout=httpx.Timeout(120.0))
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def fetch(self, f: ArchiveFile) -> list[Kline]:
        client = await self._get_client()
        async with self._sem:
            try:
                resp = await client.get(f.path)
            except httpx.HTTPError as exc:
                log.warning("archive_fetch_failed", path=f.path, error=str(exc))
                return []
        if resp.status_code == 404:
            # Sembol o dönemde listelenmemiş olabilir — normal.
            return []
        if resp.status_code != 200:
            log.warning("archive_bad_status", path=f.path, status=resp.status_code)
            return []
        try:
            return parse_zip(resp.content, f.symbol, f.timeframe)
        except (zipfile.BadZipFile, IndexError) as exc:
            log.warning("archive_parse_failed", path=f.path, error=str(exc))
            return []

    async def download(self, symbol: str, timeframe: str, start: date, end: date) -> list[Kline]:
        files = plan_files(symbol, timeframe, start, end)
        if not files:
            return []
        results = await asyncio.gather(*(self.fetch(f) for f in files))
        klines: list[Kline] = [k for batch in results for k in batch]
        klines.sort(key=lambda k: k.open_time)
        # Aylık ve günlük dosyalar örtüşebilir — tekilleştir.
        seen: set[datetime] = set()
        unique: list[Kline] = []
        for k in klines:
            if k.open_time in seen:
                continue
            seen.add(k.open_time)
            unique.append(k)
        log.info(
            "archive_downloaded",
            symbol=symbol,
            timeframe=timeframe,
            files=len(files),
            bars=len(unique),
        )
        return unique

    async def download_many(
        self, symbols: Iterable[str], timeframe: str, start: date, end: date
    ) -> dict[str, list[Kline]]:
        symbols = list(symbols)
        results = await asyncio.gather(*(self.download(s, timeframe, start, end) for s in symbols))
        return dict(zip(symbols, results, strict=True))
