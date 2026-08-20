"""Çıkış kuralları testleri — MASTER-SPEC §7."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from sarnic.core.enums import ExitReason
from sarnic.execution.exits import (
    MarketView,
    PositionView,
    evaluate_exit,
    rotation_candidate,
    update_stop,
)
from sarnic.strategy.definition import ExitSpec, RotationSpec

ENTRY_TIME = datetime(2026, 8, 13, 0, 0, tzinfo=UTC)
NOW = ENTRY_TIME + timedelta(hours=2)
SPEC = ExitSpec()


def position(**overrides) -> PositionView:
    base = {
        "symbol": "TESTUSDT",
        "qty": 10.0,
        "entry_price": 100.0,
        "entry_time": ENTRY_TIME,
        "stop": 96.0,
        "initial_stop": 96.0,
        "breakeven_locked": False,
    }
    base.update(overrides)
    return PositionView(**base)


# --------------------------------------------------------------------------- #
def test_no_exit_in_normal_conditions():
    decision = evaluate_exit(position(), MarketView(price=101.0, atr=1.0), SPEC, NOW)
    assert not decision.should_exit
    assert not decision.stop_moved


def test_stop_triggers():
    decision = evaluate_exit(position(), MarketView(price=95.0, atr=1.0), SPEC, NOW)
    assert decision.should_exit
    assert decision.reason is ExitReason.STOP


def test_stop_triggers_exactly_at_level():
    decision = evaluate_exit(position(), MarketView(price=96.0, atr=1.0), SPEC, NOW)
    assert decision.should_exit


def test_delist_beats_everything():
    decision = evaluate_exit(position(), MarketView(price=95.0, atr=1.0, delisted=True), SPEC, NOW)
    assert decision.reason is ExitReason.DELIST


def test_breakeven_lock_at_the_configured_r():
    """1R = 100 − 96 = 4. Tetiğe ulaşınca stop girişe (100) çekilir.

    Eşik `SPEC.breakeven_r` üzerinden hesaplanır; ayar değiştiğinde test
    kendiliğinden onunla gelir. Sabit sayıya bağlanırsa test, ayarın kâr
    koruma merdivenini nasıl etkilediğini ölçmek yerine gizler.
    """
    tetik = 100.0 + SPEC.breakeven_r * 4.0
    decision = evaluate_exit(position(), MarketView(price=tetik + 0.5, atr=1.0), SPEC, NOW)
    assert not decision.should_exit
    assert decision.new_stop == pytest.approx(100.0)
    assert decision.breakeven_locked


def test_breakeven_not_triggered_below_threshold():
    tetik = 100.0 + SPEC.breakeven_r * 4.0
    decision = evaluate_exit(position(), MarketView(price=tetik - 0.5, atr=1.0), SPEC, NOW)
    assert decision.new_stop is None


def test_trailing_after_breakeven():
    """Başabaş sonrası 2.5×ATR takip eden stop: 120 − 2.5×2 = 115."""
    pos = position(stop=100.0, breakeven_locked=True)
    decision = evaluate_exit(pos, MarketView(price=120.0, atr=2.0), SPEC, NOW)
    assert decision.new_stop == pytest.approx(115.0)


def test_stop_never_moves_down():
    """Monotonluk: fiyat düşünce trailing stop geri çekilmez."""
    pos = position(stop=115.0, breakeven_locked=True)
    assert update_stop(pos, MarketView(price=118.0, atr=2.0), SPEC) is None


def test_stop_never_exceeds_current_price():
    pos = position(stop=100.0, breakeven_locked=True)
    assert update_stop(pos, MarketView(price=101.0, atr=100.0), SPEC) is None


def test_breakeven_exit_reason_distinguished():
    """Başabaş stop'u tetiklenirse sebep BREAKEVEN olarak raporlanır (§7)."""
    pos = position(stop=100.0, breakeven_locked=True)
    decision = evaluate_exit(pos, MarketView(price=99.0, atr=1.0), SPEC, NOW)
    assert decision.reason is ExitReason.BREAKEVEN


def test_trailing_exit_reason_distinguished():
    pos = position(stop=115.0, breakeven_locked=True)
    decision = evaluate_exit(pos, MarketView(price=114.0, atr=1.0), SPEC, NOW)
    assert decision.reason is ExitReason.TRAILING


def test_score_exit_only_on_bar_close():
    """Puan çıkışı **bar kapanışında** değerlendirilir (§7 kural 4)."""
    intrabar = evaluate_exit(
        position(), MarketView(price=101.0, atr=1.0, score=40.0, bar_closed=False), SPEC, NOW
    )
    assert not intrabar.should_exit

    at_close = evaluate_exit(
        position(), MarketView(price=101.0, atr=1.0, score=40.0, bar_closed=True), SPEC, NOW
    )
    assert at_close.reason is ExitReason.SCORE


def test_score_above_threshold_stays():
    decision = evaluate_exit(
        position(), MarketView(price=101.0, atr=1.0, score=60.0, bar_closed=True), SPEC, NOW
    )
    assert not decision.should_exit


def test_time_exit_after_max_hold():
    late = ENTRY_TIME + timedelta(hours=SPEC.max_hold_hours)
    decision = evaluate_exit(position(), MarketView(price=101.0, atr=1.0), SPEC, late)
    assert decision.reason is ExitReason.TIME


def test_time_exit_not_before_limit():
    almost = ENTRY_TIME + timedelta(hours=SPEC.max_hold_hours - 1)
    decision = evaluate_exit(position(), MarketView(price=101.0, atr=1.0), SPEC, almost)
    assert not decision.should_exit


def test_stop_has_priority_over_time():
    late = ENTRY_TIME + timedelta(hours=60)
    decision = evaluate_exit(position(), MarketView(price=90.0, atr=1.0), SPEC, late)
    assert decision.reason is ExitReason.STOP


def test_r_multiple_calculation():
    assert position().r_multiple(104.0) == pytest.approx(1.0)
    assert position().r_multiple(108.0) == pytest.approx(2.0)
    assert position().r_multiple(96.0) == pytest.approx(-1.0)


# --------------------------------------------------------------------------- #
#  Rotasyon — §7
# --------------------------------------------------------------------------- #
SPEC_ROT = RotationSpec()


def test_rotation_requires_full_portfolio():
    assert rotation_candidate([("A", 80.0)], "B", 95.0, SPEC_ROT, 5) is None


def test_rotation_swaps_weakest_when_gap_met():
    positions = [("A", 82.0), ("B", 88.0), ("C", 90.0), ("D", 91.0), ("E", 93.0)]
    assert rotation_candidate(positions, "F", 95.0, SPEC_ROT, 5) == "A"


def test_rotation_blocked_when_gap_too_small():
    """Histerezis: en az 10 puan fark gerekir, yoksa sürekli girip çıkarız."""
    positions = [("A", 88.0), ("B", 89.0), ("C", 90.0), ("D", 91.0), ("E", 93.0)]
    assert rotation_candidate(positions, "F", 95.0, SPEC_ROT, 5) is None


def test_rotation_at_exact_gap_allowed():
    positions = [("A", 85.0), ("B", 89.0), ("C", 90.0), ("D", 91.0), ("E", 93.0)]
    assert rotation_candidate(positions, "F", 95.0, SPEC_ROT, 5) == "A"


def test_rotation_disabled():
    positions = [("A", 70.0), ("B", 88.0), ("C", 90.0), ("D", 91.0), ("E", 93.0)]
    disabled = RotationSpec(enabled=False)
    assert rotation_candidate(positions, "F", 99.0, disabled, 5) is None


def test_rotation_never_replaces_itself():
    positions = [("A", 70.0), ("B", 88.0), ("C", 90.0), ("D", 91.0), ("E", 93.0)]
    assert rotation_candidate(positions, "A", 99.0, SPEC_ROT, 5) is None


# --------------------------------------------------------------------------- #
#  Property testleri
# --------------------------------------------------------------------------- #
@given(
    price=st.floats(min_value=1.0, max_value=1000.0),
    atr=st.floats(min_value=0.0, max_value=50.0),
    locked=st.booleans(),
)
@settings(max_examples=200, deadline=None)
def test_updated_stop_is_always_below_price_and_above_old(price, atr, locked):
    pos = position(stop=96.0, breakeven_locked=locked)
    new_stop = update_stop(pos, MarketView(price=price, atr=atr), SPEC)
    if new_stop is not None:
        assert new_stop > pos.stop
        assert new_stop < price


@given(
    price=st.floats(min_value=1.0, max_value=500.0),
    hours=st.floats(min_value=0.0, max_value=100.0),
    score=st.floats(min_value=0.0, max_value=100.0),
)
@settings(max_examples=200, deadline=None)
def test_exit_decision_is_internally_consistent(price, hours, score):
    now = ENTRY_TIME + timedelta(hours=hours)
    decision = evaluate_exit(
        position(),
        MarketView(price=price, atr=1.0, score=score, bar_closed=True),
        SPEC,
        now,
    )
    # Çıkış varsa sebep zorunlu; çıkış yoksa sebep olamaz.
    assert decision.should_exit == (decision.reason is not None)
    # Aynı anda hem çıkış hem stop taşıma olamaz.
    assert not (decision.should_exit and decision.stop_moved)


# --------------------------------------------------------------------------- #
#  Kâr koruma merdiveni stop genişletilince ölmemeli
# --------------------------------------------------------------------------- #
def test_breakeven_trigger_stays_within_reach_of_the_stop():
    """`breakeven_r × stop_atr_multiple` kaç ATR'lik yükseliş gerektiriyor?

    Trailing yalnızca başabaş kilitlendikten sonra çalışır. Tetik ATR cinsinden
    uzaklaşırsa kâr koruma merdiveninin tamamı sessizce ölür — hiçbir hata
    verilmez, sadece kârlı çıkışlar durur.

    2026-08-18'de tam olarak bu oldu: stop 0.5→2.0 ATR genişletildi,
    `breakeven_r` 2.5'te bırakıldı, tetik 1.25 ATR'den **5.0 ATR**'ye fırladı.
    O ayarla 19 trailing çıkışı (+213) üreten mekanizma çalışmaz hâle geldi,
    zararlar yerinde kaldı.
    """
    spec = ExitSpec()
    tetik_atr = spec.breakeven_r * spec.stop_atr_multiple
    assert tetik_atr <= 2.5, (
        f"başabaş kilidi {tetik_atr:.2f} ATR'lik yükseliş istiyor; bu mesafede "
        "trailing pratikte hiç devreye girmez"
    )


def test_wide_stop_still_locks_breakeven_on_a_realistic_move():
    """2 ATR stop + gerçekçi bir yükselişte kilit gerçekten kapanmalı."""
    spec = ExitSpec()
    atr = 1.0
    entry = 100.0
    stop = entry - spec.stop_atr_multiple * atr
    pos = position(entry_price=entry, stop=stop, initial_stop=stop)

    # Fiyat, tetiğin tam üstüne çıksın.
    price = entry + spec.breakeven_r * spec.stop_atr_multiple * atr + 0.01
    yeni_stop = update_stop(pos, MarketView(price=price, atr=atr), spec)

    assert yeni_stop == pytest.approx(entry), "stop başabaşa çekilmeliydi"


def test_hold_window_matches_the_signal_horizon():
    """Tutma süresi sinyalin ölçülen ufkunun ötesine geçmemeli.

    Stop × tutma ızgarasında (60 gün, puan ≥ 80) 48–168 saat aralığı düzdür;
    uzun tutma getiriyi artırmaz, yalnızca maruziyeti uzatır. 24 saat ise
    belirgin biçimde kötüdür — sinyalin ufku bir günden uzun.
    """
    assert 48 <= ExitSpec().max_hold_hours <= 120


# --------------------------------------------------------------------------- #
#  Kâr koruma merdivenini kapatabilmek
# --------------------------------------------------------------------------- #
def test_zero_breakeven_r_disables_the_lock_instead_of_arming_it():
    """0 "kapalı" demektir, "hemen kilitle" değil.

    `r_multiple >= 0` her zaman doğrudur; eşik 0 iken kilit daha ilk barda
    kapanır ve pozisyon her geri çekilmede başabaşta sıfırlanır. Merdiveni
    kapatmak isteyen birinin eline geçebilecek en kötü sonuç bu olurdu.
    """
    spec = ExitSpec(breakeven_r=0.0, trail_atr=0.0, stop_atr_multiple=8.0)
    pos = position(entry_price=100.0, stop=92.0, initial_stop=92.0)
    assert update_stop(pos, MarketView(price=100.5, atr=1.0), spec) is None
    assert update_stop(pos, MarketView(price=130.0, atr=1.0), spec) is None


def test_zero_trail_atr_disables_trailing_after_lock():
    spec = ExitSpec(breakeven_r=1.0, trail_atr=0.0)
    kilitli = position(stop=100.0, breakeven_locked=True)
    assert update_stop(kilitli, MarketView(price=140.0, atr=2.0), spec) is None
