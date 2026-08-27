"""PaperAdapter — MASTER-SPEC §9.1.

Binance testnet **kullanılmaz**: testnet canlı borsayla senkron değil, emir defteri
sentetik ve dolumlar gerçekçi değil (büyük emirler fazla kolay doluyor). Bu, paper
sonuçlarını sistematik olarak iyimser gösterir — tam istemediğimiz şey.

Bunun yerine gerçek `@depth20` akışıyla beslenen kendi motorumuz:
  * seviye seviye tüketim, kısmi dolum
  * yapılandırılabilir ek kayma (varsayılan 5 bps), volatiliteyle ölçeklenir
  * taker komisyonu %0,1
  * 250 ms gecikme simülasyonu — o süredeki fiyat hareketi dolum fiyatına yansır
  * PRER: dolum fiyatı orta fiyattan %X'ten fazla saparsa emir **reddedilir**

Emir defteri saf bir veri yapısıdır; dolum fonksiyonu da saftır. Bu sayede
"bilinen bir emir defterinde elle hesaplanmış dolum fiyatı" testi yazılabilir.
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass, field
from datetime import datetime

from sarnic.config import settings
from sarnic.core.clock import Clock, RealClock
from sarnic.core.enums import OrderSide, OrderStatus, OrderType
from sarnic.core.logging import get_logger
from sarnic.execution.base import Balance, Fill, OrderRequest, OrderResult

log = get_logger(__name__)


class PRERRejection(Exception):
    """Spot Price Range Execution Rule — aralık dışı taker emri gerçekleşmez."""


@dataclass(slots=True)
class BookSide:
    """Fiyat-miktar seviyeleri. Alışlar azalan, satışlar artan fiyatta sıralıdır."""

    levels: list[tuple[float, float]]

    def total_qty(self) -> float:
        return sum(q for _, q in self.levels)


@dataclass(slots=True)
class Book:
    symbol: str
    bids: list[tuple[float, float]] = field(default_factory=list)
    asks: list[tuple[float, float]] = field(default_factory=list)
    at: datetime | None = None

    @property
    def best_bid(self) -> float | None:
        return self.bids[0][0] if self.bids else None

    @property
    def best_ask(self) -> float | None:
        return self.asks[0][0] if self.asks else None

    @property
    def mid(self) -> float | None:
        if self.best_bid is None or self.best_ask is None:
            return None
        return (self.best_bid + self.best_ask) / 2

    @classmethod
    def from_payload(cls, payload: dict) -> Book:
        return cls(
            symbol=payload.get("symbol", ""),
            bids=[(float(p), float(q)) for p, q in payload.get("bids", [])],
            asks=[(float(p), float(q)) for p, q in payload.get("asks", [])],
            at=datetime.fromisoformat(payload["at"]) if payload.get("at") else None,
        )

    @classmethod
    def synthetic(
        cls, symbol: str, price: float, spread_bps: float = 5.0, depth_quote: float = 1e9
    ) -> Book:
        """Emir defteri yoksa (backtest) fiyat etrafında tek seviyeli sentetik defter.

        Bu bir yaklaşımdır ve rapora `synthetic_book` olarak damgalanır — gerçek
        defterle üretilmiş dolumlarla karıştırılmaz.
        """
        half = price * spread_bps / 10_000 / 2
        qty = depth_quote / price if price > 0 else 0.0
        return cls(symbol=symbol, bids=[(price - half, qty)], asks=[(price + half, qty)])


@dataclass(slots=True)
class FillOutcome:
    filled_qty: float
    avg_price: float
    fills: list[Fill]
    exhausted: bool  # defter tükendi mi (kısmi dolum)


def walk_book(book: Book, side: OrderSide, qty: float) -> FillOutcome:
    """Emri defterde seviye seviye tüketir. **Saf fonksiyon** — testin dayanağı.

    BUY → asks'ı artan fiyatta tüketir; SELL → bids'i azalan fiyatta tüketir.
    """
    levels = book.asks if side == OrderSide.BUY else book.bids
    remaining = qty
    fills: list[Fill] = []
    cost = 0.0

    for price, available in levels:
        if remaining <= 1e-12:
            break
        take = min(remaining, available)
        if take <= 0:
            continue
        fills.append(Fill(price=price, qty=take, fee=0.0))
        cost += price * take
        remaining -= take

    filled = qty - remaining
    avg = cost / filled if filled > 0 else 0.0
    return FillOutcome(filled_qty=filled, avg_price=avg, fills=fills, exhausted=remaining > 1e-12)


def apply_slippage(
    avg_price: float, side: OrderSide, extra_bps: float, volatility_scalar: float = 1.0
) -> float:
    """Defter dışı ek kayma — gecikme, gizli likidite, rekabet.

    Alışta fiyatı yukarı, satışta aşağı iter. Her zaman aleyhimize.
    """
    bps = extra_bps * max(volatility_scalar, 0.0)
    factor = 1 + bps / 10_000 if side == OrderSide.BUY else 1 - bps / 10_000
    return avg_price * factor


def prer_violation(fill_price: float, mid: float | None, max_deviation: float) -> bool:
    """§9.1 PRER simülasyonu."""
    if mid is None or mid <= 0:
        return False
    return abs(fill_price - mid) / mid > max_deviation


@dataclass(slots=True)
class PaperConfig:
    taker_fee: float = settings.paper_taker_fee
    extra_slippage_bps: float = settings.paper_extra_slippage_bps
    latency_ms: int = settings.paper_latency_ms
    prer_max_deviation: float = settings.paper_prer_max_deviation
    cost_multiplier: float = 1.0  # backtest maliyet senaryoları: base / 1.5x / 2x
    simulate_latency: bool = True

    def scaled(self, multiplier: float) -> PaperConfig:
        return PaperConfig(
            taker_fee=self.taker_fee * multiplier,
            extra_slippage_bps=self.extra_slippage_bps * multiplier,
            latency_ms=self.latency_ms,
            prer_max_deviation=self.prer_max_deviation,
            cost_multiplier=multiplier,
            simulate_latency=self.simulate_latency,
        )


class BookSource:
    """Emir defteri kaynağı. Canlı paper Redis'ten, backtest sentetik defterden alır."""

    async def get(self, symbol: str) -> Book | None:  # pragma: no cover - arayüz
        raise NotImplementedError

    async def price_after_latency(self, symbol: str, latency_ms: int) -> float | None:
        """Gecikme sonrası fiyat. Varsayılan: değişim yok."""
        return None


class RedisBookSource(BookSource):
    """Canlı paper modu — `MarketDataService`'in Redis'e yazdığı defteri okur."""

    def __init__(self, redis) -> None:
        self.redis = redis

    async def get(self, symbol: str) -> Book | None:
        from sarnic.data.marketdata import read_book

        payload = await read_book(self.redis, symbol)
        return Book.from_payload(payload) if payload else None

    async def price_after_latency(self, symbol: str, latency_ms: int) -> float | None:
        """250 ms bekler ve defteri yeniden okur — aradaki hareket dolum fiyatına yansır."""
        await asyncio.sleep(latency_ms / 1000)
        book = await self.get(symbol)
        return book.mid if book else None


class StaticBookSource(BookSource):
    """Test ve backtest için: elle verilen defterler."""

    def __init__(self, books: dict[str, Book] | None = None) -> None:
        self.books = books or {}

    def set(self, symbol: str, book: Book) -> None:
        self.books[symbol] = book

    async def get(self, symbol: str) -> Book | None:
        return self.books.get(symbol)


class PaperAdapter:
    """§9.1 — v1'de tek aktif adaptör. Her paper botunun kendi sanal bakiyesi vardır."""

    name = "paper"

    def __init__(
        self,
        *,
        book_source: BookSource,
        balance: float = settings.paper_initial_balance,
        config: PaperConfig | None = None,
        clock: Clock | None = None,
        quote_asset: str = "USDT",
    ) -> None:
        self.books = book_source
        self.config = config or PaperConfig()
        self.clock = clock or RealClock()
        self.quote_asset = quote_asset
        self._free = balance
        self._locked = 0.0
        self._positions: dict[str, float] = {}
        self._open_orders: dict[str, OrderResult] = {}
        self._counter = 0
        self.halted_symbols: set[str] = set()

    # ------------------------------------------------------------------ #
    def _next_id(self) -> str:
        self._counter += 1
        return f"paper-{self._counter:08d}"

    def credit(self, amount: float) -> None:
        self._free += amount

    def set_balance(self, amount: float) -> None:
        self._free = amount

    def restore_positions(self, positions: dict[str, float]) -> None:
        """Açık pozisyon defterini DB'den geri yükler.

        Adaptör süreçle birlikte ölür; bakiye `bot.cash`'ten kurtarılıyordu ama
        defter kurtarılmıyordu. Sonuç: yeniden başlatmadan sonra her satış
        "yetersiz pozisyon" ile reddediliyor, yani **stop'lar dolamıyordu**
        (2026-08-16 kesintisinde ortaya çıktı).
        """
        self._positions = dict(positions)

    def halt_symbol(self, symbol: str) -> None:
        """Delist edilen coinde işlem durur — Binance'in canlı davranışıyla aynı."""
        self.halted_symbols.add(symbol)

    # ------------------------------------------------------------------ #
    async def submit(self, order: OrderRequest) -> OrderResult:
        now = self.clock.now()
        result = OrderResult(
            symbol=order.symbol,
            side=order.side,
            type=order.type,
            status=OrderStatus.NEW,
            requested_qty=order.qty,
            order_id=self._next_id(),
            submitted_at=now,
        )

        if order.symbol in self.halted_symbols:
            return _reject(result, "sembol delist edildi, işlem durduruldu")

        if order.qty <= 0:
            return _reject(result, "geçersiz miktar")

        # STOP_LOSS_LIMIT borsada bekleyen emir olarak durur; tetiklenene kadar dolmaz.
        if order.type == OrderType.STOP_LOSS_LIMIT:
            self._open_orders[result.order_id] = result
            log.info(
                "paper_stop_placed",
                symbol=order.symbol,
                qty=order.qty,
                stop=order.stop_price,
                order_id=result.order_id,
            )
            return result

        book = await self.books.get(order.symbol)
        if book is None or (not book.bids and not book.asks):
            return _reject(result, "emir defteri yok — piyasa verisi bekleniyor")

        mid_before = book.mid

        # Bar-kapanış çıkışlarında dolum BARIN kendisinden gelir (kural 1):
        # stopun altında açılan seansta backtest `min(stop, open)` doldurur;
        # canlı paper aynı fiyatı `meta["gap_fill_price"]` ile bildirir.
        # Defter yürüyüşü ve gecikme atlanır — o fiyat zaten barın gerçeği;
        # kayma/PRER/komisyon yine uygulanır.
        gap_fill = order.meta.get("gap_fill_price")
        if gap_fill is not None:
            raw_avg = float(gap_fill)
            outcome = FillOutcome(
                filled_qty=order.qty,
                avg_price=raw_avg,
                fills=[Fill(price=raw_avg, qty=order.qty, fee=0.0)],
                exhausted=False,
            )
        else:
            # Gecikme simülasyonu: karar → emir arası 250 ms.
            if self.config.simulate_latency and self.config.latency_ms > 0:
                moved = await self.books.price_after_latency(order.symbol, self.config.latency_ms)
                if moved is not None and mid_before and mid_before > 0:
                    drift = moved / mid_before
                    book = _shift_book(book, drift)

            outcome = walk_book(book, order.side, order.qty)
            if outcome.filled_qty <= 0:
                return _reject(result, "defterde likidite yok")

            raw_avg = outcome.avg_price
        vol_scalar = _volatility_scalar(order.meta.get("realized_vol"))
        fill_price = apply_slippage(raw_avg, order.side, self.config.extra_slippage_bps, vol_scalar)

        mid = book.mid
        # Boşluk dolumunda sapma GERÇEĞİN kendisidir (bar stopun altında
        # açıldı); PRER'e takılıp reddetmek pozisyonu stopun altında askıda
        # bırakırdı.
        if gap_fill is None and prer_violation(fill_price, mid, self.config.prer_max_deviation):
            return _reject(
                result,
                f"PRER: dolum fiyatı orta fiyattan %"
                f"{abs(fill_price - (mid or 0)) / (mid or 1) * 100:.2f} saptı, emir reddedildi",
            )

        notional = fill_price * outcome.filled_qty
        fee = notional * self.config.taker_fee

        if order.side == OrderSide.BUY:
            if notional + fee > self._free + 1e-9:
                return _reject(result, "yetersiz bakiye")
            self._free -= notional + fee
            self._positions[order.symbol] = (
                self._positions.get(order.symbol, 0.0) + outcome.filled_qty
            )
        else:
            held = self._positions.get(order.symbol, 0.0)
            if outcome.filled_qty > held + 1e-9:
                return _reject(result, "yetersiz pozisyon")
            self._positions[order.symbol] = held - outcome.filled_qty
            self._free += notional - fee

        result.status = (
            OrderStatus.FILLED if not outcome.exhausted else OrderStatus.PARTIALLY_FILLED
        )
        result.filled_qty = outcome.filled_qty
        result.avg_price = fill_price
        result.fees = fee
        result.fills = [Fill(f.price, f.qty, 0.0) for f in outcome.fills]
        result.filled_at = self.clock.now()
        result.slippage_bps = (
            abs(fill_price - (mid_before or fill_price)) / (mid_before or fill_price) * 10_000
        )

        log.info(
            "paper_filled",
            symbol=order.symbol,
            side=str(order.side),
            qty=round(result.filled_qty, 8),
            price=round(fill_price, 8),
            slippage_bps=round(result.slippage_bps, 2),
            fee=round(fee, 6),
            partial=outcome.exhausted,
        )
        return result

    async def cancel(self, order_id: str) -> None:
        order = self._open_orders.pop(order_id, None)
        if order is not None:
            order.status = OrderStatus.CANCELED

    async def get_balance(self) -> Balance:
        return Balance(asset=self.quote_asset, free=self._free, locked=self._locked)

    async def get_open_orders(self) -> list[OrderResult]:
        return list(self._open_orders.values())

    def position_qty(self, symbol: str) -> float:
        return self._positions.get(symbol, 0.0)

    async def check_stop_triggers(self, prices: dict[str, float]) -> list[OrderResult]:
        """Bekleyen STOP_LOSS_LIMIT emirleri tetiklendi mi?

        Paper motorunda stop'ları biz yürütürüz; canlıda borsa yapar. Karar
        mantığı için ikisi aynı görünür.
        """
        triggered: list[OrderResult] = []
        for order_id, order in list(self._open_orders.items()):
            price = prices.get(order.symbol)
            if price is None:
                continue
            stop_price = getattr(order, "_stop_price", None)
            if stop_price is None:
                continue
            if price <= stop_price:
                self._open_orders.pop(order_id, None)
                triggered.append(order)
        return triggered


def _shift_book(book: Book, drift: float) -> Book:
    if not math.isfinite(drift) or drift <= 0:
        return book
    return Book(
        symbol=book.symbol,
        bids=[(p * drift, q) for p, q in book.bids],
        asks=[(p * drift, q) for p, q in book.asks],
        at=book.at,
    )


def _volatility_scalar(realized_vol: float | None) -> float:
    """Kayma volatiliteyle ölçeklenir. %60 yıllık vol → 1.0 çarpan."""
    if realized_vol is None or not math.isfinite(realized_vol) or realized_vol <= 0:
        return 1.0
    return max(0.5, min(3.0, realized_vol / 0.60))


def _reject(result: OrderResult, reason: str) -> OrderResult:
    result.status = OrderStatus.REJECTED
    result.reject_reason = reason
    log.info("paper_rejected", symbol=result.symbol, reason=reason)
    return result


__all__ = [
    "Book",
    "BookSource",
    "PaperAdapter",
    "PaperConfig",
    "RedisBookSource",
    "StaticBookSource",
    "apply_slippage",
    "prer_violation",
    "walk_book",
]
