"""Puanlama testleri — Faz 3 kabul kriteri.

* puan her zaman [0, 100]
* aile katkıları toplamı taban puanı verir
* her puanın gerekçesi eksiksiz
* 100 sembol < 2 sn'de puanlanıyor
"""

from __future__ import annotations

import math
import time
from datetime import UTC, datetime

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from sarnic.features.pipeline import build_bundle
from sarnic.scoring.engine import (
    ScoringEngine,
    SymbolFeatures,
    crowding_penalty,
)
from sarnic.scoring.normalize import NEUTRAL, normalize_matrix, percentile_rank
from sarnic.scoring.registry import DEFAULT_FAMILY_WEIGHTS, FEATURE_KEYS, family_weights
from tests.conftest import make_frames

BAR = datetime(2026, 8, 13, 14, 0, tzinfo=UTC)


def features(symbol: str, **raw) -> SymbolFeatures:
    values = dict.fromkeys(FEATURE_KEYS, 0.0)
    values.update(raw)
    return SymbolFeatures(symbol=symbol, bar_time=BAR, raw=values)


# --------------------------------------------------------------------------- #
#  Normalizasyon
# --------------------------------------------------------------------------- #
def test_percentile_rank_spreads_zero_to_hundred():
    result = percentile_rank({"a": 1.0, "b": 2.0, "c": 3.0})
    assert result["a"] == pytest.approx(0.0)
    assert result["b"] == pytest.approx(50.0)
    assert result["c"] == pytest.approx(100.0)


def test_percentile_rank_inverted():
    result = percentile_rank({"a": 1.0, "b": 3.0}, higher_is_better=False)
    assert result["a"] == pytest.approx(100.0)
    assert result["b"] == pytest.approx(0.0)


def test_percentile_rank_ties_share_rank():
    result = percentile_rank({"a": 5.0, "b": 5.0, "c": 9.0})
    assert result["a"] == result["b"]
    assert result["c"] > result["a"]


def test_percentile_rank_nan_gets_neutral():
    """Eksik veri ödüllendirilmez de cezalandırılmaz da."""
    result = percentile_rank({"a": 1.0, "b": float("nan"), "c": 3.0})
    assert result["b"] == NEUTRAL


def test_percentile_rank_single_element_is_neutral():
    """Tek elemanlık kesitte sıralama bilgisi yoktur."""
    assert percentile_rank({"a": 5.0})["a"] == NEUTRAL


def test_percentile_rank_is_outlier_robust():
    """Bir uçuk değer diğerlerinin sırasını bozmaz — z-skor yerine sıralama (§5.1)."""
    normal = percentile_rank({"a": 1.0, "b": 2.0, "c": 3.0, "d": 4.0})
    with_outlier = percentile_rank({"a": 1.0, "b": 2.0, "c": 3.0, "d": 1e12})
    assert normal["a"] == with_outlier["a"]
    assert normal["b"] == with_outlier["b"]
    assert normal["c"] == with_outlier["c"]


def test_normalize_matrix_covers_all_features():
    rows = {"A": {"adx": 10.0}, "B": {"adx": 20.0}}
    matrix = normalize_matrix(rows, {"adx": True, "rsi": True})
    assert matrix["A"]["adx"] == 0.0
    assert matrix["B"]["adx"] == 100.0
    assert matrix["A"]["rsi"] == NEUTRAL  # eksik → nötr


# --------------------------------------------------------------------------- #
#  Aile ağırlıkları
# --------------------------------------------------------------------------- #
def test_default_weights_sum_to_100():
    assert sum(DEFAULT_FAMILY_WEIGHTS.values()) == pytest.approx(100.0)


def test_weights_are_renormalized():
    weights = family_weights({"trend": 60, "momentum": 40, "flow": 0, "vol": 0, "sr": 0})
    assert sum(weights.values()) == pytest.approx(100.0)
    assert weights["trend"] == pytest.approx(60.0)


def test_unknown_weight_key_ignored():
    weights = family_weights({"bilinmeyen": 99})
    assert sum(weights.values()) == pytest.approx(100.0)


# --------------------------------------------------------------------------- #
#  Kalabalıklaşma cezası — §5.2
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "ret,expected",
    [(0.0, 0.0), (0.24, 0.0), (0.26, -15.0), (0.39, -15.0), (0.41, -30.0), (2.0, -30.0)],
)
def test_crowding_penalty_tiers(ret, expected):
    assert crowding_penalty(ret) == expected


def test_crowding_penalty_handles_nan():
    assert crowding_penalty(float("nan")) == 0.0


# --------------------------------------------------------------------------- #
#  Bileşik puan
# --------------------------------------------------------------------------- #
def cross_section(n: int = 20) -> list[SymbolFeatures]:
    out = []
    for i in range(n):
        raw = {key: float(i) for key in FEATURE_KEYS}
        out.append(features(f"C{i:02d}USDT", **raw))
    return out


def test_family_contributions_sum_to_base_score():
    """Aile katkıları toplamı taban puanı verir (Faz 3 kabul kriteri)."""
    results = ScoringEngine().score_cross_section(cross_section())
    for r in results:
        assert sum(r.families.values()) == pytest.approx(r.base_score, abs=0.05)


def test_base_score_within_bounds():
    for r in ScoringEngine().score_cross_section(cross_section()):
        assert 0.0 <= r.base_score <= 100.0


def test_score_always_within_bounds_with_modifiers():
    rows = cross_section()
    rows[0].pattern_modifier = 10.0
    rows[0].candle_modifier = 3.0
    rows[-1].pattern_modifier = -10.0
    rows[-1].candle_modifier = -3.0
    rows[-1].ret_24h = 0.9  # −30 kalabalık cezası
    for r in ScoringEngine().score_cross_section(rows):
        assert 0.0 <= r.score <= 100.0


def test_best_symbol_gets_top_score():
    """Her özellikte en yüksek olan sembol en yüksek puanı almalı."""
    results = ScoringEngine().score_cross_section(cross_section())
    assert results[0].symbol == "C19USDT"
    assert results[0].score > results[-1].score


def test_results_sorted_descending():
    results = ScoringEngine().score_cross_section(cross_section())
    scores = [r.score for r in results]
    assert scores == sorted(scores, reverse=True)


def test_unusable_features_excluded():
    rows = cross_section(5)
    rows[0].usable = False
    results = ScoringEngine().score_cross_section(rows)
    assert rows[0].symbol not in {r.symbol for r in results}


def test_empty_cross_section_returns_empty():
    assert ScoringEngine().score_cross_section([]) == []


def test_modifiers_can_be_disabled():
    rows = cross_section(5)
    for r in rows:
        r.pattern_modifier = 10.0
        r.candle_modifier = 3.0
        r.ret_24h = 0.9
    engine = ScoringEngine(use_pattern=False, use_candle=False, use_crowding=False)
    for r in engine.score_cross_section(rows):
        assert r.modifiers == {"pattern": 0.0, "candle": 0.0, "crowding": 0.0}
        assert r.score == pytest.approx(r.base_score, abs=0.01)


# --------------------------------------------------------------------------- #
#  Gerekçe — §5.4 zorunlu
# --------------------------------------------------------------------------- #
def test_rationale_is_complete():
    results = ScoringEngine().score_cross_section(cross_section())
    for r in results:
        rationale = r.rationale
        for key in (
            "symbol",
            "score",
            "families",
            "modifiers",
            "top_drivers",
            "percentiles",
            "sr",
            "config_hash",
        ):
            assert key in rationale, key
        assert set(rationale["families"]) == set(DEFAULT_FAMILY_WEIGHTS)
        assert set(rationale["percentiles"]) == set(FEATURE_KEYS)


def test_top_drivers_present_for_leader():
    results = ScoringEngine().score_cross_section(cross_section())
    assert results[0].rationale["top_drivers"], "en yüksek puanın gerekçesi boş olamaz"
    assert len(results[0].rationale["top_drivers"]) <= 4


def test_crowding_penalty_appears_in_rationale():
    rows = cross_section(5)
    rows[0].ret_24h = 0.5
    results = ScoringEngine().score_cross_section(rows)
    target = next(r for r in results if r.symbol == rows[0].symbol)
    assert any("kalabalık" in d for d in target.rationale["top_drivers"])


# --------------------------------------------------------------------------- #
#  Konfigürasyon hash'i
# --------------------------------------------------------------------------- #
def test_config_hash_is_stable_and_sensitive():
    assert ScoringEngine().config_hash() == ScoringEngine().config_hash()
    changed = ScoringEngine(weights={"trend": 50, "momentum": 20, "flow": 15, "vol": 10, "sr": 5})
    assert changed.config_hash() != ScoringEngine().config_hash()
    assert ScoringEngine(use_pattern=False).config_hash() != ScoringEngine().config_hash()


# --------------------------------------------------------------------------- #
#  Property testleri
# --------------------------------------------------------------------------- #
@given(
    values=st.lists(
        st.floats(min_value=-1e6, max_value=1e6, allow_nan=False), min_size=2, max_size=40
    )
)
@settings(max_examples=100, deadline=None)
def test_score_always_in_range_for_arbitrary_features(values):
    rows = [features(f"S{i}", **dict.fromkeys(FEATURE_KEYS, v)) for i, v in enumerate(values)]
    for r in ScoringEngine().score_cross_section(rows):
        assert 0.0 <= r.score <= 100.0
        assert 0.0 <= r.base_score <= 100.0


@given(
    pattern=st.floats(min_value=-10, max_value=10),
    candle=st.floats(min_value=-3, max_value=3),
    ret24=st.floats(min_value=-0.9, max_value=5.0),
)
@settings(max_examples=100, deadline=None)
def test_modifiers_never_break_bounds(pattern, candle, ret24):
    rows = cross_section(6)
    for r in rows:
        r.pattern_modifier = pattern
        r.candle_modifier = candle
        r.ret_24h = ret24
    for r in ScoringEngine().score_cross_section(rows):
        assert 0.0 <= r.score <= 100.0


# --------------------------------------------------------------------------- #
#  Başarım — Faz 3: 100 sembol < 2 sn
# --------------------------------------------------------------------------- #
def test_hundred_symbols_scored_under_two_seconds():
    bundles = [
        build_bundle(f"C{i:03d}USDT", make_frames(symbol_seed=i, bars=400), with_patterns=True)
        for i in range(100)
    ]
    engine = ScoringEngine()

    started = time.perf_counter()
    results = engine.score_cross_section([b.features for b in bundles])
    elapsed = time.perf_counter() - started

    assert results, "100 sembolün hiçbiri puanlanamadıysa test anlamsız"
    assert elapsed < 2.0, f"puanlama {elapsed:.3f} sn sürdü, limit 2 sn"


def test_pipeline_produces_usable_features():
    bundle = build_bundle("TESTUSDT", make_frames(symbol_seed=1, bars=400))
    feats = bundle.features
    assert feats.usable
    assert set(feats.raw) == set(FEATURE_KEYS)
    finite = [k for k, v in feats.raw.items() if isinstance(v, float) and math.isfinite(v)]
    assert len(finite) >= len(FEATURE_KEYS) - 3  # birkaç özellik NaN olabilir


# --------------------------------------------------------------------------- #
# Puanlama konfigürasyonu ↔ strateji tanımı eşlemesi
#
# Panelin strateji seçicisi (`/scores/configs`) `config_hash`'i her botun
# tanımından **yeniden hesaplayarak** etiketler; `scores` tablosunda `bot_id`
# yoktur. Bu testler o eşlemenin dayandığı varsayımı sabitler.
# --------------------------------------------------------------------------- #
def _engine_for(definition):
    return ScoringEngine(
        weights=definition.scoring.weights,
        use_pattern=definition.scoring.modifiers.get("pattern", True),
        use_candle=definition.scoring.modifiers.get("candle", True),
        use_crowding=definition.scoring.modifiers.get("crowding", True),
    )


def test_gate_difference_does_not_change_scoring_config():
    """Yalnızca giriş eşiği farklı iki strateji **aynı** puanları üretir.

    `taban` ve `seçici` botları budur: ikisi de aynı `config_hash`'i yazar,
    dolayısıyla seçicide tek bir girdi olarak birleşirler. Ayrı gösterilseydi
    kullanıcı aynı listeyi iki kez görürdü.
    """
    from sarnic.strategy.definition import StrategyDefinition

    base = StrategyDefinition()
    selective = StrategyDefinition()
    selective.entry.min_score = base.entry.min_score + 5

    assert _engine_for(base).config_hash() == _engine_for(selective).config_hash()


def test_weight_difference_changes_scoring_config():
    """Ağırlıkları farklı stratejiler ayrı `config_hash` yazar — ayrı sıralamalar."""
    from sarnic.strategy.definition import StrategyDefinition

    base = StrategyDefinition()
    trend_heavy = StrategyDefinition()
    trend_heavy.scoring.weights = {**base.scoring.weights, "trend": 40.0, "momentum": 15.0}

    assert _engine_for(base).config_hash() != _engine_for(trend_heavy).config_hash()


def test_same_definition_round_trips_to_same_config():
    """`from_dict(to_dict(...))` hash'i korumalı — etiketleme buna dayanıyor."""
    from sarnic.strategy.definition import StrategyDefinition

    original = StrategyDefinition()
    original.scoring.weights = {**original.scoring.weights, "vol": 20.0}
    restored = StrategyDefinition.from_dict(original.to_dict())

    assert _engine_for(restored).config_hash() == _engine_for(original).config_hash()


# --------------------------------------------------------------------------- #
#  Kalabalıklaşma: kesitsel basamak denendi ve ölçüm reddetti
# --------------------------------------------------------------------------- #
def test_crowding_gate_stays_absolute():
    """Kesitsel basamak eklenmemeli — denendi, para kaybettiriyor.

    Ham 24s getiri sıralamasında üst desil kaybettiriyor (ileri 24s −0,665%,
    havuz −0,075%). Buradan "en çok koşmuşu cezalandır" sonucu çıkarmak
    yanlış: puanlamanın **seçtiği** semboller aynı desilde olsalar bile
    kazandırıyor (puan ≥ 80 → +%1,53). Kesitsel ceza denendiğinde fırsatların
    %38,6'sı elendi ve ortalama getiri +%1,02'ye düştü.

    Bu test o denemenin sessizce geri gelmesini engeller.
    """
    # Sakin bir gün: havuzun en tepesindeki sembol +%5 koşmuş. Ceza yok.
    assert crowding_penalty(0.05) == 0.0
    # Parabolik hareket hâlâ cezalı — asıl korunmak istenen bu.
    assert crowding_penalty(0.30) == -15.0
    assert crowding_penalty(0.45) == -30.0
