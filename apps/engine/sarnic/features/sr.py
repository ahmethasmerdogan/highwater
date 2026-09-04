"""Destek/Direnç motoru — MASTER-SPEC §4.2.

Bu modülün çıktısı hem puanlamayı hem **stop seviyesini** besler.

Look-ahead koruması (kritik): fraktal pivot `k` bar solunu ve `k` bar sağını
görmek zorundadır. Bu yüzden **son `k` bar pivot üretemez** — henüz onaylanmamıştır.
`detect_pivots` bu barları bilerek atlar; `tests/test_lookahead.py` bunu kanıtlar.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from sarnic.core.enums import TIMEFRAME_MINUTES
from sarnic.features.indicators import atr as atr_series

PIVOT_K = 5
CLUSTER_ATR_FRACTION = 0.5  # |p1 − p2| < 0.5 × ATR(14) ise aynı küme
VOLUME_PROFILE_DAYS = 30
VOLUME_PROFILE_BUCKETS = 50
VALUE_AREA_FRACTION = 0.70

LevelKind = Literal["support", "resistance", "poc", "value_area"]


@dataclass(slots=True)
class Pivot:
    index: int
    bar_time: pd.Timestamp
    price: float
    kind: Literal["high", "low"]


@dataclass(slots=True)
class Level:
    price: float
    kind: LevelKind
    strength: float = 0.0
    touches: int = 0
    volume: float = 0.0
    last_touch_index: int = 0
    reaction: float = 0.0
    members: list[float] = field(default_factory=list)

    def distance_atr(self, price: float, atr: float) -> float:
        if atr <= 0:
            return float("inf")
        return abs(self.price - price) / atr


@dataclass(slots=True)
class SRResult:
    symbol: str
    timeframe: str
    price: float
    atr: float
    levels: list[Level] = field(default_factory=list)
    nearest_support: Level | None = None
    nearest_resistance: Level | None = None
    poc: float | None = None
    value_area_low: float | None = None
    value_area_high: float | None = None

    @property
    def rr_geometry(self) -> float | None:
        """(direnç − fiyat) / (fiyat − destek) — §4.2 adım 5."""
        if self.nearest_support is None or self.nearest_resistance is None:
            return None
        downside = self.price - self.nearest_support.price
        upside = self.nearest_resistance.price - self.price
        if downside <= 0:
            return None
        return upside / downside

    @property
    def support_distance_atr(self) -> float | None:
        if self.nearest_support is None or self.atr <= 0:
            return None
        return (self.price - self.nearest_support.price) / self.atr

    @property
    def resistance_distance_atr(self) -> float | None:
        if self.nearest_resistance is None or self.atr <= 0:
            return None
        return (self.nearest_resistance.price - self.price) / self.atr

    def as_dict(self) -> dict:
        return {
            "support": self.nearest_support.price if self.nearest_support else None,
            "support_strength": self.nearest_support.strength if self.nearest_support else None,
            "resistance": self.nearest_resistance.price if self.nearest_resistance else None,
            "resistance_strength": (
                self.nearest_resistance.strength if self.nearest_resistance else None
            ),
            "rr_geometry": self.rr_geometry,
            "poc": self.poc,
            "value_area_low": self.value_area_low,
            "value_area_high": self.value_area_high,
            "atr": self.atr,
        }


# --------------------------------------------------------------------------- #
#  1) Pivot tespiti
# --------------------------------------------------------------------------- #
def detect_pivots(df: pd.DataFrame, k: int = PIVOT_K) -> list[Pivot]:
    """Fraktal pivotlar.

    Bir bar, solundaki VE sağındaki `k` barın hepsinden yüksek/alçaksa pivottur.
    Son `k` bar sağ tarafını göremediği için **pivot üretemez** — bu, look-ahead
    korumasının ta kendisidir.
    """
    n = len(df)
    if n < 2 * k + 1:
        return []

    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    times = pd.to_datetime(df["open_time"], utc=True)

    # Kayan pencere ile vektörleştirildi — backtest bar-bar çalıştığı için bu
    # fonksiyon en sıcak yollardan biri. Davranış Python döngüsüyle birebir aynı:
    # merkez bar pencerenin tek maksimumu/minimumu olmalı.
    window = 2 * k + 1
    high_windows = sliding_window_view(high, window)
    low_windows = sliding_window_view(low, window)
    centers = np.arange(k, n - k)
    center_high = high[k : n - k]
    center_low = low[k : n - k]

    is_high = (high_windows.max(axis=1) == center_high) & (
        (high_windows == center_high[:, None]).sum(axis=1) == 1
    )
    is_low = (low_windows.min(axis=1) == center_low) & (
        (low_windows == center_low[:, None]).sum(axis=1) == 1
    )

    pivots: list[Pivot] = []
    for offset, index in enumerate(centers):
        if is_high[offset]:
            pivots.append(Pivot(int(index), times.iloc[index], float(high[index]), "high"))
        if is_low[offset]:
            pivots.append(Pivot(int(index), times.iloc[index], float(low[index]), "low"))
    pivots.sort(key=lambda p: (p.index, p.kind))
    return pivots


# --------------------------------------------------------------------------- #
#  2) Kümeleme
# --------------------------------------------------------------------------- #
def cluster_pivots(pivots: list[Pivot], atr: float) -> list[Level]:
    """Fiyat ekseninde birleştirme: |p1 − p2| < 0.5 × ATR(14) ise aynı küme."""
    if not pivots or atr <= 0:
        return []
    tolerance = CLUSTER_ATR_FRACTION * atr

    ordered = sorted(pivots, key=lambda p: p.price)
    clusters: list[list[Pivot]] = [[ordered[0]]]
    for p in ordered[1:]:
        if abs(p.price - clusters[-1][-1].price) < tolerance:
            clusters[-1].append(p)
        else:
            clusters.append([p])

    levels: list[Level] = []
    for group in clusters:
        prices = [p.price for p in group]
        levels.append(
            Level(
                price=float(np.mean(prices)),
                kind="support",  # yön daha sonra fiyata göre atanır
                touches=len(group),
                last_touch_index=max(p.index for p in group),
                members=prices,
            )
        )
    return levels


# --------------------------------------------------------------------------- #
#  3) Hacim profili
# --------------------------------------------------------------------------- #
def volume_profile(
    df: pd.DataFrame,
    bars: int,
    buckets: int = VOLUME_PROFILE_BUCKETS,
) -> tuple[float | None, float | None, float | None, dict[float, float]]:
    """Son `bars` barın hacmi `buckets` fiyat kovasına dağıtılır.

    Döner: (POC, value_area_low, value_area_high, kova→hacim)
    """
    tail = df.tail(bars)
    if tail.empty:
        return None, None, None, {}

    low = float(tail["low"].min())
    high = float(tail["high"].max())
    if not math.isfinite(low) or not math.isfinite(high) or high <= low:
        return None, None, None, {}

    edges = np.linspace(low, high, buckets + 1)
    centers = (edges[:-1] + edges[1:]) / 2
    # Her barın hacmi kendi (low, high) aralığına eşit dağıtılır — kaba ama
    # tick verisi olmadan yapılabilecek en dürüst yaklaşım.
    #
    # Vektörleştirilmiş: her bar için [lo_idx, hi_idx] aralığına vol/span eklemek,
    # kümülatif toplam farkıyla tek geçişte yapılır. `iterrows` bu fonksiyonu
    # backtest'te dakikalarca yavaşlatıyordu.
    bar_low = tail["low"].to_numpy(dtype=float)
    bar_high = tail["high"].to_numpy(dtype=float)
    bar_vol = tail["volume"].to_numpy(dtype=float)

    valid = (bar_vol > 0) & (bar_high >= bar_low)
    if not valid.any():
        return None, None, None, {}

    bar_low, bar_high, bar_vol = bar_low[valid], bar_high[valid], bar_vol[valid]
    lo_idx = np.clip(np.searchsorted(edges, bar_low, side="right") - 1, 0, buckets - 1)
    hi_idx = np.clip(np.searchsorted(edges, bar_high, side="right") - 1, 0, buckets - 1)
    per_bucket = bar_vol / (hi_idx - lo_idx + 1)

    # Fark dizisi: lo'da +, hi+1'de − → kümülatif toplam aralık eklemesini verir.
    delta = np.zeros(buckets + 1, dtype=float)
    np.add.at(delta, lo_idx, per_bucket)
    np.add.at(delta, hi_idx + 1, -per_bucket)
    hist = np.cumsum(delta)[:buckets]

    if hist.sum() <= 0:
        return None, None, None, {}

    poc_idx = int(hist.argmax())
    poc = float(centers[poc_idx])

    # Value Area: POC'tan dışa doğru büyüyerek hacmin %70'ini kapsa.
    target = hist.sum() * VALUE_AREA_FRACTION
    lo = hi = poc_idx
    covered = hist[poc_idx]
    while covered < target and (lo > 0 or hi < buckets - 1):
        below = hist[lo - 1] if lo > 0 else -1.0
        above = hist[hi + 1] if hi < buckets - 1 else -1.0
        if above >= below:
            hi += 1
            covered += hist[hi]
        else:
            lo -= 1
            covered += hist[lo]

    profile = {float(centers[i]): float(hist[i]) for i in range(buckets) if hist[i] > 0}
    return poc, float(centers[lo]), float(centers[hi]), profile


# --------------------------------------------------------------------------- #
#  4) Güç puanı
# --------------------------------------------------------------------------- #
def _norm(values: list[float]) -> list[float]:
    """Min-max normalizasyon; hepsi eşitse 1.0."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-12:
        return [1.0] * len(values)
    return [(v - lo) / (hi - lo) for v in values]


def score_levels(
    levels: list[Level], df: pd.DataFrame, profile: dict[float, float], atr: float
) -> list[Level]:
    """strength = 40·dokunuş + 25·hacim + 20·yakınlık_zamanı + 15·dönüş_büyüklüğü."""
    if not levels:
        return []

    n = len(df)
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    close = df["close"].to_numpy(dtype=float)

    band = CLUSTER_ATR_FRACTION * atr

    # Hacim profili kovalarını bir kez diziye çevir — her seviye için sözlük
    # taramak yerine tek vektörel maske.
    profile_prices = np.fromiter(profile.keys(), dtype=float, count=len(profile))
    profile_volumes = np.fromiter(profile.values(), dtype=float, count=len(profile))

    # Dönüş büyüklüğü penceresi: dokunulan bar + sonraki 5 bar.
    reaction_window = 6
    windows = (
        sliding_window_view(close, reaction_window)
        if n >= reaction_window
        else np.empty((0, reaction_window))
    )

    for lvl in levels:
        # Kümedeki hacim: seviyeye ±0.5·ATR mesafedeki profil kovaları.
        lvl.volume = (
            float(profile_volumes[np.abs(profile_prices - lvl.price) <= band].sum())
            if len(profile_prices)
            else 0.0
        )

        # Dönüş büyüklüğü: seviyeye değen barlardan sonraki 5 barın maksimum sapması.
        touched = np.flatnonzero((low <= lvl.price + band) & (high >= lvl.price - band))
        # Tam pencere sığmayan son barlar hesaba katılmaz (eski davranışta da
        # 2 bardan kısa pencereler atlanıyordu).
        touched = touched[touched < len(windows)]
        if touched.size == 0 or atr <= 0:
            lvl.reaction = 0.0
            continue
        moves = np.abs(windows[touched] - lvl.price).max(axis=1)
        lvl.reaction = float(moves.mean() / atr)

    touches = _norm([float(lv.touches) for lv in levels])
    volumes = _norm([lv.volume for lv in levels])
    # Yakınlık zaman ağırlığı: son dokunuş ne kadar yeniyse o kadar değerli.
    recency = _norm([float(lv.last_touch_index) / max(n - 1, 1) for lv in levels])
    reactions_n = _norm([lv.reaction for lv in levels])

    for lvl, t, v, r, x in zip(levels, touches, volumes, recency, reactions_n, strict=True):
        lvl.strength = round(40 * t + 25 * v + 20 * r + 15 * x, 2)
    return levels


# --------------------------------------------------------------------------- #
#  Ana giriş
# --------------------------------------------------------------------------- #
def compute_sr(
    df: pd.DataFrame,
    symbol: str,
    timeframe: str,
    *,
    k: int = PIVOT_K,
    profile_bars: int | None = None,
) -> SRResult:
    """`df`'in son barı için S/R yapısı. `df` yalnızca kapanmış barlar içermelidir."""
    price = float(df["close"].iloc[-1]) if not df.empty else float("nan")
    atr_val = 0.0
    if len(df) >= 15:
        series = atr_series(df)
        last = series.iloc[-1]
        atr_val = float(last) if last is not None and math.isfinite(float(last)) else 0.0

    result = SRResult(symbol=symbol, timeframe=timeframe, price=price, atr=atr_val)
    if df.empty or atr_val <= 0:
        return result

    if profile_bars is None:
        # Günde kaç bar — elle yazılmış sözlük 30m eklendiğinde bayat kalıp
        # sessizce 1h değerini (24) döndürüyordu; hacim profili penceresi
        # yarı yarıya yanlış çıkıyordu.
        minutes = TIMEFRAME_MINUTES.get(timeframe, 60)
        per_day = max(1, round(24 * 60 / minutes))
        profile_bars = VOLUME_PROFILE_DAYS * per_day

    pivots = detect_pivots(df, k=k)
    levels = cluster_pivots(pivots, atr_val)

    poc, va_low, va_high, profile = volume_profile(df, profile_bars)
    if poc is not None:
        # POC ayrı bir seviye olarak eklenir (§4.2 adım 3).
        levels.append(Level(price=poc, kind="poc", touches=1, last_touch_index=len(df) - 1))

    levels = score_levels(levels, df, profile, atr_val)

    # Yön ataması: fiyatın altındakiler destek, üstündekiler direnç.
    for lvl in levels:
        if lvl.kind == "poc":
            continue
        lvl.kind = "support" if lvl.price <= price else "resistance"

    supports = [lv for lv in levels if lv.price < price]
    resistances = [lv for lv in levels if lv.price > price]

    result.levels = sorted(levels, key=lambda lv: lv.price)
    result.nearest_support = max(supports, key=lambda lv: lv.price) if supports else None
    result.nearest_resistance = min(resistances, key=lambda lv: lv.price) if resistances else None
    result.poc = poc
    result.value_area_low = va_low
    result.value_area_high = va_high
    return result


def stop_from_sr(
    sr: SRResult, atr_multiple: float = 0.5, entry: float | None = None, direction: int = 1
) -> float | None:
    """Stop = `nearest_support − k×ATR`, ama girişe `k×ATR`'den yakın olamaz.

    Destek yoksa stop hesaplanamaz → giriş reddedilir. Uydurma stop koymayız.

    **Taban neden gerekli.** Bu formül bir *fiyat seviyesi* üretir, girişten bir
    *mesafe* değil. Giriş desteğin hemen üstündeyse stop mesafesi keyfi biçimde
    küçülür ve pozisyon gürültüyle anında ölür. Canlıda görüldü (2026-08-19,
    ESPUSDT): stop olduktan 7 dakika sonra puan hâlâ 83,6 olduğu için yeniden
    girildi, bu kez giriş 0,077289 ve stop 0,077050 — arada **%0,31**. Pozisyon
    saniyeler içinde tekrar stoplandı.

    `k×ATR` tabanı, ölçümle seçilen mesafenin (2 ATR) canlıda da geçerli
    olmasını sağlar; o mesafe 60 gün / 605 giriş üzerinde ölçülmüştü ama sistem
    onu hiç uygulamıyordu. Destek zaten daha aşağıdaysa hiçbir şey değişmez —
    taban yalnızca fazla dar olan durumu keser.
    """
    if direction < 0:
        # Kısa: stop en yakın DİRENCİN üstünde; direnç yoksa stop yok (simetrik).
        if sr.nearest_resistance is None or sr.atr <= 0:
            return None
        stop = sr.nearest_resistance.price + atr_multiple * sr.atr
        if entry is not None and entry > 0:
            stop = max(stop, entry + atr_multiple * sr.atr)
        return stop
    if sr.nearest_support is None or sr.atr <= 0:
        return None
    stop = sr.nearest_support.price - atr_multiple * sr.atr
    if entry is not None and entry > 0:
        stop = min(stop, entry - atr_multiple * sr.atr)
    return stop
