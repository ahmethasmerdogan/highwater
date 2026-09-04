"""Adaptör defteri ile DB'nin ayrışması — kapatılamayan pozisyon.

Yaşanmış senaryonun kökü: `PaperAdapter` süreçte yaşar, pozisyon DB'de.
Emir adaptörde **geçer** (defter azalır, nakit değişir) ama aynı turun
ilerisindeki bir hata oturumu geri alırsa DB'deki pozisyon AÇIK kalır.
Adaptörün defteri bir daha DB'den okunmadığı için sonraki her çıkış emri
"yetersiz pozisyon" ile reddedilir — yani **stop bir daha dolamaz**.

Bu tam olarak 2026-09-04'te yaşanan NUMERIC taşması gibi bir çökme
döngüsünde olur: worker 75 dakika boyunca her turda çöktü, her tur
oturumu geri aldı, adaptör ise her turda bir parça daha ayrıştı.

Nakit zaten her `_get_adapter` çağrısında `bot.cash`'ten tazeleniyordu;
defterin tazelenmemesi asimetriydi.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import select

from sarnic.bots.portfolio import OpenPosition, PortfolioSnapshot
from sarnic.bots.worker import BotWorker
from sarnic.core.enums import ExitReason, PositionStatus
from sarnic.db.models import Bot, Position
from sarnic.execution.paper import PaperAdapter, StaticBookSource
from tests.conftest import utc
from tests.test_api import make_bot
from tests.test_paper import BOOK, NO_LATENCY, _SessizVeriyolu

MIKTAR = 15.0


async def _kur(api_session):
    bot, _ = await make_bot(api_session, "defter-ayrışması")
    await api_session.refresh(bot, attribute_names=["strategy_version"])
    pozisyon = Position(
        bot_id=bot.id,
        symbol="TESTUSDT",
        side="BUY",
        qty=Decimal(str(MIKTAR)),
        entry_qty=Decimal(str(MIKTAR)),
        entry_price=Decimal("100"),
        entry_time=utc(2026, 8, 18, 0),
        stop=Decimal("96"),
        initial_stop=Decimal("96"),
        score_at_entry=Decimal("85"),
        entry_fees=Decimal("1"),
        status="OPEN",
    )
    api_session.add(pozisyon)
    await api_session.commit()

    worker = BotWorker(bot.id, bus=_SessizVeriyolu())
    worker._adapter = PaperAdapter(
        book_source=StaticBookSource({"TESTUSDT": BOOK}),
        balance=float(bot.cash),
        config=NO_LATENCY,
    )
    worker._adapter.restore_positions({"TESTUSDT": MIKTAR})
    return bot, pozisyon, worker


def _acik(pozisyon_id: int) -> OpenPosition:
    return OpenPosition(
        id=pozisyon_id,
        symbol="TESTUSDT",
        qty=MIKTAR,
        entry_price=100.0,
        entry_time=utc(2026, 8, 18, 0),
        stop=96.0,
        initial_stop=96.0,
        score_at_entry=85.0,
        breakeven_locked=False,
        entry_fees=1.0,
        entry_qty=MIKTAR,
        direction=1,
    )


async def test_geri_alinan_turdan_sonra_pozisyon_yine_kapatilabilir(api_session, test_database):
    """Emir adaptörde geçti, oturum geri alındı: DB açık, defter boş → çıkış tıkanır."""
    bot, pozisyon, worker = await _kur(api_session)
    pozisyon_id, bot_id = pozisyon.id, bot.id

    # 1) Tur başarıyla kapattı — ama sonrasında bir hata oturumu geri aldı.
    snapshot = PortfolioSnapshot(
        bot_id=bot_id, cash=float(bot.cash), positions=[_acik(pozisyon_id)]
    )
    await worker._close_position(
        api_session, bot, snapshot, snapshot.positions[0], ExitReason.STOP, "ilk deneme"
    )
    assert worker._adapter.position_qty("TESTUSDT") == pytest.approx(0.0)
    await api_session.rollback()
    bot = await api_session.get(Bot, bot_id)
    await api_session.refresh(bot, attribute_names=["strategy_version"])

    # DB'de pozisyon hâlâ AÇIK; worker 20 sn sonra aynı barı yeniden koşar.
    taze = (
        await api_session.execute(select(Position).where(Position.id == pozisyon_id))
    ).scalar_one()
    assert taze.status == PositionStatus.OPEN

    # 2) İkinci deneme: adaptör defterini DB'den tazelemeli, çıkış dolmalı.
    snapshot2 = PortfolioSnapshot(
        bot_id=bot_id, cash=float(bot.cash), positions=[_acik(pozisyon_id)]
    )
    await worker._close_position(
        api_session, bot, snapshot2, snapshot2.positions[0], ExitReason.STOP, "ikinci deneme"
    )
    await api_session.commit()

    await api_session.refresh(taze)
    assert taze.status == PositionStatus.CLOSED, (
        "geri alınan turdan sonra pozisyon kapatılamıyor: adaptör defteri DB ile ayrıştı"
    )
