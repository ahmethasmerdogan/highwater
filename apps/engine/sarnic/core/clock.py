"""Saat soyutlaması.

Bozulmaz kural 1 (tek karar yolu): backtest ile canlı arasındaki tek fark
`ExecutionAdapter` ve **saat**tir. Karar veren hiçbir modül `datetime.now()`
çağırmaz; hepsi enjekte edilen bir `Clock` kullanır. Böylece backtest motoru
sanal saati ilerletirken aynı kod yolu çalışır.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime: ...


class RealClock:
    """Duvar saati — paper ve canlı modda kullanılır."""

    def now(self) -> datetime:
        return datetime.now(UTC)


class VirtualClock:
    """Backtest saati. Yalnızca `advance`/`set` ile ilerler."""

    def __init__(self, start: datetime) -> None:
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        self._now = start

    def now(self) -> datetime:
        return self._now

    def set(self, moment: datetime) -> None:
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        self._now = moment

    def advance(self, delta: timedelta) -> None:
        self._now += delta


DEFAULT_CLOCK: Clock = RealClock()


def utcnow() -> datetime:
    """Karar yolu DIŞINDAKİ kod için (log damgası, audit kaydı vb.)."""
    return datetime.now(UTC)
