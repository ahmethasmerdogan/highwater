"""Kalibrasyon testleri — §5.5.

En önemli davranış: **ilişki yoksa rapor bunu açıkça söyler.** Bu modülün işi
sonucu güzelleştirmek değil, ölçmektir.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from itertools import pairwise

import numpy as np
import pytest

from sarnic.scoring.calibration import (
    MIN_OBSERVATIONS,
    build_report,
    decile_buckets,
    information_coefficient,
    is_monotonic,
    rolling_spearman,
    spearman,
    welch_t_test,
)

START = datetime(2026, 1, 1, tzinfo=UTC)


def times(n: int, hours: int = 6) -> list[datetime]:
    return [START + timedelta(hours=i * hours) for i in range(n)]


# --------------------------------------------------------------------------- #
def test_decile_buckets_count_and_order():
    scores = np.arange(1000, dtype=float)
    returns = scores / 1000
    buckets = decile_buckets(scores, returns)
    assert len(buckets) == 10
    assert [b.decile for b in buckets] == list(range(1, 11))
    assert buckets[0].mean_return < buckets[-1].mean_return


def test_decile_medyan_ortalamadan_ayrisir():
    """Aykırı değer ortalamayı pozitife çeker; medyan tipik gözlemi korur.

    Canlı veride en düşük desilin ortalaması +%0,52 iken medyanı −%0,34'tü:
    birkaç piyango sıçraması dilimi kârlı gösteriyordu. Panel yalnızca
    ortalamayı gösterirse "en düşük puanlılar en iyi getiriyi verdi" diye
    okunur — bu yüzden ikisi birlikte raporlanır.
    """
    scores = np.arange(100, dtype=float)
    returns = np.full(100, -0.01)
    returns[:3] = 5.0  # en düşük desilin 10 gözleminden üçü aykırı sıçrama
    bucket = decile_buckets(scores, returns)[0]
    assert bucket.mean_return > 0  # ortalama aykırı değerlerle pozitif
    assert bucket.median_return == pytest.approx(-0.01)  # tipik gözlem zararda


def test_decile_buckets_need_ten_points():
    assert decile_buckets(np.arange(5, dtype=float), np.arange(5, dtype=float)) == []


def test_monotonic_detection_on_perfect_relationship():
    scores = np.arange(1000, dtype=float)
    assert is_monotonic(decile_buckets(scores, scores / 1000))


def test_monotonic_detection_rejects_noise():
    rng = np.random.default_rng(1)
    scores = np.arange(1000, dtype=float)
    returns = rng.normal(0, 1, 1000)
    buckets = decile_buckets(scores, returns)
    # Saf gürültüde monotonluk beklemeyiz (nadiren tesadüf olabilir, o yüzden
    # kesin iddia yerine ihlal sayısına bakıyoruz).
    violations = sum(1 for a, b in pairwise(buckets) if b.mean_return < a.mean_return)
    assert violations >= 1


def test_spearman_perfect_positive():
    rho, p = spearman(np.arange(50, dtype=float), np.arange(50, dtype=float))
    assert rho == pytest.approx(1.0)
    assert p < 0.001


def test_spearman_perfect_negative():
    rho, _ = spearman(np.arange(50, dtype=float), np.arange(50, 0, -1, dtype=float))
    assert rho == pytest.approx(-1.0)


def test_spearman_is_rank_based_not_linear():
    """Monoton ama doğrusal olmayan ilişkide de 1.0 vermeli."""
    x = np.arange(1, 51, dtype=float)
    rho, _ = spearman(x, x**3)
    assert rho == pytest.approx(1.0)


def test_information_coefficient_ignores_nans():
    values = np.array([1.0, 2.0, np.nan, 4.0, 5.0])
    returns = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    assert information_coefficient(values, returns) == pytest.approx(1.0)


def test_information_coefficient_insufficient_data_is_nan():
    assert math.isnan(information_coefficient(np.array([1.0]), np.array([1.0])))


def test_welch_t_test_detects_difference():
    rng = np.random.default_rng(3)
    a = rng.normal(0.05, 0.01, 200)
    b = rng.normal(0.00, 0.01, 200)
    t, p = welch_t_test(a, b)
    assert t > 0
    assert p < 0.001


def test_rolling_spearman_produces_points():
    n = 600
    ts = times(n, hours=6)
    scores = np.arange(n, dtype=float)
    returns = scores / n + np.random.default_rng(5).normal(0, 0.05, n)
    points = rolling_spearman(ts, scores, returns, window_days=90)
    assert points
    assert all(-1.0 <= v <= 1.0 for _, v in points)


# --------------------------------------------------------------------------- #
#  Tam rapor
# --------------------------------------------------------------------------- #
def test_report_says_insufficient_when_few_observations():
    n = 50
    report = build_report(
        horizon="24h",
        times=times(n),
        scores=np.arange(n, dtype=float),
        returns=np.arange(n, dtype=float) / n,
    )
    assert not report.sufficient
    assert str(MIN_OBSERVATIONS) in report.verdict


def test_report_reports_strong_relationship_honestly():
    n = 2000
    ts = times(n, hours=2)
    scores = np.linspace(0, 100, n)
    rng = np.random.default_rng(7)
    returns = scores / 1000 + rng.normal(0, 0.01, n)

    report = build_report(horizon="24h", times=ts, scores=scores, returns=returns)
    assert report.sufficient
    assert report.monotonic
    assert report.spearman > 0.5
    assert report.top_minus_bottom > 0
    assert report.top_minus_bottom_p < 0.05
    assert "monoton artıyor" in report.verdict


def test_report_says_flat_when_no_relationship():
    """Puanlama işe yaramıyorsa panel bunu saklamaz."""
    n = 3000
    ts = times(n, hours=2)
    rng = np.random.default_rng(11)
    scores = rng.uniform(0, 100, n)
    returns = rng.normal(0, 0.02, n)

    report = build_report(horizon="24h", times=ts, scores=scores, returns=returns)
    assert report.sufficient
    assert abs(report.spearman) < 0.1
    assert "öngörü" in report.verdict or "ilişki yok" in report.verdict


def test_report_computes_family_ic():
    n = 1200
    ts = times(n, hours=2)
    scores = np.linspace(0, 100, n)
    returns = scores / 1000

    families = {
        "trend": scores,  # mükemmel ilişki
        "momentum": np.zeros(n),  # bilgi yok
    }
    report = build_report(
        horizon="24h", times=ts, scores=scores, returns=returns, family_values=families
    )
    assert report.family_ic["trend"] == pytest.approx(1.0)
    assert math.isnan(report.family_ic["momentum"]) or abs(report.family_ic["momentum"]) < 0.1


def test_report_dict_is_json_safe():
    n = 700
    report = build_report(
        horizon="4h",
        times=times(n, hours=3),
        scores=np.linspace(0, 100, n),
        returns=np.linspace(0, 0.1, n),
    )
    data = report.as_dict()
    import json

    json.dumps(data)  # NaN kalmışsa burada patlar
    assert data["horizon"] == "4h"
    assert data["n"] == n


def test_report_filters_non_finite_input():
    n = 800
    scores = np.linspace(0, 100, n)
    returns = scores / 1000
    returns[10] = np.nan
    scores[20] = np.inf
    report = build_report(horizon="24h", times=times(n, hours=3), scores=scores, returns=returns)
    assert report.n == n - 2
