"""Havuz filtre zinciri — MASTER-SPEC §3.2.

Tasarım ilkesi (§3.1): havuz bir **alfa filtresi değil, işlenebilirlik filtresidir.**
Tek sorusu "bu coini spread ve slipaj beni öldürmeden alıp satabilir miyim?"dir.
Buraya momentum/getiri filtresi eklemek yasaktır — o ScoringEngine'in işidir.

Bu modül saftır: DB, ağ, saat yok. Girdi `Candidate` listesi, çıktı `Candidate`
listesi + huni raporu. Bu sayede determinizm testi yazılabilir.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field, replace
from typing import Protocol

# Kaldıraçlı token son ekleri (§3.2 filtre 2). Sembolün BAŞ varlığında aranır.
#
# Dikkat: düz "sonu UP ile biterse ele" kuralı JUP (Jupiter) gibi meşru varlıkları
# yanlışlıkla eler. Kaldıraçlı token adı her zaman `<TABAN><EK>` biçimindedir ve
# taban en az iki karakterdir — eleme koşuluna bunu da koyuyoruz.
LEVERAGED_SUFFIXES: tuple[str, ...] = ("UP", "DOWN", "BULL", "BEAR", "3L", "3S", "5L", "5S")
MIN_BASE_LENGTH = 2

# Stable-stable çiftlerini elemek için (§3.2 filtre 3).
STABLECOINS = frozenset(
    {
        "USDT",
        "USDC",
        "BUSD",
        "FDUSD",
        "TUSD",
        "DAI",
        "USDP",
        "UST",
        "USTC",
        "PAX",
        "GUSD",
        "EURI",
        "EUR",
        "TRY",
        "AEUR",
        "USD1",
        "USDE",
        "PYUSD",
    }
)


@dataclass(slots=True)
class UniverseConfig:
    """Filtre parametreleri. `config_hash` bunun üzerinden hesaplanır."""

    quote_asset: str = "USDT"
    volume_prefilter_n: int = 250  # filtre 5: N
    min_age_days: int = 60  # filtre 6: X
    max_spread_pct: float = 0.30  # filtre 7: S
    min_spread_samples: int = 10
    # filtre 8: T — 2026-08-16'da %0,05'ten %0,10'a çekildi (kullanıcı kararı).
    # Gerekçe: tick oranı, ulaşılabilecek **en dar spread'in alt sınırıdır**;
    # bir sembolün spread'i bir tick'ten küçük olamaz. %0,05'lik eşik, spread
    # eşiğinden (%0,30) altı kat sıkıydı ve aynı riski ikinci kez, çok daha
    # sert biçimde uyguluyordu. Havuzun en büyük kesimi buradaydı: 170 → 87.
    # Bkz. docs/OPEN-QUESTIONS.md §9.20.
    max_tick_ratio_pct: float = 0.10  # filtre 8: T
    min_volatility_pct: float = 30.0  # filtre 9: V1
    max_volatility_pct: float = 250.0  # filtre 9: V2
    min_range_3d_pct: float = 3.0  # filtre 10: R1
    max_range_3d_pct: float = 200.0  # filtre 10: R2
    top_n: int = 100  # filtre 12
    hysteresis_band: int = 120  # §3.3: 100–120 bandında kalan çıkarılmaz

    def hash(self) -> str:
        payload = json.dumps(asdict(self), sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()[:32]

    def merged(self, overrides: dict | None) -> UniverseConfig:
        if not overrides:
            return self
        valid = {k: v for k, v in overrides.items() if k in self.__slots__}
        return replace(self, **valid)


@dataclass(slots=True)
class Candidate:
    """Filtre zincirinden geçen aday. Tüm alanlar t anında bilinen verilerdir."""

    symbol: str
    base_asset: str = ""
    quote_asset: str = "USDT"
    status: str = "TRADING"
    is_spot_allowed: bool = True
    price: float = 0.0
    quote_volume: float = 0.0
    age_days: float = 9999.0
    spread_pct: float | None = None
    spread_samples: int = 0
    tick_size: float = 0.0
    volatility_ann_pct: float | None = None
    range_3d_pct: float | None = None
    delist_announced: bool = False
    rank: int = 0

    @property
    def tick_ratio_pct(self) -> float:
        if self.price <= 0:
            return float("inf")
        return self.tick_size / self.price * 100


@dataclass(slots=True)
class FunnelStep:
    index: int
    name: str
    kept: int
    dropped: int
    dropped_symbols: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "index": self.index,
            "name": self.name,
            "kept": self.kept,
            "dropped": self.dropped,
            # Panelde "neden elendi?" için ilk 25 örnek yeter.
            "examples": self.dropped_symbols[:25],
        }


class Filter(Protocol):
    name: str

    def apply(self, candidates: list[Candidate], cfg: UniverseConfig) -> list[Candidate]: ...


# --------------------------------------------------------------------------- #
#  Filtreler (uygulama sırası önemlidir)
# --------------------------------------------------------------------------- #
class MarketFilter:
    name = "MarketFilter"

    def apply(self, candidates, cfg):
        return [
            c
            for c in candidates
            if c.status == "TRADING" and c.is_spot_allowed and c.quote_asset == cfg.quote_asset
        ]


class LeveragedTokenFilter:
    name = "LeveragedTokenFilter"

    def apply(self, candidates, cfg):
        return [c for c in candidates if not is_leveraged_token(c.base_asset or c.symbol)]


class StablecoinFilter:
    name = "StablecoinFilter"

    def apply(self, candidates, cfg):
        return [c for c in candidates if (c.base_asset or "").upper() not in STABLECOINS]


class BlacklistFilter:
    name = "BlacklistFilter"

    def __init__(self, blacklist: set[str] | None = None) -> None:
        self.blacklist = {s.upper() for s in (blacklist or set())}

    def apply(self, candidates, cfg):
        return [c for c in candidates if c.symbol.upper() not in self.blacklist]


class QuoteVolumeFilter:
    """24s `quoteVolume` azalan sırada ilk N aday. Sıralama burada da atanır."""

    name = "QuoteVolumeFilter"

    def apply(self, candidates, cfg):
        ordered = sorted(candidates, key=lambda c: (-c.quote_volume, c.symbol))
        top = ordered[: cfg.volume_prefilter_n]
        for i, c in enumerate(top, start=1):
            c.rank = i
        return top


class AgeFilter:
    name = "AgeFilter"

    def apply(self, candidates, cfg):
        return [c for c in candidates if c.age_days >= cfg.min_age_days]


class SpreadFilter:
    """Ortalama spread ≤ %S. Yeterli örnek yoksa aday **elenir** (bilinmeyen risk alınmaz)."""

    name = "SpreadFilter"

    def apply(self, candidates, cfg):
        out = []
        for c in candidates:
            if c.spread_pct is None or c.spread_samples < cfg.min_spread_samples:
                continue
            if c.spread_pct <= cfg.max_spread_pct:
                out.append(c)
        return out


class TickSizeFilter:
    name = "TickSizeFilter"

    def apply(self, candidates, cfg):
        return [c for c in candidates if c.tick_ratio_pct <= cfg.max_tick_ratio_pct]


class VolatilityFilter:
    name = "VolatilityFilter"

    def apply(self, candidates, cfg):
        return [
            c
            for c in candidates
            if c.volatility_ann_pct is not None
            and cfg.min_volatility_pct <= c.volatility_ann_pct <= cfg.max_volatility_pct
        ]


class RangeStabilityFilter:
    name = "RangeStabilityFilter"

    def apply(self, candidates, cfg):
        return [
            c
            for c in candidates
            if c.range_3d_pct is not None
            and cfg.min_range_3d_pct <= c.range_3d_pct <= cfg.max_range_3d_pct
        ]


class DelistFilter:
    name = "DelistFilter"

    def apply(self, candidates, cfg):
        return [c for c in candidates if not c.delist_announced]


class TopNSelector:
    name = "TopNSelector"

    def apply(self, candidates, cfg):
        ordered = sorted(candidates, key=lambda c: (-c.quote_volume, c.symbol))
        for i, c in enumerate(ordered, start=1):
            c.rank = i
        return ordered[: cfg.top_n]


def is_leveraged_token(asset: str) -> bool:
    """`BTCUP`, `ETHDOWN`, `XRPBULL`, `ADABEAR`, `BTC3L`, `ETH3S` → True.

    `JUP`, `SOL`, `UNI` → False: son eki taşısalar bile geriye anlamlı bir taban
    varlık kalmıyorsa kaldıraçlı token değildir.
    """
    a = asset.upper()
    if a in STABLECOINS:
        return False
    return any(
        a.endswith(suffix) and len(a) - len(suffix) >= MIN_BASE_LENGTH
        for suffix in LEVERAGED_SUFFIXES
    )


def build_chain(blacklist: set[str] | None = None) -> list[Filter]:
    """§3.2'deki 12 filtre, tam sırasıyla."""
    return [
        MarketFilter(),
        LeveragedTokenFilter(),
        StablecoinFilter(),
        BlacklistFilter(blacklist),
        QuoteVolumeFilter(),
        AgeFilter(),
        SpreadFilter(),
        TickSizeFilter(),
        VolatilityFilter(),
        RangeStabilityFilter(),
        DelistFilter(),
        TopNSelector(),
    ]


@dataclass(slots=True)
class ChainResult:
    selected: list[Candidate]  # TopNSelector sonrası — havuz adayı
    ranked: list[Candidate]  # TopNSelector öncesi, sıralanmış tam liste (histerezis için)
    funnel: list[FunnelStep]


def run_chain(
    candidates: list[Candidate],
    cfg: UniverseConfig,
    blacklist: set[str] | None = None,
) -> ChainResult:
    """Zinciri çalıştırır ve her adımın elediği sayıyı raporlar (huni)."""
    chain = build_chain(blacklist)
    funnel: list[FunnelStep] = []
    current = list(candidates)
    ranked: list[Candidate] = []

    for i, flt in enumerate(chain, start=1):
        before = {c.symbol for c in current}
        if isinstance(flt, TopNSelector):
            # Kesmeden önceki tam sıralı liste histerezis bandının kaynağıdır.
            ranked = sorted(current, key=lambda c: (-c.quote_volume, c.symbol))
            for idx, c in enumerate(ranked, start=1):
                c.rank = idx
        current = flt.apply(current, cfg)
        after = {c.symbol for c in current}
        dropped = sorted(before - after)
        funnel.append(
            FunnelStep(
                index=i,
                name=flt.name,
                kept=len(current),
                dropped=len(dropped),
                dropped_symbols=dropped,
            )
        )
    return ChainResult(selected=current, ranked=ranked, funnel=funnel)


#: Bu filtrelerden düşen sembol **anında** havuzdan çıkar.
#:
#: Ayrım niteliktedir: delist edilmiş, kaldıraçlı ya da kara listedeki bir
#: sembolde beklemek anlamsız ve tehlikelidir. Diğerleri ise **ölçüm**
#: filtreleridir (spread, oynaklık, hacim, yaş) — eşiğin dibinde gezinen bir
#: sembol her yenilemede taraf değiştirebilir ve bu bir bilgi değil, gürültüdür.
HARD_FILTERS = frozenset(
    {"MarketFilter", "LeveragedTokenFilter", "StablecoinFilter", "BlacklistFilter", "DelistFilter"}
)

#: Ölçüm filtresinden düşen bir üye kaç yenileme boyunca korunur.
#:
#: Ölçüldü (2026-08-19): havuz üç gündür 86–87 arasında salınıyordu. BABYUSDT
#: 25 dakikada beş kez girip çıktı, OPGUSDT üç kez. Her salınım bir snapshot
#: yazıyordu — günde 31–68 snapshot — ve havuzdan çıkan sembol puanlamanın
#: kesitini de değiştiriyordu. Bir tur beklemek salınımı durdurur; gerçek bir
#: bozulma iki turda da sürer ve sembol yine çıkar.
SOFT_DROP_GRACE = 2


def apply_hysteresis(
    selected: list[Candidate],
    ranked_pool: list[Candidate],
    previous: set[str],
    cfg: UniverseConfig,
    protected: set[str] | None = None,
    funnel: list[FunnelStep] | None = None,
    soft_misses: dict[str, int] | None = None,
) -> list[Candidate]:
    """Yumuşatma — §3.3.

    * Havuzdaki bir coin sıralamada `top_n`–`hysteresis_band` bandına düşerse **çıkarılmaz**.
    * Bandın altına düşerse çıkar.
    * `protected` (açık pozisyonu olan) coinler her koşulda kalır — yeni giriş yapılmaz,
      ama pozisyon kapanana kadar havuzdadır.
    * Bir **ölçüm** filtresinden düşen mevcut üye `SOFT_DROP_GRACE` tur korunur;
      sert filtrelerden (delist, kara liste, kaldıraçlı) düşen anında çıkar.

    `soft_misses` çağıran tarafından tutulan sayaçtır: aynı sembol üst üste
    düşerse süre dolar. Sayaç motorun içinde yaşar, süreç yeniden başlarsa
    sıfırlanır — en kötü ihtimalle bir fazladan salınım olur.
    """
    protected = protected or set()
    chosen = {c.symbol: c for c in selected}
    by_symbol = {c.symbol: c for c in ranked_pool}
    dropped_by = _dropped_by(funnel or [])

    for symbol in previous | protected:
        if symbol in chosen:
            continue
        cand = by_symbol.get(symbol)
        if cand is None:
            # Zincirden düştü. Açık pozisyon varsa her hâlükârda tutulur;
            # aday nesnesi elde olmadığı için burada eklenemez, o iş çağırana
            # aittir (`protected` zaten `selected` dışında da korunur).
            continue
        if symbol in protected:
            chosen[symbol] = cand
            continue
        if cfg.top_n < cand.rank <= cfg.hysteresis_band:
            chosen[symbol] = cand

    # Zincirden tamamen düşen mevcut üyeler: ölçüm filtresiyse bir süre koru.
    if soft_misses is not None:
        for symbol in previous:
            if symbol in chosen:
                soft_misses.pop(symbol, None)
                continue
            filtre = dropped_by.get(symbol)
            if filtre is None or filtre in HARD_FILTERS:
                soft_misses.pop(symbol, None)
                continue
            kacinci = soft_misses.get(symbol, 0) + 1
            if kacinci < SOFT_DROP_GRACE:
                soft_misses[symbol] = kacinci
                cand = by_symbol.get(symbol) or _placeholder(symbol, cfg)
                chosen[symbol] = cand
            else:
                soft_misses.pop(symbol, None)

    return sorted(chosen.values(), key=lambda c: (c.rank, c.symbol))


def _dropped_by(funnel: list[FunnelStep]) -> dict[str, str]:
    """Sembol → onu eleyen ilk filtrenin adı."""
    out: dict[str, str] = {}
    for step in funnel:
        for symbol in step.dropped_symbols:
            out.setdefault(symbol, step.name)
    return out


def _placeholder(symbol: str, cfg: UniverseConfig) -> Candidate:
    """Ölçümü bu turda alınamamış ama havuzda tutulan üye.

    Sıra numarası bandın sonuna konur: üye korunuyor ama sıralamada öne
    geçmiyor — koruma bir ödül değil, yalnızca gürültüye karşı bir tampon.
    """
    cand = Candidate(symbol=symbol)
    cand.rank = cfg.hysteresis_band
    return cand
