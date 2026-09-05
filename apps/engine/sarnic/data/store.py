"""OHLCV deposu — okuma/yazma tek kapı.

`load_frame` karar yolunun tek veri girişidir. **`only_closed=True` varsayılandır**:
kapanmamış bar hiçbir koşulda karara giremez (bozulmaz kural 2).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pandas as pd
from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.calendar import calendar_for
from sarnic.core.enums import TIMEFRAME_MINUTES
from sarnic.core.logging import get_logger
from sarnic.core.markets import MARKETS, market_of
from sarnic.core.observability import BARS_WRITTEN
from sarnic.data.binance import Kline
from sarnic.db.models import OHLCV, SymbolInfo

log = get_logger(__name__)

OHLCV_COLUMNS = [
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "quote_volume",
    "trades",
    "taker_buy_base",
    "taker_buy_quote",
]


# PostgreSQL tek sorguda en fazla 32.767 bağlı parametre kabul eder. Satır
# sayısı × sütun sayısı bunu aşarsa sürücü `InterfaceError` fırlatır — 3.681
# sembollük `exchangeInfo` yazımı tam olarak buna takılıyordu. Yazımları
# parçalara bölüyoruz.
MAX_BIND_PARAMS = 32_000


def chunk_size_for(columns: int) -> int:
    """Parametre sınırına takılmayacak en büyük parça boyutu."""
    return max(1, MAX_BIND_PARAMS // max(columns, 1))


def chunks(rows: list[dict], size: int):
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


async def upsert_klines(session: AsyncSession, klines: list[Kline]) -> int:
    """Kapanmış barları yazar. Kapanmamış bar DB'ye **yazılmaz**."""
    rows = [k.as_row() for k in klines if k.is_closed]
    if not rows:
        return 0

    size = chunk_size_for(len(rows[0]))
    for batch in chunks(rows, size):
        await _upsert_kline_batch(session, batch)
    BARS_WRITTEN.inc(len(rows))
    return len(rows)


async def _upsert_kline_batch(session: AsyncSession, rows: list[dict]) -> None:
    stmt = pg_insert(OHLCV).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["symbol", "timeframe", "open_time"],
        set_={
            "open": stmt.excluded.open,
            "high": stmt.excluded.high,
            "low": stmt.excluded.low,
            "close": stmt.excluded.close,
            "volume": stmt.excluded.volume,
            "quote_volume": stmt.excluded.quote_volume,
            "trades": stmt.excluded.trades,
            "taker_buy_base": stmt.excluded.taker_buy_base,
            "taker_buy_quote": stmt.excluded.taker_buy_quote,
            "is_closed": stmt.excluded.is_closed,
        },
    )
    await session.execute(stmt)


async def load_frame(
    session: AsyncSession,
    symbol: str,
    timeframe: str,
    *,
    end: datetime | None = None,
    limit: int = 500,
    start: datetime | None = None,
    only_closed: bool = True,
) -> pd.DataFrame:
    """`end` anına kadar (dahil) son `limit` barı verir.

    Look-ahead koruması: `end` verildiğinde `open_time <= end` filtresi uygulanır;
    `end` barının kendisi ancak kapanmışsa gelir.
    """
    stmt = select(*[getattr(OHLCV, c) for c in OHLCV_COLUMNS]).where(
        OHLCV.symbol == symbol, OHLCV.timeframe == timeframe
    )
    if only_closed:
        stmt = stmt.where(OHLCV.is_closed.is_(True))
    if end is not None:
        stmt = stmt.where(OHLCV.open_time <= end)
    if start is not None:
        stmt = stmt.where(OHLCV.open_time >= start)
    stmt = stmt.order_by(OHLCV.open_time.desc()).limit(limit)

    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        return _empty_frame()

    df = pd.DataFrame(rows, columns=OHLCV_COLUMNS)
    df = df.iloc[::-1].reset_index(drop=True)
    return _coerce(df)


async def load_frames(
    session: AsyncSession,
    symbols: list[str],
    timeframe: str,
    *,
    end: datetime | None = None,
    start: datetime | None = None,
    limit: int = 500,
) -> dict[str, pd.DataFrame]:
    """Çok sembollü tek sorgu — 100 sembol için N+1 sorgu atmayız.

    `start` verildiğinde alt sınır **doğrudan** odur. Verilmediğinde sınır
    `limit`'ten türetilir (`end` − limit × bar süresi), ki bu bilinen bir bar
    sayısı isteyen çağıranlar için doğru davranıştır.

    Belirli bir **zaman aralığı** isteyen çağıranın `limit`i büyük tutup sonra
    filtrelemesi pahalıdır: kıyas ucu 23 barlık pencere için 5.000 bar (44
    sembolde ~208 gün) çekiyor ve 1,4 saniye sürüyordu. `start` ile aynı sorgu
    milisaniyelere iniyor.
    """
    if not symbols:
        return {}
    stmt = select(OHLCV.symbol, *[getattr(OHLCV, c) for c in OHLCV_COLUMNS]).where(
        OHLCV.symbol.in_(symbols),
        OHLCV.timeframe == timeframe,
        OHLCV.is_closed.is_(True),
    )
    if end is not None:
        stmt = stmt.where(OHLCV.open_time <= end)
    if start is not None:
        stmt = stmt.where(OHLCV.open_time >= start)
    elif end is not None:
        # Alt sınır bar SAYISINDAN türetilir; kripto 7/24 olduğu için takvim
        # süresi = bar sayısıdır. Seanslı pazarda (ekli sembol) değildir:
        # 300 "gün" ≈ 206 BIST seansı çıkıyor, EMA200'ün 220 bar şartı
        # dolmuyor ve TÜM havuz "yetersiz bar" ile puansız kalıyordu.
        # Hafta sonu + tatil payı: pencere ×1,6 açılır; `.tail(limit)`
        # zaten tam `limit` bara kırpar — fazla satır maliyeti önemsiz.
        yogunluk = 1.6 if any(market_of(s).code != "CRYPTO" for s in symbols[:1]) else 1.0
        earliest = end - timedelta(minutes=TIMEFRAME_MINUTES[timeframe] * limit * yogunluk)
        stmt = stmt.where(OHLCV.open_time >= earliest)
    stmt = stmt.order_by(OHLCV.symbol, OHLCV.open_time)

    rows = (await session.execute(stmt)).all()
    out: dict[str, pd.DataFrame] = {}
    if not rows:
        return {s: _empty_frame() for s in symbols}

    full = pd.DataFrame(rows, columns=["symbol", *OHLCV_COLUMNS])
    for symbol, group in full.groupby("symbol", sort=False):
        df = group.drop(columns=["symbol"]).tail(limit).reset_index(drop=True)
        out[str(symbol)] = _coerce(df)
    for s in symbols:
        out.setdefault(s, _empty_frame())
    return out


async def last_bar_time(session: AsyncSession, symbol: str, timeframe: str) -> datetime | None:
    stmt = (
        select(OHLCV.open_time)
        .where(OHLCV.symbol == symbol, OHLCV.timeframe == timeframe)
        .order_by(OHLCV.open_time.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def first_bar_time(session: AsyncSession, symbol: str, timeframe: str) -> datetime | None:
    stmt = (
        select(OHLCV.open_time)
        .where(OHLCV.symbol == symbol, OHLCV.timeframe == timeframe)
        .order_by(OHLCV.open_time.asc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def count_bars(
    session: AsyncSession, symbol: str, timeframe: str, start: datetime, end: datetime
) -> int:
    stmt = text(
        "SELECT count(*) FROM ohlcv WHERE symbol = :s AND timeframe = :tf "
        "AND open_time >= :a AND open_time <= :b"
    )
    res = await session.execute(stmt, {"s": symbol, "tf": timeframe, "a": start, "b": end})
    return int(res.scalar_one())


async def purge_symbol(session: AsyncSession, symbol: str) -> None:
    await session.execute(delete(OHLCV).where(OHLCV.symbol == symbol))


async def upsert_symbol_info(session: AsyncSession, rows: list[dict]) -> int:
    """`exchangeInfo` önbelleği. Binance ~3.700 sembol döndürüyor; tek sorguya
    sığmaz (bkz. `MAX_BIND_PARAMS`), bu yüzden parçalara bölünür."""
    if not rows:
        return 0

    size = chunk_size_for(len(rows[0]))
    for batch in chunks(rows, size):
        stmt = pg_insert(SymbolInfo).values(batch)
        update = {c: getattr(stmt.excluded, c) for c in batch[0] if c != "symbol"}
        # listed_at yalnızca boşken yazılır — geçmişi geriye doğru ezmeyiz.
        update.pop("listed_at", None)
        stmt = stmt.on_conflict_do_update(index_elements=["symbol"], set_=update)
        await session.execute(stmt)
    return len(rows)


# --------------------------------------------------------------------------- #
def _empty_frame() -> pd.DataFrame:
    df = pd.DataFrame(columns=OHLCV_COLUMNS)
    return _coerce(df)


def _coerce(df: pd.DataFrame) -> pd.DataFrame:
    """NUMERIC → float64. İndikatör hattı float ister; muhasebe Decimal kalır."""
    df = df.copy()
    if "open_time" in df:
        df["open_time"] = pd.to_datetime(df["open_time"], utc=True)
    for col in OHLCV_COLUMNS:
        if col == "open_time":
            continue
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")
    return df


def expected_bar_count(start: datetime, end: datetime, timeframe: str, symbol: str = "") -> int:
    """Beklenen bar sayısı — pazar-farkında.

    Kripto için eski aritmetiğin birebir aynısı. Hisse sembolünde (ekli ad)
    takvim sorulur: hafta sonu ve tatil "eksik bar" DEĞİLDİR — eski hesap
    BIST'te her hafta sonunu 48 barlık ERROR sanıp onarımcıyı sonsuza kadar
    olmayan barları doldurmaya gönderirdi.
    """
    market = market_of(symbol) if symbol else None
    if market is not None and market.code != "CRYPTO":
        return calendar_for(market.calendar).expected_bars(start, end, timeframe)
    minutes = TIMEFRAME_MINUTES[timeframe]
    span = (end - start).total_seconds() / 60
    return max(0, int(span // minutes) + 1)


def floor_to_bar(moment: datetime, timeframe: str) -> datetime:
    """Bir zamanı içinde bulunduğu barın açılışına yuvarlar."""
    minutes = TIMEFRAME_MINUTES[timeframe]
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    epoch_minutes = int(moment.timestamp() // 60)
    floored = (epoch_minutes // minutes) * minutes
    return datetime.fromtimestamp(floored * 60, tz=UTC)


def last_closed_bar(moment: datetime, timeframe: str, market_code: str = "CRYPTO") -> datetime:
    """`moment` anında **kapanmış** son barın açılış zamanı.

    Look-ahead korumasının temel taşı: içinde bulunulan bar sayılmaz.
    Seanslı pazarda (BIST/ABD) saf epoch aritmetiği piyasa kapalıyken var
    olmayan barı "kapanmış" sayardı; bot gece boyunca aynı bayat barı
    yeniden puanlar, `scores`'a olmayan bar zamanları yazardı. Takvim
    sorulur: kapanmış son SEANS neyse odur.
    """
    market = MARKETS.get(market_code)
    if market is not None and market.code != "CRYPTO":
        return calendar_for(market.calendar).last_closed_bar(moment, timeframe)
    return floor_to_bar(moment, timeframe) - timedelta(minutes=TIMEFRAME_MINUTES[timeframe])
