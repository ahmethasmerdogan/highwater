"""Sistem genelinde paylaşılan sabitler ve numaralandırmalar."""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "ADMIN"
    TRADER = "TRADER"
    VIEWER = "VIEWER"


class BotState(StrEnum):
    DRAFT = "DRAFT"
    PAPER_RUNNING = "PAPER_RUNNING"
    PAUSED = "PAUSED"
    STOPPED = "STOPPED"
    ERROR = "ERROR"
    DEGRADED = "DEGRADED"


class BotMode(StrEnum):
    PAPER = "PAPER"
    LIVE = "LIVE"


class OrderSide(StrEnum):
    BUY = "BUY"
    SELL = "SELL"

    @property
    def direction(self) -> int:
        """Pozisyon yönü: BUY = uzun (+1), SELL = kısa (−1)."""
        return 1 if self is OrderSide.BUY else -1

    @classmethod
    def from_direction(cls, direction: int) -> OrderSide:
        return cls.BUY if direction > 0 else cls.SELL

    @property
    def opposite(self) -> OrderSide:
        return OrderSide.SELL if self is OrderSide.BUY else OrderSide.BUY


class OrderType(StrEnum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_LOSS_LIMIT = "STOP_LOSS_LIMIT"


class OrderStatus(StrEnum):
    NEW = "NEW"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"


class PositionStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class ExitReason(StrEnum):
    STOP = "STOP"
    BREAKEVEN = "BREAKEVEN"
    TRAILING = "TRAILING"
    SCORE = "SCORE"
    TIME = "TIME"
    ROTATION = "ROTATION"
    KILL_SWITCH = "KILL_SWITCH"
    DELIST = "DELIST"
    MANUAL = "MANUAL"
    LIQUIDATION = "LIQUIDATION"
    PARTIAL = "PARTIAL"


class Timeframe(StrEnum):
    M15 = "15m"
    M30 = "30m"
    H1 = "1h"
    H4 = "4h"
    D1 = "1d"


TIMEFRAME_MINUTES: dict[str, int] = {
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
}


class EventKind(StrEnum):
    """Redis Streams olay tipleri (MASTER-SPEC §14)."""

    POOL_UPDATED = "pool.updated"
    SCORE_THRESHOLD_CROSSED = "score.threshold_crossed"
    SCORES_UPDATED = "scores.updated"
    POSITION_OPENED = "position.opened"
    POSITION_CLOSED = "position.closed"
    ORDER_SUBMITTED = "order.submitted"
    ORDER_REJECTED = "order.rejected"
    RISK_CIRCUIT_BREAKER = "risk.circuit_breaker"
    BOT_STATE_CHANGED = "bot.state_changed"
    BOT_HEARTBEAT = "bot.heartbeat"
    DATA_STALE = "data.stale"
    API_BANNED = "api.banned"
    BACKTEST_FINISHED = "backtest.finished"
    CHAT_MESSAGE = "chat.message"
    LOG = "log"


class CircuitBreaker(StrEnum):
    DAILY_LOSS = "DAILY_LOSS"
    WEEKLY_LOSS = "WEEKLY_LOSS"
    MAX_DRAWDOWN = "MAX_DRAWDOWN"
    CONSECUTIVE_LOSSES = "CONSECUTIVE_LOSSES"
    STALE_DATA = "STALE_DATA"
    API_ERROR_RATE = "API_ERROR_RATE"
    IP_BAN = "IP_BAN"
    KILL_SWITCH = "KILL_SWITCH"


SCORE_FAMILIES = ("trend", "momentum", "flow", "vol", "sr")
