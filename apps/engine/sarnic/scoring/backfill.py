"""Geçmiş puanları üretir — kalibrasyonu ölçülebilir kılar.

**Neden gerekli.** Sistem 400+ günlük OHLCV taşıyor ama `scores` tablosu
yalnızca canlı çalışmanın başladığı andan itibaren dolu. Kalibrasyon sayfası
puan–getiri ilişkisini `score_observations` üzerinden ölçüyor ve o da
`scores`'tan besleniyor; dolayısıyla sistemin **varlık nedeni olan soru**
("bu puanlama ileri getiriyi öngörüyor mu") tek günlük bir kesitle
cevaplanmaya çalışılıyordu. Tek günün kesitine bakıp ağırlık değiştirmek,
aynı veride arama yapmaktır.

Bu modül geçmiş barları yürüyüp puanları yazar. Ardından
`sarnic observations` ileri getirileri hesaplar ve kalibrasyon aylara yayılmış
gerçek bir ölçüme dönüşür.

**Bozulmaz kural 1 korunur:** ayrı bir puanlama kodu yazılmıyor.
`BacktestEngine`'in kendi veri yükleme, `cuts` ve bundle üretim yolları
kullanılıyor; yani buradaki puanlar canlı botun ürettiğiyle aynı kodun
çıktısıdır. Fark yalnızca sonucun nereye yazıldığıdır.

**Look-ahead:** `_cuts` yalnızca `open_time <= bar` olan barları sayar,
canlı yoldaki `is_closed`/`open_time <= at` filtresinin birebir karşılığı.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.backtest.engine import BacktestEngine, BacktestParams
from sarnic.core.clock import utcnow
from sarnic.core.logging import get_logger
from sarnic.db.models import Score
from sarnic.features.pipeline import build_bundle_precomputed, precompute_indicators
from sarnic.scoring.engine import ScoringEngine
from sarnic.strategy.definition import StrategyDefinition

log = get_logger(__name__)

#: Tek `INSERT` içinde yazılacak satır sayısı.
CHUNK = 2000


async def backfill_scores(
    session: AsyncSession,
    definition: StrategyDefinition,
    symbols: list[str],
    *,
    days: int,
    progress=None,
) -> int:
    """`days` günlük geçmiş için puan satırları yazar; yazılan sayıyı döndürür."""
    end = utcnow()
    start = end - timedelta(days=days)

    engine = BacktestEngine(
        definition,
        BacktestParams(
            start=start,
            end=end,
            initial_equity=5000.0,
            symbols=symbols,
            use_holdout=False,
            with_patterns=definition.scoring.modifiers.get("pattern", True),
        ),
    )

    data = await engine.load_data(session, symbols)
    bars = engine.bar_times(data)
    if not bars:
        log.warning("score_backfill_no_bars", days=days, symbols=len(symbols))
        return 0

    indicator_frames = {s: precompute_indicators(frames) for s, frames in data.items()}

    scoring = ScoringEngine(
        weights=definition.scoring.weights,
        use_pattern=definition.scoring.modifiers.get("pattern", True),
        use_candle=definition.scoring.modifiers.get("candle", True),
        use_crowding=definition.scoring.modifiers.get("crowding", True),
    )

    log.info(
        "score_backfill_start",
        bars=len(bars),
        symbols=len(symbols),
        timeframe=definition.timeframe,
        config_hash=scoring.config_hash(),
    )

    rows: list[dict] = []
    written = 0

    async def flush() -> None:
        nonlocal rows, written
        if not rows:
            return
        # Aynı (sembol, bar, dilim, ayar) için ikinci satır yazılmaz; komut
        # tekrar çalıştırıldığında var olanı bozmadan eksikleri tamamlar.
        statement = (
            pg_insert(Score)
            .values(rows)
            .on_conflict_do_nothing(
                index_elements=["symbol", "bar_time", "timeframe", "config_hash"]
            )
        )
        await session.execute(statement)
        await session.commit()
        written += len(rows)
        rows = []

    for index, bar in enumerate(bars, start=1):
        cuts = engine._cuts(data, symbols, bar)
        if not cuts:
            continue

        bundles = [
            build_bundle_precomputed(
                symbol,
                data[symbol],
                indicator_frames.get(symbol, {}),
                symbol_cuts,
                with_patterns=engine.params.with_patterns,
                decision_tf=definition.timeframe,
            )
            for symbol, symbol_cuts in cuts.items()
        ]
        results = scoring.score_cross_section([b.features for b in bundles])
        for r in results:
            rows.append(r.as_row(definition.timeframe))

        if len(rows) >= CHUNK:
            await flush()
        if progress is not None and index % max(1, len(bars) // 40) == 0:
            progress(index, len(bars), written)

    await flush()
    log.info("score_backfill_done", bars=len(bars), rows=written)
    return written


async def pool_symbols(session: AsyncSession) -> list[str]:
    """Güncel havuz — puan üretilecek sembol kümesi."""
    from sarnic.db.models import UniverseSnapshot

    snap = (
        await session.execute(
            select(UniverseSnapshot).order_by(UniverseSnapshot.id.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if snap is None:
        return []
    return [s["symbol"] for s in snap.symbols]
