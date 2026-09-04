"""Kaldıraç kararı — teyit ÜÇLÜSÜ olmadan kaldıraç yok.

Sahibin kararıyla kapsama girdi (2026-08-27; CLAUDE.md'nin "kaldıraç
kapsam dışı" satırı bu kararla eskidi — defterde kayıtlı). Paper motorunda
simüle edilir; canlı para hâlâ yok.

Tasarım ilkesi: **risk sabit kalır** — işlem başına riske edilen para
(risk_pct × özsermaye) kaldıraçla ÇARPILMAZ. Kaldıraç yalnızca nakit ve
pozisyon tavanlarını kaldırır: stopu dar, teyidi tam bir girişte risk
bütçesinin istediği boyut nakdi aşabilsin diye. Kanıtlanmamış kenarı
katlamak değil, dar-stoplu yüksek-teyitli girişin önünü açmak.

Üç şart (üçü birden, sahibin tarifi: "puanı yüksek + destek-direnç +
formasyon"):
  1. Puan `min_score` ve üstünde (kademeli: daha yüksek puan → daha çok).
  2. Formasyon teyidi: pattern_modifier > 0 (boğa formasyonu aktif).
  3. S/R teyidi: en yakın dirence yer var (headroom ≥ `min_headroom_atr`
     × ATR) — dirence yapışık bir fiyata kaldıraçla girilmez.

Emniyet: stop mesafesi başlangıç marjının içine sığmak ZORUNDA
(`stop_margin_fit`, varsayılan 0,8): stop, likidasyon fiyatının güvenli
tarafında kalır; sığmıyorsa kaldıraç sığana kadar DÜŞÜRÜLÜR. Böylece
likidasyon ancak stopu da atlayan bir boşlukta mümkündür — o da
`stop_fill_price` ile açılıştan dolar ve kayıp dürüstçe kaydedilir.

Borç maliyeti gerçektir: `borrow_cost` saatlik oranla tahakkuk eder ve
kapanışta komisyonlara eklenir. Bedava kaldıraç yalanı yok.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class LeverageSpec:
    """`sizing.leverage` bloğu. Yokken her şey birebir eski davranış."""

    max_leverage: float = 1.0  # 1 = kapalı
    min_score: float = 88.0
    #: [puan, kaldıraç] kademeleri; puan arttıkça kaldıraç artar.
    tiers: list[list[float]] = field(default_factory=lambda: [[88.0, 2.0], [93.0, 3.0]])
    min_headroom_atr: float = 2.0
    require_pattern: bool = True
    #: Stop mesafesi ≤ başlangıç marjı × bu oran (likidasyon tamponu).
    stop_margin_fit: float = 0.8
    #: Saatlik borç oranı (0.0000208 ≈ günlük %0,05 — Binance USDT marjını
    #: taklit eder; temkinli taraf).
    hourly_rate: float = 0.0000208
    #: True ise kaldıraç RİSKİ de çarpar: işlem başına risk = risk_pct × kaldıraç.
    #: Varsayılan (False) tasarım kararıdır — kaldıraç yalnız tavanları kaldırır.
    #: Sahibin "paper'da korumacı olma" isteğiyle agresif kollar için açıldı
    #: (2026-09-04); kazanç ve kayıp aynı çarpanla büyür, kesiciler yine bekler.
    scale_risk: bool = False

    @classmethod
    def from_sizing(cls, sizing: dict | None) -> LeverageSpec:
        blok = (sizing or {}).get("leverage") or {}
        if not blok:
            return cls()
        return cls(
            max_leverage=float(blok.get("max_leverage", 1.0)),
            min_score=float(blok.get("min_score", 88.0)),
            tiers=[[float(a), float(b)] for a, b in blok.get("tiers", [[88.0, 2.0], [93.0, 3.0]])],
            min_headroom_atr=float(blok.get("min_headroom_atr", 2.0)),
            require_pattern=bool(blok.get("require_pattern", True)),
            stop_margin_fit=float(blok.get("stop_margin_fit", 0.8)),
            hourly_rate=float(blok.get("hourly_rate", 0.0000208)),
            scale_risk=bool(blok.get("scale_risk", False)),
        )

    @property
    def enabled(self) -> bool:
        return self.max_leverage > 1.0


@dataclass(slots=True)
class LeverageDecision:
    leverage: float
    reason: str


def decide_leverage(
    spec: LeverageSpec,
    *,
    score: float,
    pattern_modifier: float | None,
    headroom_atr: float | None,
    entry: float,
    stop: float,
) -> LeverageDecision:
    """Teyit üçlüsü + marj sığması → nihai kaldıraç.

    Her ret gerekçelidir; panel/log "neden 1×" sorusuna cevap verebilir.
    """
    if not spec.enabled:
        return LeverageDecision(1.0, "kaldıraç kapalı")
    if score < spec.min_score:
        return LeverageDecision(1.0, f"puan {score:.1f} < eşik {spec.min_score:.0f}")
    if spec.require_pattern and not (pattern_modifier or 0.0) > 0:
        return LeverageDecision(1.0, "formasyon teyidi yok")
    # Eşik 0 ise S/R teyidi kapalıdır: 'direnç bulunamadı' (None) açık gökyüzüdür,
    # ret sebebi değil. Eşikli spec'te None hâlâ teyitsizdir → 1×.
    if spec.min_headroom_atr > 0 and (headroom_atr is None or headroom_atr < spec.min_headroom_atr):
        return LeverageDecision(
            1.0,
            f"dirence yer yok ({'—' if headroom_atr is None else f'{headroom_atr:.1f}'} ATR "
            f"< {spec.min_headroom_atr:.1f})",
        )

    # Kademe: geçilen en yüksek puan eşiğinin kaldıracı.
    lev = 1.0
    for esik, kat in sorted(spec.tiers):
        if score >= esik:
            lev = kat
    lev = min(lev, spec.max_leverage)
    if lev <= 1.0:
        return LeverageDecision(1.0, "kademe eşiği geçilmedi")

    # Marj sığması: stop mesafesi başlangıç marjının içinde kalmalı.
    # (entry-stop)/entry ≤ (1/lev) × fit → sığana kadar düşür.
    if entry <= 0 or stop >= entry:
        return LeverageDecision(1.0, "stop/giriş geçersiz")
    stop_pct = (entry - stop) / entry
    while lev > 1.0 and stop_pct > (1.0 / lev) * spec.stop_margin_fit:
        lev = round(lev - 1.0, 4) if lev > 2.0 else 1.0
    if lev <= 1.0:
        return LeverageDecision(1.0, f"stop marja sığmadı (mesafe %{stop_pct * 100:.1f})")
    return LeverageDecision(lev, f"teyit tam: puan {score:.1f}, {lev:g}×")


def borrow_cost(notional: float, leverage: float, hold_hours: float, hourly_rate: float) -> float:
    """Borç maliyeti: yalnız BORÇ ALINAN kısım için, tutulan saat kadar."""
    if leverage <= 1.0 or notional <= 0 or hold_hours <= 0:
        return 0.0
    borrowed = notional * (1.0 - 1.0 / leverage)
    return borrowed * hourly_rate * hold_hours


def liquidation_price(entry: float, leverage: float, maintenance_fraction: float = 0.9) -> float:
    """Uzun pozisyonun yaklaşık likidasyon fiyatı (bilgi amaçlı).

    Başlangıç marjının `maintenance_fraction`'ı tükenince: 3× için giriş
    fiyatının %30'unun %90'ı kadar altı. Stop sığma kuralı sayesinde
    normalde hiç görülmez; panel yine de gösterir — kullanıcı borcun
    nerede bittiğini bilmeli.
    """
    if leverage <= 1.0:
        return 0.0
    return entry * (1.0 - (1.0 / leverage) * maintenance_fraction)
