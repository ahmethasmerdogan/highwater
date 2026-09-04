"""Kısa yön — saf modüller (KISA-YON-PLANI §4).

Elle hesaplı kısa örnekler + iki yönlü property'ler. Uzun (direction=+1)
aritmetiği bugünkü hâliyle birebir: altın fixture (`test_altin_uzun`) ve
buradaki "uzun değişmedi" testleri bunu tutar.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from sarnic.core.enums import ExitReason, OrderSide
from sarnic.execution.accounting import price_points, risk_per_unit, weighted_r
from sarnic.execution.exits import MarketView, PositionView, evaluate_exit, update_stop
from sarnic.execution.gapfill import adverse_extreme, stop_fill_price, stop_hit
from sarnic.features.sr import Level, SRResult, stop_from_sr
from sarnic.sizing.engine import SizingEngine, SizingInput, stop_anchored_to_fill
from sarnic.sizing.leverage import LeverageSpec, borrow_cost, decide_leverage, liquidation_price
from sarnic.strategy.definition import ExitSpec

ENTRY_TIME = datetime(2026, 1, 1, tzinfo=UTC)
SPEC = ExitSpec(breakeven_r=1.5, trail_atr=2.5)
LEV = LeverageSpec(
    max_leverage=3.0,
    min_score=88.0,
    tiers=[[88.0, 2.0], [93.0, 3.0]],
    min_headroom_atr=2.0,
    require_pattern=True,
)


def kisa(**kw) -> PositionView:
    base = dict(
        symbol="XUSDT",
        qty=10.0,
        entry_price=100.0,
        entry_time=ENTRY_TIME,
        stop=104.0,
        initial_stop=104.0,
        direction=-1,
    )
    return PositionView(**{**base, **kw})


# --------------------------------------------------------------------------- #
#  Enum ve muhasebe
# --------------------------------------------------------------------------- #
def test_order_side_yon_cevrimi():
    assert OrderSide.BUY.direction == 1 and OrderSide.SELL.direction == -1
    assert OrderSide.from_direction(-1) is OrderSide.SELL
    assert OrderSide.from_direction(1) is OrderSide.BUY
    assert OrderSide.BUY.opposite is OrderSide.SELL


def test_fiyat_puani_ve_r_kisa_elle():
    """Kısa: 100'den sat, 90'da kapat, 2 adet → +20 puan; risk 4 → 2,5R."""
    assert price_points(100.0, 90.0, 2.0, -1) == pytest.approx(20.0)
    assert risk_per_unit(100.0, 104.0, -1) == pytest.approx(4.0)
    assert weighted_r(100.0, 90.0, 2.0, 4.0, direction=-1) == pytest.approx(2.5)
    # Uzun değişmedi.
    assert price_points(100.0, 110.0, 2.0) == pytest.approx(20.0)
    assert weighted_r(100.0, 110.0, 2.0, 4.0) == pytest.approx(2.5)


# --------------------------------------------------------------------------- #
#  Çıkışlar
# --------------------------------------------------------------------------- #
def test_kisa_r_carpani():
    p = kisa()
    assert p.initial_risk == pytest.approx(4.0)
    assert p.r_multiple(96.0) == pytest.approx(1.0)
    assert p.r_multiple(104.0) == pytest.approx(-1.0)


def test_kisa_stop_fiyat_ustune_cikinca_tetiklenir():
    sonra = ENTRY_TIME + timedelta(hours=1)
    d = evaluate_exit(kisa(), MarketView(price=104.5, atr=1.0), SPEC, sonra)
    assert d.should_exit and d.reason is ExitReason.STOP and "≥" in d.message
    d2 = evaluate_exit(kisa(), MarketView(price=103.9, atr=1.0), SPEC, sonra)
    assert not d2.should_exit


def test_kisa_basabas_ve_trailing_asagi_iner():
    # +1,5R (fiyat 94) → stop girişe (100) çekilir: 104'ten AŞAĞI.
    assert update_stop(kisa(), MarketView(price=94.0, atr=2.0), SPEC) == pytest.approx(100.0)
    kilitli = kisa(stop=100.0, breakeven_locked=True)
    # Trailing: fiyat 90, ATR 2 → 90 + 2,5×2 = 95 (fiyatın ÜSTÜNDE, stopun altında).
    assert update_stop(kilitli, MarketView(price=90.0, atr=2.0), SPEC) == pytest.approx(95.0)
    # Fiyat 97 → aday 102 > 100: koruyucu yönün tersi, taşınmaz.
    assert update_stop(kilitli, MarketView(price=97.0, atr=2.0), SPEC) is None


def test_uzun_cikis_aritmetigi_degismedi():
    p = PositionView("X", 1.0, 100.0, ENTRY_TIME, 96.0, 96.0)
    assert p.direction == 1 and p.r_multiple(104.0) == pytest.approx(1.0)
    d = evaluate_exit(p, MarketView(price=95.9, atr=1.0), SPEC, ENTRY_TIME)
    assert d.should_exit and "≤" in d.message


@given(
    price=st.floats(min_value=1.0, max_value=200.0),
    atr=st.floats(min_value=0.01, max_value=20.0),
)
@settings(max_examples=200, deadline=None)
def test_kisa_stop_yalniz_asagi_ve_fiyatin_ustunde(price, atr):
    for locked in (False, True):
        pos = kisa(breakeven_locked=locked, stop=100.0 if locked else 104.0)
        yeni = update_stop(pos, MarketView(price=price, atr=atr), SPEC)
        if yeni is not None:
            assert yeni < pos.stop
            assert yeni > price


@given(
    price=st.floats(min_value=1.0, max_value=500.0),
    hours=st.floats(min_value=0.0, max_value=100.0),
    score=st.floats(min_value=0.0, max_value=100.0),
)
@settings(max_examples=200, deadline=None)
def test_kisa_cikis_karari_tutarli(price, hours, score):
    d = evaluate_exit(
        kisa(),
        MarketView(price=price, atr=1.0, score=score, bar_closed=True),
        SPEC,
        ENTRY_TIME + timedelta(hours=hours),
    )
    assert d.should_exit == (d.reason is not None)
    assert not (d.should_exit and d.stop_moved)


# --------------------------------------------------------------------------- #
#  Boşluk dolumu
# --------------------------------------------------------------------------- #
def test_kisa_bosluk_dolumu_kotu_olan():
    assert stop_fill_price(104.0, 106.0, -1) == 106.0  # stopun üstünde açıldı → açılış
    assert stop_fill_price(104.0, 103.0, -1) == 104.0  # gün içi deldi → stop
    assert stop_fill_price(96.0, 94.0) == 94.0  # uzun değişmedi
    assert adverse_extreme(90.0, 110.0, -1) == 110.0 and adverse_extreme(90.0, 110.0) == 90.0
    assert stop_hit(104.0, 105.0, -1) and not stop_hit(104.0, 103.0, -1)
    assert stop_hit(96.0, 95.0) and not stop_hit(96.0, 97.0)


# --------------------------------------------------------------------------- #
#  S/R stopu
# --------------------------------------------------------------------------- #
def _sr(**kw) -> SRResult:
    return SRResult(symbol="X", timeframe="1h", price=100.0, atr=2.0, **kw)


def test_kisa_stop_direncin_ustunde():
    sr = _sr(nearest_resistance=Level(price=105.0, kind="resistance"))
    assert stop_from_sr(sr, 0.5, entry=100.0, direction=-1) == pytest.approx(106.0)
    # Direnç girişe yapışıksa taban: giriş + k×ATR'den yakın olamaz.
    yakin = _sr(nearest_resistance=Level(price=100.2, kind="resistance"))
    assert stop_from_sr(yakin, 0.5, entry=100.0, direction=-1) == pytest.approx(101.2)
    assert stop_from_sr(_sr(), 0.5, entry=100.0, direction=-1) is None
    # Uzun değişmedi.
    uzun = _sr(nearest_support=Level(price=95.0, kind="support"))
    assert stop_from_sr(uzun, 0.5, entry=100.0) == pytest.approx(94.0)


# --------------------------------------------------------------------------- #
#  Boyutlandırma
# --------------------------------------------------------------------------- #
def _inp(direction: int, entry: float, stop: float, score: float = 90.0) -> SizingInput:
    return SizingInput(
        symbol="XUSDT",
        score=score,
        entry=entry,
        stop=stop,
        equity=1_000_000.0,
        free_cash=1_000_000.0,
        current_exposure=0.0,
        cluster_exposure=0.0,
        realized_vol_20d=0.6,
        adv_1h=1e12,
        direction=direction,
    )


def test_kisa_boyut_stop_ustte_risk_dogru():
    d = SizingEngine().size(_inp(-1, 100.0, 104.0))
    assert d.accepted, d.reject_reason
    assert d.stop == 104.0
    assert d.risk_amount == pytest.approx(d.qty * 4.0)
    ret = SizingEngine().size(_inp(-1, 100.0, 96.0))
    assert not ret.accepted and "üstünde değil" in ret.reject_reason


@given(
    entry=st.floats(min_value=0.01, max_value=10_000.0),
    stop_fraction=st.floats(min_value=0.001, max_value=0.2),
    score=st.floats(min_value=0, max_value=100),
    direction=st.sampled_from([1, -1]),
)
@settings(max_examples=200, deadline=None)
def test_stop_her_zaman_koruyucu_tarafta(entry, stop_fraction, score, direction):
    stop = entry * (1 - direction * stop_fraction)
    d = SizingEngine().size(_inp(direction, entry, stop, score))
    if d.accepted:
        assert direction * (entry - d.stop) > 0
        assert d.risk_amount == pytest.approx(d.qty * direction * (entry - stop))


# --------------------------------------------------------------------------- #
#  Kaldıraç
# --------------------------------------------------------------------------- #
def test_kisa_kaldirac_ayi_formasyonu_teyit_ve_marj_sigmasi():
    """Giriş 100, stop 130 (%30): 3× sığmaz (0,8/3 = %26,7), 2× sığar (%40)."""
    ortak = dict(score=95.0, headroom_atr=5.0, entry=100.0, direction=-1)
    d = decide_leverage(LEV, pattern_modifier=-3.0, stop=130.0, **ortak)
    assert d.leverage == 2.0, d.reason
    boga = decide_leverage(LEV, pattern_modifier=3.0, stop=130.0, **ortak)
    assert boga.leverage == 1.0 and "formasyon" in boga.reason
    ters = decide_leverage(LEV, pattern_modifier=-3.0, stop=90.0, **ortak)
    assert ters.leverage == 1.0 and "geçersiz" in ters.reason


def test_kisa_likidasyon_girisin_ustunde_ve_borc_tam_notional():
    assert liquidation_price(100.0, 3.0, direction=-1) == pytest.approx(130.0)
    assert liquidation_price(100.0, 3.0) == pytest.approx(70.0)
    assert borrow_cost(1000.0, 1.0, 10.0, 0.001, direction=-1) == pytest.approx(10.0)
    assert borrow_cost(1000.0, 1.0, 10.0, 0.001) == 0.0
    assert borrow_cost(1000.0, 2.0, 10.0, 0.001) == pytest.approx(5.0)


# --------------------------------------------------------------------------- #
#  Dolum stopu geçerse stop dolumdan çapalanır (bot 5 / MSTRBUSDT, 2026-09-04)
# --------------------------------------------------------------------------- #
def test_stop_doluma_capalanir():
    # Uzun: karar 141, stop 138,92 (mesafe 2,08); dolum 136,87 stopun ALTINDA.
    assert stop_anchored_to_fill(136.87, 141.0, 138.92, 1) == pytest.approx(136.87 - 2.08)
    # Doğru taraftaysa stop aynen kalır.
    assert stop_anchored_to_fill(141.3, 141.0, 138.92, 1) == 138.92
    # Kısa: karar 100, stop 104; dolum 105 stopun ÜSTÜNDE → 105 + 4 = 109.
    assert stop_anchored_to_fill(105.0, 100.0, 104.0, -1) == pytest.approx(109.0)
    assert stop_anchored_to_fill(99.5, 100.0, 104.0, -1) == 104.0


def test_stop_capasi_kismi_r_sinirli():
    """1R≈0 pozisyonda r_multiple patlar; worker tavanı 9 999'da keser."""
    p = PositionView("X", 1.0, 100.0, ENTRY_TIME, 100.0, 100.0)
    assert p.r_multiple(101.0) > 9_999.0
    assert max(-9_999.0, min(9_999.0, p.r_multiple(101.0))) == 9_999.0
