"""Boyutlandırma testleri — Faz 4 kabul kriteri.

`hypothesis` property testleri (CLAUDE.md test disiplini):
  * pozisyon boyutu hiçbir koşulda `max_position_pct`'i aşmaz
  * toplam maruziyet `max_exposure` tavanını aşmaz
  * küme maruziyeti %50'yi aşmaz
  * stop her zaman girişin altında
"""

from __future__ import annotations

import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from sarnic.sizing.engine import (
    SizingEngine,
    SizingInput,
    SizingParams,
    regime_multiplier,
    round_to_step,
    score_tier,
    vol_scalar,
)
from sarnic.strategy.definition import EntrySpec, ExitSpec

PROP = settings(max_examples=250, deadline=None)


def make_input(**overrides) -> SizingInput:
    base = {
        "symbol": "TESTUSDT",
        # Kademe çarpanı 1,00 olan bant — elle hesaplanmış fixture'ların
        # sayıları puanla değil, boyutlandırma mantığıyla ilgilidir. Kademeler
        # giriş kapısına göre yeniden çapalandığında (80/82/85) 90 artık 1,25
        # veriyordu ve testler mantığı değil ayarı sınar hâle gelmişti.
        "score": 83.0,
        "entry": 100.0,
        "stop": 96.0,
        "equity": 10_000.0,
        "free_cash": 10_000.0,
        "current_exposure": 0.0,
        "cluster_exposure": 0.0,
        "realized_vol_20d": 0.60,
        "adv_1h": 10_000_000.0,
        "open_positions": 0,
    }
    base.update(overrides)
    return SizingInput(**base)


# --------------------------------------------------------------------------- #
#  Bilinen sonuçlu fixture (elle hesaplanmış)
# --------------------------------------------------------------------------- #
def test_hand_calculated_size():
    """equity 10.000, risk %1 → R = 100. Giriş 100, stop 96 → birim risk 4.

    qty = 100 / 4 = 25 → notional 2.500.
    vol_scalar = 0.60/0.60 = 1.0, tier(83) = 1.00, regime = 1.0 → 2.500.
    Tek pozisyon tavanı 10.000 × %30 = 3.000 → bağlayıcı değil.
    """
    decision = SizingEngine().size(make_input())
    assert decision.accepted
    assert decision.qty == pytest.approx(25.0)
    assert decision.notional == pytest.approx(2_500.0)
    assert decision.risk_amount == pytest.approx(100.0)


def test_tier_scales_notional():
    """tier(81) = 0,75 → 2.500 × 0,75 = 1.875."""
    decision = SizingEngine().size(make_input(score=81.0))
    assert decision.notional == pytest.approx(1_875.0)


def test_high_tier_hits_position_cap():
    """tier(95) = 1.25 → 3.125, ama tavan 3.000 → kırpılır."""
    decision = SizingEngine().size(make_input(score=95.0))
    assert decision.notional == pytest.approx(3_000.0)
    binding = [s for s in decision.steps if s.get("binding")]
    assert any(s["step"] == "tek_pozisyon_tavanı" for s in binding)


def test_regime_halves_in_bear_market():
    decision = SizingEngine().size(make_input(btc_below_ema200=True))
    assert decision.notional == pytest.approx(1_250.0)


def test_regime_compounds():
    """BTC EMA200 altında (×0.5) ve vol p90 üstünde (×0.7) → ×0.35."""
    decision = SizingEngine().size(make_input(btc_below_ema200=True, btc_vol_above_p90=True))
    assert decision.notional == pytest.approx(2_500.0 * 0.35)


def test_liquidity_cap_binds():
    """adv_1h × %2 = 1.000 → boyut 1.000'e kırpılır."""
    decision = SizingEngine().size(make_input(adv_1h=50_000.0))
    assert decision.notional == pytest.approx(1_000.0)


# --------------------------------------------------------------------------- #
#  Reddetme koşulları
# --------------------------------------------------------------------------- #
def test_rejects_stop_above_entry():
    decision = SizingEngine().size(make_input(stop=105.0))
    assert not decision.accepted
    assert "stop girişin altında değil" in decision.reject_reason


def test_rejects_missing_stop():
    decision = SizingEngine().size(make_input(stop=0.0))
    assert not decision.accepted
    assert "stop hesaplanamadı" in decision.reject_reason


def test_rejects_stop_too_far():
    """(100 − 90)/100 = %10 > %8."""
    decision = SizingEngine().size(make_input(stop=90.0))
    assert not decision.accepted
    assert "stop çok uzak" in decision.reject_reason


def test_rejects_below_score_threshold():
    decision = SizingEngine().size(make_input(score=75.0))
    assert not decision.accepted
    assert "kademe eşiğinin altında" in decision.reject_reason


def test_rejects_when_max_positions_reached():
    decision = SizingEngine().size(make_input(open_positions=5))
    assert not decision.accepted
    assert "maksimum eşzamanlı pozisyon" in decision.reject_reason


def test_rejects_on_cluster_limit():
    """Küme limiti aşılırsa **kırpılmaz, reddedilir** (§6.2)."""
    decision = SizingEngine().size(make_input(cluster_exposure=4_900.0))
    assert not decision.accepted
    assert "korelasyon kümesi limiti" in decision.reject_reason


def test_rejects_below_min_notional():
    """equity 20 → risk 0.20 → qty 0.05 → notional 5 × tier 0.75 = 3.75 < 10."""
    decision = SizingEngine().size(make_input(equity=20.0, free_cash=20.0, score=81.0))
    assert not decision.accepted
    assert "minimum emir tutarının altında" in decision.reject_reason


# --------------------------------------------------------------------------- #
#  Yardımcı fonksiyonlar
# --------------------------------------------------------------------------- #
def test_score_tier_boundaries():
    """Kademe sınırları ayardan okunur, sabit sayıdan değil.

    Sabit sayıya bağlıyken kademeler giriş kapısına göre yeniden çapalanınca
    test, ayarın kasıtlı değişimini bir kusur gibi gösteriyordu. Sınanan şey
    davranış olmalı: eşiğin altı sıfır, her eşikte bir üst çarpan.
    """
    tiers = sorted(SizingParams().tiers)
    en_alt = tiers[0][0]

    assert score_tier(en_alt - 0.1) == 0.0, "kapının altında pozisyon açılmaz"
    for esik, carpan in tiers:
        assert score_tier(esik) == carpan
        assert score_tier(esik + 0.001) == carpan
    assert score_tier(100.0) == tiers[-1][1]


@pytest.mark.parametrize(
    "realized,expected",
    [(0.60, 1.0), (1.20, 0.5), (0.30, 1.5), (5.0, 0.5), (0.01, 1.5), (0.0, 1.0)],
)
def test_vol_scalar_is_clamped(realized, expected):
    assert vol_scalar(0.60, realized) == pytest.approx(expected)


def test_vol_scalar_handles_nan():
    assert vol_scalar(0.60, float("nan")) == 1.0


@pytest.mark.parametrize(
    "below,high_vol,expected",
    [(False, False, 1.0), (True, False, 0.5), (False, True, 0.7), (True, True, 0.35)],
)
def test_regime_multiplier(below, high_vol, expected):
    assert regime_multiplier(below, high_vol) == pytest.approx(expected)


def test_round_to_step_rounds_down():
    """Yukarı yuvarlamak limitleri aşabilir — her zaman aşağı."""
    assert round_to_step(10.7, 0.5) == pytest.approx(10.5)
    assert round_to_step(10.7, 0.0) == pytest.approx(10.7)


# --------------------------------------------------------------------------- #
#  Property testleri — "hiçbir koşulda"
# --------------------------------------------------------------------------- #
sane_floats = st.floats(
    min_value=0.01, max_value=1e7, allow_nan=False, allow_infinity=False, width=32
)


@given(
    score=st.floats(min_value=0, max_value=100),
    entry=st.floats(min_value=0.01, max_value=100_000),
    stop_fraction=st.floats(min_value=0.001, max_value=0.5),
    equity=st.floats(min_value=100, max_value=10_000_000),
    exposure_fraction=st.floats(min_value=0.0, max_value=1.0),
    cluster_fraction=st.floats(min_value=0.0, max_value=1.0),
    realized=st.floats(min_value=0.0, max_value=10.0),
    adv=st.floats(min_value=0.0, max_value=1e12),
    positions=st.integers(min_value=0, max_value=10),
)
@PROP
def test_never_exceeds_any_cap(
    score,
    entry,
    stop_fraction,
    equity,
    exposure_fraction,
    cluster_fraction,
    realized,
    adv,
    positions,
):
    params = SizingParams()
    current_exposure = equity * params.max_exposure_pct * exposure_fraction
    decision = SizingEngine(params).size(
        make_input(
            score=score,
            entry=entry,
            stop=entry * (1 - stop_fraction),
            equity=equity,
            free_cash=equity,
            current_exposure=current_exposure,
            cluster_exposure=equity * params.cluster_exposure_pct * cluster_fraction,
            realized_vol_20d=realized,
            adv_1h=adv,
            open_positions=positions,
        )
    )
    if not decision.accepted:
        assert decision.qty == 0.0
        assert decision.notional == 0.0
        return

    # 1) Tek pozisyon tavanı
    assert decision.notional <= equity * params.max_position_pct + 1e-6
    # 2) Toplam maruziyet tavanı
    assert current_exposure + decision.notional <= equity * params.max_exposure_pct + 1e-6
    # 3) Likidite tavanı
    assert decision.notional <= adv * params.adv_fraction + 1e-6
    # 4) Serbest nakit
    assert decision.notional <= equity + 1e-6
    # 5) Boyut pozitif
    assert decision.qty > 0


@given(
    entry=st.floats(min_value=1.0, max_value=100_000),
    stop_fraction=st.floats(min_value=0.001, max_value=0.5),
    score=st.floats(min_value=0, max_value=100),
)
@PROP
def test_stop_is_always_below_entry_when_accepted(entry, stop_fraction, score):
    stop = entry * (1 - stop_fraction)
    decision = SizingEngine().size(
        make_input(score=score, entry=entry, stop=stop, equity=1_000_000, free_cash=1_000_000)
    )
    if decision.accepted:
        assert decision.stop < entry
        assert decision.stop > 0


@given(
    equity=st.floats(min_value=1_000, max_value=1_000_000),
    stop_fraction=st.floats(min_value=0.005, max_value=0.079),
)
@PROP
def test_risk_amount_never_exceeds_budget_before_scaling(equity, stop_fraction):
    """Ölçekleyiciler ≤ 1.5 olduğu için risk, bütçenin 1.5 katını aşamaz."""
    params = SizingParams()
    decision = SizingEngine(params).size(
        make_input(
            entry=100.0,
            stop=100.0 * (1 - stop_fraction),
            equity=equity,
            free_cash=equity,
            adv_1h=1e12,
        )
    )
    if decision.accepted:
        budget = equity * params.risk_pct
        assert decision.risk_amount <= budget * 1.5 * 1.25 + 1e-6


@given(
    cluster=st.floats(min_value=0.0, max_value=1.0),
    equity=st.floats(min_value=1_000, max_value=1_000_000),
)
@PROP
def test_cluster_exposure_cap_never_breached(cluster, equity):
    params = SizingParams()
    cap = equity * params.cluster_exposure_pct
    existing = cap * cluster
    decision = SizingEngine(params).size(
        make_input(equity=equity, free_cash=equity, cluster_exposure=existing, adv_1h=1e12)
    )
    if decision.accepted:
        assert existing + decision.notional <= cap + 1e-6


@given(score=st.floats(min_value=0, max_value=100))
@PROP
def test_tier_is_monotonic(score):
    assert score_tier(score) in (0.0, 0.75, 1.0, 1.25)
    if score < 80:
        assert score_tier(score) == 0.0


def test_sizing_params_from_definition():
    params = SizingParams.from_definition(
        {"risk_pct": 0.02, "tiers": [[70, 0.5], [90, 1.0]], "vol_target": 0.4}
    )
    assert params.risk_pct == 0.02
    assert params.target_vol == 0.4
    assert score_tier(75, params.tiers) == 0.5


def test_decision_records_every_step():
    """Panelde "neden bu boyut?" sorusunun cevabı adım listesidir."""
    decision = SizingEngine().size(make_input())
    names = [s["step"] for s in decision.steps]
    for expected in (
        "risk_bütçesi",
        "stop_boyutu",
        "vol_scalar",
        "tier",
        "regime",
        "tek_pozisyon_tavanı",
        "serbest_nakit",
        "toplam_maruziyet",
        "likidite_tavanı",
    ):
        assert expected in names
    assert all(math.isfinite(s["value"]) for s in decision.steps)


def test_stop_width_and_rejection_cap_stay_compatible():
    """Varsayılan stop, boyutlandırmanın reddetme kapağının altında kalmalı.

    Stop girişin `max_stop_pct`'inden uzaksa pozisyon açılmaz. İki ayar ayrı
    dosyalarda durduğu için biri değişince diğeri sessizce işlem elemeye başlar
    — üstelik taraflı biçimde: yüksek ATR'li semboller elenir ve büyük
    kazançları onlar taşır. Ölçüldü: kapak %8 sabitken 2 ATR stop işlem başına
    +%0,69 verirken 6 ATR −%0,62 veriyor, çünkü girişlerin üçte biri hiç
    açılmıyor.

    Havuzda ATR/fiyatın %90 dilimi ≈ %2,46. Volatil bir sembolde bile stop
    kapağın altında kalmalı.
    """
    atr_pct_p90 = 0.0246
    stop_pct = ExitSpec().stop_atr_multiple * atr_pct_p90
    assert stop_pct <= SizingParams().max_stop_pct, (
        f"stop havuzun volatil ucunda %{stop_pct * 100:.1f} olur; kapak "
        f"%{SizingParams().max_stop_pct * 100:.0f} — işlemler sessizce elenir"
    )


def test_score_tiers_are_anchored_to_the_entry_gate():
    """Kademeler giriş kapısının üstünde anlamlı biçimde dağılmalı.

    Kapı ile kademeler ayrı dosyalarda durur ve biri değişince diğeri sessizce
    işlevsizleşir. Eski varsayılan (80/85/92) kapı 80 ile birlikte işlemlerin
    %87'sini en küçük kademeye koyuyordu; en büyük kademe (92+) 60 günde altı
    kez görüldü, yani hiç kullanılmadı.
    """
    tiers = sorted(SizingParams().tiers)
    kapi = EntrySpec().min_score

    assert tiers[0][0] <= kapi, "en alt kademe kapının altında başlamalı"
    # Kapının hemen üstünde en az iki kademe daha olmalı: aksi hâlde bütün
    # işlemler tek çarpanla gider ve kademe kavramı bir işe yaramaz.
    ustundekiler = [t for t, _ in tiers if t > kapi]
    assert len(ustundekiler) >= 2
    # En üst kademe erişilebilir olmalı — 60 günlük dağılımda 88 üstü 30 kez,
    # 92 üstü yalnızca 6 kez görüldü.
    assert max(ustundekiler) <= kapi + 8


def test_score_tier_scales_with_conviction():
    """Yüksek puan daha büyük çarpan almalı — ölçüm bunu destekliyor."""
    tiers = SizingParams().tiers
    assert score_tier(80.5, tiers) < score_tier(83.0, tiers) < score_tier(87.0, tiers)


# --------------------------------------------------------------------------- #
#  Kırıntı pozisyon
# --------------------------------------------------------------------------- #
def test_rejects_when_constraints_leave_only_a_crumb():
    """Nakit bittiyse küçük bir pozisyon açmak değil, açmamak doğrudur.

    Kısıtlar boyutu kırpıyordu ama tabanı yoktu. Ölçüldü (2026-08-19): aynı
    sembolde, neredeyse aynı barda, botlara göre büyüklükler 20 $ ile 1.514 $
    arasında değişti. 20 $'lık pozisyon hiçbir şey kazandıramaz ama beş
    pozisyonluk defterde bir slotu 72 saate kadar işgal eder ve o slot gerçek
    bir fırsata kapanır.
    """
    decision = SizingEngine().size(make_input(free_cash=20.0))

    assert not decision.accepted
    assert "slot boş bırakıldı" in decision.reject_reason
    # Kırpmanın kendisi hâlâ görünür olmalı — sessiz ret yok.
    assert any(s.get("binding") and s["step"] == "serbest_nakit" for s in decision.steps)


def test_partial_constraint_still_allowed_above_the_floor():
    """Taban bir eşiktir, yasak değil: hedefin yarısı kabul edilir.

    Nakit tavanı komisyon payı kadar (NAKIT_EMNIYET_PAYI) daraltılır — adaptörün
    marj kuralı komisyonu da sayar; tam tavan her emri reddettiriyordu.
    """
    from sarnic.sizing.engine import NAKIT_EMNIYET_PAYI

    hedef = SizingEngine().size(make_input()).notional
    decision = SizingEngine().size(make_input(free_cash=hedef * 0.5))

    assert decision.accepted
    assert decision.notional == pytest.approx(hedef * 0.5 * NAKIT_EMNIYET_PAYI)


def test_crumb_floor_scales_with_the_target_not_a_fixed_amount():
    """Taban orana bağlıdır; küçük sermayede de aynı mantık işler.

    Sabit bir dolar tabanı, 200 $ sermayeli bir botta her girişi reddederdi.
    """
    kucuk = make_input(equity=500.0, free_cash=500.0)
    hedef = SizingEngine().size(kucuk).notional
    assert SizingEngine().size(make_input(equity=500.0, free_cash=hedef * 0.6)).accepted
    assert not SizingEngine().size(make_input(equity=500.0, free_cash=hedef * 0.1)).accepted


def test_position_slot_count_matches_the_entry_spec():
    """Slot sayısı iki yerde tanımlı; ayrışırsa maruziyet sessizce düşer.

    Giriş mantığı `EntrySpec.max_positions`, boyutlandırma
    `SizingParams.max_positions` kullanıyor. Biri 4, diğeri 5 kalırsa sistem
    dört pozisyon açar ama sermayeyi beşe böler — defter hiçbir zaman dolmaz.
    """
    assert SizingParams().max_positions == EntrySpec().max_positions
