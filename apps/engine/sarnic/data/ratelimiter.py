"""Merkezi Binance istek sıralayıcısı — MASTER-SPEC §2.1.

Kurallar:
  * Tüm REST istekleri buradan geçer. Ağırlık bütçesi IP başınadır.
  * `X-MBX-USED-WEIGHT-1m` başlığı okunur; %70 eşiğinde kendini yavaşlatır.
  * `429` → üstel geri çekilme.
  * `418` → tüm istekler durur, CRITICAL alarm, **otomatik retry yok** (yasağı uzatır).
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from dataclasses import dataclass

from sarnic.config import settings
from sarnic.core.logging import get_logger

log = get_logger(__name__)


class IPBannedError(RuntimeError):
    """HTTP 418 — Binance IP yasağı. İnsan müdahalesi gerekir."""

    def __init__(self, retry_after: float | None = None) -> None:
        super().__init__("Binance IP yasağı (418). Otomatik yeniden deneme yapılmayacak.")
        self.retry_after = retry_after


class RateLimitedError(RuntimeError):
    def __init__(self, retry_after: float) -> None:
        super().__init__(f"Binance ağırlık limiti aşıldı, {retry_after:.0f} sn sonra.")
        self.retry_after = retry_after


@dataclass(slots=True)
class LimiterState:
    used_weight: int = 0
    limit: int = 6000
    banned_until: float = 0.0
    throttled_until: float = 0.0
    window_started: float = 0.0

    @property
    def ratio(self) -> float:
        return self.used_weight / self.limit if self.limit else 0.0


class RateLimiter:
    """Tek örnek. Tüm REST çağrıları `async with limiter.acquire(weight)` içinde yapılır."""

    def __init__(
        self,
        weight_per_minute: int | None = None,
        soft_ratio: float | None = None,
    ) -> None:
        self.state = LimiterState(limit=weight_per_minute or settings.rate_limit_weight_per_minute)
        self.soft_ratio = soft_ratio if soft_ratio is not None else settings.rate_limit_soft_ratio
        self._lock = asyncio.Lock()
        self._on_ban = None

    def set_ban_callback(self, cb) -> None:
        """418 anında CRITICAL alarm yayınlamak için."""
        self._on_ban = cb

    # ------------------------------------------------------------------ #
    def _now(self) -> float:
        return time.monotonic()

    async def before_request(self, weight: int) -> None:
        """Sıraya girer; gerekiyorsa bekler. 418 aktifse hemen hata verir."""
        async with self._lock:
            now = self._now()

            if now < self.state.banned_until:
                raise IPBannedError(retry_after=self.state.banned_until - now)

            # 1 dakikalık pencere sıfırlanması
            if now - self.state.window_started >= 60:
                self.state.window_started = now
                self.state.used_weight = 0

            if now < self.state.throttled_until:
                await asyncio.sleep(self.state.throttled_until - now)

            # Yumuşak eşiği aşacaksak pencere sonuna kadar bekle.
            projected = self.state.used_weight + weight
            if projected > self.state.limit * self.soft_ratio:
                wait = max(0.0, 60 - (self._now() - self.state.window_started))
                if wait > 0:
                    log.info(
                        "rate_limit_soft_throttle",
                        used=self.state.used_weight,
                        limit=self.state.limit,
                        wait_s=round(wait, 2),
                    )
                    await asyncio.sleep(wait)
                self.state.window_started = self._now()
                self.state.used_weight = 0

            self.state.used_weight += weight

    def observe_headers(self, headers) -> None:
        """Gerçek kullanım borsadan gelir; yerel sayaç onunla düzeltilir."""
        for key, value in headers.items():
            lower = key.lower()
            if lower.startswith("x-mbx-used-weight-1m"):
                with contextlib.suppress(ValueError):
                    self.state.used_weight = max(self.state.used_weight, int(value))

    def note_429(self, retry_after: float) -> None:
        self.state.throttled_until = self._now() + retry_after
        log.warning("rate_limit_429", retry_after=retry_after)

    def note_418(self, retry_after: float) -> None:
        self.state.banned_until = self._now() + max(retry_after, 60.0)
        log.critical("binance_ip_banned", retry_after=retry_after)
        if self._on_ban is not None:
            try:
                self._on_ban(retry_after)
            except Exception:
                log.exception("ban_callback_failed")

    @property
    def is_banned(self) -> bool:
        return self._now() < self.state.banned_until


_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter()
    return _limiter
