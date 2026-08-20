"""Uçtan uca backtest koşusu — DB'siz.

Bu test bozulmaz kural 1'in kanıtıdır: backtest motoru `ScoringEngine`,
`SizingEngine`, `RiskEngine` ve çıkış kurallarının **aynı** örneklerini çalıştırır.
Burada yalnızca veri kaynağı bellekten gelir.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest

from sarnic.backtest.engine import BacktestEngine, BacktestParams, UniverseTimeline, summarize
from sarnic.strategy.definition import StrategyDefinition
from tests.conftest import make_ohlcv

START = datetime(2026, 1, 1, tzinfo=UTC)
SYMBOLS = [f"C{i:02d}USDT" for i in range(12)]


def build_data(bars: int = 900) -> dict[str, dict[str, pd.DataFrame]]:
    """1h / 4h / 1d çerçeveleri; her sembol farklı seed ve farklı sürüklenme."""
    data: dict[str, dict[str, pd.DataFrame]] = {}
    for i, symbol in enumerate([*SYMBOLS, "BTCUSDT"]):
        drift = 0.0006 - i * 0.00008  # bazıları yükselir, bazıları düşer
        data[symbol] = {
            "1h": make_ohlcv(
                bars, start=START, timeframe_minutes=60, drift=drift, vol=0.01, seed=100 + i
            ),
            "4h": make_ohlcv(
                bars // 4 + 300,
                start=START - timedelta(days=50),
                timeframe_minutes=240,
                drift=drift * 4,
                vol=0.02,
                seed=200 + i,
            ),
            "1d": make_ohlcv(
                400,
                start=START - timedelta(days=400),
                timeframe_minutes=1440,
                drift=drift * 24,
                vol=0.04,
                seed=300 + i,
            ),
        }
    return data


@pytest.fixture(scope="module")
def data() -> dict[str, dict[str, pd.DataFrame]]:
    return build_data()


@pytest.fixture(scope="module")
def engine() -> BacktestEngine:
    definition = StrategyDefinition()
    params = BacktestParams(
        start=START + timedelta(hours=260),
        end=START + timedelta(hours=880),
        initial_equity=5000.0,
        symbols=SYMBOLS,
        with_patterns=False,  # hız — formasyon motoru ayrıca test ediliyor
    )
    return BacktestEngine(definition, params)


@pytest.fixture(scope="module")
def scenario(engine, data):
    timeline = UniverseTimeline([], fallback=SYMBOLS)
    times = engine.bar_times(data)
    assert times, "test verisinde bar bulunamadı"
    return engine.run_scenario(data, timeline, times, 1.0, "base"), times


# --------------------------------------------------------------------------- #
def test_scenario_produces_equity_curve(scenario):
    result, times = scenario
    assert len(result.equity_curve) == len(times)
    assert result.equity_curve[0][1] == pytest.approx(5000.0, rel=0.35)


def test_equity_never_negative(scenario):
    result, _ = scenario
    assert all(equity >= 0 for _, equity in result.equity_curve)


def test_all_trades_have_reason_and_r_multiple(scenario):
    result, _ = scenario
    for trade in result.trades:
        assert trade["exit_reason"]
        assert "pnl_r" in trade
        assert trade["hold_hours"] >= 0
        assert trade["exit_price"] > 0


def test_max_positions_never_exceeded(scenario):
    """Aynı anda 5'ten fazla pozisyon açılamaz (§6.4)."""
    result, _ = scenario
    open_intervals = [(t["entry_time"], t["exit_time"]) for t in result.trades]
    for entry, _ in open_intervals:
        concurrent = sum(1 for a, b in open_intervals if a <= entry < b)
        assert concurrent <= 5


def test_metrics_are_computed(scenario):
    result, _ = scenario
    m = result.metrics
    assert m.initial_equity > 0
    assert m.final_equity > 0
    assert m.trades == len(result.trades)
    assert -1.0 <= m.max_drawdown <= 0.0


def test_three_benchmarks_always_present(scenario):
    """§11: üç kıyas her raporda görünür."""
    result, _ = scenario
    names = [b.name for b in result.benchmarks]
    assert any("likit-100" in n for n in names)
    assert any("BTC" in n for n in names)
    assert any("rastgele" in n for n in names)


def test_random_benchmark_reports_distribution(scenario):
    result, _ = scenario
    random_bench = next(b for b in result.benchmarks if "rastgele" in b.name)
    assert random_bench.detail["trials"] > 0
    assert random_bench.detail["final_p05"] <= random_bench.detail["final_p95"]


def test_small_sample_gets_red_flag(scenario):
    """Bu kısa koşuda işlem sayısı azdır — rapor bunu söylemek zorundadır."""
    result, _ = scenario
    if result.metrics.trades < 20:
        assert any(f["kind"] == "sample_size" for f in result.flags)


def test_scenario_is_json_serialisable(scenario):
    import json

    result, _ = scenario
    json.dumps(result.as_dict())


def test_cost_scenarios_reduce_returns(engine, data):
    """Maliyet arttıkça getiri düşmeli — 2× senaryosu base'i geçemez."""
    timeline = UniverseTimeline([], fallback=SYMBOLS)
    times = engine.bar_times(data)
    base = engine.run_scenario(data, timeline, times, 1.0, "base")
    doubled = engine.run_scenario(data, timeline, times, 2.0, "2x")

    if base.metrics.trades > 0:
        assert doubled.metrics.final_equity <= base.metrics.final_equity + 1e-6


def test_holdout_split_locks_last_30_percent(engine, data):
    times = engine.bar_times(data)
    in_sample, holdout = engine.split_holdout(times)
    assert len(in_sample) + len(holdout) == len(times)
    assert len(holdout) == pytest.approx(len(times) * 0.30, rel=0.02)
    assert max(in_sample) < min(holdout)


def test_cuts_never_include_future_bars(engine, data):
    """Kesme testi: `bar` anındaki kesim, `bar`'dan sonraki hiçbir barı içermez."""
    times = engine.bar_times(data)
    bar = times[len(times) // 2]
    cuts = engine._cuts(data, SYMBOLS, bar)
    assert cuts
    for symbol, symbol_cuts in cuts.items():
        for tf, cut in symbol_cuts.items():
            df = data[symbol][tf]
            if df.empty or cut == 0:
                continue
            assert df["open_time"].iloc[cut - 1] <= pd.Timestamp(bar)
            if cut < len(df):
                assert df["open_time"].iloc[cut] > pd.Timestamp(bar)


def test_universe_timeline_is_marked_approximate_without_snapshots(engine, data):
    timeline = UniverseTimeline([], fallback=SYMBOLS)
    timeline.at(START)
    assert timeline.approximate
    assert "YAKLAŞIK EVREN" in timeline.note()


def test_summarize_mentions_approximate_universe(scenario, engine):
    from sarnic.backtest.engine import BacktestReport

    result, _ = scenario
    report = BacktestReport(
        definition_hash="x",
        params={},
        scenarios=[result],
        approximate_universe=True,
        universe_note="YAKLAŞIK EVREN",
    )
    text = summarize(report)
    assert "YAKLAŞIK EVREN" in text
    assert "işlem" in text


# --------------------------------------------------------------------------- #
#  Saat dilimi — panelden gelen `<input type="date">` regresyonu
# --------------------------------------------------------------------------- #
def test_naive_dates_are_treated_as_utc():
    """Saat dilimsiz tarih UTC'ye tamamlanır.

    Panel tarih kutusu `2026-01-01` gönderiyordu; bu saat dilimsiz bir damgaya
    çözülüyor, OHLCV çerçevesinin UTC farkındalı `open_time` sütunuyla
    karşılaştırılamıyor ve koşu daha ilk bar seçiminde `FAILED` oluyordu
    ("Invalid comparison between dtype=datetime64[us, UTC] and datetime").
    """
    params = BacktestParams(start=datetime(2026, 1, 1), end=datetime(2026, 2, 1))
    assert params.start.tzinfo is UTC
    assert params.end.tzinfo is UTC


def test_aware_dates_are_left_alone():
    params = BacktestParams(start=START, end=START + timedelta(days=10))
    assert params.start == START


def test_bar_times_accepts_naive_params(data):
    """Asıl kanıt: saat dilimsiz parametrelerle bar seçimi patlamıyor."""
    definition = StrategyDefinition()
    params = BacktestParams(
        start=(START + timedelta(hours=260)).replace(tzinfo=None),
        end=(START + timedelta(hours=400)).replace(tzinfo=None),
        symbols=SYMBOLS,
        with_patterns=False,
    )
    times = BacktestEngine(definition, params).bar_times(data)
    assert times, "saat dilimsiz aralıkta bar bulunamadı"
