"""Kaldıraç: teyit üçlüsü, marj sığması, borç maliyeti, adaptör marjı.

Kural: kaldıraç riski çarpmaz, tavanları kaldırır; teyit yoksa 1×;
borç bedavaya verilmez. lev=1 yolunun birebir eski davranış olduğu
`test_paper.py`'deki mevcut takımla zaten sabit.
"""

from __future__ import annotations

import pytest

from sarnic.core.enums import OrderSide, OrderStatus, OrderType
from sarnic.execution.base import OrderRequest
from sarnic.execution.paper import Book, PaperAdapter, PaperConfig, StaticBookSource
from sarnic.sizing.engine import SizingEngine, SizingInput, SizingParams
from sarnic.sizing.leverage import (
    LeverageSpec,
    borrow_cost,
    decide_leverage,
    liquidation_price,
)

SPEC = LeverageSpec(
    max_leverage=3.0,
    min_score=88.0,
    tiers=[[88.0, 2.0], [93.0, 3.0]],
    min_headroom_atr=2.0,
    require_pattern=True,
    stop_margin_fit=0.8,
)


def test_leverage_disabled_is_always_one():
    spec = LeverageSpec()  # blok yok → kapalı
    d = decide_leverage(
        spec, score=99.0, pattern_modifier=5.0, headroom_atr=10.0, entry=100.0, stop=99.0
    )
    assert d.leverage == 1.0


def test_confirmation_trio_all_required():
    # Puan düşük → 1×
    assert (
        decide_leverage(
            SPEC, score=85.0, pattern_modifier=3.0, headroom_atr=5.0, entry=100, stop=95
        ).leverage
        == 1.0
    )
    # Formasyon yok → 1×
    assert (
        decide_leverage(
            SPEC, score=95.0, pattern_modifier=0.0, headroom_atr=5.0, entry=100, stop=95
        ).leverage
        == 1.0
    )
    # Dirence yer yok → 1×
    assert (
        decide_leverage(
            SPEC, score=95.0, pattern_modifier=3.0, headroom_atr=1.0, entry=100, stop=95
        ).leverage
        == 1.0
    )
    # Üçü tam → kademe (95 ≥ 93 → 3×; stop %5, marj %33×0,8 → sığar)
    assert (
        decide_leverage(
            SPEC, score=95.0, pattern_modifier=3.0, headroom_atr=5.0, entry=100, stop=95
        ).leverage
        == 3.0
    )


def test_score_ladder():
    d = decide_leverage(
        SPEC, score=90.0, pattern_modifier=1.0, headroom_atr=3.0, entry=100, stop=96
    )
    assert d.leverage == 2.0  # 88 kademesi, 93 değil


def test_stop_must_fit_margin():
    # 3× marj %33; sığma payı 0,8 → stop mesafesi ≤ %26,7 olmalı.
    # %30'luk stop 3×'e sığmaz → 2×'e düşer (%40 sınırına sığar).
    d = decide_leverage(
        SPEC, score=95.0, pattern_modifier=2.0, headroom_atr=4.0, entry=100.0, stop=70.0
    )
    assert d.leverage == 2.0
    # %45'lik stop 2×'e de sığmaz (%40) → 1×.
    d = decide_leverage(
        SPEC, score=95.0, pattern_modifier=2.0, headroom_atr=4.0, entry=100.0, stop=55.0
    )
    assert d.leverage == 1.0
    assert "sığmadı" in d.reason


def test_borrow_cost_only_on_borrowed_part():
    # 3.000 notional, 3×: borç 2.000. 48 saat × %0,00208/s ≈ 2,00.
    maliyet = borrow_cost(3_000.0, 3.0, 48.0, 0.0000208)
    assert maliyet == pytest.approx(2_000.0 * 0.0000208 * 48.0)
    assert borrow_cost(3_000.0, 1.0, 48.0, 0.0000208) == 0.0


def test_liquidation_price_below_fitted_stop():
    # Sığma kuralı stopu likidasyonun güvenli tarafında tutar.
    entry, lev = 100.0, 3.0
    liq = liquidation_price(entry, lev)
    assert liq == pytest.approx(100.0 * (1 - (1 / 3) * 0.9))
    # 3×'e sığan en geniş stop: %26,7 → 73,3 > liq (70,0).
    assert liq < 100.0 * (1 - (1 / 3) * 0.8)


def test_sizing_caps_lift_with_leverage():
    """Kaldıraç yalnız nakit + tek pozisyon tavanını kaldırır; risk aynı."""
    p = SizingParams(
        risk_pct=0.01,
        max_position_pct=0.30,
        max_exposure_pct=2.0,
        max_stop_pct=0.20,
        target_vol=1.0,
        tiers=((0.0, 1.0),),
        min_fill_ratio=0.0,
        adv_fraction=1.0,
    )
    inp = dict(
        symbol="X",
        score=95.0,
        entry=100.0,
        stop=98.0,  # %2 stop → risk bazlı notional = 0.01×10.000/0.02×100...
        equity=10_000.0,
        free_cash=10_000.0,
        current_exposure=0.0,
        cluster_exposure=0.0,
        realized_vol_20d=1.0,
        adv_1h=1e9,
    )
    spot = SizingEngine(p).size(SizingInput(**inp, leverage=1.0))
    lev3 = SizingEngine(p).size(SizingInput(**inp, leverage=3.0))
    assert spot.accepted and lev3.accepted
    # %2 stopla risk bazlı hedef 5.000; spot'ta tek-pozisyon tavanı 3.000'e
    # kırpar, 3× tavanı 9.000'e çıkarır → hedefin tamamı geçer.
    assert spot.qty * 100.0 == pytest.approx(3_000.0)
    assert lev3.qty * 100.0 == pytest.approx(5_000.0)


@pytest.mark.asyncio
async def test_adapter_margin_rule():
    """1.000 nakitle 3× → 2.400 notional geçer (marj 800), 3.600 geçmez."""
    book = Book(symbol="T", bids=[(100.0, 1000.0)], asks=[(100.0, 1000.0)])
    cfg = PaperConfig(latency_ms=0, simulate_latency=False, extra_slippage_bps=0.0, taker_fee=0.0)

    adapter = PaperAdapter(book_source=StaticBookSource({"T": book}), balance=1_000.0, config=cfg)
    ok = await adapter.submit(
        OrderRequest(
            symbol="T",
            side=OrderSide.BUY,
            type=OrderType.MARKET,
            qty=24.0,
            meta={"leverage": 3.0},
        )
    )
    assert ok.status == OrderStatus.FILLED
    # Akış tam notional: nakit eksiye iner — borç görünür kalır.
    assert adapter._free == pytest.approx(1_000.0 - 2_400.0)

    adapter2 = PaperAdapter(book_source=StaticBookSource({"T": book}), balance=1_000.0, config=cfg)
    ret = await adapter2.submit(
        OrderRequest(
            symbol="T",
            side=OrderSide.BUY,
            type=OrderType.MARKET,
            qty=36.0,
            meta={"leverage": 3.0},
        )
    )
    assert ret.status == OrderStatus.REJECTED
    assert "marj" in (ret.reject_reason or "")


@pytest.mark.asyncio
async def test_adapter_no_leverage_meta_unchanged():
    """meta.leverage yokken eski kural birebir: tam notional nakit ister."""
    book = Book(symbol="T", bids=[(100.0, 1000.0)], asks=[(100.0, 1000.0)])
    cfg = PaperConfig(latency_ms=0, simulate_latency=False, extra_slippage_bps=0.0, taker_fee=0.0)
    adapter = PaperAdapter(book_source=StaticBookSource({"T": book}), balance=1_000.0, config=cfg)
    ret = await adapter.submit(
        OrderRequest(symbol="T", side=OrderSide.BUY, type=OrderType.MARKET, qty=12.0)
    )
    assert ret.status == OrderStatus.REJECTED  # 1.200 > 1.000


def test_agirlikli_r_kismi_yoksa_eski_formul():
    """weighted_r: kısmi satış yoksa (exit−entry)/risk ile birebir; kısmi
    varsa giriş miktarına göre ağırlıklı — elle hesap 1,5R (bkz. backtest testi)."""
    from sarnic.execution.accounting import weighted_r

    assert weighted_r(100.0, 110.0, 10.0, 5.0) == 2.0
    assert weighted_r(100.0, 110.0, 10.0, 5.0, realized_points=0.0, entry_qty=10.0) == 2.0
    # 10 adet @100, 5'i 105'ten satıldı (puan 25), kalan 5 adet 110'dan: (25+50)/(5×10)=1,5
    assert weighted_r(100.0, 110.0, 5.0, 5.0, realized_points=25.0, entry_qty=10.0) == 1.5
    assert weighted_r(100.0, 110.0, 0.0, 5.0) == 0.0


def test_risk_carpani_kaldiracla_buyur():
    """scale_risk: risk bütçesi kaldıraç kadar büyür (3× → 3 kat notional,
    tavanlar da 3× kalktığı için boyut gerçekten büyür). Kapalıyken eski davranış."""
    from sarnic.sizing.engine import SizingEngine, SizingInput, SizingParams
    from sarnic.sizing.leverage import LeverageSpec

    assert LeverageSpec.from_sizing(
        {"leverage": {"max_leverage": 3, "scale_risk": True}}
    ).scale_risk
    assert not LeverageSpec.from_sizing({"leverage": {"max_leverage": 3}}).scale_risk
    e = SizingEngine(
        SizingParams(
            risk_pct=0.01,
            max_position_pct=0.9,
            max_exposure_pct=3.0,
            cluster_exposure_pct=3.0,
            adv_fraction=1e9,
            min_fill_ratio=0.0,
        )
    )
    ortak = dict(
        symbol="X",
        score=85.0,
        entry=100.0,
        stop=95.0,
        equity=10_000.0,
        free_cash=10_000.0,
        current_exposure=0.0,
        cluster_exposure=0.0,
        realized_vol_20d=0.6,
        adv_1h=1e12,
    )
    duz = e.size(SizingInput(**ortak))
    kat = e.size(SizingInput(**ortak, leverage=3.0, risk_scale=3.0))
    assert duz.accepted and kat.accepted
    assert kat.qty == pytest.approx(duz.qty * 3.0, rel=1e-6)


def test_esiksiz_specte_direnc_yoklugu_ret_degil():
    """min_headroom_atr=0 → S/R teyidi kapalı; None (direnç bulunamadı) kaldıracı düşürmez."""
    spec = LeverageSpec(
        max_leverage=3.0,
        min_score=75.0,
        tiers=((75.0, 2.0), (82.0, 3.0)),
        min_headroom_atr=0.0,
        require_pattern=False,
    )
    d = decide_leverage(
        spec, score=83.0, pattern_modifier=None, headroom_atr=None, entry=100.0, stop=97.0
    )
    assert d.leverage == 3.0, d.reason
    # Eşikli spec'te None hâlâ teyitsiz → 1×.
    d2 = decide_leverage(
        SPEC, score=95.0, pattern_modifier=3.0, headroom_atr=None, entry=100.0, stop=95.0
    )
    assert d2.leverage == 1.0 and "dirence yer yok" in d2.reason
