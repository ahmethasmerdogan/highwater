"""ExecutionAdapter arayüzü — MASTER-SPEC §9.

Tek arayüz, iki uygulama. **Karar mantığı hangi adaptörün takılı olduğunu bilmez.**
Bozulmaz kural 1'in somut karşılığı budur: backtest/paper/canlı arasında değişen
tek şey burasıdır.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from sarnic.core.enums import OrderSide, OrderStatus, OrderType


@dataclass(slots=True)
class OrderRequest:
    symbol: str
    side: OrderSide
    type: OrderType
    qty: float
    price: float | None = None  # LIMIT için
    stop_price: float | None = None  # STOP_LOSS_LIMIT için
    client_id: str = ""
    bot_id: int | None = None
    position_id: int | None = None
    meta: dict = field(default_factory=dict)


@dataclass(slots=True)
class Fill:
    price: float
    qty: float
    fee: float


@dataclass(slots=True)
class OrderResult:
    symbol: str
    side: OrderSide
    type: OrderType
    status: OrderStatus
    requested_qty: float
    filled_qty: float = 0.0
    avg_price: float = 0.0
    fees: float = 0.0
    slippage_bps: float = 0.0
    reject_reason: str = ""
    order_id: str = ""
    #: Emri doğuran pozisyon; bekleyen emirleri kapanışta düşürmek için.
    position_id: int | None = None
    submitted_at: datetime | None = None
    filled_at: datetime | None = None
    fills: list[Fill] = field(default_factory=list)

    @property
    def notional(self) -> float:
        return self.filled_qty * self.avg_price

    @property
    def accepted(self) -> bool:
        return self.status in (OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED)


@dataclass(slots=True)
class Balance:
    asset: str
    free: float
    locked: float = 0.0

    @property
    def total(self) -> float:
        return self.free + self.locked


class ExecutionAdapter(Protocol):
    """§9'daki dört uçlu arayüz."""

    name: str

    async def submit(self, order: OrderRequest) -> OrderResult: ...
    async def cancel(self, order_id: str) -> None: ...
    async def get_balance(self) -> Balance: ...
    async def get_open_orders(self) -> list[OrderResult]: ...
