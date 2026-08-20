"""Korelasyon kümeleri — MASTER-SPEC §6.3.

BTC + ETH + SOL aynı anda açıksa bu üç pozisyon değil, **bir bahistir**.
Kriptoda düşüşte korelasyonlar 1'e yaklaşır; çeşitlendirme tam ihtiyaç
duyulduğu anda buharlaşır.

90 günlük getiri korelasyon matrisinden hiyerarşik kümeleme, haftalık.
`corr > 0.75` → aynı küme.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.clock import utcnow
from sarnic.core.logging import get_logger
from sarnic.data.store import load_frames
from sarnic.db.models import CorrelationCluster

log = get_logger(__name__)

CORRELATION_THRESHOLD = 0.75
LOOKBACK_DAYS = 90
RECOMPUTE_INTERVAL = timedelta(days=7)


def returns_matrix(frames: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Sembol→günlük log getiri matrisi. Ortak tarihlere hizalanır."""
    series: dict[str, pd.Series] = {}
    for symbol, df in frames.items():
        if df.empty or len(df) < 20:
            continue
        s = df.set_index("open_time")["close"].astype(float)
        series[symbol] = np.log(s / s.shift(1)).dropna()
    if not series:
        return pd.DataFrame()
    return pd.DataFrame(series).dropna(how="all")


def cluster_symbols(
    returns: pd.DataFrame, threshold: float = CORRELATION_THRESHOLD
) -> dict[str, int]:
    """Hiyerarşik kümeleme. `corr > threshold` olanlar aynı kümeye düşer."""
    if returns.empty or returns.shape[1] < 2:
        return {c: i for i, c in enumerate(returns.columns, start=1)}

    corr = returns.corr(min_periods=20).fillna(0.0)
    # Uzaklık = 1 − korelasyon. corr=0.75 → distance=0.25 kesme noktası.
    # `copy=True` şart: pandas salt-okunur bir görünüm döndürebiliyor ve
    # `fill_diagonal` onun üzerine yazamıyor.
    distance = (1.0 - corr).to_numpy(dtype=float, copy=True)
    np.fill_diagonal(distance, 0.0)
    distance = (distance + distance.T) / 2  # simetri garantisi
    distance = np.clip(distance, 0.0, 2.0)

    condensed = squareform(distance, checks=False)
    linkage_matrix = linkage(condensed, method="average")
    labels = fcluster(linkage_matrix, t=1.0 - threshold, criterion="distance")
    return {symbol: int(label) for symbol, label in zip(corr.columns, labels, strict=True)}


async def compute_clusters(
    session: AsyncSession,
    symbols: list[str],
    *,
    at: datetime | None = None,
    threshold: float = CORRELATION_THRESHOLD,
    persist: bool = True,
) -> dict[str, int]:
    now = at or utcnow()
    frames = await load_frames(session, symbols, "1d", end=now, limit=LOOKBACK_DAYS + 5)
    returns = returns_matrix(frames)
    assignments = cluster_symbols(returns, threshold)

    if persist and assignments:
        session.add(
            CorrelationCluster(computed_at=now, threshold=threshold, assignments=assignments)
        )
    log.info("clusters_computed", symbols=len(symbols), clusters=len(set(assignments.values())))
    return assignments


async def latest_clusters(session: AsyncSession, *, at: datetime | None = None) -> dict[str, int]:
    stmt = select(CorrelationCluster).order_by(CorrelationCluster.computed_at.desc()).limit(1)
    if at is not None:
        stmt = (
            select(CorrelationCluster)
            .where(CorrelationCluster.computed_at <= at)
            .order_by(CorrelationCluster.computed_at.desc())
            .limit(1)
        )
    row = (await session.execute(stmt)).scalar_one_or_none()
    return dict(row.assignments) if row else {}


async def clusters_are_stale(session: AsyncSession, *, now: datetime | None = None) -> bool:
    now = now or utcnow()
    row = (
        await session.execute(
            select(CorrelationCluster.computed_at)
            .order_by(CorrelationCluster.computed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return row is None or (now - row) > RECOMPUTE_INTERVAL


def cluster_exposure(
    assignments: dict[str, int], exposures: dict[str, float], symbol: str
) -> float:
    """`symbol`'ün ait olduğu kümedeki toplam maruziyet (kendisi hariç).

    Küme ataması yoksa sembol tek başına bir kümedir — bilinmeyeni
    "riski yok" saymayız, ama var olmayan bir korelasyonu da uydurmayız.
    """
    target = assignments.get(symbol)
    if target is None:
        return 0.0
    return sum(
        value
        for other, value in exposures.items()
        if other != symbol and assignments.get(other) == target
    )
