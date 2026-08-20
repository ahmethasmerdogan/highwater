"""İleri getiri gözlemleri — kalibrasyonun besleyicisi (§5.5).

Her puanlama, 4s/24s/72s ileri getirileriyle eşleştirilerek `score_observations`
tablosuna yazılır. Bu, "puan ileri getiriyi öngörüyor mu?" sorusunun ham verisidir.

Kritik: ileri getiri **puanın barından sonraki** kapanışlarla hesaplanır. Puanın
kendi barının kapanışı referans fiyattır; sonraki barlar hedeftir. Bu tablo
karara girmez, yalnızca ölçüme girer — dolayısıyla look-ahead riski yoktur.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.clock import utcnow
from sarnic.core.logging import get_logger
from sarnic.data.store import chunk_size_for, chunks, load_frames
from sarnic.db.models import Score, ScoreObservation

log = get_logger(__name__)

HORIZONS = {"fwd_return_4h": 4, "fwd_return_24h": 24, "fwd_return_72h": 72}

# En kısa ufuk dolduğu anda gözlem yazılır; uzun ufuklar doldukça `updated_at`
# ile güncellenir (upsert). Önceden 72 saat beklendiği için kalibrasyon sayfası
# sistem kurulduktan sonra üç gün boş kalıyordu — oysa 4 saatlik ufuk çoktan
# ölçülebilir durumdaydı. Yarım veri riski yok: dolmamış ufuk `NULL` kalır ve
# kalibrasyon sorgusu `NULL` satırları zaten dışarıda bırakır.
SETTLE_HOURS = min(HORIZONS.values())


def forward_returns(
    df: pd.DataFrame, bar_time: datetime, horizons: dict[str, int]
) -> dict[str, float | None]:
    """`bar_time` kapanışından `h` saat sonraki kapanışa göre getiri."""
    if df.empty:
        return dict.fromkeys(horizons)
    times = df["open_time"]
    idx = times.searchsorted(pd.Timestamp(bar_time), side="left")
    if idx >= len(df) or times.iloc[idx] != pd.Timestamp(bar_time):
        return dict.fromkeys(horizons)

    base = float(df["close"].iloc[idx])
    if base <= 0:
        return dict.fromkeys(horizons)

    out: dict[str, float | None] = {}
    for key, hours in horizons.items():
        target_time = pd.Timestamp(bar_time) + pd.Timedelta(hours=hours)
        j = times.searchsorted(target_time, side="left")
        if j >= len(df):
            out[key] = None
            continue
        out[key] = float(df["close"].iloc[j]) / base - 1.0
    return out


async def backfill_observations(
    session: AsyncSession,
    *,
    since: datetime | None = None,
    now: datetime | None = None,
    timeframe: str = "1h",
) -> int:
    """Ufku dolmuş puanlar için gözlemleri hesaplar ve yazar."""
    now = now or utcnow()
    cutoff = now - timedelta(hours=SETTLE_HOURS)
    since = since or (now - timedelta(days=90))

    rows = (
        await session.execute(
            select(Score.id, Score.symbol, Score.bar_time, Score.score, Score.families)
            .where(
                Score.bar_time >= since,
                Score.bar_time <= cutoff,
                Score.timeframe == timeframe,
            )
            .order_by(Score.bar_time)
        )
    ).all()
    if not rows:
        return 0

    symbols = sorted({r[1] for r in rows})
    frames = await load_frames(session, symbols, timeframe, end=now, limit=200_000)

    payload: list[dict] = []
    for score_id, symbol, bar_time, score, families in rows:
        returns = forward_returns(frames.get(symbol, pd.DataFrame()), bar_time, HORIZONS)
        if all(v is None for v in returns.values()):
            continue
        payload.append(
            {
                "score_id": score_id,
                "symbol": symbol,
                "bar_time": bar_time,
                "score": float(score),
                "families": families,
                **returns,
                "updated_at": now,
            }
        )

    if not payload:
        return 0

    # 90 günlük pencerede on binlerce gözlem birikebilir; parametre sınırına
    # takılmamak için parçalara bölünür (bkz. store.MAX_BIND_PARAMS).
    for batch in chunks(payload, chunk_size_for(len(payload[0]))):
        stmt = pg_insert(ScoreObservation).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=["score_id"],
            set_={
                "fwd_return_4h": stmt.excluded.fwd_return_4h,
                "fwd_return_24h": stmt.excluded.fwd_return_24h,
                "fwd_return_72h": stmt.excluded.fwd_return_72h,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        await session.execute(stmt)
    log.info("observations_written", count=len(payload))
    return len(payload)
