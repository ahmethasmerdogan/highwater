"""Puanlama motoru — MASTER-SPEC §5.

    score = clamp(base_score + pattern_modifier + candle_modifier + crowding_penalty, 0, 100)

Bu modül **saftır**: DB, ağ, saat yok. Girdi bir bar için sembol→özellik haritası,
çıktı puan + gerekçe. Backtest, paper ve canlı bu aynı fonksiyonu çağırır
(bozulmaz kural 1).
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import datetime

from sarnic.features.indicators import IndicatorSet
from sarnic.features.patterns import PatternResult
from sarnic.features.sr import SRResult
from sarnic.scoring.normalize import NEUTRAL, normalize_matrix
from sarnic.scoring.registry import (
    DIRECTIONAL_FAMILIES,
    FEATURES,
    FEATURES_BY_FAMILY,
    FeatureDef,
    family_weights,
)

# §5.2 kalabalıklaşma cezası — parabolik hareketlere karşı koruma.
#
# Mutlak eşikler doğru ama pratikte **ölü**: 60 günlük 123.735 sembol-barın
# yalnızca %0,54'ü +%25'i, %0,22'si +%40'ı aşıyor. Kapı neredeyse hiç açılmıyor.
CROWDING_TIERS: tuple[tuple[float, float], ...] = ((0.40, -30.0), (0.25, -15.0))


# §5.3 mutlak kapı.
DEFAULT_MIN_SCORE = 80.0
DEFAULT_SCORE_EXIT = 60.0
# 55 değil 60: 60 gün / 605 giriş üzerinde puan çıkış eşiği gezdirildiğinde
# işlem başına net getiri 55'te +%0,72, 60'ta +%0,82, 65'te +%0,81, 70'te
# +%0,61. 60 ve 65 örneğin **iki yarısında da** 55'i geçiyor; 70 fazla erken
# çıkıyor. Puanı düşen pozisyon ölü sermayedir, ama eşik giriş kapısına fazla
# yaklaşırsa gürültüyle alıp satmaya dönüşür.


@dataclass(slots=True)
class SymbolFeatures:
    """Bir sembolün bir bardaki ham özellikleri (normalizasyon öncesi)."""

    symbol: str
    bar_time: datetime
    raw: dict[str, float] = field(default_factory=dict)
    pattern_modifier: float = 0.0
    candle_modifier: float = 0.0
    ret_24h: float = float("nan")
    sr: dict = field(default_factory=dict)
    pattern_labels: list[str] = field(default_factory=list)
    usable: bool = True
    note: str = ""


@dataclass(slots=True)
class ScoreResult:
    symbol: str
    bar_time: datetime
    score: float
    base_score: float
    families: dict[str, float]
    modifiers: dict[str, float]
    rationale: dict
    config_hash: str

    def as_row(self, timeframe: str) -> dict:
        return {
            "symbol": self.symbol,
            "bar_time": self.bar_time,
            "timeframe": timeframe,
            "score": self.score,
            "families": self.families,
            "modifiers": self.modifiers,
            "rationale": self.rationale,
            "config_hash": self.config_hash,
        }


def crowding_penalty(ret_24h: float) -> float:
    """24s getiri > %25 → −15, > %40 → −30 (§5.2).

    Ölçüldü ve **bilerek olduğu gibi bırakıldı**: mutlak kapı sembol-barların
    yalnızca %0,54'ünde açılıyor. Kesitsel bir basamak (havuzun en çok koşmuş
    onda biri) eklemek denendi ve geri alındı — ham getiri sıralamasında üst
    desil kaybettiriyor, ama puanlamanın **seçtiği** üst desil sembolleri
    kazandırıyor. Kesitsel ceza, puan ≥ 80 kapısındaki fırsatların %38,6'sını
    eleyip ortalama ileri 24s getiriyi +%1,53'ten +%1,02'ye düşürdü.

    Ayrımın kendisi bulgudur: "çok koşmuş olmak" tek başına kötü, "çok koşmuş
    **ve** trend/akış/yapı olarak da sağlam olmak" iyi. Puanlama bu ikisini
    ayırt edebiliyor; ham sıralama ayırt edemiyor.
    """
    if ret_24h is None or not math.isfinite(ret_24h):
        return 0.0
    for threshold, penalty in CROWDING_TIERS:
        if ret_24h > threshold:
            return penalty
    return 0.0


def build_features(
    symbol: str,
    ind: dict[str, IndicatorSet],
    sr: SRResult | None,
    patterns: PatternResult | None,
    *,
    decision_tf: str = "1h",
) -> SymbolFeatures:
    """İndikatör/SR/formasyon çıktılarını puanlama özelliklerine çevirir.

    `ind` anahtarları zaman dilimleridir. Karar dilimi bota göre değişir
    (15m, 30m, 1h…); 4h ve 1d ise **her zaman** bağlamdır ve ayrı sinyal
    değil puanın içinde birer özelliktir (§4).

    `trend_4h` / `trend_1d` adları bu yüzden sabittir ve her zaman gerçekten
    4h ve 1d trendini taşır — karar dilimi ne olursa olsun.
    """
    base = ind.get(decision_tf)
    if base is None:
        return SymbolFeatures(
            symbol, datetime.min, usable=False, note=f"{decision_tf} göstergesi yok"
        )
    h1 = base

    h4, d1 = ind.get("4h"), ind.get("1d")
    raw: dict[str, float] = {}

    # --- Trend ---
    raw["ema_alignment"] = _alignment_score(h1)
    raw["price_over_ema200"] = h1.price_over_ema200
    raw["adx"] = h1.adx
    raw["trend_4h"] = _alignment_score(h4) if h4 else float("nan")
    raw["trend_1d"] = _alignment_score(d1) if d1 else float("nan")

    # --- Momentum (son 6 saat atlanmış getiriler) ---
    raw["ret_24h_skip6"] = h1.ret_24h_skip6
    raw["ret_72h_skip6"] = h1.ret_72h_skip6
    raw["ret_168h_skip6"] = h1.ret_168h_skip6
    # RSI konumu: 50'den uzaklık değil, doğrudan seviye — aşırı alım bölgesi
    # kesitsel sıralamada zaten en üstte kalır, crowding cezası onu dengeler.
    raw["rsi_position"] = h1.rsi
    raw["macd_hist_slope"] = h1.macd_hist_slope

    # --- Akış ---
    raw["taker_buy_ratio"] = h1.taker_buy_ratio
    raw["rvol"] = h1.rvol
    raw["obv_slope"] = h1.obv_slope

    # --- Volatilite / Yapı ---
    raw["bb_width"] = h1.bb_width
    raw["atr_pct"] = h1.atr_pct

    # --- S/R geometrisi ---
    sr_dict: dict = {}
    if sr is not None:
        rr = sr.rr_geometry
        raw["rr_geometry"] = rr if rr is not None else float("nan")
        raw["support_strength"] = (
            sr.nearest_support.strength if sr.nearest_support is not None else float("nan")
        )
        sr_dict = sr.as_dict()
    else:
        raw["rr_geometry"] = float("nan")
        raw["support_strength"] = float("nan")

    feats = SymbolFeatures(
        symbol=symbol,
        bar_time=h1.bar_time.to_pydatetime() if h1.bar_time is not None else datetime.min,
        raw=raw,
        ret_24h=h1.ret_24h,
        sr=sr_dict,
        usable=h1.ok,
        note="" if h1.ok else "; ".join(h1.warnings),
    )

    if patterns is not None:
        feats.pattern_modifier = patterns.modifier()
        feats.candle_modifier = patterns.candle_modifier()
        best = patterns.best
        if best is not None:
            confirm = "hacim ✓" if best.volume_confirmed else "hacim ✗"
            feats.pattern_labels = [f"{_pattern_label(best.kind)} ({confirm})"]
    return feats


def _alignment_score(ind: IndicatorSet | None) -> float:
    """EMA dizilimini sürekli bir sayıya çevirir (0/1 yerine derece).

    (EMA20−EMA50)/EMA50 + (EMA50−EMA200)/EMA200 — dizilim ne kadar açıksa o kadar yüksek.
    """
    if ind is None or not math.isfinite(ind.ema200) or ind.ema200 == 0 or ind.ema50 == 0:
        return float("nan")
    return (ind.ema20 - ind.ema50) / ind.ema50 + (ind.ema50 - ind.ema200) / ind.ema200


class ScoringEngine:
    def __init__(
        self,
        weights: dict[str, float] | None = None,
        *,
        use_pattern: bool = True,
        use_candle: bool = True,
        use_crowding: bool = True,
    ) -> None:
        self.weights = family_weights(weights)
        self.use_pattern = use_pattern
        self.use_candle = use_candle
        self.use_crowding = use_crowding

    # ------------------------------------------------------------------ #
    def config_hash(self, direction: int = 1) -> str:
        payload_dict: dict = {
            "weights": {k: round(v, 6) for k, v in sorted(self.weights.items())},
            "features": [f.key for f in FEATURES],
            "pattern": self.use_pattern,
            "candle": self.use_candle,
            "crowding": self.use_crowding,
            "crowding_tiers": list(CROWDING_TIERS),
        }
        # Yalnız kısa için anahtar eklenir: uzun hash'i ve `scores` satırları
        # değişmez; kısa puanlar aynı tabloya ayrı config_hash ile yazılır.
        if direction < 0:
            payload_dict["direction"] = -1
        payload = json.dumps(payload_dict, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()[:32]

    # ------------------------------------------------------------------ #
    def score_cross_section(
        self, features: list[SymbolFeatures], direction: int = 1
    ) -> list[ScoreResult]:
        """Bir bardaki tüm havuzu birlikte puanlar.

        Normalizasyon **kesitseldir**: bir sembolü tek başına puanlamak mümkün
        değildir, çünkü yüzdelik sırası havuza bağlıdır. Bu bilinçlidir.

        `direction=-1` kısa puan: yönlü ailelerin yüzdelikleri ters çevrilir
        (100 − p), `vol` olduğu gibi kalır, düzelticiler işaret değiştirir
        (ayı formasyonu artı, çöküşü kovalamak cezalı). Uzun için kod yolu ve
        aritmetik bugünkü hâliyle birebirdir.
        """
        usable = [f for f in features if f.usable]
        if not usable:
            return []

        higher = {f.key: f.higher_is_better for f in FEATURES}
        matrix = normalize_matrix({f.symbol: f.raw for f in usable}, higher)
        if direction < 0:
            ters = {d.key for fam in DIRECTIONAL_FAMILIES for d in FEATURES_BY_FAMILY.get(fam, ())}
            matrix = {
                s: {k: (100.0 - v if k in ters else v) for k, v in pct.items()}
                for s, pct in matrix.items()
            }
        cfg_hash = self.config_hash(direction)

        results: list[ScoreResult] = []
        for feats in usable:
            pct = matrix[feats.symbol]
            families, contributions = self._family_scores(pct)
            base = round(sum(families.values()), 4)

            pattern_mod = direction * feats.pattern_modifier if self.use_pattern else 0.0
            candle_mod = direction * feats.candle_modifier if self.use_candle else 0.0
            crowd = crowding_penalty(direction * feats.ret_24h) if self.use_crowding else 0.0

            total = max(0.0, min(100.0, base + pattern_mod + candle_mod + crowd))

            modifiers = {
                "pattern": round(pattern_mod, 2),
                "candle": round(candle_mod, 2),
                "crowding": round(crowd, 2),
            }
            results.append(
                ScoreResult(
                    symbol=feats.symbol,
                    bar_time=feats.bar_time,
                    score=round(total, 2),
                    base_score=base,
                    families={k: round(v, 2) for k, v in families.items()},
                    modifiers=modifiers,
                    rationale=self._rationale(
                        feats, pct, families, modifiers, contributions, total, cfg_hash
                    ),
                    config_hash=cfg_hash,
                )
            )
            if direction < 0:
                results[-1].rationale["direction"] = -1
        results.sort(key=lambda r: (-r.score, r.symbol))
        return results

    # ------------------------------------------------------------------ #
    def _family_scores(
        self, pct: dict[str, float]
    ) -> tuple[dict[str, float], list[tuple[FeatureDef, float]]]:
        """Aile puanları + özellik bazında katkılar.

        Aile puanı = (aile içi ağırlıklı ortalama yüzdelik / 100) × aile ağırlığı.
        Böylece aile katkıları toplamı taban puanı verir ve taban ∈ [0, 100].
        """
        families: dict[str, float] = {}
        contributions: list[tuple[FeatureDef, float]] = []

        for family, weight in self.weights.items():
            defs = FEATURES_BY_FAMILY.get(family, ())
            if not defs:
                families[family] = 0.0
                continue
            total_w = sum(d.weight for d in defs)
            acc = 0.0
            for d in defs:
                value = pct.get(d.key, NEUTRAL)
                share = d.weight / total_w
                acc += value * share
                # Katkı: nötr 50'ye göre fark × bu özelliğin puandaki payı.
                contributions.append((d, (value - NEUTRAL) / 100.0 * weight * share))
            families[family] = acc / 100.0 * weight
        return families, contributions

    # ------------------------------------------------------------------ #
    def _rationale(
        self,
        feats: SymbolFeatures,
        pct: dict[str, float],
        families: dict[str, float],
        modifiers: dict[str, float],
        contributions: list[tuple[FeatureDef, float]],
        score: float,
        cfg_hash: str,
    ) -> dict:
        """§5.4 — "Neden alındı?" sorusunun cevabı. Zorunlu, boş bırakılamaz."""
        top = sorted(contributions, key=lambda c: -c[1])[:3]
        drivers = [f"{d.label} ({_fmt_signed(v)})" for d, v in top if abs(v) >= 0.01]
        for label in feats.pattern_labels:
            if modifiers["pattern"] != 0:
                drivers.append(f"{label} ({_fmt_signed(modifiers['pattern'])})")
        if modifiers["crowding"] != 0:
            drivers.append(
                f"24s getiri %{feats.ret_24h * 100:.1f} — kalabalık cezası "
                f"({_fmt_signed(modifiers['crowding'])})"
            )

        return {
            "symbol": feats.symbol,
            "score": round(score, 2),
            "bar_time": feats.bar_time.isoformat() if feats.bar_time else None,
            "families": {k: round(v, 2) for k, v in families.items()},
            "modifiers": modifiers,
            "top_drivers": drivers[:4],
            "percentiles": {k: round(v, 1) for k, v in sorted(pct.items())},
            "sr": feats.sr,
            "config_hash": cfg_hash,
        }


def _fmt_signed(value: float) -> str:
    return f"{value:+.1f}"


def _pattern_label(kind: str) -> str:
    return {
        "double_bottom": "çift dip",
        "double_top": "çift tepe",
        "head_shoulders": "omuz-baş-omuz",
        "inverse_head_shoulders": "ters omuz-baş-omuz",
        "ascending_triangle": "yükselen üçgen",
        "descending_triangle": "alçalan üçgen",
        "symmetrical_triangle": "simetrik üçgen",
        "bull_flag": "boğa bayrağı",
        "bear_flag": "ayı bayrağı",
        "falling_wedge": "alçalan kama",
        "rising_wedge": "yükselen kama",
    }.get(kind, kind)
