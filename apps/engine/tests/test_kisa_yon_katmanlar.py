"""Kısa yön — puanlama, tanım, portföy ve paper adaptörü (KISA-YON-PLANI §2, §3, §5)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from sarnic.bots.portfolio import OpenPosition, PortfolioSnapshot
from sarnic.core.enums import OrderSide, OrderStatus, OrderType
from sarnic.execution.base import OrderRequest
from sarnic.scoring.engine import ScoringEngine
from sarnic.strategy.definition import StrategyDefinition, StrategyValidationError
from tests.test_paper import adapter
from tests.test_scoring import cross_section

#: Uzun puanlama ayarının hash'i — kısa yön eklenmeden ÖNCE alındı. Değişirse
#: `scores` tablosundaki her uzun satır yetim kalır.
ESKI_UZUN_CFG_HASH = "5a21a501e5004e0c72d91ccd4a2850b5"


# --------------------------------------------------------------------------- #
#  Puanlama
# --------------------------------------------------------------------------- #
def test_uzun_config_hash_degismedi_kisa_farkli():
    e = ScoringEngine()
    assert e.config_hash() == ESKI_UZUN_CFG_HASH
    assert e.config_hash(1) == ESKI_UZUN_CFG_HASH
    assert e.config_hash(-1) != ESKI_UZUN_CFG_HASH


def test_kisa_taban_yonlu_ailelerde_tam_ters():
    """vol ağırlığı 0 → kısa taban = 100 − uzun taban (aileler yalnız yönlü)."""
    e = ScoringEngine(weights={"trend": 30, "momentum": 25, "flow": 20, "vol": 0, "sr": 10})
    feats = cross_section(20)
    uzun = {r.symbol: r for r in e.score_cross_section(feats)}
    kisa = {r.symbol: r for r in e.score_cross_section(feats, direction=-1)}
    assert set(uzun) == set(kisa)
    for s in uzun:
        assert kisa[s].base_score == pytest.approx(100.0 - uzun[s].base_score, abs=1e-3)
        assert kisa[s].rationale["direction"] == -1
        assert "direction" not in uzun[s].rationale


def test_vol_ailesi_yonden_bagimsiz():
    e = ScoringEngine()
    feats = cross_section(20)
    uzun = {r.symbol: r for r in e.score_cross_section(feats)}
    kisa = {r.symbol: r for r in e.score_cross_section(feats, direction=-1)}
    for s in uzun:
        assert kisa[s].families["vol"] == pytest.approx(uzun[s].families["vol"])
        assert kisa[s].config_hash != uzun[s].config_hash


def test_kisa_duzelticiler_isaret_degistirir():
    feats = cross_section(12)
    feats[0].pattern_modifier = 5.0
    feats[0].candle_modifier = 2.0
    feats[0].ret_24h = -0.30  # %30 çöküş: kısa için kalabalık cezası
    e = ScoringEngine()
    uzun = next(r for r in e.score_cross_section(feats) if r.symbol == feats[0].symbol)
    kisa = next(r for r in e.score_cross_section(feats, -1) if r.symbol == feats[0].symbol)
    assert uzun.modifiers["pattern"] == 5.0 and kisa.modifiers["pattern"] == -5.0
    assert uzun.modifiers["candle"] == 2.0 and kisa.modifiers["candle"] == -2.0
    assert uzun.modifiers["crowding"] == 0.0 and kisa.modifiers["crowding"] == -15.0


# --------------------------------------------------------------------------- #
#  Tanım
# --------------------------------------------------------------------------- #
def test_tanim_yon_opt_in_ve_uzun_json_degismez():
    assert "direction" not in StrategyDefinition().to_dict()["entry"]
    eski = StrategyDefinition.from_dict({"entry": {"min_score": 80}})
    assert eski.entry.direction == "LONG" and eski.entry.directions() == (1,)
    kisa = StrategyDefinition.from_dict({"entry": {"direction": "SHORT"}}).require_valid()
    assert kisa.entry.directions() == (-1,)
    assert kisa.to_dict()["entry"]["direction"] == "SHORT"
    assert kisa.hash() != StrategyDefinition().hash()
    assert StrategyDefinition.from_dict({"entry": {"direction": "BOTH"}}).entry.directions() == (
        1,
        -1,
    )
    with pytest.raises(StrategyValidationError):
        StrategyDefinition.from_dict({"entry": {"direction": "UP"}}).require_valid()


# --------------------------------------------------------------------------- #
#  Portföy
# --------------------------------------------------------------------------- #
def test_kisa_pozisyon_ozsermaye_ve_maruziyet():
    p = OpenPosition(
        id=1,
        symbol="XUSDT",
        qty=10.0,
        entry_price=100.0,
        entry_time=datetime(2026, 1, 1, tzinfo=UTC),
        stop=104.0,
        initial_stop=104.0,
        score_at_entry=85.0,
        breakeven_locked=False,
        direction=-1,
    )
    assert p.unrealized(90.0) == pytest.approx(100.0)
    assert p.market_value(90.0) == pytest.approx(-900.0)
    assert p.notional(90.0) == pytest.approx(900.0)
    # Kısa açılışta satış geliri nakde girdi: 1000 + 1000 = 2000 nakit.
    snap = PortfolioSnapshot(bot_id=1, cash=2000.0, positions=[p], prices={"XUSDT": 90.0})
    assert snap.equity == pytest.approx(1100.0)  # 1000 + 100 kâr
    assert snap.exposure == pytest.approx(900.0)  # brüt, tavanlar için


# --------------------------------------------------------------------------- #
#  Paper adaptörü: ödünç-varlık modeli
# --------------------------------------------------------------------------- #
async def test_kisa_acilis_ve_kapanis_elle():
    """Önce sat 15 (bid'ler: 10@99 + 5@98 = 1480 → 98,6667, −5 bps kayma),
    sonra al 15 (ask'ler: 1505/15, +5 bps). Nakit = 10000 + (n1 − f1) − (n2 + f2)."""
    a = adapter()
    sat = await a.submit(
        OrderRequest("TESTUSDT", OrderSide.SELL, OrderType.MARKET, 15.0, meta={"direction": -1})
    )
    assert sat.status == OrderStatus.FILLED
    f1 = (1480.0 / 15.0) * (1 - 5 / 10_000)
    assert sat.avg_price == pytest.approx(f1)
    n1 = f1 * 15.0
    assert a.position_qty("TESTUSDT") == pytest.approx(-15.0)
    assert (await a.get_balance()).free == pytest.approx(10_000 + n1 - n1 * 0.001)

    # Kısadan fazlasını kapatmak reddedilir.
    fazla = await a.submit(
        OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 20.0, meta={"direction": -1})
    )
    assert not fazla.accepted and "yetersiz pozisyon" in fazla.reject_reason

    al = await a.submit(
        OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 15.0, meta={"direction": -1})
    )
    f2 = (1505.0 / 15.0) * (1 + 5 / 10_000)
    n2 = f2 * 15.0
    assert al.status == OrderStatus.FILLED
    assert a.position_qty("TESTUSDT") == pytest.approx(0.0)
    assert (await a.get_balance()).free == pytest.approx(10_000 + n1 - n1 * 0.001 - n2 - n2 * 0.001)


async def test_kisa_acilis_marj_kurali():
    a = adapter(balance=100.0)
    r = await a.submit(
        OrderRequest("TESTUSDT", OrderSide.SELL, OrderType.MARKET, 15.0, meta={"direction": -1})
    )
    assert not r.accepted and "yetersiz bakiye" in r.reject_reason


async def test_uzun_yol_meta_olmadan_birebir():
    a = adapter()
    r = await a.submit(OrderRequest("TESTUSDT", OrderSide.BUY, OrderType.MARKET, 15.0))
    assert r.status == OrderStatus.FILLED and a.position_qty("TESTUSDT") == pytest.approx(15.0)
    s = await a.submit(OrderRequest("TESTUSDT", OrderSide.SELL, OrderType.MARKET, 15.0))
    assert s.accepted and a.position_qty("TESTUSDT") == pytest.approx(0.0)


# --------------------------------------------------------------------------- #
#  Worker: kısa pozisyon kapanışı ALIŞ emriyle, Trade.side = SELL
# --------------------------------------------------------------------------- #
async def test_worker_kisa_pozisyonu_alisla_kapatir(api_session, test_database):
    """100'den açılmış kısa, ask'lerden geri alınır (100,38): zarar, Trade SELL,
    adaptör defteri 0'a döner, nakit geri alış bedeli kadar düşer."""
    from decimal import Decimal

    from sqlalchemy import select

    from sarnic.bots.worker import BotWorker
    from sarnic.core.enums import ExitReason, PositionStatus
    from sarnic.db.models import Position, Trade
    from sarnic.execution.paper import PaperAdapter, StaticBookSource
    from sarnic.sizing.leverage import borrow_cost
    from tests.conftest import utc
    from tests.test_api import make_bot
    from tests.test_paper import BOOK, NO_LATENCY, _SessizVeriyolu

    bot, _ = await make_bot(api_session, "kısa-kapanış")
    # Worker canlıda botu sürümüyle birlikte yükler; testte ilişki açıkça tazelenir.
    await api_session.refresh(bot, attribute_names=["strategy_version"])
    miktar = 15.0
    pozisyon = Position(
        bot_id=bot.id,
        symbol="TESTUSDT",
        side="SELL",
        qty=Decimal(str(miktar)),
        entry_qty=Decimal(str(miktar)),
        entry_price=Decimal("100"),
        entry_time=utc(2026, 8, 18, 0),
        stop=Decimal("104"),
        initial_stop=Decimal("104"),
        score_at_entry=Decimal("85"),
        entry_fees=Decimal("1"),
        status="OPEN",
    )
    api_session.add(pozisyon)
    await api_session.commit()

    worker = BotWorker(bot.id, bus=_SessizVeriyolu())
    worker._adapter = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}), balance=2500.0, config=NO_LATENCY
    )
    worker._adapter.restore_positions({"TESTUSDT": -miktar})
    acik = OpenPosition(
        id=pozisyon.id,
        symbol="TESTUSDT",
        qty=miktar,
        entry_price=100.0,
        entry_time=utc(2026, 8, 18, 0),
        stop=104.0,
        initial_stop=104.0,
        score_at_entry=85.0,
        breakeven_locked=False,
        entry_fees=1.0,
        entry_qty=miktar,
        direction=-1,
    )
    snapshot = PortfolioSnapshot(bot_id=bot.id, cash=2500.0, positions=[acik])
    await worker._close_position(api_session, bot, snapshot, acik, ExitReason.STOP, "test")
    await api_session.commit()
    await api_session.refresh(pozisyon)
    assert pozisyon.status == PositionStatus.CLOSED
    islem = (
        await api_session.execute(select(Trade).where(Trade.position_id == pozisyon.id))
    ).scalar_one()
    assert str(islem.side) == "SELL"
    fiyat = (1505.0 / 15.0) * (1 + 5 / 10_000)  # ask'lerden alış + 5 bps
    assert float(islem.exit_price) == pytest.approx(fiyat, rel=1e-6)
    # Kısa zararı: (100 − 100,38) × 15 − komisyonlar (< 0).
    assert float(islem.pnl) < 0
    assert float(islem.pnl_r) == pytest.approx((100.0 - fiyat) / 4.0, abs=1e-4)
    assert worker._adapter.position_qty("TESTUSDT") == pytest.approx(0.0)
    # Kısa 1× bile borçludur: ödünç varlığın TAM notional'ı saatlik oranla.
    saat = (worker.clock.now() - utc(2026, 8, 18, 0)).total_seconds() / 3600
    borc = borrow_cost(100.0 * miktar, 1.0, saat, 0.0000208, direction=-1)
    assert borc > 0
    assert snapshot.cash == pytest.approx(
        2500.0 - fiyat * miktar - fiyat * miktar * 0.001 - borc, abs=0.01
    )
    assert snapshot.positions == []


# --------------------------------------------------------------------------- #
#  Karar ve gözetim döngüleri aynı botta sırayla koşar (bot 4 yarışı, 2026-09-04)
# --------------------------------------------------------------------------- #
async def test_worker_bar_karari_ve_gozetim_ayni_kilidi_paylasir():
    import asyncio

    from sarnic.bots.worker import BotWorker
    from tests.test_paper import _SessizVeriyolu

    worker = BotWorker(999, bus=_SessizVeriyolu())
    sira: list[str] = []

    async def sahte_bar(bar_time):
        sira.append("bar-başla")
        await asyncio.sleep(0.05)
        sira.append("bar-bitti")
        return True

    async def sahte_gozetim():
        sira.append("gözetim")

    worker._run_bar_kilitli = sahte_bar  # type: ignore[method-assign]
    worker._manage_open_positions_kilitli = sahte_gozetim  # type: ignore[method-assign]
    await asyncio.gather(worker.run_bar(None), worker._manage_open_positions())
    # Gözetim, bar kararı bitmeden araya giremez.
    assert sira == ["bar-başla", "bar-bitti", "gözetim"]


# --------------------------------------------------------------------------- #
#  Havuzdan düşen pozisyon yönetilmeye devam eder (bug hunt, 2026-09-04)
# --------------------------------------------------------------------------- #
async def test_havuzdan_dusen_pozisyon_ticker_fiyatiyla_yonetilir(api_session, test_database):
    """Sembol havuzdan çıkarsa `ctx.prices` onu içermez. Sessizce atlamak çıkış
    kurallarını o pozisyon için kapatır ve gerçekleşmemiş zararı özsermayeden
    gizler. Ticker fiyatı varsa yönetim devam etmeli."""
    from datetime import UTC, datetime

    from sarnic.bots.worker import BarContext, BotWorker
    from tests.conftest import utc
    from tests.test_api import make_bot
    from tests.test_paper import _SessizVeriyolu

    bot, _ = await make_bot(api_session, "havuz-disi")
    await api_session.refresh(bot, attribute_names=["strategy_version"])
    worker = BotWorker(bot.id, bus=_SessizVeriyolu())

    acik = OpenPosition(
        id=1,
        symbol="DUSMUSUSDT",
        qty=10.0,
        entry_price=100.0,
        entry_time=utc(2026, 8, 18, 0),
        stop=90.0,
        initial_stop=90.0,
        score_at_entry=85.0,
        breakeven_locked=False,
    )
    snapshot = PortfolioSnapshot(bot_id=bot.id, cash=0.0, positions=[acik])
    ctx = BarContext(
        bar_time=datetime(2026, 9, 4, 12, tzinfo=UTC),
        symbols=["BTCUSDT"],  # pozisyonun sembolü havuzda YOK
        scores={},
        stops={},
        atr={},
        prices={"BTCUSDT": 50_000.0},
        realized_vol={},
        adv_1h={},
        havuz_disi_fiyat={"DUSMUSUSDT": 80.0},  # stopun altında → çıkış gerekir
    )
    gorulen: list[float] = []

    async def sahte_uygula(session, bot_, snap, position, decision, price):
        gorulen.append(price)

    worker._apply_exit_decision = sahte_uygula  # type: ignore[method-assign]
    definition = worker._definition_of(bot)
    await worker._manage_exits(api_session, bot, definition, snapshot, ctx, bar_closed=True)
    assert gorulen == [80.0], "havuzdan düşen pozisyon ticker fiyatıyla yönetilmeli"
