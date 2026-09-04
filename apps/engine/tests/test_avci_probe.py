"""GEÇİCİ av dosyası — bulgular doğrulanınca kalıcı testlere taşınacak."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from sarnic.backtest.engine import SLIP_RATIO, BacktestEngine, BacktestParams, SimPosition
from sarnic.core.enums import ExitReason, OrderSide, OrderType
from sarnic.execution.accounting import price_points, risk_per_unit, weighted_r
from sarnic.execution.base import OrderRequest
from sarnic.execution.paper import PaperAdapter, StaticBookSource
from sarnic.strategy.definition import StrategyDefinition
from tests.test_paper import BOOK, NO_LATENCY

AT = datetime(2026, 1, 20, tzinfo=UTC)


def _engine(direction: str = "SHORT") -> BacktestEngine:
    d = StrategyDefinition.from_dict(
        {
            "entry": {"direction": direction, "min_score": 60.0},
            "exit": {"partial_tp_r": 1.0, "score_exit": 40.0},
        }
    )
    return BacktestEngine(
        d, BacktestParams(start=AT, end=AT + timedelta(days=1), symbols=["X"])
    )


def _pos(direction: int = -1, **kw) -> SimPosition:
    stop = 104.0 if direction < 0 else 96.0
    base = dict(
        symbol="X",
        qty=10.0,
        entry_price=100.0,
        entry_time=AT,
        stop=stop,
        initial_stop=stop,
        score_at_entry=85.0,
        entry_fees=1.0,
        entry_notional=1000.0,
        entry_qty=10.0,
        direction=direction,
    )
    return SimPosition(**{**base, **kw})


# --------------------------------------------------------------------------- #
# H3: kısmi satışın devri (turnover) eksik sayılıyor mu?
# --------------------------------------------------------------------------- #
def test_h3_kismi_satis_devri_tam_dilimi_sayar():
    """`run_scenario` kısmi satıştan sonra `position.qty`'yi okuyor."""
    eng = _engine()
    pos = _pos()
    fiyat = 90.0
    once = pos.qty
    eng._partial(pos, 0.5, fiyat, AT + timedelta(hours=5), 10.0)
    satilan = once - pos.qty
    # run_scenario satırının birebir kopyası:
    kaydedilen = pos.qty * 0.5 * fiyat
    assert kaydedilen == pytest.approx(satilan * fiyat)


# --------------------------------------------------------------------------- #
# H4: kısa + kısmi + kapanış — nakit korunumu ve pnl/fees tutarlılığı
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("direction", [1, -1])
def test_h4_kismi_ve_kapanis_nakit_korunumu(direction):
    eng = _engine()
    pos = _pos(direction)
    d = direction
    giris_fee = pos.entry_fees
    nakit = 0.0
    p1, p2 = (90.0, 85.0) if d < 0 else (110.0, 115.0)

    nakit += eng._partial(pos, 0.5, p1, AT + timedelta(hours=5), 10.0)
    trades: list[dict] = []
    nakit += eng._close(pos, p2, AT + timedelta(hours=10), ExitReason.SCORE, 10.0, trades)

    t = trades[0]
    # Kapanışta nakde dönen toplam − açılışta ödenen = işlemin net sonucu.
    acilista = d * 100.0 * 10.0 + giris_fee  # nakitten çıkan
    assert nakit - acilista == pytest.approx(t["pnl"], abs=1e-6)


# --------------------------------------------------------------------------- #
# H1/H2: paper adaptörü — bekleyen stop emirleri
# --------------------------------------------------------------------------- #
async def test_h1_check_stop_triggers_calisir():
    a = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}), balance=10_000.0, config=NO_LATENCY
    )
    r = await a.submit(
        OrderRequest("TESTUSDT", OrderSide.SELL, OrderType.STOP_LOSS_LIMIT, 5.0, stop_price=95.0)
    )
    assert len(await a.get_open_orders()) == 1
    tetiklenen = await a.check_stop_triggers({"TESTUSDT": 90.0})
    assert [o.order_id for o in tetiklenen] == [r.order_id]


async def test_h2_kapanan_pozisyonun_stop_emri_defterde_kalmaz():
    """Worker her girişte bir STOP_LOSS_LIMIT bırakıyor; iptal eden yol var mı?"""
    import inspect

    from sarnic.bots import worker as w

    kaynak = inspect.getsource(w)
    assert "adapter.cancel(" in kaynak or "await adapter.cancel" in kaynak


# --------------------------------------------------------------------------- #
# H5: eski satırlarda entry_qty=0 → kısmi sonrası R şişer
# --------------------------------------------------------------------------- #
def test_h5_entry_qty_sifirsa_r_kalan_miktara_bolunmez():
    """entry_qty=0 (eski satır) + kısmi çıkış → payda kalan miktar oluyor."""
    risk = risk_per_unit(100.0, 96.0, 1)
    # 10 adet girildi, 5'i 110'dan satıldı, kalan 5 120'den kapanıyor.
    realized = price_points(100.0, 110.0, 5.0, 1)
    dogru = weighted_r(100.0, 120.0, 5.0, risk, realized_points=realized, entry_qty=10.0)
    eski = weighted_r(100.0, 120.0, 5.0, risk, realized_points=realized, entry_qty=0.0)
    assert eski == pytest.approx(dogru)


# --------------------------------------------------------------------------- #
# H6: kısa girişte serbest nakit tavanı
# --------------------------------------------------------------------------- #
def test_h6_kisa_giris_nakit_tavani():
    from sarnic.sizing.engine import SizingEngine, SizingInput, SizingParams

    eng = SizingEngine(SizingParams(min_fill_ratio=0.0))
    inp = SizingInput(
        symbol="X",
        score=90.0,
        entry=100.0,
        stop=104.0,
        equity=10_000.0,
        free_cash=10_000.0,
        current_exposure=0.0,
        cluster_exposure=0.0,
        realized_vol_20d=0.60,
        adv_1h=1e9,
        direction=-1,
    )
    karar = eng.size(inp)
    assert karar.accepted
    assert karar.risk_amount > 0


# --------------------------------------------------------------------------- #
# H7: likidasyon canlı yolda da denetleniyor mu? (backtest denetliyor)
# --------------------------------------------------------------------------- #
def test_h7_canli_yol_likidasyonu_denetler():
    import inspect

    from sarnic.bots import worker as w

    assert "liquidation_price" in inspect.getsource(w)
