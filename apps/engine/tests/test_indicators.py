"""İndikatör testleri — elle hesaplanmış fixture'larla (CLAUDE.md test disiplini).

Her indikatör küçük, elle doğrulanabilir bir örnek üzerinde kanıtlanır.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from sarnic.features import indicators as ind
from tests.conftest import make_ohlcv


def frame_from(closes: list[float], highs=None, lows=None, volumes=None) -> pd.DataFrame:
    n = len(closes)
    return pd.DataFrame(
        {
            "open_time": pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC"),
            "open": closes,
            "high": highs or [c * 1.01 for c in closes],
            "low": lows or [c * 0.99 for c in closes],
            "close": closes,
            "volume": volumes or [100.0] * n,
            "quote_volume": [c * 100 for c in closes],
            "trades": [10] * n,
            "taker_buy_base": [50.0] * n,
            "taker_buy_quote": [c * 50 for c in closes],
        }
    )


# --------------------------------------------------------------------------- #
def test_ema_matches_hand_calculation():
    """EMA(3), α = 2/(3+1) = 0.5. İlk değer basit ortalamadan değil, seed'den gelir.

    pandas `adjust=False` ile: EMA_t = α·x_t + (1−α)·EMA_{t−1}, EMA_0 = x_0.
    Seri: 10, 20, 30 → EMA_0 = 10, EMA_1 = 15, EMA_2 = 22.5
    """
    series = pd.Series([10.0, 20.0, 30.0])
    result = ind.ema(series, 3)
    # min_periods=3 → ilk iki değer NaN, üçüncü 22.5
    assert math.isnan(result.iloc[0])
    assert math.isnan(result.iloc[1])
    assert result.iloc[2] == pytest.approx(22.5)


def test_true_range_hand_calculation():
    """TR = max(H−L, |H−C_prev|, |L−C_prev|)."""
    df = pd.DataFrame(
        {
            "high": [10.0, 12.0, 11.0],
            "low": [8.0, 9.0, 7.0],
            "close": [9.0, 11.0, 8.0],
        }
    )
    tr = ind.true_range(df)
    assert tr.iloc[0] == pytest.approx(2.0)  # 10−8, önceki kapanış yok
    # bar 1: H−L=3, |12−9|=3, |9−9|=0 → 3
    assert tr.iloc[1] == pytest.approx(3.0)
    # bar 2: H−L=4, |11−11|=0, |7−11|=4 → 4
    assert tr.iloc[2] == pytest.approx(4.0)


def test_rsi_all_gains_is_100():
    """Hiç kayıp yoksa RSI 100'dür — sıfıra bölme değil."""
    df = frame_from([float(i) for i in range(1, 40)])
    result = ind.rsi(df["close"], 14)
    assert result.iloc[-1] == pytest.approx(100.0)


def test_rsi_known_value():
    """Sabit +1/−1 salınımında RSI 50 civarında kalır."""
    closes = [100 + (1 if i % 2 == 0 else -1) for i in range(60)]
    result = ind.rsi(pd.Series([float(c) for c in closes]), 14)
    assert 40 < result.iloc[-1] < 60


def test_atr_constant_range():
    """Her barda aralık 2 ise ATR de 2'ye yakınsar."""
    n = 60
    df = pd.DataFrame(
        {
            "high": [11.0] * n,
            "low": [9.0] * n,
            "close": [10.0] * n,
        }
    )
    result = ind.atr(df, 14)
    assert result.iloc[-1] == pytest.approx(2.0, abs=1e-6)


def test_bollinger_width_zero_on_flat_series():
    series = pd.Series([100.0] * 40)
    assert ind.bollinger_width(series).iloc[-1] == pytest.approx(0.0)


def test_obv_direction():
    """Fiyat artınca hacim eklenir, azalınca çıkarılır."""
    df = frame_from([10.0, 11.0, 10.5, 12.0], volumes=[100.0, 200.0, 300.0, 400.0])
    result = ind.obv(df)
    # 0 (ilk fark 0) + 200 − 300 + 400 = 300
    assert result.iloc[-1] == pytest.approx(300.0)


def test_pct_return_with_skip():
    """skip=6, bars=24 → t−6 ile t−30 arasındaki getiri (§5.2)."""
    closes = [float(i) for i in range(1, 101)]
    series = pd.Series(closes)
    result = ind.pct_return(series, bars=24, skip=6)
    # index 99: end = series[93] = 94, start = series[69] = 70
    assert result.iloc[-1] == pytest.approx(94 / 70 - 1)


def test_pct_return_without_skip_uses_last_bar():
    series = pd.Series([float(i) for i in range(1, 101)])
    result = ind.pct_return(series, bars=24)
    assert result.iloc[-1] == pytest.approx(100 / 76 - 1)


def test_adx_rises_in_trend():
    """Düz seride ADX düşük, güçlü trendde yüksek olmalı."""
    flat = frame_from([100.0 + (0.01 if i % 2 else -0.01) for i in range(200)])
    trend = frame_from([100.0 * (1.01**i) for i in range(200)])
    assert ind.adx(flat).iloc[-1] < ind.adx(trend).iloc[-1]


def test_compute_flags_insufficient_bars():
    df = make_ohlcv(50)
    result = ind.compute(df, "TESTUSDT", "1h")
    assert not result.ok
    assert any("yetersiz bar" in w for w in result.warnings)


def test_compute_full_set(uptrend):
    result = ind.compute(uptrend, "TESTUSDT", "1h")
    assert result.ok
    assert result.bars == len(uptrend)
    for field in ("ema20", "ema50", "ema200", "adx", "rsi", "atr", "bb_width"):
        assert math.isfinite(getattr(result, field)), field
    # Yükselen trendde EMA dizilimi kurulmalı.
    assert result.trend_aligned
    assert result.price_over_ema200 > 0


def test_compute_empty_frame():
    result = ind.compute(pd.DataFrame(columns=["open_time", "close"]), "X", "1h")
    assert not result.ok
    assert "veri yok" in result.warnings


def test_taker_buy_ratio_in_unit_range(ohlcv):
    result = ind.compute(ohlcv, "TESTUSDT", "1h")
    assert 0.0 <= result.taker_buy_ratio <= 1.0


def test_session_vwap_resets_daily():
    """VWAP her UTC gününde sıfırlanır — gün başında fiyata çok yakın olmalı."""
    df = make_ohlcv(72, timeframe_minutes=60, seed=3)
    vwap = ind.session_vwap(df)
    day_starts = df.index[pd.to_datetime(df["open_time"]).dt.hour == 0]
    for i in day_starts:
        typical = (df.loc[i, "high"] + df.loc[i, "low"] + df.loc[i, "close"]) / 3
        assert vwap.loc[i] == pytest.approx(typical, rel=1e-9)


def test_slope_of_rising_series_is_positive():
    assert ind.slope(pd.Series(np.arange(20, dtype=float) + 1), 5).iloc[-1] > 0


def test_slope_of_falling_series_is_negative():
    assert ind.slope(pd.Series(np.arange(20, 0, -1, dtype=float)), 5).iloc[-1] < 0


# --------------------------------------------------------------------------- #
# Serileştirme sınırı — numpy tipleri API'ye sızmamalı
# --------------------------------------------------------------------------- #
def _assert_json_safe(value, path="kök"):
    """Değerin saf Python tiplerinden oluştuğunu doğrular.

    `numpy.bool_` `bool`'un alt sınıfı **değildir** ve Pydantic onu JSON'a
    çeviremez. `/symbols/{sembol}/patterns` bu yüzden her sembol için 500
    dönüyordu; Terminal sayfası açılır açılmaz hata yağmuruna dönüyordu.
    """
    import numpy as np

    assert not isinstance(value, np.generic), f"{path}: numpy tipi sızdı ({type(value)})"
    if isinstance(value, dict):
        for key, item in value.items():
            _assert_json_safe(item, f"{path}.{key}")
    elif isinstance(value, list | tuple):
        for index, item in enumerate(value):
            _assert_json_safe(item, f"{path}[{index}]")


def test_pattern_payload_is_json_safe():
    import json

    from sarnic.features.patterns import compute_patterns
    from tests.conftest import make_ohlcv

    df = make_ohlcv(bars=600, vol=0.03, seed=7)
    result = compute_patterns(df, "TESTUSDT", "1h")

    payload = {
        "matches": [m.as_dict() for m in result.matches],
        "candle_signals": result.candle_signals,
        "pattern_modifier": result.modifier(),
        "candle_modifier": result.candle_modifier(),
    }
    _assert_json_safe(payload)
    json.dumps(payload)  # ikinci kemer: gerçekten serileşiyor mu


def test_volume_confirmation_returns_builtin_bool():
    import numpy as np

    from sarnic.features.patterns import PatternMatch, confirm_with_volume
    from tests.conftest import make_ohlcv

    df = make_ohlcv(bars=120, seed=3)
    match = confirm_with_volume(PatternMatch("test", 1, 0.8, 0, len(df) - 1), df)

    assert type(match.volume_confirmed) is bool
    assert not isinstance(match.volume_confirmed, np.generic)


# --------------------------------------------------------------------------- #
#  Dilime göre tablolar enum'dan türetilmeli
# --------------------------------------------------------------------------- #
def test_bars_per_year_covers_every_timeframe():
    """Elle yazılmış sözlükler yeni dilim eklendiğinde bayat kalıyordu.

    30m eklendiğinde `BARS_PER_YEAR` sözlüğünde yoktu ve `.get(tf, 8760)`
    sessizce 1h değerini döndürüyordu: volatilite yıllıklandırması √2 kat
    yanlış hesaplanıyor, 30m botun volatilite özellikleri ve backtest Sharpe'ı
    bozuk çıkıyordu. Artık tablolar `TIMEFRAME_MINUTES`'ten türetiliyor.
    """
    from sarnic.backtest.metrics import BARS_PER_YEAR as METRIC_BARS
    from sarnic.core.enums import TIMEFRAME_MINUTES
    from sarnic.features.indicators import BARS_PER_YEAR

    assert set(BARS_PER_YEAR) == set(TIMEFRAME_MINUTES)
    assert set(METRIC_BARS) == set(TIMEFRAME_MINUTES)
    # Bilinen değerler korunmalı — mevcut dilimlerde davranış değişmedi.
    assert BARS_PER_YEAR["1h"] == 8760
    assert BARS_PER_YEAR["15m"] == 35040
    assert BARS_PER_YEAR["4h"] == 2190
    assert BARS_PER_YEAR["1d"] == 365
    # Yeni dilim doğru: 30 dakikalık bar, saatliğin iki katı.
    assert BARS_PER_YEAR["30m"] == 2 * BARS_PER_YEAR["1h"]


def test_annualized_volatility_scales_with_timeframe():
    """Aynı seriden 30m ve 1h yıllıklandırması farklı olmalı."""
    from sarnic.features.indicators import BARS_PER_YEAR

    assert BARS_PER_YEAR["30m"] != BARS_PER_YEAR["1h"]
