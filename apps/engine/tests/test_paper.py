"""Paper motoru testleri — Faz 4 kabul kriteri.

> "Paper motoru bilinen bir emir defterinde elle hesaplanmış dolum fiyatını
> birebir üretiyor."
"""

from __future__ import annotations

import pytest

from sarnic.core.enums import OrderSide, OrderStatus, OrderType
from sarnic.execution.base import OrderRequest
from sarnic.execution.paper import (
    Book,
    PaperAdapter,
    PaperConfig,
    StaticBookSource,
    apply_slippage,
    prer_violation,
    walk_book,
)

# Elle hesaplanabilir defter.
BOOK = Book(
    symbol="TESTUSDT",
    bids=[(99.0, 10.0), (98.0, 20.0), (97.0, 30.0)],
    asks=[(100.0, 10.0), (101.0, 20.0), (102.0, 30.0)],
)

NO_LATENCY = PaperConfig(latency_ms=0, simulate_latency=False)


# --------------------------------------------------------------------------- #
#  Saf dolum fonksiyonu
# --------------------------------------------------------------------------- #
def test_walk_book_single_level():
    outcome = walk_book(BOOK, OrderSide.BUY, 5.0)
    assert outcome.filled_qty == pytest.approx(5.0)
    assert outcome.avg_price == pytest.approx(100.0)
    assert not outcome.exhausted


def test_walk_book_two_levels_hand_calculated():
    """15 adet alım: 10 @ 100 + 5 @ 101 = 1505 → ortalama 100.3333."""
    outcome = walk_book(BOOK, OrderSide.BUY, 15.0)
    assert outcome.filled_qty == pytest.approx(15.0)
    assert outcome.avg_price == pytest.approx(1505.0 / 15.0)
    assert len(outcome.fills) == 2


def test_walk_book_three_levels_hand_calculated():
    """45 adet: 10@100 + 20@101 + 15@102 = 1000+2020+1530 = 4550 → 101.1111."""
    outcome = walk_book(BOOK, OrderSide.BUY, 45.0)
    assert outcome.avg_price == pytest.approx(4550.0 / 45.0)


def test_walk_book_sell_consumes_bids():
    """15 satış: 10 @ 99 + 5 @ 98 = 990 + 490 = 1480 → 98.6667."""
    outcome = walk_book(BOOK, OrderSide.SELL, 15.0)
    assert outcome.avg_price == pytest.approx(1480.0 / 15.0)


def test_walk_book_partial_fill_when_exhausted():
    """Defterde 60 adet var; 100 istenirse 60 dolar, kalanı kısmi kalır."""
    outcome = walk_book(BOOK, OrderSide.BUY, 100.0)
    assert outcome.filled_qty == pytest.approx(60.0)
    assert outcome.exhausted


def test_walk_book_empty_side():
    empty = Book(symbol="X", bids=[], asks=[])
    outcome = walk_book(empty, OrderSide.BUY, 10.0)
    assert outcome.filled_qty == 0.0


# --------------------------------------------------------------------------- #
#  Kayma ve PRER
# --------------------------------------------------------------------------- #
def test_slippage_always_hurts():
    """Alışta fiyat yukarı, satışta aşağı — her zaman aleyhimize."""
    assert apply_slippage(100.0, OrderSide.BUY, 5.0) == pytest.approx(100.05)
    assert apply_slippage(100.0, OrderSide.SELL, 5.0) == pytest.approx(99.95)


def test_slippage_scales_with_volatility():
    base = apply_slippage(100.0, OrderSide.BUY, 5.0, 1.0)
    volatile = apply_slippage(100.0, OrderSide.BUY, 5.0, 2.0)
    assert volatile > base


def test_prer_rejects_far_fills():
    assert prer_violation(110.0, 100.0, 0.05) is True
    assert prer_violation(104.0, 100.0, 0.05) is False
    assert prer_violation(110.0, None, 0.05) is False


# --------------------------------------------------------------------------- #
#  Adaptör davranışı
# --------------------------------------------------------------------------- #
def adapter(book: Book = BOOK, balance: float = 10_000.0, **cfg) -> PaperAdapter:
    config = PaperConfig(
        latency_ms=0,
        simulate_latency=False,
        taker_fee=cfg.get("taker_fee", 0.001),
        extra_slippage_bps=cfg.get("extra_slippage_bps", 5.0),
        prer_max_deviation=cfg.get("prer_max_deviation", 0.05),
    )
    return PaperAdapter(
        book_source=StaticBookSource({book.symbol: book}), balance=balance, config=config
    )


async def test_market_buy_fill_price_and_fee():
    """15 adet: ham ortalama 100.3333 → +5 bps kayma → 100.38350.

    Komisyon %0.1 → notional × 0.001.
    """
    a = adapter()
    result = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 15.0))
    raw = 1505.0 / 15.0
    expected = raw * (1 + 5 / 10_000)
    assert result.status == OrderStatus.FILLED
    assert result.avg_price == pytest.approx(expected)
    assert result.fees == pytest.approx(expected * 15.0 * 0.001)

    balance = await a.get_balance()
    assert balance.free == pytest.approx(10_000 - expected * 15.0 - result.fees)
    assert a.position_qty("TESTUSDT") == pytest.approx(15.0)


async def test_partial_fill_marked():
    a = adapter(balance=1_000_000.0)
    result = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 100.0))
    assert result.status == OrderStatus.PARTIALLY_FILLED
    assert result.filled_qty == pytest.approx(60.0)


async def test_insufficient_balance_rejected():
    a = adapter(balance=100.0)
    result = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 15.0))
    assert result.status == OrderStatus.REJECTED
    assert "yetersiz bakiye" in result.reject_reason


async def test_selling_more_than_held_rejected():
    a = adapter()
    result = await a.submit(OrderRequest("TESTUSDT", OrderSide.SELL, OrderType.MARKET, 5.0))
    assert result.status == OrderStatus.REJECTED
    assert "yetersiz pozisyon" in result.reject_reason


async def test_prer_rejection():
    """Defterin derinliği sığ ve fiyat aralığı geniş → dolum orta fiyattan çok sapar."""
    wide = Book(
        symbol="TESTUSDT",
        bids=[(99.0, 1.0)],
        asks=[(100.0, 1.0), (150.0, 100.0)],
    )
    a = adapter(book=wide, prer_max_deviation=0.05)
    result = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 50.0))
    assert result.status == OrderStatus.REJECTED
    assert "PRER" in result.reject_reason


async def test_empty_book_rejected():
    a = adapter(book=Book(symbol="TESTUSDT", bids=[], asks=[]))
    result = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 1.0))
    assert result.status == OrderStatus.REJECTED
    assert "emir defteri yok" in result.reject_reason


async def test_delisted_symbol_halted():
    """Delist edilen coinde işlem durur — Binance'in canlı davranışıyla aynı (§9.1)."""
    a = adapter()
    a.halt_symbol("TESTUSDT")
    result = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 1.0))
    assert result.status == OrderStatus.REJECTED
    assert "delist" in result.reject_reason


async def test_stop_order_rests_without_filling():
    """STOP_LOSS_LIMIT borsada bekleyen emir olarak durur (§7 kural 1)."""
    a = adapter()
    result = await a.submit(
        OrderRequest("TESTUSDT", OrderSide.SELL, OrderType.STOP_LOSS_LIMIT, 5.0, stop_price=95.0)
    )
    assert result.status == OrderStatus.NEW
    assert result.filled_qty == 0.0
    assert len(await a.get_open_orders()) == 1

    await a.cancel(result.order_id)
    assert await a.get_open_orders() == []


async def test_round_trip_accounting():
    """Al-sat turunda bakiye komisyon ve kayma kadar azalmalı — sıfır toplamlı değil."""
    a = adapter()
    buy = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 5.0))
    sell = await a.submit(OrderRequest("TESTUSDT", OrderSide.SELL, OrderType.MARKET, 5.0))
    assert buy.accepted and sell.accepted

    balance = await a.get_balance()
    assert balance.free < 10_000.0
    assert a.position_qty("TESTUSDT") == pytest.approx(0.0)


async def test_cost_scenarios_scale_fees():
    """§11 maliyet senaryoları: 2× senaryoda komisyon iki katı."""
    base = PaperConfig(latency_ms=0, simulate_latency=False)
    doubled = base.scaled(2.0)
    assert doubled.taker_fee == pytest.approx(base.taker_fee * 2)
    assert doubled.extra_slippage_bps == pytest.approx(base.extra_slippage_bps * 2)


async def test_zero_quantity_rejected():
    a = adapter()
    result = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 0.0))
    assert result.status == OrderStatus.REJECTED


def test_synthetic_book_is_marked_as_approximation():
    book = Book.synthetic("XUSDT", 100.0, spread_bps=10.0)
    assert book.best_bid == pytest.approx(99.95)
    assert book.best_ask == pytest.approx(100.05)
    assert book.mid == pytest.approx(100.0)


# --------------------------------------------------------------------------- #
# Portföy eğrisi toplama — §12
#
# Panel bot eğrilerini "aynı zaman damgasını topla" ile birleştiriyordu. Bu iki
# şekilde yalan söylüyor: (a) bir bot bir barı kaçırınca portföy düşmüş görünür,
# (b) aynı `(bot_id, at)` iki kez yazılırsa özsermaye katlanır. (b) artık
# `uq_equity_point` ile veritabanında imkânsız; (a) burada test ediliyor.
# --------------------------------------------------------------------------- #
def _pt(at, equity):
    return {"at": at, "equity": equity, "cash": equity, "exposure": 0.0}


def test_combine_curves_sums_aligned_points():
    from sarnic.bots.portfolio import combine_curves

    total = combine_curves([[_pt(1, 100.0), _pt(2, 110.0)], [_pt(1, 50.0), _pt(2, 55.0)]])

    assert [p["equity"] for p in total] == [150.0, 165.0]


def test_combine_curves_forward_fills_missing_points():
    """İkinci bot 2. anda nokta yazmamış — portföy **düşmemeli**."""
    from sarnic.bots.portfolio import combine_curves

    total = combine_curves([[_pt(1, 100.0), _pt(2, 120.0)], [_pt(1, 50.0), _pt(3, 60.0)]])

    assert [(p["at"], p["equity"]) for p in total] == [(1, 150.0), (2, 170.0), (3, 180.0)]


def test_combine_curves_ignores_bot_before_it_started():
    """Geç başlayan bot, başlamadan önceki anlarda sıfır sayılmamalı."""
    from sarnic.bots.portfolio import combine_curves

    total = combine_curves([[_pt(1, 100.0), _pt(2, 100.0)], [_pt(2, 40.0)]])

    assert [(p["at"], p["equity"]) for p in total] == [(1, 100.0), (2, 140.0)]


def test_combine_curves_handles_empty_input():
    from sarnic.bots.portfolio import combine_curves

    assert combine_curves([]) == []
    assert combine_curves([[], []]) == []


def test_combine_curves_works_with_iso_string_timestamps():
    """Gerçek kullanımda `at` bir ISO dizesidir (`equity_curve`).

    Sabit ofsetli ISO-8601'de sözlük sırası kronolojik sırayla aynıdır; bu test
    o varsayımı sabitler ki ileride biri `at` biçimini değiştirdiğinde kırılsın.
    """
    from sarnic.bots.portfolio import combine_curves

    total = combine_curves(
        [
            [_pt("2026-08-15T03:00:00+00:00", 100.0), _pt("2026-08-15T12:00:00+00:00", 120.0)],
            [_pt("2026-08-15T03:00:00+00:00", 50.0), _pt("2026-08-16T01:00:00+00:00", 60.0)],
        ]
    )

    assert [p["at"][:16] for p in total] == [
        "2026-08-15T03:00",
        "2026-08-15T12:00",
        "2026-08-16T01:00",
    ]
    assert [p["equity"] for p in total] == [150.0, 170.0, 180.0]


# --------------------------------------------------------------------------- #
#  Yeniden başlatma — 2026-08-16 elektrik kesintisi
#
# Adaptör süreçle birlikte ölür. Bakiye `bot.cash`'ten kurtarılıyordu ama açık
# pozisyon defteri kurtarılmıyordu: yeniden başlatmadan sonra defter boş
# olduğu için **her satış** "yetersiz pozisyon" ile reddediliyordu. Stop
# tetiklense bile çıkış emri dolamıyor, pozisyon açık kalıyordu.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_kurtarilmayan_defter_cikisi_reddeder():
    """Kusurun kendisi: defter boşken satış reddedilir."""
    adapter = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}), balance=10_000.0, config=NO_LATENCY
    )
    result = await adapter.submit(
        OrderRequest(symbol="TESTUSDT", side=OrderSide.SELL, type=OrderType.MARKET, qty=5.0)
    )
    assert result.status == OrderStatus.REJECTED
    assert "yetersiz pozisyon" in (result.reject_reason or "")


@pytest.mark.asyncio
async def test_kurtarilan_defterle_cikis_dolar():
    """Düzeltme: defter DB'den geri yüklendiğinde aynı satış dolar."""
    adapter = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}), balance=10_000.0, config=NO_LATENCY
    )
    adapter.restore_positions({"TESTUSDT": 5.0})

    result = await adapter.submit(
        OrderRequest(symbol="TESTUSDT", side=OrderSide.SELL, type=OrderType.MARKET, qty=5.0)
    )
    assert result.status == OrderStatus.FILLED
    assert result.filled_qty == pytest.approx(5.0)
    assert adapter.position_qty("TESTUSDT") == pytest.approx(0.0)


# --------------------------------------------------------------------------- #
#  Kısmi çıkış — sessiz muhasebe ayrışması
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_partial_exit_leaves_the_remainder_in_the_adapter():
    """Defter tükenirse satış kısmi dolar ve kalan adaptörde durur.

    İşçi bu durumda pozisyonu yine de kapatıyordu. Sonuç sessizdi: DB'de
    pozisyon kapalı, adaptörün envanterinde kalan miktar duruyor, o miktar bir
    daha satılamıyor (botun kaydı yok) ve nakit hiç geri gelmiyor. Hiçbir hata
    görünmez — sadece özkaynak eğrisi kalıcı olarak yanlış olur.
    """
    adapter = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}), balance=10_000.0, config=NO_LATENCY
    )
    defterdeki = sum(q for _, q in BOOK.bids)
    adapter.restore_positions({"TESTUSDT": defterdeki * 2})

    result = await adapter.submit(
        OrderRequest(
            symbol="TESTUSDT", side=OrderSide.SELL, type=OrderType.MARKET, qty=defterdeki * 2
        )
    )

    assert result.status == OrderStatus.PARTIALLY_FILLED
    assert result.filled_qty == pytest.approx(defterdeki)
    # Kalan **adaptörde durur** — işçi bunu görmezden gelirse kayıptır.
    assert adapter.position_qty("TESTUSDT") == pytest.approx(defterdeki)


@pytest.mark.asyncio
async def test_worker_keeps_the_position_open_after_a_partial_exit(api_session, test_database):
    """İşçi kısmi çıkışta pozisyonu kapatmamalı.

    Kapatırsa: DB'de pozisyon yok, adaptörde kalan var, o kalan bir daha
    satılamaz ve nakit geri gelmez. Doğrusu — kalanla açık kal, satılan dilimin
    sonucunu biriktir, bir sonraki turda tekrar dene. Çıkış koşulu hâlâ
    geçerlidir.
    """
    from decimal import Decimal

    from sqlalchemy import select

    from sarnic.bots.portfolio import OpenPosition, PortfolioSnapshot
    from sarnic.bots.worker import BotWorker
    from sarnic.core.enums import ExitReason, PositionStatus
    from sarnic.db.models import Position, Trade
    from tests.conftest import utc
    from tests.test_api import make_bot

    bot, _ = await make_bot(api_session, "kısmi")
    defterdeki = sum(q for _, q in BOOK.bids)
    pozisyon = Position(
        bot_id=bot.id,
        symbol="TESTUSDT",
        side="BUY",
        qty=Decimal(str(defterdeki * 2)),
        entry_price=Decimal("100"),
        entry_time=utc(2026, 8, 18, 0),
        stop=Decimal("90"),
        initial_stop=Decimal("90"),
        score_at_entry=Decimal("85"),
        entry_fees=Decimal("1"),
        status="OPEN",
    )
    api_session.add(pozisyon)
    await api_session.commit()

    worker = BotWorker(bot.id, bus=_SessizVeriyolu())
    worker._adapter = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}), balance=0.0, config=NO_LATENCY
    )
    worker._adapter.restore_positions({"TESTUSDT": defterdeki * 2})

    acik = OpenPosition(
        id=pozisyon.id,
        symbol="TESTUSDT",
        qty=defterdeki * 2,
        entry_price=100.0,
        entry_time=utc(2026, 8, 18, 0),
        stop=90.0,
        initial_stop=90.0,
        score_at_entry=85.0,
        breakeven_locked=False,
        entry_fees=1.0,
    )
    snapshot = PortfolioSnapshot(bot_id=bot.id, cash=0.0, positions=[acik])

    await worker._close_position(api_session, bot, snapshot, acik, ExitReason.STOP, "test")
    await api_session.commit()

    # Güncelleme Core `update()` ile gitti; ORM kimlik haritası eski değeri
    # tutuyor. Yeniden okumak için açıkça tazeleniyor.
    await api_session.refresh(pozisyon)
    tazelenmis = pozisyon
    assert tazelenmis.status == PositionStatus.OPEN, "kısmi çıkışta pozisyon kapanmamalı"
    assert float(tazelenmis.qty) == pytest.approx(defterdeki), "kalan miktarla açık kalmalı"
    assert float(tazelenmis.realized_pnl) != 0.0, "satılan dilimin sonucu kaydedilmeli"
    # Kapanış işlemi yazılmamalı — pozisyon henüz kapanmadı.
    islemler = (
        (await api_session.execute(select(Trade).where(Trade.position_id == pozisyon.id)))
        .scalars()
        .all()
    )
    assert islemler == []
    # Adaptörün envanteri ile DB aynı miktarı gösterir; ayrışma yok.
    assert worker._adapter.position_qty("TESTUSDT") == pytest.approx(float(tazelenmis.qty))


class _SessizVeriyolu:
    """Olayları Redis'e göndermeyen sahte veriyolu."""

    async def emit(self, *args, **kwargs) -> None:
        return None


# --------------------------------------------------------------------------- #
#  Boşluk dolumu — kural 1: backtest ile paper aynı fiyattan kapanır
# --------------------------------------------------------------------------- #
def test_stop_fill_price_gap_below():
    from sarnic.execution.gapfill import stop_fill_price

    # Bar stopun ALTINDA açıldı: dolum açılıştır — piyasa stopa hiç uğramadı.
    assert stop_fill_price(stop=100.0, bar_open=92.0) == 92.0
    # Bar üstte açılıp gün içinde deldi: dolum stoptur.
    assert stop_fill_price(stop=100.0, bar_open=104.0) == 100.0


@pytest.mark.asyncio
async def test_gap_fill_price_overrides_book_and_skips_prer():
    """Boşluk dolumu defter fiyatını değil BARIN fiyatını kullanır.

    Defterin en iyi alıcısı 99 iken bar açılışı 80'den dolum istenir:
    sonuç ~80 (kayma dahil) olmalı ve %20'lik sapma PRER'e TAKILMAMALI —
    sapma boşluğun kendisidir, bir hata değil.
    """
    adapter = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}),
        balance=10_000.0,
        config=PaperConfig(
            latency_ms=0, simulate_latency=False, extra_slippage_bps=0.0, taker_fee=0.001
        ),
    )
    adapter.restore_positions({"TESTUSDT": 5.0})

    result = await adapter.submit(
        OrderRequest(
            symbol="TESTUSDT",
            side=OrderSide.SELL,
            type=OrderType.MARKET,
            qty=5.0,
            meta={"gap_fill_price": 80.0},
        )
    )
    assert result.status == OrderStatus.FILLED
    # Kayma sıfır: dolum tam bar fiyatı. Komisyon yine kesilir.
    assert result.avg_price == pytest.approx(80.0)
    assert result.fees == pytest.approx(80.0 * 5.0 * 0.001)


@pytest.mark.asyncio
async def test_gap_fill_absent_uses_book_as_before():
    """meta boşken davranış birebir eski: defter yürüyüşü + PRER aktif."""
    adapter = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}),
        balance=10_000.0,
        config=PaperConfig(
            latency_ms=0, simulate_latency=False, extra_slippage_bps=0.0, taker_fee=0.0
        ),
    )
    adapter.restore_positions({"TESTUSDT": 5.0})
    result = await adapter.submit(
        OrderRequest(symbol="TESTUSDT", side=OrderSide.SELL, type=OrderType.MARKET, qty=5.0)
    )
    assert result.status == OrderStatus.FILLED
    assert result.avg_price == pytest.approx(99.0)  # en iyi alıcı
