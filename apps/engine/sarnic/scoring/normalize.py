"""Kesitsel normalizasyon — MASTER-SPEC §5.1.

Her ham özellik, **o bardaki havuz içinde yüzdelik sırasına** çevrilir (0–100).
Z-skor değil: kriptoda kuyruklar kalın, tek bir uçuk değer z-skoru bozar;
sıralama buna dayanıklıdır.

Eksik veri (`NaN`) sıralamaya girmez ve nötr 50 alır — eksik olduğu için
ödüllendirilmez de cezalandırılmaz da.
"""

from __future__ import annotations

import math

NEUTRAL = 50.0


def percentile_rank(values: dict[str, float], higher_is_better: bool = True) -> dict[str, float]:
    """Sembol→değer sözlüğünü sembol→yüzdelik (0–100) sözlüğüne çevirir.

    Beraberlikte ortalama sıra kullanılır (ties → aynı yüzdelik).
    Tek eleman varsa nötr 50 döner: bir elemanlık kesitte sıralama bilgisi yoktur.
    """
    finite = {k: v for k, v in values.items() if v is not None and math.isfinite(v)}
    out: dict[str, float] = {k: NEUTRAL for k in values}
    n = len(finite)
    if n == 0:
        return out
    if n == 1:
        return out

    ordered = sorted(finite.items(), key=lambda kv: kv[1])
    # Beraberlik gruplarına ortalama sıra ver.
    i = 0
    ranks: dict[str, float] = {}
    while i < n:
        j = i
        while j + 1 < n and ordered[j + 1][1] == ordered[i][1]:
            j += 1
        avg_rank = (i + j) / 2
        for k in range(i, j + 1):
            ranks[ordered[k][0]] = avg_rank
        i = j + 1

    for symbol, rank in ranks.items():
        pct = rank / (n - 1) * 100.0
        out[symbol] = pct if higher_is_better else 100.0 - pct
    return out


def normalize_matrix(
    rows: dict[str, dict[str, float]],
    higher_is_better: dict[str, bool],
) -> dict[str, dict[str, float]]:
    """Tüm özellikler için kesitsel yüzdelik matrisi.

    `rows`: {sembol: {özellik: ham değer}}
    Döner:  {sembol: {özellik: yüzdelik 0–100}}
    """
    if not rows:
        return {}
    keys = higher_is_better.keys()
    out: dict[str, dict[str, float]] = {s: {} for s in rows}
    for key in keys:
        column = {s: rows[s].get(key, float("nan")) for s in rows}
        ranked = percentile_rank(column, higher_is_better.get(key, True))
        for symbol, pct in ranked.items():
            out[symbol][key] = pct
    return out
