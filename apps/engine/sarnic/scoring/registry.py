"""Özellik kaydı — MASTER-SPEC §5.2'deki aile tablosunun makine okunur hâli.

Her özellik: hangi aileye ait, aile içinde hangi ağırlıkta, ve yüksek değer
iyi mi (`higher_is_better`).

Ağırlıklar **başlangıç hipotezidir**, keşfedilmiş gerçek değil (§0). Kalibrasyon
sayfası aile bazında IC gösterir; bir ailenin IC'si uzun süre sıfırsa ağırlığı
sorgulanır.
"""

from __future__ import annotations

from dataclasses import dataclass

# §5.2 aile ağırlıkları — toplam 100.
DEFAULT_FAMILY_WEIGHTS: dict[str, float] = {
    "trend": 30.0,
    "momentum": 25.0,
    "flow": 20.0,
    "vol": 15.0,
    "sr": 10.0,
}


@dataclass(frozen=True, slots=True)
class FeatureDef:
    key: str
    family: str
    weight: float  # aile içi göreli ağırlık
    higher_is_better: bool
    label: str  # gerekçe metninde görünen Türkçe ad


FEATURES: tuple[FeatureDef, ...] = (
    # --- Trend (30) ---
    FeatureDef("ema_alignment", "trend", 1.0, True, "EMA dizilimi (20>50>200)"),
    FeatureDef("price_over_ema200", "trend", 1.0, True, "fiyat / EMA200"),
    FeatureDef("adx", "trend", 1.0, True, "ADX(14) trend gücü"),
    FeatureDef("trend_4h", "trend", 1.0, True, "4h trend uyumu"),
    FeatureDef("trend_1d", "trend", 1.0, True, "1d trend uyumu"),
    # --- Momentum (25) — son 6 saat atlanır (§5.2) ---
    FeatureDef("ret_24h_skip6", "momentum", 1.0, True, "24s getiri (son 6s atlandı)"),
    FeatureDef("ret_72h_skip6", "momentum", 1.0, True, "72s getiri (son 6s atlandı)"),
    FeatureDef("ret_168h_skip6", "momentum", 1.0, True, "168s getiri (son 6s atlandı)"),
    FeatureDef("rsi_position", "momentum", 1.0, True, "RSI(14) konumu"),
    FeatureDef("macd_hist_slope", "momentum", 1.0, True, "MACD histogram eğimi"),
    # --- Akış (20) ---
    FeatureDef("taker_buy_ratio", "flow", 1.0, True, "taker alım oranı"),
    FeatureDef("rvol", "flow", 1.0, True, "göreli hacim (RVOL)"),
    FeatureDef("obv_slope", "flow", 1.0, True, "OBV eğimi"),
    # --- Volatilite / Yapı (15) ---
    # BB genişliği: squeeze aranıyor → DAR bant iyi, bu yüzden ters çevrilir.
    FeatureDef("bb_width", "vol", 1.0, False, "BB sıkışması"),
    # ATR% rejimi: bkz. docs/OPEN-QUESTIONS.md #2 — düşük vol tercih ediliyor.
    FeatureDef("atr_pct", "vol", 1.0, False, "ATR% rejimi"),
    # --- S/R geometrisi (10) ---
    FeatureDef("rr_geometry", "sr", 1.0, True, "direnç/destek mesafe oranı"),
    FeatureDef("support_strength", "sr", 1.0, True, "destek gücü"),
)

FEATURES_BY_FAMILY: dict[str, tuple[FeatureDef, ...]] = {
    fam: tuple(f for f in FEATURES if f.family == fam) for fam in DEFAULT_FAMILY_WEIGHTS
}

FEATURE_KEYS: tuple[str, ...] = tuple(f.key for f in FEATURES)


def family_weights(overrides: dict | None = None) -> dict[str, float]:
    """Strateji tanımından gelen ağırlıkları uygular ve 100'e normalize eder."""
    weights = dict(DEFAULT_FAMILY_WEIGHTS)
    if overrides:
        for key, value in overrides.items():
            if key in weights:
                weights[key] = float(value)
    total = sum(weights.values())
    if total <= 0:
        return dict(DEFAULT_FAMILY_WEIGHTS)
    # Toplam 100 olmalı — strateji 30/25/20/15/10 dışında bir şey verirse ölçekle.
    return {k: v / total * 100.0 for k, v in weights.items()}
