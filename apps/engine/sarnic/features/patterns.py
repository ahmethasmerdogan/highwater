"""Formasyon motoru — MASTER-SPEC §4.3.

**Beklenti kalibrasyonu (§18.5):** Bu, literatür desteği en ince bileşendir.
Formasyon bir *tetikleyici değil, çarpandır*; puana katkısı ±10 ile sınırlıdır.
Kalibrasyon sayfası formasyonun IC'sini ayrı gösterir — sıfırsa ağırlığı sıfırlanır.

Yöntem Lo–Mamaysky–Wang çizgisindedir, **bir farkla**: LMW tüm örneklem üzerinde
simetrik kernel kullanır; bu bizde look-ahead olurdu (t barının yumuşatılmış
değeri t+1'i görürdü). Burada kernel **tek yanlıdır (nedensel)**: `t` anındaki
yumuşatılmış değer yalnızca `t` ve öncesini kullanır.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import pandas as pd

# Puan tavanları — spec'te sabit, tartışmaya kapalı.
PATTERN_MODIFIER_CAP = 10.0
CANDLE_MODIFIER_CAP = 3.0

# Ekstremum onayı için gereken bar sayısı (pivot ile aynı mantık).
EXTREMUM_K = 3
VOLUME_CONFIRM_MULTIPLE = 1.5
VOLUME_CONFIRM_LOOKBACK = 20

PatternKind = Literal[
    "double_bottom",
    "double_top",
    "head_shoulders",
    "inverse_head_shoulders",
    "ascending_triangle",
    "descending_triangle",
    "symmetrical_triangle",
    "bull_flag",
    "bear_flag",
    "falling_wedge",
    "rising_wedge",
]

BULLISH: frozenset[str] = frozenset(
    {
        "double_bottom",
        "inverse_head_shoulders",
        "ascending_triangle",
        "bull_flag",
        "falling_wedge",
    }
)
BEARISH: frozenset[str] = frozenset(
    {"double_top", "head_shoulders", "descending_triangle", "bear_flag", "rising_wedge"}
)


@dataclass(slots=True)
class Extremum:
    index: int
    price: float
    kind: Literal["max", "min"]


@dataclass(slots=True)
class PatternMatch:
    kind: str
    direction: int  # +1 boğa, −1 ayı
    confidence: float  # 0–1
    start_index: int
    end_index: int
    neckline: float | None = None
    target: float | None = None
    volume_confirmed: bool = False

    def as_dict(self) -> dict:
        """Saf Python tipleri döndürür — burası serileştirme sınırıdır.

        Alanlar numpy dizilerinden türüyor; `np.float64`/`np.bool_` sızdığında
        Pydantic `Unable to serialize unknown type` ile 500 veriyor. Bunu
        üretim noktalarında tek tek kovalamak yerine sınırda kesiyoruz.
        """
        return {
            "kind": self.kind,
            "direction": int(self.direction),
            "confidence": round(float(self.confidence), 4),
            "neckline": None if self.neckline is None else float(self.neckline),
            "target": None if self.target is None else float(self.target),
            "volume_confirmed": bool(self.volume_confirmed),
        }


@dataclass(slots=True)
class PatternResult:
    symbol: str
    timeframe: str
    matches: list[PatternMatch] = field(default_factory=list)
    candle_signals: list[str] = field(default_factory=list)
    candle_net: float = 0.0

    @property
    def best(self) -> PatternMatch | None:
        return max(self.matches, key=lambda m: m.confidence) if self.matches else None

    def modifier(self) -> float:
        """Puana katkı, [−10, +10] ile sınırlı (§5.2)."""
        if not self.matches:
            return 0.0
        best = self.best
        assert best is not None
        return round(
            max(
                -PATTERN_MODIFIER_CAP,
                min(PATTERN_MODIFIER_CAP, best.direction * best.confidence * PATTERN_MODIFIER_CAP),
            ),
            2,
        )

    def candle_modifier(self) -> float:
        """Mum formasyonları daha küçük bir alt-değiştirici, ±3 tavanlı (§4.3)."""
        return round(max(-CANDLE_MODIFIER_CAP, min(CANDLE_MODIFIER_CAP, self.candle_net)), 2)


# --------------------------------------------------------------------------- #
#  1) Nedensel kernel yumuşatma
# --------------------------------------------------------------------------- #
def causal_kernel_smooth(prices: np.ndarray, bandwidth: float) -> np.ndarray:
    """Tek yanlı Nadaraya–Watson.

    `out[t]` yalnızca `prices[:t+1]`'i kullanır. Simetrik kernel kullanmak
    (klasik LMW) t barında t+1'i görmek demektir — bu sistemde yasaktır.
    """
    n = len(prices)
    if n == 0:
        return prices.copy()
    h = max(bandwidth, 1e-6)
    # Etkili pencere: 3 bant genişliği (dışı ihmal edilebilir ağırlık).
    span = max(2, math.ceil(3 * h))

    # Ağırlık yalnızca GECİKMEYE bağlıdır (t − idx), t'ye değil: aynı çekirdek
    # her bara uygulanır. Bar bar Python döngüsü yerine tek evrişim yeterli.
    # Ölçüldü (2026-09-04): formasyon motorunun sembol başına 52 ms'sinin
    # ~17 ms'si buradaydı — `select_bandwidth` bu işi 5 kez tekrarlıyor.
    # Kenar davranışı korunur: t < span iken payda yalnızca VAR OLAN barların
    # ağırlıklarını toplar, yani pencere kısalır. Nedensellik de korunur —
    # çekirdek yalnızca geçmişe (gecikme ≥ 0) bakar.
    lags = np.arange(span + 1, dtype=float)
    w = np.exp(-0.5 * (lags / h) ** 2)

    prices = np.asarray(prices, dtype=float)
    # np.convolve(p, w)[t] = Σ_m p[m]·w[t−m] — tam olarak istenen nedensel
    # toplam (m ≤ t, gecikme ≤ span). İlk n eleman t = 0…n−1 satırlarıdır.
    num = np.convolve(prices, w, mode="full")[:n]
    den = np.convolve(np.ones(n), w, mode="full")[:n]
    out = np.divide(num, den, out=prices.astype(float, copy=True), where=den > 0)
    return out


def select_bandwidth(
    prices: np.ndarray, candidates: tuple[float, ...] = (3, 5, 8, 13, 21)
) -> float:
    """Bant genişliği bir-adım-ileri tahmin hatasıyla seçilir.

    Klasik çapraz doğrulama tüm örneklemi kullanır; burada **nedensel** bir
    ölçüt kullanıyoruz: t'ye kadarki yumuşatma t+1'i ne kadar iyi tahmin ediyor?
    Bu ölçüt geçmişte kalır, dolayısıyla look-ahead üretmez.
    """
    if len(prices) < 30:
        return 5.0
    best_h, best_err = candidates[0], float("inf")
    for h in candidates:
        smooth = causal_kernel_smooth(prices, h)
        err = float(np.mean((prices[1:] - smooth[:-1]) ** 2))
        if err < best_err:
            best_h, best_err = h, err
    return float(best_h)


# --------------------------------------------------------------------------- #
#  2) Yerel ekstremumlar
# --------------------------------------------------------------------------- #
def find_extrema(smoothed: np.ndarray, k: int = EXTREMUM_K) -> list[Extremum]:
    """Yumuşatılmış seride yerel tepe/dip. Son `k` bar onaylanmamış → atlanır."""
    n = len(smoothed)
    out: list[Extremum] = []
    if n < 2 * k + 1:
        return out
    for i in range(k, n - k):
        window = smoothed[i - k : i + k + 1]
        if smoothed[i] == window.max() and (window == smoothed[i]).sum() == 1:
            out.append(Extremum(i, float(smoothed[i]), "max"))
        elif smoothed[i] == window.min() and (window == smoothed[i]).sum() == 1:
            out.append(Extremum(i, float(smoothed[i]), "min"))
    # Ardışık aynı tipleri sadeleştir (max, max → daha uçtakini tut).
    cleaned: list[Extremum] = []
    for e in out:
        if cleaned and cleaned[-1].kind == e.kind:
            better = e.price > cleaned[-1].price if e.kind == "max" else e.price < cleaned[-1].price
            if better:
                cleaned[-1] = e
            continue
        cleaned.append(e)
    return cleaned


# --------------------------------------------------------------------------- #
#  3) Şablon eşleştirme
# --------------------------------------------------------------------------- #
def _rel(a: float, b: float) -> float:
    """İki fiyat arasındaki göreli fark."""
    base = (abs(a) + abs(b)) / 2
    return abs(a - b) / base if base > 0 else float("inf")


def _score(diff: float, tolerance: float) -> float:
    """Fark toleransın neresinde? 0 fark → 1.0 güven, tolerans sınırı → 0."""
    if diff >= tolerance:
        return 0.0
    return float(1.0 - diff / tolerance)


def match_templates(ex: list[Extremum], tolerance: float = 0.05) -> list[PatternMatch]:
    """Ekstremum dizisini şablonlarla eşleştirir. Yalnızca **son** oluşumlara bakar."""
    matches: list[PatternMatch] = []
    if len(ex) < 3:
        return matches

    # --- 3'lü diziler: çift dip / çift tepe ---
    for i in range(len(ex) - 2):
        a, b, c = ex[i], ex[i + 1], ex[i + 2]
        if a.kind == "min" and b.kind == "max" and c.kind == "min":
            diff = _rel(a.price, c.price)
            conf = _score(diff, tolerance)
            if conf > 0 and b.price > max(a.price, c.price):
                depth = b.price - (a.price + c.price) / 2
                matches.append(
                    PatternMatch(
                        "double_bottom",
                        +1,
                        conf,
                        a.index,
                        c.index,
                        neckline=b.price,
                        target=b.price + depth,
                    )
                )
        if a.kind == "max" and b.kind == "min" and c.kind == "max":
            diff = _rel(a.price, c.price)
            conf = _score(diff, tolerance)
            if conf > 0 and b.price < min(a.price, c.price):
                depth = (a.price + c.price) / 2 - b.price
                matches.append(
                    PatternMatch(
                        "double_top",
                        -1,
                        conf,
                        a.index,
                        c.index,
                        neckline=b.price,
                        target=b.price - depth,
                    )
                )

    # --- 5'li diziler: omuz-baş-omuz ve tersi + üçgen/kama/bayrak ---
    for i in range(len(ex) - 4):
        e = ex[i : i + 5]
        kinds = tuple(x.kind for x in e)
        p = [x.price for x in e]

        if kinds == ("max", "min", "max", "min", "max"):
            # Omuz-baş-omuz: orta tepe en yüksek, omuzlar benzer.
            if p[2] > p[0] and p[2] > p[4]:
                shoulder_diff = _rel(p[0], p[4])
                neck_diff = _rel(p[1], p[3])
                conf = _score(shoulder_diff, tolerance) * _score(neck_diff, tolerance * 1.5)
                if conf > 0:
                    neck = (p[1] + p[3]) / 2
                    matches.append(
                        PatternMatch(
                            "head_shoulders",
                            -1,
                            conf,
                            e[0].index,
                            e[4].index,
                            neckline=neck,
                            target=neck - (p[2] - neck),
                        )
                    )
            # Yükselen üçgen: tepeler yatay, dipler yükseliyor.
            if _rel(p[0], p[2]) < tolerance and _rel(p[2], p[4]) < tolerance and p[3] > p[1]:
                conf = _score(_rel(p[0], p[4]), tolerance)
                if conf > 0:
                    res = float(np.mean([p[0], p[2], p[4]]))
                    matches.append(
                        PatternMatch(
                            "ascending_triangle",
                            +1,
                            conf,
                            e[0].index,
                            e[4].index,
                            neckline=res,
                            target=res + (res - p[1]),
                        )
                    )
            # Alçalan kama: hem tepeler hem dipler düşüyor, daralıyor → boğa.
            if p[0] > p[2] > p[4] and p[1] > p[3] and (p[0] - p[1]) > (p[4] - p[3]):
                matches.append(
                    PatternMatch("falling_wedge", +1, 0.6, e[0].index, e[4].index, neckline=p[2])
                )
            # Yükselen kama: hem tepeler hem dipler yükseliyor, daralıyor → ayı.
            if p[0] < p[2] < p[4] and p[1] < p[3] and (p[0] - p[1]) > (p[4] - p[3]):
                matches.append(
                    PatternMatch("rising_wedge", -1, 0.6, e[0].index, e[4].index, neckline=p[2])
                )
            # Simetrik üçgen: tepeler düşüyor, dipler yükseliyor.
            if p[0] > p[2] > p[4] and p[1] < p[3]:
                matches.append(
                    PatternMatch(
                        "symmetrical_triangle", 0, 0.5, e[0].index, e[4].index, neckline=p[2]
                    )
                )

        if kinds == ("min", "max", "min", "max", "min"):
            # Ters omuz-baş-omuz.
            if p[2] < p[0] and p[2] < p[4]:
                shoulder_diff = _rel(p[0], p[4])
                neck_diff = _rel(p[1], p[3])
                conf = _score(shoulder_diff, tolerance) * _score(neck_diff, tolerance * 1.5)
                if conf > 0:
                    neck = (p[1] + p[3]) / 2
                    matches.append(
                        PatternMatch(
                            "inverse_head_shoulders",
                            +1,
                            conf,
                            e[0].index,
                            e[4].index,
                            neckline=neck,
                            target=neck + (neck - p[2]),
                        )
                    )
            # Alçalan üçgen: dipler yatay, tepeler düşüyor.
            if _rel(p[0], p[2]) < tolerance and _rel(p[2], p[4]) < tolerance and p[3] < p[1]:
                conf = _score(_rel(p[0], p[4]), tolerance)
                if conf > 0:
                    sup = float(np.mean([p[0], p[2], p[4]]))
                    matches.append(
                        PatternMatch(
                            "descending_triangle",
                            -1,
                            conf,
                            e[0].index,
                            e[4].index,
                            neckline=sup,
                            target=sup - (p[1] - sup),
                        )
                    )

    return matches


def detect_flags(
    close: np.ndarray, ex: list[Extremum], pole_bars: int = 12, flag_bars: int = 20
) -> list[PatternMatch]:
    """Bayrak: keskin bir direk + ters yönde sığ, daralan konsolidasyon."""
    n = len(close)
    out: list[PatternMatch] = []
    if n < pole_bars + flag_bars + 1:
        return out

    pole_start = n - pole_bars - flag_bars
    pole_end = n - flag_bars
    pole_move = (close[pole_end - 1] - close[pole_start]) / close[pole_start]
    flag = close[pole_end:]
    if len(flag) < 4:
        return out
    flag_range = (flag.max() - flag.min()) / flag.mean() if flag.mean() > 0 else 1.0
    flag_drift = (flag[-1] - flag[0]) / flag[0] if flag[0] > 0 else 0.0

    # Direk ≥ %8, bayrak dalgalanması direğin yarısından küçük, eğim ters yönde.
    if abs(pole_move) >= 0.08 and flag_range < abs(pole_move) / 2:
        conf = min(1.0, abs(pole_move) / 0.20) * (1 - flag_range / max(abs(pole_move) / 2, 1e-9))
        conf = float(max(0.0, min(1.0, conf)))
        if pole_move > 0 and flag_drift <= 0.02:
            out.append(
                PatternMatch("bull_flag", +1, conf, pole_start, n - 1, neckline=float(flag.max()))
            )
        elif pole_move < 0 and flag_drift >= -0.02:
            out.append(
                PatternMatch("bear_flag", -1, conf, pole_start, n - 1, neckline=float(flag.min()))
            )
    return out


# --------------------------------------------------------------------------- #
#  4) Hacim onayı
# --------------------------------------------------------------------------- #
def confirm_with_volume(
    match: PatternMatch, df: pd.DataFrame, lookback: int = VOLUME_CONFIRM_LOOKBACK
) -> PatternMatch:
    """Kırılım barında hacim, 20 barlık ortalamanın ≥1.5 katı mı?

    Değilse `confidence` **yarıya iner** (§4.3).
    """
    volume = df["volume"].to_numpy(dtype=float)
    idx = min(match.end_index, len(volume) - 1)
    lo = max(0, idx - lookback)
    baseline = float(np.mean(volume[lo:idx])) if idx > lo else 0.0
    # `bool(...)` **zorunlu**: `volume[idx] >= ...` bir `numpy.bool_` üretir ve
    # `and` bunu olduğu gibi döndürür. Pydantic `numpy.bool_`'u JSON'a çeviremez —
    # `/symbols/{sembol}/patterns` her sembol için 500 veriyordu ve Terminal
    # sayfası açılır açılmaz hata yağmuruna dönüyordu.
    confirmed = bool(baseline > 0 and volume[idx] >= VOLUME_CONFIRM_MULTIPLE * baseline)
    match.volume_confirmed = confirmed
    if not confirmed:
        match.confidence *= 0.5
    return match


# --------------------------------------------------------------------------- #
#  5) Mum formasyonları (alt-değiştirici)
# --------------------------------------------------------------------------- #
_CANDLE_WEIGHTS: dict[str, float] = {
    "engulfing": 1.0,
    "hammer": 0.8,
    "invertedhammer": 0.5,
    "morningstar": 1.2,
    "eveningstar": -1.2,
    "shootingstar": -0.8,
    "hangingman": -0.6,
    "3whitesoldiers": 1.2,
    "3blackcrows": -1.2,
    "doji": 0.0,
    "harami": 0.4,
    "piercing": 0.7,
    "darkcloudcover": -0.7,
}


def detect_candles(df: pd.DataFrame) -> tuple[list[str], float]:
    """`pandas-ta-classic`'in mum formasyonları; son bar için net etki döner.

    Kütüphane yoksa veya TA-Lib gerektiren bir kalıp çalışmazsa sessizce boş döner —
    bu bileşen ±3 puanla sınırlı bir süstür, sistemin işlemesini engellemez.
    """
    if len(df) < 10:
        return [], 0.0
    try:
        import pandas_ta_classic as ta
    except ImportError:
        return [], 0.0

    frame = df.rename(columns={"open_time": "date"}).copy()
    signals: list[str] = []
    net = 0.0
    for name, weight in _CANDLE_WEIGHTS.items():
        if weight == 0.0:
            continue
        try:
            res = ta.cdl_pattern(
                open_=frame["open"],
                high=frame["high"],
                low=frame["low"],
                close=frame["close"],
                name=name,
            )
        except Exception:
            continue
        if res is None or res.empty:
            continue
        value = float(res.iloc[-1, 0])
        if value == 0:
            continue
        direction = 1.0 if value > 0 else -1.0
        signals.append(f"{name}{'+' if direction > 0 else '-'}")
        net += weight * direction
    return signals, net


# --------------------------------------------------------------------------- #
#  Ana giriş
# --------------------------------------------------------------------------- #
def compute_patterns(
    df: pd.DataFrame, symbol: str, timeframe: str, *, lookback: int = 200
) -> PatternResult:
    """`df`'in son barı için formasyon tespiti. Yalnızca kapanmış barlar beklenir."""
    result = PatternResult(symbol=symbol, timeframe=timeframe)
    if len(df) < 40:
        return result

    tail = df.tail(lookback).reset_index(drop=True)
    close = tail["close"].to_numpy(dtype=float)

    bandwidth = select_bandwidth(close)
    smoothed = causal_kernel_smooth(close, bandwidth)
    extrema = find_extrema(smoothed)

    matches = match_templates(extrema)
    matches += detect_flags(close, extrema)

    # Yalnızca son 1/3'te biten formasyonlar taze sayılır.
    fresh_cutoff = int(len(tail) * 2 / 3)
    matches = [m for m in matches if m.end_index >= fresh_cutoff]

    result.matches = [confirm_with_volume(m, tail) for m in matches]
    result.candle_signals, result.candle_net = detect_candles(tail)
    return result
