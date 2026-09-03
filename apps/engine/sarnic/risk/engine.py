"""Risk motoru ve devre kesiciler — MASTER-SPEC §8.

| Tetik | Eşik | Eylem |
|---|---|---|
| Günlük zarar | −%4 | 24 saat yeni giriş yok; mevcut pozisyonlar yönetilmeye devam |
| Haftalık zarar | −%8 | Tüm girişler durur, **manuel yeniden başlatma** gerekir |
| Maksimum drawdown | −%15 | Kill switch: tüm botlar STOPPED, pozisyonlar kapatılır |
| Ardışık zarar | 5 işlem | İlgili bot 6 saat duraklatılır |
| Bayat veri | 60 sn | Yeni emir yasağı (stop'lar aktif kalır) |
| API hata oranı | 5 dk'da %20 | Bot DEGRADED, alarm |
| 418 IP yasağı | — | Tüm istekler durur, CRITICAL alarm, otomatik retry yok |

Bu modül saftır: girdi `RiskState`, çıktı `RiskVerdict`.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sarnic.core.enums import CircuitBreaker

DAILY_LOSS_LIMIT = -0.04
WEEKLY_LOSS_LIMIT = -0.08
MAX_DRAWDOWN_LIMIT = -0.15
CONSECUTIVE_LOSS_LIMIT = 5
API_ERROR_RATE_LIMIT = 0.20
API_ERROR_WINDOW = timedelta(minutes=5)

DAILY_BLOCK_DURATION = timedelta(hours=24)
CONSECUTIVE_LOSS_PAUSE = timedelta(hours=6)

# Eşik karşılaştırma toleransı. 9200/10000 − 1 kayan noktada −0.07999999999999996
# çıkar; tam −%8 zararın eşiği kaçırmasına izin veremeyiz.
EPSILON = 1e-9


def breached(value: float, limit: float) -> bool:
    """Zarar eşiği aşıldı mı? Her ikisi de negatiftir."""
    return value <= limit + EPSILON


@dataclass(slots=True)
class RiskLimits:
    daily_loss: float = DAILY_LOSS_LIMIT
    weekly_loss: float = WEEKLY_LOSS_LIMIT
    max_drawdown: float = MAX_DRAWDOWN_LIMIT
    consecutive_losses: int = CONSECUTIVE_LOSS_LIMIT
    api_error_rate: float = API_ERROR_RATE_LIMIT

    @classmethod
    def from_definition(cls, risk: dict | None) -> RiskLimits:
        if not risk:
            return cls()
        return cls(
            daily_loss=float(risk.get("daily_loss", DAILY_LOSS_LIMIT)),
            weekly_loss=float(risk.get("weekly_loss", WEEKLY_LOSS_LIMIT)),
            max_drawdown=float(risk.get("max_drawdown", MAX_DRAWDOWN_LIMIT)),
            consecutive_losses=int(risk.get("consecutive_losses", CONSECUTIVE_LOSS_LIMIT)),
            api_error_rate=float(risk.get("api_error_rate", API_ERROR_RATE_LIMIT)),
        )


@dataclass(slots=True)
class RiskState:
    equity: float
    equity_start_of_day: float
    equity_start_of_week: float
    equity_peak: float
    consecutive_losses: int = 0
    data_stale: bool = False
    api_banned: bool = False
    api_error_rate: float = 0.0
    entries_blocked_until: datetime | None = None
    manual_halt: bool = False

    @property
    def daily_return(self) -> float:
        if self.equity_start_of_day <= 0:
            return 0.0
        return self.equity / self.equity_start_of_day - 1.0

    @property
    def weekly_return(self) -> float:
        if self.equity_start_of_week <= 0:
            return 0.0
        return self.equity / self.equity_start_of_week - 1.0

    @property
    def drawdown(self) -> float:
        if self.equity_peak <= 0:
            return 0.0
        return self.equity / self.equity_peak - 1.0


@dataclass(slots=True)
class Trip:
    breaker: CircuitBreaker
    message: str
    entries_blocked_until: datetime | None = None
    close_positions: bool = False
    requires_manual_restart: bool = False
    degrade: bool = False
    level: str = "WARN"

    def as_dict(self) -> dict:
        return {
            "breaker": str(self.breaker),
            "message": self.message,
            "close_positions": self.close_positions,
            "requires_manual_restart": self.requires_manual_restart,
            "entries_blocked_until": (
                self.entries_blocked_until.isoformat() if self.entries_blocked_until else None
            ),
            "level": self.level,
        }


@dataclass(slots=True)
class RiskVerdict:
    allow_entry: bool
    trips: list[Trip] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)

    @property
    def kill(self) -> bool:
        return any(t.close_positions for t in self.trips)

    @property
    def requires_manual_restart(self) -> bool:
        return any(t.requires_manual_restart for t in self.trips)

    @property
    def degraded(self) -> bool:
        return any(t.degrade for t in self.trips)


class RiskEngine:
    def __init__(self, limits: RiskLimits | None = None) -> None:
        self.limits = limits or RiskLimits()

    def evaluate(self, state: RiskState, now: datetime) -> RiskVerdict:
        limits = self.limits
        trips: list[Trip] = []
        reasons: list[str] = []
        allow = True
        # Blok VEREN kesiciler (günlük zarar, ardışık zarar) blok sürerken
        # yeniden tetiklenmez. Aksi hâlde her karar barı blokajı "şimdi + süre"
        # ile İLERİ kaydırıyordu: bot 4'te 6 saatlik duraklatma sonsuz kilide
        # dönüştü (seri ancak işlemle kırılır, işlem bloklu → kısır döngü) ve
        # olay akışı 15 dk'da bir aynı kesiciyle doldu. Girişler zaten
        # aşağıdaki mevcut-yasak kontrolüyle kapalı kalır.
        zaten_bloklu = state.entries_blocked_until is not None and now < state.entries_blocked_until

        # --- Kill switch seviyesi: maksimum drawdown ---
        if breached(state.drawdown, limits.max_drawdown):
            allow = False
            trips.append(
                Trip(
                    CircuitBreaker.MAX_DRAWDOWN,
                    f"Maksimum drawdown %{abs(state.drawdown) * 100:.1f} "
                    f"(limit %{abs(limits.max_drawdown) * 100:.0f}). "
                    "Kill switch: tüm botlar durur, pozisyonlar kapatılır.",
                    close_positions=True,
                    requires_manual_restart=True,
                    level="CRITICAL",
                )
            )
            reasons.append("maksimum drawdown")

        # --- Haftalık zarar: manuel yeniden başlatma ---
        if breached(state.weekly_return, limits.weekly_loss):
            allow = False
            trips.append(
                Trip(
                    CircuitBreaker.WEEKLY_LOSS,
                    f"Haftalık zarar %{abs(state.weekly_return) * 100:.1f} "
                    f"(limit %{abs(limits.weekly_loss) * 100:.0f}). "
                    "Tüm girişler durdu, manuel yeniden başlatma gerekiyor.",
                    requires_manual_restart=True,
                    level="CRITICAL",
                )
            )
            reasons.append("haftalık zarar limiti")

        # --- Günlük zarar: 24 saat giriş yok ---
        if not zaten_bloklu and breached(state.daily_return, limits.daily_loss):
            allow = False
            trips.append(
                Trip(
                    CircuitBreaker.DAILY_LOSS,
                    f"Günlük zarar %{abs(state.daily_return) * 100:.1f} "
                    f"(limit %{abs(limits.daily_loss) * 100:.0f}). "
                    "24 saat yeni giriş yok; mevcut pozisyonlar yönetilmeye devam ediyor.",
                    entries_blocked_until=now + DAILY_BLOCK_DURATION,
                    level="ERROR",
                )
            )
            reasons.append("günlük zarar limiti")

        # --- Ardışık zarar: 6 saat duraklatma ---
        if not zaten_bloklu and state.consecutive_losses >= limits.consecutive_losses:
            allow = False
            trips.append(
                Trip(
                    CircuitBreaker.CONSECUTIVE_LOSSES,
                    f"{state.consecutive_losses} ardışık zarar. Bot 6 saat duraklatıldı.",
                    entries_blocked_until=now + CONSECUTIVE_LOSS_PAUSE,
                    level="ERROR",
                )
            )
            reasons.append("ardışık zarar")

        # --- Bayat veri: yeni emir yasağı, stop'lar aktif ---
        if state.data_stale:
            allow = False
            trips.append(
                Trip(
                    CircuitBreaker.STALE_DATA,
                    "Piyasa verisi bayat. Yeni emir gönderilmiyor; mevcut stop'lar aktif kalıyor.",
                    level="ERROR",
                )
            )
            reasons.append("bayat veri")

        # --- 418 IP yasağı ---
        if state.api_banned:
            allow = False
            trips.append(
                Trip(
                    CircuitBreaker.IP_BAN,
                    "Binance IP yasağı (418). Tüm istekler durdu. "
                    "Otomatik yeniden deneme yapılmıyor — insan müdahalesi gerekiyor.",
                    level="CRITICAL",
                )
            )
            reasons.append("IP yasağı")

        # --- API hata oranı: DEGRADED ---
        if state.api_error_rate >= limits.api_error_rate - EPSILON:
            trips.append(
                Trip(
                    CircuitBreaker.API_ERROR_RATE,
                    f"API hata oranı %{state.api_error_rate * 100:.0f} "
                    f"(limit %{limits.api_error_rate * 100:.0f}). Bot DEGRADED.",
                    degrade=True,
                    level="ERROR",
                )
            )
            reasons.append("API hata oranı")

        # --- Önceden konmuş giriş yasağı hâlâ geçerli mi? ---
        if state.entries_blocked_until is not None and now < state.entries_blocked_until:
            allow = False
            reasons.append(
                f"giriş yasağı {state.entries_blocked_until.isoformat()} tarihine kadar sürüyor"
            )

        if state.manual_halt:
            allow = False
            reasons.append("manuel durdurma")

        return RiskVerdict(allow_entry=allow, trips=trips, reasons=reasons)


class ApiErrorTracker:
    """5 dakikalık kayan pencerede hata oranı."""

    def __init__(self, window: timedelta = API_ERROR_WINDOW) -> None:
        self.window = window
        self._events: deque[tuple[datetime, bool]] = deque()

    def record(self, at: datetime, is_error: bool) -> None:
        self._events.append((at, is_error))
        self._prune(at)

    def _prune(self, now: datetime) -> None:
        cutoff = now - self.window
        while self._events and self._events[0][0] < cutoff:
            self._events.popleft()

    def rate(self, now: datetime) -> float:
        self._prune(now)
        if not self._events:
            return 0.0
        errors = sum(1 for _, e in self._events if e)
        return errors / len(self._events)

    def __len__(self) -> int:
        return len(self._events)
