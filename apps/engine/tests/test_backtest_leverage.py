"""Backtest kaldıraç modeli — PaperAdapter/worker ile BİREBİR (kural 1).

Ön-kayıt (MEYDAN-OKUMA §Fable programı, madde 4): kaldıraç backtesti ancak
marj + saatlik borç + bar-içi likidasyon modeli canlıyla birebirse geçerli.
Bu dosya o birebirliğin kanıtıdır; elle hesaplanmış küçük örneklerle.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest

from sarnic.backtest.engine import (
    SLIP_RATIO,
    BacktestEngine,
    BacktestParams,
    SimPosition,
    UniverseTimeline,
)
from sarnic.core.enums import ExitReason
from sarnic.sizing.leverage import borrow_cost, liquidation_price
from sarnic.strategy.definition import StrategyDefinition
from tests.test_backtest_run import START, SYMBOLS, build_data

KALDIRACLI = {
    "leverage": {
        "max_leverage": 3.0,
        "min_score": 0.0,
        "tiers": [[0.0, 3.0]],
        "require_pattern": False,
        "min_headroom_atr": 0.0,
        "stop_margin_fit": 0.8,
        "hourly_rate": 0.0000208,
    }
}


def _engine(sizing_extra: dict | None = None) -> BacktestEngine:
    d = StrategyDefinition()
    d.sizing = {**d.sizing, **(sizing_extra or {})}
    params = BacktestParams(
        start=START + timedelta(hours=260),
        end=START + timedelta(hours=880),
        initial_equity=5000.0,
        symbols=SYMBOLS,
        with_patterns=False,
    )
    return BacktestEngine(d, params)


def test_kaldiracli_tanim_artik_kurulur():
    """Eskiden ValueError; artık motor kaldıracı taşır ve spec'i saklar."""
    e = _engine(KALDIRACLI)
    assert e.lev_spec.enabled and e.lev_spec.max_leverage == 3.0


def test_kapanis_borc_maliyeti_worker_aritmetigiyle_ayni():
    """3× pozisyon, 48 saat: borç = notional × (1−1/3) × saatlik × 48.
    Komisyona eklenir, kârdan düşer — worker ile aynı."""
    e = _engine(KALDIRACLI)
    giris = datetime(2026, 1, 20, tzinfo=UTC)
    cikis = giris + timedelta(hours=48)
    poz = SimPosition(
        symbol="C00USDT", qty=10.0, entry_price=100.0, entry_time=giris,
        stop=95.0, initial_stop=95.0, score_at_entry=90.0,
        entry_fees=1.0, leverage=3.0, entry_notional=1000.0,
    )
    trades: list[dict] = []
    cost_bps = 10.0
    e._close(poz, 110.0, cikis, ExitReason.SCORE, cost_bps, trades)
    t = trades[0]
    beklenen_borc = borrow_cost(1000.0, 3.0, 48.0, 0.0000208)
    assert beklenen_borc == pytest.approx(1000.0 * (2 / 3) * 0.0000208 * 48)
    assert t["borrow_cost"] == pytest.approx(beklenen_borc, abs=1e-8)
    assert t["leverage"] == 3.0
    # Çıkış kayması: 110 × (1 − 5bp); komisyon 10bp; toplam ücret = giriş 1 + çıkış + borç.
    fiyat = 110.0 * (1 - cost_bps * SLIP_RATIO / 10_000)
    cikis_komisyon = fiyat * 10.0 * cost_bps / 10_000
    assert t["fees"] == pytest.approx(1.0 + cikis_komisyon + beklenen_borc, abs=1e-6)
    assert t["pnl"] == pytest.approx((fiyat - 100.0) * 10.0 - 1.0 - cikis_komisyon - beklenen_borc, abs=1e-6)


def test_bar_ici_likidasyon_stoptan_once_tetiklenir():
    """low likidasyon fiyatının altına inerse pozisyon LIQUIDATION ile kapanır,
    dolum min(likidasyon, açılış) — boşluk dürüstlüğü (stop_fill_price)."""
    e = _engine(KALDIRACLI)
    bar = datetime(2026, 1, 20, 12, tzinfo=UTC)
    poz = SimPosition(
        symbol="X", qty=1.0, entry_price=100.0, entry_time=bar - timedelta(hours=5),
        stop=60.0, initial_stop=60.0, score_at_entry=90.0, leverage=3.0, entry_notional=100.0,
    )
    liq = liquidation_price(100.0, 3.0)  # 100 × (1 − 0.9/3) = 70
    assert liq == pytest.approx(70.0)
    assert liq > poz.stop, "test kurgusu: likidasyon stopun üstünde olmalı"
    df = pd.DataFrame({
        "open_time": [pd.Timestamp(bar)],
        "open": [72.0], "high": [73.0], "low": [65.0], "close": [71.0], "quote_volume": [1.0],
    })
    trades: list[dict] = []
    kalan, _, _ = e._check_intrabar_stops(
        [poz], {"X": {"1h": df}}, {"X": {"1h": 1}}, bar, 0.0, 10.0, trades
    )
    assert kalan == [] and len(trades) == 1
    assert trades[0]["exit_reason"] == "LIQUIDATION"
    # Dolum 70 (açılış 72 daha iyi, min alınır) × çıkış kayması.
    assert trades[0]["exit_price"] == pytest.approx(70.0 * (1 - 10.0 * SLIP_RATIO / 10_000))


def test_kaldiracsiz_pozisyonda_likidasyon_yolu_calismaz():
    """1× pozisyon: low stopun altındaysa STOP, likidasyon hesaplanmaz."""
    e = _engine()
    bar = datetime(2026, 1, 20, 12, tzinfo=UTC)
    poz = SimPosition(
        symbol="X", qty=1.0, entry_price=100.0, entry_time=bar - timedelta(hours=5),
        stop=90.0, initial_stop=90.0, score_at_entry=90.0,
    )
    df = pd.DataFrame({
        "open_time": [pd.Timestamp(bar)],
        "open": [95.0], "high": [96.0], "low": [80.0], "close": [94.0], "quote_volume": [1.0],
    })
    trades: list[dict] = []
    e._check_intrabar_stops([poz], {"X": {"1h": df}}, {"X": {"1h": 1}}, bar, 0.0, 10.0, trades)
    assert trades[0]["exit_reason"] == "STOP" and trades[0]["leverage"] == 1.0


def test_uctan_uca_kaldiracli_kosu_borc_ve_kaldirac_kaydeder():
    """Sentetik veri, teyit şartları gevşek: kaldıraçlı işlem açılmalı, her
    işlem kaldıracını ve borcunu taşımalı; nakit bir noktada eksiye (borç)
    inebilmeli — PaperAdapter'daki görünür borç kuralı."""
    data = build_data()
    e = _engine({**KALDIRACLI, "risk_pct": 0.03})
    times = e.bar_times(data)
    sonuc = e.run_scenario(data, UniverseTimeline([], fallback=SYMBOLS), times, 1.0, "base")
    trades = sonuc.trades
    assert trades, "sentetik veride hiç işlem yok — kurgu bozuk"
    assert all("leverage" in t and "borrow_cost" in t for t in trades)
    kaldiracli = [t for t in trades if t["leverage"] > 1.0]
    assert kaldiracli, "hiç kaldıraçlı giriş olmadı — decide_leverage yolu çalışmıyor"
    assert all(t["borrow_cost"] > 0 for t in kaldiracli)
    assert all(t["borrow_cost"] == 0 for t in trades if t["leverage"] == 1.0)
