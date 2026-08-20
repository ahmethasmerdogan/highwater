"""Backtest testleri — Faz 9 kabul kriteri.

* Bilinen-sonuçlu senaryo fixture'ı (elle hesaplanmış mini backtest) birebir tutuyor
* Rastgele portföy kıyası her raporda görünüyor
* `Sharpe > 3` üreten bir fixture'da kırmızı bayrak basılıyor
* Snapshot'sız dönemler "YAKLAŞIK EVREN" damgası taşıyor
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from sarnic.backtest.benchmarks import buy_and_hold, turnover_matched_random
from sarnic.backtest.engine import UniverseTimeline
from sarnic.backtest.metrics import (
    MAX_DD_RED_FLAG,
    SHARPE_RED_FLAG,
    Metrics,
    cagr,
    compute_metrics,
    max_drawdown,
    max_drawdown_duration,
    red_flags,
    regime_split,
    sharpe_ratio,
)

START = datetime(2026, 1, 1, tzinfo=UTC)


def curve(values: list[float], hours: int = 1) -> list[tuple[datetime, float]]:
    return [(START + timedelta(hours=i * hours), v) for i, v in enumerate(values)]


# --------------------------------------------------------------------------- #
#  Metrikler — elle hesaplanmış
# --------------------------------------------------------------------------- #
def test_total_return_hand_calculated():
    m = compute_metrics(curve([1000.0, 1100.0, 1210.0]), [])
    assert m.total_return == pytest.approx(0.21)
    assert m.initial_equity == 1000.0
    assert m.final_equity == 1210.0


def test_max_drawdown_hand_calculated():
    """100 → 120 → 90 → 110. Tepe 120, dip 90 → −%25."""
    equity = np.array([100.0, 120.0, 90.0, 110.0])
    assert max_drawdown(equity) == pytest.approx(-0.25)


def test_max_drawdown_zero_when_monotonic():
    assert max_drawdown(np.array([100.0, 110.0, 120.0])) == pytest.approx(0.0)


def test_max_drawdown_duration_in_days():
    times = [START + timedelta(days=i) for i in range(5)]
    equity = np.array([100.0, 90.0, 80.0, 95.0, 105.0])
    # Tepe 100 (gün 0), yeni tepe gün 4 → 4 gün
    assert max_drawdown_duration(times, equity) == pytest.approx(4.0)


def test_sharpe_of_constant_returns_is_infinite_guarded():
    """Sıfır standart sapmada Sharpe hesaplanamaz — NaN döner, uydurma sayı değil."""
    assert math.isnan(sharpe_ratio(np.array([0.01, 0.01, 0.01]), 8760))


def test_cagr_hand_calculated():
    """1 yılda 1000 → 1200 = %20 CAGR."""
    times = [START, START + timedelta(days=365.25)]
    assert cagr(np.array([1000.0, 1200.0]), times) == pytest.approx(0.20, rel=1e-3)


def test_trade_statistics_hand_calculated():
    trades = [
        {"pnl": 100.0, "pnl_r": 2.0, "exit_reason": "STOP", "fees": 1.0, "slippage_bps": 5},
        {"pnl": -50.0, "pnl_r": -1.0, "exit_reason": "STOP", "fees": 1.0, "slippage_bps": 5},
        {"pnl": 25.0, "pnl_r": 0.5, "exit_reason": "TIME", "fees": 1.0, "slippage_bps": 5},
    ]
    m = compute_metrics(curve([1000.0, 1075.0]), trades)
    assert m.trades == 3
    assert m.win_rate == pytest.approx(2 / 3)
    assert m.profit_factor == pytest.approx(125.0 / 50.0)
    assert m.expectancy_r == pytest.approx((2.0 - 1.0 + 0.5) / 3)
    assert m.total_fees == pytest.approx(3.0)
    assert m.exit_reasons == {"STOP": 2, "TIME": 1}


def test_profit_factor_nan_when_no_losses():
    trades = [{"pnl": 10.0, "pnl_r": 1.0, "exit_reason": "STOP"}]
    assert math.isnan(compute_metrics(curve([100.0, 110.0]), trades).profit_factor)


def test_empty_curve_returns_empty_metrics():
    m = compute_metrics([], [])
    assert m.trades == 0
    assert m.start is None


# --------------------------------------------------------------------------- #
#  Kırmızı bayraklar — §11
# --------------------------------------------------------------------------- #
def test_high_sharpe_raises_red_flag():
    m = Metrics(sharpe=4.2, max_drawdown=-0.20, trades=100)
    flags = red_flags(m)
    kinds = {f["kind"] for f in flags}
    assert "sharpe" in kinds
    assert "hata şüphesidir" in next(f for f in flags if f["kind"] == "sharpe")["message"]


def test_sharpe_below_threshold_no_flag():
    m = Metrics(sharpe=SHARPE_RED_FLAG - 0.1, max_drawdown=-0.20, trades=100)
    assert "sharpe" not in {f["kind"] for f in red_flags(m)}


def test_tiny_drawdown_raises_red_flag():
    m = Metrics(sharpe=1.0, max_drawdown=-(MAX_DD_RED_FLAG / 2), trades=100)
    assert "max_drawdown" in {f["kind"] for f in red_flags(m)}


def test_small_sample_raises_red_flag():
    m = Metrics(sharpe=1.0, max_drawdown=-0.2, trades=5)
    flags = red_flags(m)
    assert "sample_size" in {f["kind"] for f in flags}
    assert "güvenilir değildir" in next(f for f in flags if f["kind"] == "sample_size")["message"]


def test_realistic_result_has_no_flags():
    m = Metrics(sharpe=0.9, max_drawdown=-0.22, trades=140)
    assert red_flags(m) == []


# --------------------------------------------------------------------------- #
#  Rejim ayrıştırması
# --------------------------------------------------------------------------- #
def test_regime_split_separates_bull_and_bear():
    times = [START + timedelta(hours=i) for i in range(5)]
    equity = list(zip(times, [100.0, 110.0, 121.0, 108.9, 98.0], strict=True))
    regimes = {times[1]: "boğa", times[2]: "boğa", times[3]: "ayı", times[4]: "ayı"}
    result = regime_split(equity, regimes)
    assert set(result) == {"boğa", "ayı"}
    assert result["boğa"]["total_return"] > 0
    assert result["ayı"]["total_return"] < 0


# --------------------------------------------------------------------------- #
#  Kıyaslar — §11 zorunlu üçlü
# --------------------------------------------------------------------------- #
def price_series(values: list[float]) -> pd.Series:
    idx = pd.to_datetime([START + timedelta(hours=i) for i in range(len(values))], utc=True)
    return pd.Series(values, index=idx)


def test_buy_and_hold_equal_weight():
    """İki coin, biri iki katına, biri sabit → sepet %50 artar (maliyet öncesi)."""
    prices = {
        "A": price_series([100.0, 200.0]),
        "B": price_series([50.0, 50.0]),
    }
    times = list(prices["A"].index.to_pydatetime())
    result = buy_and_hold(prices, times, initial=1000.0, cost_bps=0.0)
    assert result[0][1] == pytest.approx(1000.0)
    assert result[-1][1] == pytest.approx(1500.0)


def test_buy_and_hold_applies_entry_cost():
    prices = {"A": price_series([100.0, 100.0])}
    times = list(prices["A"].index.to_pydatetime())
    result = buy_and_hold(prices, times, initial=1000.0, cost_bps=10.0)
    assert result[-1][1] == pytest.approx(999.0)


def test_turnover_matched_random_produces_distribution():
    """§11'in en önemli kıyası: aynı devir, rastgele coinler."""
    prices = {
        f"C{i}": price_series([100.0 * (1 + 0.001 * i * j) for j in range(200)]) for i in range(10)
    }
    times = list(prices["C0"].index.to_pydatetime())
    curve_out, detail = turnover_matched_random(
        prices,
        times,
        initial=1000.0,
        positions=3,
        rebalance_bars=48,
        cost_bps=15.0,
        trials=20,
    )
    assert len(curve_out) == len(times)
    assert detail["trials"] == 20
    assert detail["positions"] == 3
    assert detail["final_p05"] <= detail["final_p50"] <= detail["final_p95"]


def test_random_benchmark_matches_strategy_turnover():
    """Rastgele portföy stratejiyle **aynı** pozisyon sayısını kullanmalı."""
    prices = {f"C{i}": price_series([100.0] * 100) for i in range(8)}
    times = list(prices["C0"].index.to_pydatetime())
    _, detail = turnover_matched_random(
        prices,
        times,
        initial=1000.0,
        positions=5,
        rebalance_bars=24,
        cost_bps=15.0,
        trials=5,
    )
    assert detail["positions"] == 5
    assert detail["rebalance_bars"] == 24


def test_random_benchmark_is_deterministic_with_seed():
    prices = {f"C{i}": price_series([100.0 + i * j for j in range(50)]) for i in range(6)}
    times = list(prices["C0"].index.to_pydatetime())
    a, _ = turnover_matched_random(
        prices,
        times,
        initial=1000.0,
        positions=2,
        rebalance_bars=10,
        cost_bps=10.0,
        trials=5,
        seed=123,
    )
    b, _ = turnover_matched_random(
        prices,
        times,
        initial=1000.0,
        positions=2,
        rebalance_bars=10,
        cost_bps=10.0,
        trials=5,
        seed=123,
    )
    assert [v for _, v in a] == [v for _, v in b]


# --------------------------------------------------------------------------- #
#  Point-in-time evren — §11 / §3.4
# --------------------------------------------------------------------------- #
class FakeSnapshot:
    def __init__(self, taken_at: datetime, symbols: list[str]) -> None:
        self.taken_at = taken_at
        self.symbols = [{"symbol": s} for s in symbols]


def test_universe_timeline_reads_point_in_time():
    timeline = UniverseTimeline(
        [
            FakeSnapshot(START, ["A", "B"]),
            FakeSnapshot(START + timedelta(days=1), ["B", "C"]),
        ],
        fallback=["X"],
    )
    assert timeline.at(START + timedelta(hours=1)) == ["A", "B"]
    assert timeline.at(START + timedelta(days=2)) == ["B", "C"]
    assert not timeline.approximate


def test_universe_timeline_marks_approximate_before_first_snapshot():
    timeline = UniverseTimeline([FakeSnapshot(START, ["A"])], fallback=["X", "Y"])
    assert timeline.at(START - timedelta(days=1)) == ["X", "Y"]
    assert timeline.approximate
    assert "YAKLAŞIK EVREN" in timeline.note()


def test_universe_timeline_without_snapshots_is_approximate():
    timeline = UniverseTimeline([], fallback=["A"])
    assert timeline.approximate
    assert "YAKLAŞIK EVREN" in timeline.note()
    assert "hayatta kalma yanlılığı" in timeline.note()


def test_universe_timeline_with_snapshots_notes_point_in_time():
    timeline = UniverseTimeline([FakeSnapshot(START, ["A"])], fallback=[])
    timeline.at(START + timedelta(hours=1))
    assert "point-in-time" in timeline.note()
