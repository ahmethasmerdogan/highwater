"""İndikatör hattı — MASTER-SPEC §4.1.

Kural: **birbirinin kopyası indikatör istiflenmez.** RSI + Stochastic + CCI +
Williams %R dört indikatör değil, aynı şeyin dört ölçümüdür.

Look-ahead koruması: bu modül yalnızca **kapanmış** barlar içeren bir DataFrame
alır ve her indikatörü `t` barında yalnızca `t` ve öncesindeki veriyle hesaplar.
`shift(-n)` veya `center=True` kullanımı bu dosyada yasaktır.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from sarnic.core.enums import TIMEFRAME_MINUTES

# Karar birimi 1h; bunlar bar cinsinden pencerelerdir.
EMA_PERIODS = (20, 50, 200)
ADX_PERIOD = 14
RSI_PERIOD = 14
ATR_PERIOD = 14
MACD_FAST, MACD_SLOW, MACD_SIGNAL = 12, 26, 9
BB_PERIOD, BB_STD = 20, 2.0
RVOL_PERIOD = 20
REALIZED_VOL_PERIOD = 20

# En uzun pencere EMA200 → altındaki veri güvenilir değil.
MIN_BARS = 220


@dataclass(slots=True)
class IndicatorSet:
    """Bir sembolün bir zaman dilimindeki son bar göstergeleri."""

    symbol: str
    timeframe: str
    bar_time: pd.Timestamp | None = None
    close: float = float("nan")
    ema20: float = float("nan")
    ema50: float = float("nan")
    ema200: float = float("nan")
    adx: float = float("nan")
    rsi: float = float("nan")
    macd_hist: float = float("nan")
    macd_hist_slope: float = float("nan")
    atr: float = float("nan")
    atr_pct: float = float("nan")
    bb_width: float = float("nan")
    obv: float = float("nan")
    obv_slope: float = float("nan")
    vwap: float = float("nan")
    realized_vol: float = float("nan")
    rvol: float = float("nan")
    taker_buy_ratio: float = float("nan")
    ret_24h: float = float("nan")
    ret_72h: float = float("nan")
    ret_168h: float = float("nan")
    ret_24h_skip6: float = float("nan")
    ret_72h_skip6: float = float("nan")
    ret_168h_skip6: float = float("nan")
    bars: int = 0
    warnings: list[str] = field(default_factory=list)

    @property
    def trend_aligned(self) -> bool:
        """EMA20 > EMA50 > EMA200 dizilimi."""
        return (
            math.isfinite(self.ema20)
            and math.isfinite(self.ema50)
            and math.isfinite(self.ema200)
            and self.ema20 > self.ema50 > self.ema200
        )

    @property
    def price_over_ema200(self) -> float:
        if not math.isfinite(self.ema200) or self.ema200 == 0:
            return float("nan")
        return self.close / self.ema200 - 1.0

    @property
    def ok(self) -> bool:
        return self.bars >= MIN_BARS and math.isfinite(self.ema200)


# --------------------------------------------------------------------------- #
#  Saf hesaplayıcılar — pandas-ta-classic yerine açık yazıldı ki her satırın
#  hangi barları kullandığı testte kanıtlanabilsin (look-ahead denetimi).
# --------------------------------------------------------------------------- #
def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def rma(series: pd.Series, period: int) -> pd.Series:
    """Wilder yumuşatması — RSI, ATR ve ADX'in tabanı."""
    return series.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    return pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)


def atr(df: pd.DataFrame, period: int = ATR_PERIOD) -> pd.Series:
    return rma(true_range(df), period)


def rsi(series: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = rma(gain, period)
    avg_loss = rma(loss, period)
    rs = avg_gain / avg_loss.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    # Kayıp yoksa RSI 100'dür (bölme sonsuz).
    return out.where(avg_loss != 0, 100.0)


def adx(df: pd.DataFrame, period: int = ADX_PERIOD) -> pd.Series:
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    tr = rma(true_range(df), period)
    plus_di = 100 * rma(pd.Series(plus_dm, index=df.index), period) / tr.replace(0, np.nan)
    minus_di = 100 * rma(pd.Series(minus_dm, index=df.index), period) / tr.replace(0, np.nan)
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return rma(dx, period)


def macd(
    series: pd.Series, fast: int = MACD_FAST, slow: int = MACD_SLOW, signal: int = MACD_SIGNAL
) -> tuple[pd.Series, pd.Series, pd.Series]:
    line = ema(series, fast) - ema(series, slow)
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return line, sig, line - sig


def bollinger_width(series: pd.Series, period: int = BB_PERIOD, std: float = BB_STD) -> pd.Series:
    mid = series.rolling(period, min_periods=period).mean()
    dev = series.rolling(period, min_periods=period).std(ddof=0)
    return (2 * std * dev) / mid.replace(0, np.nan)


def obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["close"].diff().fillna(0.0))
    return (direction * df["volume"]).cumsum()


def session_vwap(df: pd.DataFrame) -> pd.Series:
    """Gün içi VWAP — her UTC gününde sıfırlanır."""
    typical = (df["high"] + df["low"] + df["close"]) / 3
    day = pd.to_datetime(df["open_time"], utc=True).dt.floor("D")
    pv = (typical * df["volume"]).groupby(day).cumsum()
    vol = df["volume"].groupby(day).cumsum()
    return pv / vol.replace(0, np.nan)


def realized_vol(series: pd.Series, period: int = REALIZED_VOL_PERIOD, bars_per_year: int = 8760):
    """Yıllıklandırılmış gerçekleşmiş volatilite (oran, yüzde değil)."""
    logret = np.log(series / series.shift(1))
    return logret.rolling(period, min_periods=period).std(ddof=1) * math.sqrt(bars_per_year)


def rvol(volume: pd.Series, period: int = RVOL_PERIOD) -> pd.Series:
    mean = volume.rolling(period, min_periods=period).mean()
    return volume / mean.replace(0, np.nan)


def slope(series: pd.Series, window: int = 5) -> pd.Series:
    """`window` bar üzerinden normalize edilmiş doğrusal eğim.

    En küçük kareler eğiminin kapalı formu kullanılır (x = 0..w−1 sabit):

        eğim = (w·Σ(i·y) − Σi·Σy) / (w·Σi² − (Σi)²)

    `rolling().apply()` her pencere için Python geri çağrısı çalıştırıyordu ve
    backtest'in en yavaş noktasıydı; bu sürüm tamamen vektörel.
    """
    if window < 2:
        raise ValueError("eğim penceresi en az 2 bar olmalı")

    y = series.astype(float)
    x = np.arange(window, dtype=float)
    sum_x = x.sum()
    sum_x2 = (x**2).sum()
    denominator = window * sum_x2 - sum_x**2

    # Σ(i·y_t): ağırlıkları sabit olan kayan pencere toplamı.
    weighted = _rolling_weighted_sum(y, x)

    sum_y = y.rolling(window, min_periods=window).sum()
    raw_slope = (window * weighted - sum_x * sum_y) / denominator

    # Ölçekten bağımsız olsun diye |y| ortalamasına bölünür.
    scale = y.abs().rolling(window, min_periods=window).mean()
    normalized = raw_slope / scale.replace(0, np.nan)
    return normalized.where(scale != 0, 0.0)


def _rolling_weighted_sum(y: pd.Series, weights: np.ndarray) -> pd.Series:
    """Σ(w_i · y_{t−k+i}) — sabit ağırlıklı kayan pencere, konvolüsyonla."""
    window = len(weights)
    values = y.to_numpy(dtype=float)
    if len(values) < window:
        return pd.Series(np.full(len(values), np.nan), index=y.index)

    # np.convolve ağırlıkları ters çevirir; düzeltmek için weights'i ters veriyoruz.
    conv = np.convolve(values, weights[::-1], mode="valid")
    out = np.full(len(values), np.nan)
    out[window - 1 :] = conv
    # NaN içeren pencereler geçersizdir.
    nan_windows = (
        pd.Series(np.isnan(values).astype(float), index=y.index)
        .rolling(window, min_periods=window)
        .sum()
        .to_numpy()
    )
    out[np.nan_to_num(nan_windows, nan=1.0) > 0] = np.nan
    return pd.Series(out, index=y.index)


def pct_return(series: pd.Series, bars: int, skip: int = 0) -> pd.Series:
    """`bars` barlık getiri; `skip` son barı atlar (§5.2 "son 6 saati atla" kuralı).

    skip=6, bars=24 → t−6 ile t−30 arasındaki getiri.
    """
    end = series.shift(skip)
    start = series.shift(skip + bars)
    return end / start - 1.0


# Yılda kaç bar — `TIMEFRAME_MINUTES`'ten **türetilir**, elle yazılmaz.
#
# Elle yazıldığı sürece yeni bir dilim eklendiğinde burası bayat kalıyordu:
# 30m eklendiğinde sözlükte yoktu ve `.get(tf, 8760)` sessizce 1h değerini
# döndürüyordu. Volatilite yıllıklandırması √2 kat yanlış hesaplanıyor, yani
# 30m botun volatilite özellikleri ve backtest Sharpe'ı bozuk çıkıyordu.
BARS_PER_YEAR = {
    tf: round(365 * 24 * 60 / minutes) for tf, minutes in TIMEFRAME_MINUTES.items()
}


# `compute_frame` çıktısındaki sütunlar → `IndicatorSet` alanları.
_FRAME_FIELDS = (
    "close",
    "ema20",
    "ema50",
    "ema200",
    "adx",
    "rsi",
    "macd_hist",
    "macd_hist_slope",
    "atr",
    "atr_pct",
    "bb_width",
    "obv",
    "obv_slope",
    "vwap",
    "realized_vol",
    "rvol",
    "taker_buy_ratio",
    "ret_24h",
    "ret_72h",
    "ret_168h",
    "ret_24h_skip6",
    "ret_72h_skip6",
    "ret_168h_skip6",
)


def compute_frame(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    """**Her bar için** gösterge sütunları.

    Buradaki her hesap nedenseldir (`ewm`, `rolling`, `shift(+n)`); `t` satırı
    yalnızca `t` ve öncesindeki barlara bakar. Bu yüzden seriyi bir kez hesaplayıp
    `t` satırını okumak, seriyi `t`'de kesip son satırı okumakla **birebir aynı**
    sonucu verir — `tests/test_lookahead.py` bunu kanıtlar.

    Backtest bar-bar ilerlerken bu eşdeğerlik sayesinde göstergeler bir kez
    hesaplanır; aksi hâlde maliyet bar sayısının karesiyle büyürdü.
    """
    close = df["close"].astype(float)
    volume = df["volume"].astype(float)
    out = pd.DataFrame(index=df.index)

    out["close"] = close
    out["ema20"] = ema(close, 20)
    out["ema50"] = ema(close, 50)
    out["ema200"] = ema(close, 200)
    out["adx"] = adx(df)
    out["rsi"] = rsi(close)

    _, _, hist = macd(close)
    out["macd_hist"] = hist
    out["macd_hist_slope"] = slope(hist, 5)

    atr_series = atr(df)
    out["atr"] = atr_series
    out["atr_pct"] = atr_series / close.replace(0, np.nan)

    out["bb_width"] = bollinger_width(close)

    obv_series = obv(df)
    out["obv"] = obv_series
    out["obv_slope"] = slope(obv_series, 10)

    out["vwap"] = session_vwap(df)
    out["realized_vol"] = realized_vol(close, bars_per_year=BARS_PER_YEAR.get(timeframe, 8760))
    out["rvol"] = rvol(volume)

    # Alım baskısı: son 20 barın taker alım hacminin toplam hacme oranı.
    taker = df["taker_buy_base"].astype(float)
    taker_sum = taker.rolling(RVOL_PERIOD, min_periods=1).sum()
    volume_sum = volume.rolling(RVOL_PERIOD, min_periods=1).sum()
    out["taker_buy_ratio"] = taker_sum / volume_sum.replace(0, np.nan)

    # Getiriler bar cinsinden — 1h'te 24 bar = 24 saat.
    per_hour = {"15m": 4, "30m": 2, "1h": 1, "4h": 0.25, "1d": 1 / 24}.get(timeframe, 1)
    skip = max(1, round(6 * per_hour))
    for name, hours in (("ret_24h", 24), ("ret_72h", 72), ("ret_168h", 168)):
        bars = round(hours * per_hour)
        if bars >= 1:
            out[name] = pct_return(close, bars)
            out[f"{name}_skip6"] = pct_return(close, bars, skip=skip)
        else:
            out[name] = np.nan
            out[f"{name}_skip6"] = np.nan

    return out


def _finite(value) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return float("nan")
    return v if math.isfinite(v) else float("nan")


def set_from_frame(
    frame: pd.DataFrame,
    row_index,
    bar_time,
    *,
    symbol: str,
    timeframe: str,
    bars: int,
) -> IndicatorSet:
    """`compute_frame` çıktısının bir satırını `IndicatorSet`'e çevirir."""
    out = IndicatorSet(symbol=symbol, timeframe=timeframe, bars=bars)
    if bars < MIN_BARS:
        out.warnings.append(f"yetersiz bar: {bars} < {MIN_BARS}")
    out.bar_time = pd.Timestamp(bar_time)
    row = frame.loc[row_index]
    for field_name in _FRAME_FIELDS:
        setattr(out, field_name, _finite(row.get(field_name)))
    return out


def compute(df: pd.DataFrame, symbol: str, timeframe: str) -> IndicatorSet:
    """Verilen (yalnızca kapanmış barlar içeren) çerçevenin **son barı** için gösterge seti."""
    if df.empty:
        out = IndicatorSet(symbol=symbol, timeframe=timeframe, bars=0)
        out.warnings.append("veri yok")
        return out

    frame = compute_frame(df, timeframe)
    return set_from_frame(
        frame,
        frame.index[-1],
        df["open_time"].iloc[-1],
        symbol=symbol,
        timeframe=timeframe,
        bars=len(df),
    )


def compute_multi(frames: dict[str, pd.DataFrame], symbol: str) -> dict[str, IndicatorSet]:
    """Bir sembol için birden çok zaman dilimi. 4h ve 1d ayrı sinyal değil,
    1h puanının içinde birer özelliktir (§4)."""
    return {tf: compute(df, symbol, tf) for tf, df in frames.items()}
