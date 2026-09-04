"""Boyutlandırma motoru — MASTER-SPEC §6.

Taban **eşit risk**tir; her sapmanın bir gerekçesi vardır (§6.1). Puanla doğru
orantılı dağıtım bilinçli olarak reddedilmiştir: puanlar 85/82/81 gelirse
orantısal ağırlıklar zaten eşit ağırlık olur, eşikten fark alınırsa kural
gürültüye aşırı duyarlı ve kırılgan hâle gelir.

Bu modül **saftır**: DB, ağ, saat yok. Girdi bir `SizingInput`, çıktı bir
`SizingDecision`. Böylece `hypothesis` ile "hiçbir koşulda %30'u aşamaz"
gibi özellikler kanıtlanabilir.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# §6.4 sabit parametreler (v1).
DEFAULT_RISK_PCT = 0.01
# Bkz. `EntrySpec.max_positions`: slot sayısı ölçümle 4'e indirildi; ikisi
# birlikte değişmeli, yoksa boyutlandırma ile giriş mantığı farklı sayıya göre
# çalışır ve maruziyet beklenenden düşük kalır.
DEFAULT_MAX_POSITIONS = 4
DEFAULT_MAX_POSITION_PCT = 0.30
DEFAULT_MAX_EXPOSURE_PCT = 0.80
DEFAULT_CLUSTER_EXPOSURE_PCT = 0.50
# Stop girişin bu kadarından uzaksa pozisyon **reddedilir** (§6.2 adım 2).
#
# Bu kapak `ExitSpec.stop_atr_multiple` ile bağımsız değildir ve ikisini ayrı
# seçmek sessizce işlem eler. Havuzda ATR/fiyat medyanı %0,99, %90 dilimi
# %2,46; yani 2 ATR stop neredeyse hiçbir şeyi elemez ama 6 ATR girişlerin
# üçte birini, 8 ATR yarısını eler. Eleme üstelik **taraflıdır**: yüksek ATR'li
# semboller elenir, büyük kazançları taşıyanlar onlardır.
#
# 60 gün / 605 giriş, kapak %8 sabitken işlem başına net getiri:
#     2 ATR →  +0,694%  (3 red)      6 ATR →  −0,623%  (194 red)
#     3 ATR →  −0,093%  (44 red)     8 ATR →  −0,504%  (296 red)
# Kapak kaldırıldığında sıralama tersine döner (8 ATR en iyi) — yani "geniş
# stop iyidir" sonucu yalnızca kapağı yok sayınca doğru. Stop genişletmeden
# önce bu kapağa bakılır.
# Kısıtlar sonrası kalan boyut, hedeflenen boyutun en az bu kadarı olmalı.
#
# Kısıtlar boyutu **kırpıyordu ama tabanı yoktu**: serbest nakit 20 $ kaldıysa
# 20 $'lık pozisyon açılıyordu. Ölçüldü (2026-08-19): aynı sembolde (LDOUSDT),
# neredeyse aynı barda, botlara göre büyüklükler 20 $ ile 1.514 $ arasında
# değişti — 75 kat. 20 $'lık pozisyon hiçbir şey kazandıramaz ama beş
# pozisyonluk defterde bir slotu 72 saat boyunca işgal eder ve o slot gerçek
# bir fırsata kapanır.
#
# Sermaye bittiyse doğru davranış küçük bir pozisyon açmak değil, **açmamak**:
# slot boş kalır ve nakit serbestleştiğinde kullanılabilir.
DEFAULT_MIN_FILL_RATIO = 0.25

DEFAULT_MAX_STOP_PCT = 0.08
DEFAULT_TARGET_VOL = 0.60

# §6.2 adım 3: volatilite ölçekleyicisi bu bantla sınırlıdır.
VOL_SCALAR_MIN, VOL_SCALAR_MAX = 0.5, 1.5
# §6.2 adım 6: likidite tavanı — 1 saatlik hacmin %2'si.
ADV_FRACTION = 0.02
# §6.2 adım 4: puan kademeleri (lineer değil — gürültüye dayanıklı).
#
# Kademeler **giriş kapısının üstündeki gerçek dağılıma** çapalanır, yoksa
# ladder işlevsiz kalır. Ölçülen dağılım (60 gün, 1h, puan ≥ 80):
#     80–82: 347   82–84: 202   84–86: 116   86–88: 61   88+: 30
# Eski varsayılan (80/85/92) işlemlerin %87'sini en küçük kademeye koyuyor,
# 92 üstü ise 60 günde altı kez görülüyordu — yani en büyük kademe pratikte
# hiç kullanılmıyordu. Yeni çapalar kapı, medyan ve üst çeyrektir.
#
# Ölçekleme yönü de veriyle uyumlu: işlem başına net getiri kapı 80'de +%0,72,
# 82'de +%1,10, 85'te +%1,53. Yüksek puan daha büyük pozisyonu hak ediyor.
DEFAULT_TIERS: tuple[tuple[float, float], ...] = ((80.0, 0.75), (82.0, 1.00), (85.0, 1.25))


@dataclass(slots=True)
class SizingParams:
    risk_pct: float = DEFAULT_RISK_PCT
    max_positions: int = DEFAULT_MAX_POSITIONS
    max_position_pct: float = DEFAULT_MAX_POSITION_PCT
    max_exposure_pct: float = DEFAULT_MAX_EXPOSURE_PCT
    cluster_exposure_pct: float = DEFAULT_CLUSTER_EXPOSURE_PCT
    max_stop_pct: float = DEFAULT_MAX_STOP_PCT
    min_fill_ratio: float = DEFAULT_MIN_FILL_RATIO
    target_vol: float = DEFAULT_TARGET_VOL
    tiers: tuple[tuple[float, float], ...] = DEFAULT_TIERS
    adv_fraction: float = ADV_FRACTION
    min_notional: float = 10.0

    @classmethod
    def from_definition(cls, sizing: dict | None) -> SizingParams:
        if not sizing:
            return cls()
        tiers = sizing.get("tiers")
        return cls(
            risk_pct=float(sizing.get("risk_pct", DEFAULT_RISK_PCT)),
            max_positions=int(sizing.get("max_positions", DEFAULT_MAX_POSITIONS)),
            max_position_pct=float(sizing.get("max_position_pct", DEFAULT_MAX_POSITION_PCT)),
            max_exposure_pct=float(sizing.get("max_exposure_pct", DEFAULT_MAX_EXPOSURE_PCT)),
            cluster_exposure_pct=float(
                sizing.get("cluster_exposure_pct", DEFAULT_CLUSTER_EXPOSURE_PCT)
            ),
            max_stop_pct=float(sizing.get("max_stop_pct", DEFAULT_MAX_STOP_PCT)),
            min_fill_ratio=float(sizing.get("min_fill_ratio", DEFAULT_MIN_FILL_RATIO)),
            target_vol=float(sizing.get("vol_target", DEFAULT_TARGET_VOL)),
            tiers=tuple((float(a), float(b)) for a, b in tiers) if tiers else DEFAULT_TIERS,
        )


@dataclass(slots=True)
class SizingInput:
    symbol: str
    score: float
    entry: float
    stop: float
    equity: float
    free_cash: float
    current_exposure: float
    cluster_exposure: float
    realized_vol_20d: float  # yıllık oran (0.85 = %85)
    adv_1h: float  # 1 saatlik ortalama işlem hacmi (quote)
    open_positions: int = 0
    btc_below_ema200: bool = False
    btc_vol_above_p90: bool = False
    step_size: float = 0.0
    min_notional: float = 0.0
    #: Girişin kaldıracı (1 = spot davranışı). Kaldıraç RİSKİ çarpmaz;
    #: yalnız nakit ve tek-pozisyon tavanını kaldırır (sizing/leverage.py).
    leverage: float = 1.0
    #: Risk bütçesi çarpanı (LeverageSpec.scale_risk ile kaldıraç kadar; yoksa 1).
    risk_scale: float = 1.0
    #: +1 uzun, −1 kısa. Stop koruyucu tarafta olmalı; tavanlar brüt notional.
    direction: int = 1


@dataclass(slots=True)
class SizingDecision:
    symbol: str
    accepted: bool = False
    qty: float = 0.0
    notional: float = 0.0
    stop: float = 0.0
    risk_amount: float = 0.0
    reject_reason: str = ""
    steps: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "accepted": self.accepted,
            "qty": self.qty,
            "notional": self.notional,
            "stop": self.stop,
            "risk_amount": self.risk_amount,
            "reject_reason": self.reject_reason,
            "steps": self.steps,
        }


def score_tier(score: float, tiers: tuple[tuple[float, float], ...] = DEFAULT_TIERS) -> float:
    """§6.2 adım 4. Eşiğin altındaysa 0 — pozisyon açılmaz."""
    multiplier = 0.0
    for threshold, value in sorted(tiers):
        if score >= threshold:
            multiplier = value
    return multiplier


def vol_scalar(target_vol: float, realized_vol: float) -> float:
    """§6.2 adım 3 — eşit dolar ≠ eşit risk."""
    if not math.isfinite(realized_vol) or realized_vol <= 0:
        return 1.0
    return max(VOL_SCALAR_MIN, min(VOL_SCALAR_MAX, target_vol / realized_vol))


def regime_multiplier(btc_below_ema200: bool, btc_vol_above_p90: bool) -> float:
    """§6.2 adım 5."""
    regime = 1.0
    if btc_below_ema200:
        regime *= 0.5
    if btc_vol_above_p90:
        regime *= 0.7
    return regime


def round_to_step(qty: float, step: float) -> float:
    """Borsa lot adımına aşağı yuvarla. Yukarı yuvarlamak limitleri aşabilir."""
    if step <= 0:
        return qty
    return math.floor(qty / step) * step


class SizingEngine:
    def __init__(self, params: SizingParams | None = None) -> None:
        self.params = params or SizingParams()

    def size(self, inp: SizingInput) -> SizingDecision:
        p = self.params
        steps: list[dict] = []
        d = SizingDecision(symbol=inp.symbol, stop=inp.stop)

        # --- Ön koşullar ---
        if inp.entry <= 0:
            return _reject(d, "geçersiz giriş fiyatı", steps)
        if inp.stop <= 0:
            return _reject(d, "stop hesaplanamadı (destek seviyesi yok)", steps)
        if inp.direction * (inp.entry - inp.stop) <= 0:
            # Bozulmaz: stop her zaman girişin koruyucu tarafındadır.
            return _reject(
                d,
                "stop girişin altında değil" if inp.direction > 0 else "stop girişin üstünde değil",
                steps,
            )
        if inp.open_positions >= p.max_positions:
            return _reject(d, f"maksimum eşzamanlı pozisyon ({p.max_positions})", steps)

        stop_distance_pct = inp.direction * (inp.entry - inp.stop) / inp.entry
        if stop_distance_pct > p.max_stop_pct:
            return _reject(
                d,
                f"stop çok uzak (%{stop_distance_pct * 100:.1f} > %{p.max_stop_pct * 100:.0f})",
                steps,
            )

        tier = score_tier(inp.score, p.tiers)
        if tier <= 0:
            return _reject(d, f"puan kademe eşiğinin altında ({inp.score:.1f})", steps)

        # --- 1) Risk bütçesi ---
        risk_amount = inp.equity * p.risk_pct * max(inp.risk_scale, 1.0)
        steps.append({"step": "risk_bütçesi", "value": risk_amount})
        if inp.risk_scale > 1.0:
            steps.append({"step": "risk_çarpanı", "value": inp.risk_scale})

        # --- 2) Stop'tan boyut ---
        qty = risk_amount / (inp.direction * (inp.entry - inp.stop))
        notional = qty * inp.entry
        steps.append({"step": "stop_boyutu", "value": notional})

        # --- 3) Volatilite normalizasyonu ---
        vs = vol_scalar(p.target_vol, inp.realized_vol_20d)
        # --- 4) Puan kademesi ---
        # --- 5) Rejim çarpanı ---
        regime = regime_multiplier(inp.btc_below_ema200, inp.btc_vol_above_p90)

        notional *= vs * tier * regime
        hedef_notional = notional
        steps.append({"step": "vol_scalar", "value": vs})
        steps.append({"step": "tier", "value": tier})
        steps.append({"step": "regime", "value": regime})
        steps.append({"step": "ölçekli_notional", "value": notional})

        # --- 6) Kısıtlar (sırayla, hepsi zorunlu) ---
        lev = max(1.0, inp.leverage)
        caps = [
            # Kaldıraç iki tavanı kaldırır: nakit (marj yeter) ve tek pozisyon.
            # Toplam maruziyet ve likidite tavanı OLDUĞU GİBİ kalır — kaldıraçlı
            # strateji brüt maruziyeti kendi max_exposure_pct'siyle (>1 olabilir)
            # bilinçli açar; burada sessizce açılmaz.
            ("tek_pozisyon_tavanı", inp.equity * p.max_position_pct * lev),
            ("serbest_nakit", inp.free_cash * lev),
            ("toplam_maruziyet", inp.equity * p.max_exposure_pct - inp.current_exposure),
            ("likidite_tavanı", inp.adv_1h * p.adv_fraction),
        ]
        for name, cap in caps:
            if cap < notional:
                notional = cap
                steps.append({"step": name, "value": notional, "binding": True})
            else:
                steps.append({"step": name, "value": cap, "binding": False})

        if notional <= 0:
            return _reject(d, "kısıtlar sonrası boyut sıfır", steps)

        # Kırpılmış boyut hedefin küçük bir kırıntısıysa pozisyon açmak zarardır:
        # kazanç ihmal edilebilir, ama slot 72 saate kadar dolu kalır.
        taban = hedef_notional * p.min_fill_ratio
        if notional < taban:
            return _reject(
                d,
                f"kısıtlar boyutu hedefin %{notional / hedef_notional * 100:.0f}'ine düşürdü "
                f"(en az %{p.min_fill_ratio * 100:.0f} gerekiyor) — slot boş bırakıldı",
                steps,
            )

        # Korelasyon kümesi limiti — aşılırsa **reddedilir**, kırpılmaz (§6.2).
        cluster_cap = inp.equity * p.cluster_exposure_pct
        if inp.cluster_exposure + notional > cluster_cap:
            return _reject(d, "korelasyon kümesi limiti", steps)

        qty = notional / inp.entry
        step_size = inp.step_size or p.min_notional * 0
        if step_size > 0:
            qty = round_to_step(qty, step_size)
            notional = qty * inp.entry

        min_notional = max(inp.min_notional, p.min_notional)
        if notional < min_notional:
            return _reject(d, f"minimum emir tutarının altında ({notional:.2f})", steps)

        d.accepted = True
        d.qty = qty
        d.notional = notional
        d.risk_amount = qty * inp.direction * (inp.entry - inp.stop)
        d.steps = steps
        return d


def _reject(d: SizingDecision, reason: str, steps: list[dict]) -> SizingDecision:
    d.accepted = False
    d.reject_reason = reason
    d.steps = steps
    d.qty = 0.0
    d.notional = 0.0
    return d
