"""Backtest kısa yön — elle hesaplı kapanış/stop/likidasyon + uçtan uca SHORT ve BOTH koşusu."""

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
from tests.test_backtest_leverage import KALDIRACLI
from tests.test_backtest_run import START, SYMBOLS, build_data


def _engine(direction: str = "SHORT", sizing_extra: dict | None = None, **entry) -> BacktestEngine:
    d = StrategyDefinition.from_dict(
        {
            "entry": {"direction": direction, "min_score": 60.0, **entry},
            "exit": {"score_exit": 40.0},
        }
    )
    d.sizing = {**d.sizing, **(sizing_extra or {})}
    params = BacktestParams(
        start=START + timedelta(hours=260),
        end=START + timedelta(hours=880),
        initial_equity=5000.0,
        symbols=SYMBOLS,
        with_patterns=False,
    )
    return BacktestEngine(d, params)


def _kisa(**kw) -> SimPosition:
    base = dict(
        symbol="X",
        qty=10.0,
        entry_price=100.0,
        entry_time=datetime(2026, 1, 20, tzinfo=UTC),
        stop=104.0,
        initial_stop=104.0,
        score_at_entry=85.0,
        entry_fees=1.0,
        entry_notional=1000.0,
        entry_qty=10.0,
        direction=-1,
    )
    return SimPosition(**{**base, **kw})


def test_kisa_kapanis_elle():
    """100'den sat, 90'da kapat (kayma +5bp), 10 adet, 1× kısa: borç tam notional."""
    e = _engine(sizing_extra=KALDIRACLI)
    poz = _kisa()
    cikis = poz.entry_time + timedelta(hours=10)
    trades: list[dict] = []
    nakit = e._close(poz, 90.0, cikis, ExitReason.SCORE, 10.0, trades)
    t = trades[0]
    fiyat = 90.0 * (1 + 10.0 * SLIP_RATIO / 10_000)  # kısa kapatma ALIŞ: yukarı kayar
    komisyon = fiyat * 10.0 * 10.0 / 10_000
    borc = borrow_cost(1000.0, 1.0, 10.0, e.lev_spec.hourly_rate, direction=-1)
    assert borc == pytest.approx(1000.0 * e.lev_spec.hourly_rate * 10.0)
    assert t["side"] == "SELL"
    assert t["exit_price"] == pytest.approx(fiyat)
    assert t["pnl"] == pytest.approx((100.0 - fiyat) * 10.0 - 1.0 - komisyon - borc, abs=1e-6)
    assert t["pnl_r"] == pytest.approx((100.0 - fiyat) / 4.0, abs=1e-6)
    # Nakde dönen: geri alış ödemesi (negatif) − komisyon − borç.
    assert nakit == pytest.approx(-(fiyat * 10.0) - komisyon - borc, abs=1e-6)


def test_kisa_bar_ici_stop_high_ile_tetiklenir():
    e = _engine()
    bar = datetime(2026, 1, 20, 12, tzinfo=UTC)
    poz = _kisa(entry_time=bar - timedelta(hours=5))
    df = pd.DataFrame(
        {
            "open_time": [pd.Timestamp(bar)],
            "open": [101.0],
            "high": [105.0],  # stop 104'ü deldi
            "low": [99.0],
            "close": [102.0],
            "quote_volume": [1.0],
        }
    )
    trades: list[dict] = []
    kalan, _, _ = e._check_intrabar_stops(
        [poz], {"X": {"1h": df}}, {"X": {"1h": 1}}, bar, 0.0, 10.0, trades
    )
    assert kalan == [] and trades[0]["exit_reason"] == "STOP"
    # Dolum max(stop, open) = 104 × alış kayması (yukarı).
    assert trades[0]["exit_price"] == pytest.approx(104.0 * (1 + 10.0 * SLIP_RATIO / 10_000))
    # Boşlukta stopun ÜSTÜNDE açılan bar: açılıştan dolar.
    poz2 = _kisa(entry_time=bar - timedelta(hours=5))
    df2 = df.assign(open=[107.0], high=[108.0], low=[106.0], close=[107.5])
    trades2: list[dict] = []
    e._check_intrabar_stops([poz2], {"X": {"1h": df2}}, {"X": {"1h": 1}}, bar, 0.0, 10.0, trades2)
    assert trades2[0]["exit_price"] == pytest.approx(107.0 * (1 + 10.0 * SLIP_RATIO / 10_000))


def test_kisa_likidasyon_stoptan_once():
    """3× kısa: likidasyon 100 × (1 + 0,9/3) = 130; stop 140 → önce likidasyon."""
    e = _engine(sizing_extra=KALDIRACLI)
    bar = datetime(2026, 1, 20, 12, tzinfo=UTC)
    poz = _kisa(stop=140.0, initial_stop=140.0, leverage=3.0, entry_time=bar - timedelta(hours=5))
    assert liquidation_price(100.0, 3.0, direction=-1) == pytest.approx(130.0)
    df = pd.DataFrame(
        {
            "open_time": [pd.Timestamp(bar)],
            "open": [128.0],
            "high": [135.0],
            "low": [127.0],
            "close": [129.0],
            "quote_volume": [1.0],
        }
    )
    trades: list[dict] = []
    e._check_intrabar_stops([poz], {"X": {"1h": df}}, {"X": {"1h": 1}}, bar, 0.0, 10.0, trades)
    assert trades[0]["exit_reason"] == "LIQUIDATION"
    assert trades[0]["exit_price"] == pytest.approx(130.0 * (1 + 10.0 * SLIP_RATIO / 10_000))


def test_uctan_uca_short_kosusu_sell_isler_uretir():
    data = build_data()
    e = _engine("SHORT")
    times = e.bar_times(data)
    sonuc = e.run_scenario(data, UniverseTimeline([], fallback=SYMBOLS), times, 1.0, "base")
    assert sonuc.trades, "sentetik veride hiç kısa işlem yok"
    assert all(t["side"] == "SELL" for t in sonuc.trades)
    # Kısa kâr: çıkış girişin altındaysa fiyat-puanı pozitif olmalı.
    for t in sonuc.trades:
        puan = (t["entry_price"] - t["exit_price"]) * t["qty"]
        assert t["pnl"] < puan + 1e-6  # komisyon/borç düşülmüş
    # Özsermaye eğrisi başlangıçtan başlar ve sonludur.
    assert sonuc.equity_curve[0][1] == pytest.approx(5000.0, rel=0.05)


def test_both_ayni_sembolde_iki_yon_yok():
    data = build_data()
    e = _engine("BOTH")
    times = e.bar_times(data)
    sonuc = e.run_scenario(data, UniverseTimeline([], fallback=SYMBOLS), times, 1.0, "base")
    yonler = {t["side"] for t in sonuc.trades}
    assert yonler <= {"BUY", "SELL"} and sonuc.trades
    # Aynı sembolde zaman aralıkları çakışan iki işlem olamaz (hedge yok).
    for a in sonuc.trades:
        for b in sonuc.trades:
            if a is b or a["symbol"] != b["symbol"]:
                continue
            assert a["exit_time"] <= b["entry_time"] or b["exit_time"] <= a["entry_time"]
