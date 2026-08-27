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

from sarnic.backtest.engine import BacktestEngine, BacktestParams, UniverseTimeline
from sarnic.core.clock import utcnow
from sarnic.core.logging import get_logger
from sarnic.db.models import Score, UniverseSnapshot
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

    # Havuz her bar için ayrı çözülür. Sabit bir sembol listesiyle geçmişi
    # puanlamak, bugün havuzda olan sembolleri geçmişe geri yerleştirir — ve
    # bir sembolün bugün havuzda olmasının sebebi genellikle o dönemde
    # yükselmiş olmasıdır. Kenar ölçümüne olmayan bir üstünlük bindirir.
    snapshots = (
        (
            await session.execute(
                select(UniverseSnapshot)
                .where(UniverseSnapshot.taken_at <= end)
                .order_by(UniverseSnapshot.taken_at)
            )
        )
        .scalars()
        .all()
    )
    timeline = UniverseTimeline(list(snapshots), fallback=symbols)
    if timeline.approximate:
        log.warning("score_backfill_universe_approximate", note=timeline.note())
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
        # O anda havuzda olmayan sembol kesite giremez. Kesitsel puanlama
        # yüzdelik tabanlı olduğu için bu yalnızca fazladan satır meselesi
        # değildir: havuza sonradan giren bir sembol, o günün yüzdeliklerini
        # de bozar.
        pool = timeline.at(bar)
        cuts = engine._cuts(data, pool, bar)
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


async def pool_symbols(session: AsyncSession, *, days: int | None = None) -> list[str]:
    """Puan üretilecek sembollerin **birleşimi** — bir dönem boyunca havuza girmiş herkes.

    Eskiden burası yalnızca **en son** snapshot'ı döndürüyor, o küme de tüm
    geçmiş barlara uygulanıyordu. Bu, bozulmaz kural 2'nin (look-ahead yasağı)
    doğrudan ihlaliydi: bugünün havuzu, geçmişte o havuzda olmayan sembolleri
    içerir ve bir sembolün bugün havuzda olmasının sebebi genellikle **o
    dönemde yükselmiş olmasıdır**. Geçmişe geri yerleştirildiğinde ölçüme
    olmayan bir kenar bindirir.

    Ölçülen bedeli: kirli pencerede kapı 75,2 kenarı +%0,413 (t=2,74), aynı
    yöntemle temiz pencerede +%0,025 (t=0,06). Kenarın tamamı yanlılıktı.

    Birleşim döndürülür çünkü veri yüklemesi tüm dönemi kapsamalı; hangi
    sembolün hangi barda havuzda olduğu `backfill_scores` içinde bar bazlı
    çözülür.
    """
    from sarnic.db.models import UniverseSnapshot

    stmt = select(UniverseSnapshot).order_by(UniverseSnapshot.taken_at)
    if days is not None:
        stmt = stmt.where(UniverseSnapshot.taken_at >= utcnow() - timedelta(days=days))
    snaps = (await session.execute(stmt)).scalars().all()
    if not snaps:
        return []
    return sorted({entry["symbol"] for snap in snaps for entry in snap.symbols})
