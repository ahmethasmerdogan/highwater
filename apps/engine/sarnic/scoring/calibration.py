"""Kalibrasyon — MASTER-SPEC §5.5. Sistemin dürüstlük organı.

Üç ölçüm:
  1. Puan desili → ortalama ileri getiri (monoton artıyor mu?)
  2. Spearman rank korelasyonu (puan ↔ ileri getiri), kayan pencerelerde
  3. Aile bazında bilgi katsayısı (IC) — hangi aile gerçekten çalışıyor?

**Eğer desil grafiği düz çıkarsa puanlama işe yaramıyor demektir ve panel bunu
saklamaz.** Bu modül o cevabı hesaplar; süslemek onun işi değildir.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from itertools import pairwise

import numpy as np
from scipy import stats

# Panelin "yeterli gözlem" eşiği (DESIGN.md §6 boş durum metni).
MIN_OBSERVATIONS = 500
MIN_DAYS = 30


@dataclass(slots=True)
class DecileBucket:
    decile: int
    count: int
    mean_return: float
    #: Ortalama, birkaç aşırı getiriyle sürüklenir. En düşük desilde ortalama
    #: pozitif çıkarken medyan negatiftir: birkaç piyango sıçraması dilimi
    #: kârlı gösteriyor, tipik gözlem zarar ediyor. İkisi yan yana durmazsa
    #: panel "en düşük puanlılar en iyi getiriyi verdi" diye okunur.
    median_return: float
    std_error: float
    ci_low: float
    ci_high: float
    mean_score: float


@dataclass(slots=True)
class ICPoint:
    at: datetime
    family: str
    ic: float
    n: int


@dataclass(slots=True)
class CalibrationReport:
    horizon: str
    n: int
    span_days: int = 0
    deciles: list[DecileBucket] = field(default_factory=list)
    spearman: float = float("nan")
    spearman_p: float = float("nan")
    rolling_spearman: list[tuple[datetime, float]] = field(default_factory=list)
    family_ic: dict[str, float] = field(default_factory=dict)
    ic_series: list[ICPoint] = field(default_factory=list)
    monotonic: bool = False
    #: Sistemin **fiilen işlem yaptığı** bölgenin havuza göre farkı.
    #:
    #: Spearman ve üst-alt desil farkı tüm dağılıma bakar; sistem ise yalnızca
    #: giriş kapısının üstünü alır. İkisi çok farklı şeyler söyleyebilir ve
    #: söylüyor da: 60 günlük örnekte Spearman +0,014 ("ilişki yok") çıkarken,
    #: puanı ≥ 80 olanların ileri getirisi havuz ortalamasını 72 saatte
    #: +1,80 puan geçiyordu (t=+3,6, örneğin iki yarısında da pozitif).
    #: Alt desilin iyi gitmesi üst-alt farkını bozuyor ama sistem alt desili
    #: hiç almıyor — o yüzden ayrı ölçülür.
    gate: float = float("nan")
    gate_n: int = 0
    gate_return: float = float("nan")
    pool_return: float = float("nan")
    gate_edge: float = float("nan")
    gate_edge_t: float = float("nan")
    #: Gün-kümelenmiş t. Bar-bazlı t bağımsızlık varsayar; aynı günün barları
    #: aynı piyasa hareketini paylaşır ve ham t ~%70 şişkin çıkar (ölçüldü:
    #: referans kenarda ham 2,61 → gün-kümeli 1,52). Karar İKİSİNE birden
    #: bakmalı; şüphede kümelenmiş olan esas alınır.
    gate_edge_t_daily: float = float("nan")
    gate_days: int = 0
    top_minus_bottom: float = float("nan")
    top_minus_bottom_t: float = float("nan")
    top_minus_bottom_p: float = float("nan")
    sufficient: bool = False
    verdict: str = ""

    def as_dict(self) -> dict:
        return {
            "horizon": self.horizon,
            "n": self.n,
            "span_days": self.span_days,
            "sufficient": self.sufficient,
            "deciles": [
                {
                    "decile": d.decile,
                    "count": d.count,
                    "mean_return": d.mean_return,
                    "median_return": d.median_return,
                    "ci_low": d.ci_low,
                    "ci_high": d.ci_high,
                    "mean_score": d.mean_score,
                }
                for d in self.deciles
            ],
            "spearman": _clean(self.spearman),
            "spearman_p": _clean(self.spearman_p),
            "rolling_spearman": [
                {"at": at.isoformat(), "value": _clean(v)} for at, v in self.rolling_spearman
            ],
            "family_ic": {k: _clean(v) for k, v in self.family_ic.items()},
            "ic_series": [
                {"at": p.at.isoformat(), "family": p.family, "ic": _clean(p.ic), "n": p.n}
                for p in self.ic_series
            ],
            "monotonic": self.monotonic,
            # Sistemin fiilen işlem yaptığı bölge — dağılım geneli değil.
            "gate": _clean(self.gate),
            "gate_n": self.gate_n,
            "gate_return": _clean(self.gate_return),
            "pool_return": _clean(self.pool_return),
            "gate_edge": _clean(self.gate_edge),
            "gate_edge_t": _clean(self.gate_edge_t),
            "gate_edge_t_daily": _clean(self.gate_edge_t_daily),
            "gate_days": self.gate_days,
            "top_minus_bottom": _clean(self.top_minus_bottom),
            "top_minus_bottom_t": _clean(self.top_minus_bottom_t),
            "top_minus_bottom_p": _clean(self.top_minus_bottom_p),
            "verdict": self.verdict,
        }


def _clean(x: float) -> float | None:
    return None if x is None or not math.isfinite(x) else round(float(x), 6)


def decile_buckets(scores: np.ndarray, returns: np.ndarray) -> list[DecileBucket]:
    """Puanı 10 desile böler; her desilin ortalama ve medyan ileri getirisini verir."""
    n = len(scores)
    if n < 10:
        return []
    order = np.argsort(scores)
    buckets: list[DecileBucket] = []
    edges = np.linspace(0, n, 11).astype(int)
    for d in range(10):
        idx = order[edges[d] : edges[d + 1]]
        if len(idx) == 0:
            continue
        r = returns[idx]
        mean = float(np.mean(r))
        se = float(np.std(r, ddof=1) / math.sqrt(len(r))) if len(r) > 1 else 0.0
        buckets.append(
            DecileBucket(
                decile=d + 1,
                count=len(idx),
                mean_return=mean,
                median_return=float(np.median(r)),
                std_error=se,
                ci_low=mean - 1.96 * se,
                ci_high=mean + 1.96 * se,
                mean_score=float(np.mean(scores[idx])),
            )
        )
    return buckets


def is_monotonic(buckets: list[DecileBucket], tolerance: int = 2) -> bool:
    """Kaç desil çiftinin sırası bozuk? `tolerance`'ı aşarsa monoton değildir."""
    if len(buckets) < 3:
        return False
    violations = sum(1 for a, b in pairwise(buckets) if b.mean_return < a.mean_return)
    return violations <= tolerance


def spearman(scores: np.ndarray, returns: np.ndarray) -> tuple[float, float]:
    if len(scores) < 3:
        return float("nan"), float("nan")
    res = stats.spearmanr(scores, returns)
    return float(res.statistic), float(res.pvalue)


def information_coefficient(feature_values: np.ndarray, returns: np.ndarray) -> float:
    """IC = Spearman(özellik, ileri getiri). Aile bazında hesaplanır."""
    if len(feature_values) < 3:
        return float("nan")
    mask = np.isfinite(feature_values) & np.isfinite(returns)
    if mask.sum() < 3:
        return float("nan")
    return float(stats.spearmanr(feature_values[mask], returns[mask]).statistic)


def rolling_spearman(
    times: list[datetime], scores: np.ndarray, returns: np.ndarray, window_days: int = 90
) -> list[tuple[datetime, float]]:
    """Kayan pencerede Spearman — "90 günlük pencerelerin çoğunda pozitif mi?" (Faz 0a testi 2)."""
    if not times or len(times) != len(scores):
        return []
    order = np.argsort([t.timestamp() for t in times])
    t_sorted = [times[i] for i in order]
    s_sorted, r_sorted = scores[order], returns[order]

    out: list[tuple[datetime, float]] = []
    start = 0
    step = max(1, len(t_sorted) // 200)  # en fazla ~200 nokta çizeriz
    for end in range(0, len(t_sorted), step):
        while (t_sorted[end] - t_sorted[start]).days > window_days:
            start += 1
        if end - start < 30:
            continue
        rho, _ = spearman(s_sorted[start : end + 1], r_sorted[start : end + 1])
        if math.isfinite(rho):
            out.append((t_sorted[end], rho))
    return out


def welch_t_test(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """Üst desil vs alt desil farkı istatistiksel olarak anlamlı mı?"""
    if len(a) < 2 or len(b) < 2:
        return float("nan"), float("nan")
    res = stats.ttest_ind(a, b, equal_var=False)
    return float(res.statistic), float(res.pvalue)


def build_report(
    *,
    horizon: str,
    times: list[datetime],
    scores: np.ndarray,
    returns: np.ndarray,
    family_values: dict[str, np.ndarray] | None = None,
    ic_window_days: int = 30,
    gate: float | None = None,
) -> CalibrationReport:
    """Tam kalibrasyon raporu. Sonucu yumuşatmaz — düzse düz der."""
    mask = np.isfinite(scores) & np.isfinite(returns)
    scores, returns = scores[mask], returns[mask]
    times = [t for t, keep in zip(times, mask, strict=True) if keep]

    report = CalibrationReport(horizon=horizon, n=len(scores))
    report.span_days = (max(times) - min(times)).days if len(times) > 1 else 0
    report.sufficient = report.n >= MIN_OBSERVATIONS and report.span_days >= MIN_DAYS

    if report.n < 10:
        report.verdict = _insufficient_message(report)
        return report

    report.deciles = decile_buckets(scores, returns)
    report.monotonic = is_monotonic(report.deciles)
    report.spearman, report.spearman_p = spearman(scores, returns)
    report.rolling_spearman = rolling_spearman(times, scores, returns)

    if report.deciles:
        order = np.argsort(scores)
        n = len(scores)
        bottom = returns[order[: n // 10]]
        top = returns[order[-(n // 10) :]]
        report.top_minus_bottom = float(np.mean(top) - np.mean(bottom))
        report.top_minus_bottom_t, report.top_minus_bottom_p = welch_t_test(top, bottom)

    if gate is not None and len(times) > 1:
        _gate_edge(report, times, scores, returns, gate)

    if family_values:
        for family, values in family_values.items():
            v = values[mask] if len(values) == len(mask) else values
            report.family_ic[family] = information_coefficient(v, returns)
            report.ic_series += _rolling_ic(times, v, returns, family, ic_window_days)

    report.verdict = _verdict(report)
    return report


def _rolling_ic(
    times: list[datetime],
    values: np.ndarray,
    returns: np.ndarray,
    family: str,
    window_days: int,
) -> list[ICPoint]:
    if len(times) != len(values):
        return []
    order = np.argsort([t.timestamp() for t in times])
    t_sorted = [times[i] for i in order]
    v_sorted, r_sorted = values[order], returns[order]
    out: list[ICPoint] = []
    start = 0
    step = max(1, len(t_sorted) // 120)
    for end in range(0, len(t_sorted), step):
        while (t_sorted[end] - t_sorted[start]).days > window_days:
            start += 1
        if end - start < 30:
            continue
        ic = information_coefficient(v_sorted[start : end + 1], r_sorted[start : end + 1])
        if math.isfinite(ic):
            out.append(ICPoint(t_sorted[end], family, ic, end - start + 1))
    return out


def _gate_edge(
    report: CalibrationReport,
    times: list[datetime],
    scores: np.ndarray,
    returns: np.ndarray,
    gate: float,
) -> None:
    """Kapının üstündeki seçim, aynı barlardaki havuzu geçiyor mu?

    Karşılaştırma **bar bazında** yapılır: her barın seçimi o barın kendi havuz
    ortalamasıyla kıyaslanır. Dönem ortalamalarını karşılaştırmak, sinyalin sık
    çıktığı günler piyasanın da iyi olduğu günlerse sahte kenar üretir.
    """
    report.gate = gate
    bar_index: dict[float, list[int]] = {}
    for i, t in enumerate(times):
        bar_index.setdefault(t.timestamp(), []).append(i)

    farklar: list[float] = []
    secim: list[float] = []
    havuz: list[float] = []
    gunler: list[str] = []
    for ts, idx in bar_index.items():
        if len(idx) < 5:
            continue
        bar_scores = scores[idx]
        bar_returns = returns[idx]
        secilen = bar_returns[bar_scores >= gate]
        if secilen.size == 0:
            continue
        farklar.append(float(secilen.mean() - bar_returns.mean()))
        secim.append(float(secilen.mean()))
        havuz.append(float(bar_returns.mean()))
        gunler.append(datetime.fromtimestamp(ts, tz=UTC).date().isoformat())

    report.gate_n = len(farklar)
    if len(farklar) < 20:
        return
    f = np.asarray(farklar)
    report.gate_return = float(np.mean(secim))
    report.pool_return = float(np.mean(havuz))
    report.gate_edge = float(f.mean())
    std = f.std(ddof=1)
    if std > 0:
        report.gate_edge_t = float(f.mean() / (std / math.sqrt(len(f))))

    # Gün-kümelenmiş t: aynı günün barları tek gözleme indirilir. Ham t'nin
    # bağımsızlık varsayımı saatlik kesitte gerçekçi değil — bir günün 24
    # barı aynı piyasa dalgasını paylaşır.
    gun_ort: dict[str, list[float]] = {}
    for g, fark in zip(gunler, farklar, strict=True):
        gun_ort.setdefault(g, []).append(fark)
    if len(gun_ort) >= 10:
        g = np.asarray([float(np.mean(v)) for v in gun_ort.values()])
        report.gate_days = len(g)
        g_std = g.std(ddof=1)
        if g_std > 0:
            report.gate_edge_t_daily = float(g.mean() / (g_std / math.sqrt(len(g))))


def _insufficient_message(r: CalibrationReport) -> str:
    """Hangi koşulun eksik olduğunu **açıkça** söyler.

    Önceki metin her iki koşulu birlikte anıp yalnızca gözlem sayısını
    gösteriyordu; 1.526 gözlem varken "en az 500 gerekiyor — şu an 1526"
    yazıyor ve okuyucuyu yanıltıyordu.
    """
    eksik = []
    if r.n < MIN_OBSERVATIONS:
        eksik.append(f"{MIN_OBSERVATIONS} puanlama gerekiyor, {r.n} var")
    if r.span_days < MIN_DAYS:
        eksik.append(f"{MIN_DAYS} günlük geçmiş gerekiyor, {r.span_days} gün var")
    return "Henüz yeterli gözlem yok — " + "; ".join(eksik) + "."


def _verdict(r: CalibrationReport) -> str:
    if not r.sufficient:
        return _insufficient_message(r)
    positive_windows = (
        sum(1 for _, v in r.rolling_spearman if v > 0) / len(r.rolling_spearman)
        if r.rolling_spearman
        else 0.0
    )
    kapi = _gate_sentence(r)
    if not r.monotonic and abs(r.spearman) < 0.02:
        return (
            "Puan ile ileri getiri arasında dağılım genelinde ölçülebilir ilişki yok; "
            "desil grafiği düz." + kapi
        )
    if r.monotonic and r.spearman > 0 and r.top_minus_bottom_p < 0.05:
        return (
            f"Desil grafiği monoton artıyor, Spearman {r.spearman:+.3f}, üst-alt desil farkı "
            f"istatistiksel olarak anlamlı (p={r.top_minus_bottom_p:.4f}). "
            f"Pencerelerin %{positive_windows * 100:.0f}'i pozitif."
        )
    return (
        f"Karışık sonuç: Spearman {r.spearman:+.3f}, monotonluk "
        f"{'var' if r.monotonic else 'yok'}, üst-alt desil farkı p={r.top_minus_bottom_p:.4f}."
        + kapi
    )


def _gate_sentence(r: CalibrationReport) -> str:
    """Sistemin gerçekten işlem yaptığı bölge ne diyor?

    Dağılım geneli düz olsa bile kapının üstü çalışıyor olabilir — ve bu, bir
    ayrıntı değil, sistemin tek kullandığı bölgedir. Susmak, çalışan bir kenarı
    "öngörü yok" diye raporlamak demekti.
    """
    if not math.isfinite(r.gate_edge) or r.gate_n < 20:
        return ""
    yon = "geçiyor" if r.gate_edge > 0 else "geride kalıyor"
    guclu = abs(r.gate_edge_t) >= 2.0 if math.isfinite(r.gate_edge_t) else False
    return (
        f" Ama sistemin işlem yaptığı bölge ayrı: puanı ≥ {r.gate:.0f} olanlar "
        f"{r.gate_n} barda havuzu ortalama %{r.gate_edge * 100:+.2f} {yon} "
        f"(t={r.gate_edge_t:+.1f}{', anlamlı' if guclu else ', anlamlı değil'}). "
        "Alt desil sistemin hiç almadığı bölgedir; üst-alt farkı bu yüzden "
        "sistemin performansını temsil etmez."
    )
