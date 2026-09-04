"""Çıkış kuralları — MASTER-SPEC §7.

Beş çıkış yolu, **öncelik sırasıyla** değerlendirilir:

  1. Stop            — `nearest_support − 0.5×ATR`
  2. Başabaş kilidi  — +1.5R'de stop girişe çekilir
  3. Trailing        — başabaş sonrası 2.5×ATR takip eden stop
  4. Puan çıkışı     — bar kapanışında `score < 55`
  5. Zaman çıkışı    — 48 saat

Ayrıca **rotasyon**: portföy doluyken yeni aday, en düşük puanlı pozisyondan
en az 10 puan yüksekse değiştirilir (histerezis).

Saf modül: girdi `PositionView` + `MarketView`, çıktı `ExitDecision`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

from sarnic.core.enums import ExitReason
from sarnic.strategy.definition import ExitSpec, RotationSpec


@dataclass(slots=True)
class PositionView:
    symbol: str
    qty: float
    entry_price: float
    entry_time: datetime
    stop: float
    initial_stop: float
    breakeven_locked: bool = False
    partial_done: bool = False
    #: +1 uzun, −1 kısa. Her fiyat farkı bu çarpanla okunur; uzun için
    #: aritmetik bugünkü hâliyle birebir (KISA-YON-PLANI §0).
    direction: int = 1

    @property
    def initial_risk(self) -> float:
        """1R = stopun girişten koruyucu yöndeki uzaklığı. Ömür boyu sabittir."""
        return max(self.direction * (self.entry_price - self.initial_stop), 1e-12)

    def r_multiple(self, price: float) -> float:
        return self.direction * (price - self.entry_price) / self.initial_risk


@dataclass(slots=True)
class MarketView:
    price: float
    atr: float
    score: float | None = None
    bar_closed: bool = False
    delisted: bool = False


@dataclass(slots=True)
class ExitDecision:
    should_exit: bool
    reason: ExitReason | None = None
    message: str = ""
    new_stop: float | None = None
    breakeven_locked: bool = False
    #: >0 ise pozisyonun bu kesri satılır (kısmi kâr alma); çıkış değildir.
    partial_fraction: float = 0.0

    @property
    def stop_moved(self) -> bool:
        return self.new_stop is not None


def evaluate_exit(
    position: PositionView,
    market: MarketView,
    spec: ExitSpec,
    now: datetime,
) -> ExitDecision:
    """Öncelik sırasına göre tek bir karar döner."""
    # --- 0) Delist: Binance'in canlı davranışıyla aynı, her şeyin önünde ---
    if market.delisted:
        return ExitDecision(True, ExitReason.DELIST, "sembol delist edildi")

    # --- 1) Stop: fiyat stopun kötü tarafına geçti (uzun ≤, kısa ≥) ---
    if position.direction * (market.price - position.stop) <= 0:
        reason = ExitReason.STOP
        if position.breakeven_locked:
            # Başabaş/trailing sonrası tetiklenen stop ayrı raporlanır — çıkış
            # sebebi dağılımı grafiğinin bilgi taşıması için (§7).
            reason = (
                ExitReason.BREAKEVEN
                if math.isclose(position.stop, position.entry_price, rel_tol=1e-9)
                else ExitReason.TRAILING
            )
        isaret = "≤" if position.direction > 0 else "≥"
        return ExitDecision(
            True, reason, f"stop tetiklendi: {market.price:.8f} {isaret} {position.stop:.8f}"
        )

    # --- 4) Puan çıkışı (yalnızca bar kapanışında) ---
    if market.bar_closed and market.score is not None and market.score < spec.score_exit:
        return ExitDecision(
            True,
            ExitReason.SCORE,
            f"puan {market.score:.1f} < {spec.score_exit:.0f}",
        )

    # --- 5) Zaman çıkışı ---
    held_hours = (now - position.entry_time).total_seconds() / 3600
    if held_hours >= spec.max_hold_hours:
        return ExitDecision(
            True,
            ExitReason.TIME,
            f"{held_hours:.1f} saat doldu (limit {spec.max_hold_hours})",
        )

    # --- 2) Başabaş kilidi ve 3) Trailing: çıkış değil, stop güncellemesi ---
    new_stop = update_stop(position, market, spec)

    # --- 6) Kısmi kâr alma (bar kapanışında, bir kez): stop güncellemesiyle
    # aynı kararda taşınır — ikisi de "pozisyon açık kalır" kararıdır.
    kesir = 0.0
    if (
        market.bar_closed
        and spec.partial_tp_r > 0
        and not position.partial_done
        and position.r_multiple(market.price) >= spec.partial_tp_r
    ):
        kesir = spec.partial_fraction

    if new_stop is not None or kesir > 0:
        parcalar = []
        if kesir > 0:
            parcalar.append(f"kısmi kâr: %{kesir * 100:.0f} satıldı (+{spec.partial_tp_r:g}R)")
        if new_stop is not None:
            parcalar.append(f"stop {position.stop:.8f} → {new_stop:.8f}")
        return ExitDecision(
            False,
            None,
            " · ".join(parcalar),
            new_stop=new_stop,
            breakeven_locked=new_stop is not None,
            partial_fraction=kesir,
        )

    return ExitDecision(False)


def update_stop(position: PositionView, market: MarketView, spec: ExitSpec) -> float | None:
    """Başabaş kilidi ve trailing. Stop **asla koruyucu yönün tersine çekilmez**.

    `breakeven_r <= 0` kilidi, `trail_atr <= 0` trailing'i kapatır. Kapatma
    açıkça mümkün olmalı: 0 "hemen kilitle" diye yorumlansaydı stop daha ilk
    barda girişe çekilir ve pozisyon her geri çekilmede sıfırlanırdı — kapatmak
    isteyen birinin eline geçebilecek en kötü sonuç.
    """
    if market.price <= 0:
        return None

    candidate: float | None = None

    if not position.breakeven_locked:
        # Eşiğe ulaşınca stop girişe çekilir.
        if spec.breakeven_r > 0 and position.r_multiple(market.price) >= spec.breakeven_r:
            candidate = position.entry_price
    elif market.atr > 0 and spec.trail_atr > 0:
        # Başabaş sonrası ATR katı kadar takip eden stop (kısa: fiyatın üstünde).
        candidate = market.price - position.direction * spec.trail_atr * market.atr

    if candidate is None:
        return None
    # Monotonluk: yalnızca koruyucu yönde (uzun yukarı, kısa aşağı).
    if position.direction * (candidate - position.stop) <= 0:
        return None
    # Stop hiçbir zaman güncel fiyatı geçemez.
    if position.direction * (market.price - candidate) <= 0:
        return None
    return candidate


def rotation_candidate(
    open_positions: list[tuple[str, float]],
    candidate_symbol: str,
    candidate_score: float,
    spec: RotationSpec,
    max_positions: int,
) -> str | None:
    """Portföy doluyken hangi pozisyon feda edilir?

    Aday, mevcut **en düşük** puanlı pozisyondan en az `min_score_gap` puan
    yüksek olmalı. Bu histerezis sürekli girip çıkmayı ve devir maliyetini önler.
    Koşul sağlanmazsa `None` döner ve giriş yapılmaz.
    """
    if not spec.enabled:
        return None
    if len(open_positions) < max_positions:
        return None
    if any(symbol == candidate_symbol for symbol, _ in open_positions):
        return None

    weakest_symbol, weakest_score = min(open_positions, key=lambda x: x[1])
    if candidate_score - weakest_score >= spec.min_score_gap:
        return weakest_symbol
    return None
