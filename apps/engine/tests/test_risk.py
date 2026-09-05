"""Devre kesici senaryo testleri — Faz 4 kabul kriteri.

* Yapay −%4 günlük zarar enjekte edilince yeni giriş reddediliyor
* −%15'te kill switch tetikleniyor
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from sarnic.core.enums import CircuitBreaker
from sarnic.risk.engine import ApiErrorTracker, RiskEngine, RiskLimits, RiskState

NOW = datetime(2026, 8, 13, 12, 0, tzinfo=UTC)


def state(**overrides) -> RiskState:
    base = {
        "equity": 10_000.0,
        "equity_start_of_day": 10_000.0,
        "equity_start_of_week": 10_000.0,
        "equity_peak": 10_000.0,
    }
    base.update(overrides)
    return RiskState(**base)


# --------------------------------------------------------------------------- #
def test_healthy_state_allows_entry():
    verdict = RiskEngine().evaluate(state(), NOW)
    assert verdict.allow_entry
    assert not verdict.trips
    assert not verdict.kill


def test_daily_loss_blocks_entries_for_24h():
    """−%4 günlük zarar → 24 saat yeni giriş yok, pozisyonlar yönetilmeye devam."""
    verdict = RiskEngine().evaluate(state(equity=9_600.0), NOW)
    assert not verdict.allow_entry
    trip = next(t for t in verdict.trips if t.breaker == CircuitBreaker.DAILY_LOSS)
    assert trip.entries_blocked_until == NOW + timedelta(hours=24)
    assert not trip.close_positions
    assert not trip.requires_manual_restart
    assert "mevcut pozisyonlar yönetilmeye devam" in trip.message


def test_daily_loss_just_above_limit_allows():
    """−%3.9 henüz tetiklemez — eşik kesindir."""
    verdict = RiskEngine().evaluate(state(equity=9_610.0), NOW)
    assert verdict.allow_entry


def test_weekly_loss_requires_manual_restart():
    verdict = RiskEngine().evaluate(state(equity=9_200.0, equity_start_of_day=9_200.0), NOW)
    trip = next(t for t in verdict.trips if t.breaker == CircuitBreaker.WEEKLY_LOSS)
    assert trip.requires_manual_restart
    assert not trip.close_positions
    assert not verdict.allow_entry
    assert verdict.requires_manual_restart


def test_max_drawdown_triggers_kill_switch():
    """−%15 drawdown → tüm botlar STOPPED, pozisyonlar kapatılır."""
    verdict = RiskEngine().evaluate(
        state(equity=8_500.0, equity_start_of_day=8_500.0, equity_start_of_week=8_500.0),
        NOW,
    )
    trip = next(t for t in verdict.trips if t.breaker == CircuitBreaker.MAX_DRAWDOWN)
    assert trip.close_positions
    assert trip.requires_manual_restart
    assert trip.level == "CRITICAL"
    assert verdict.kill
    assert not verdict.allow_entry


def test_consecutive_losses_pause_six_hours():
    verdict = RiskEngine().evaluate(state(consecutive_losses=5), NOW)
    trip = next(t for t in verdict.trips if t.breaker == CircuitBreaker.CONSECUTIVE_LOSSES)
    assert trip.entries_blocked_until == NOW + timedelta(hours=6)
    assert not verdict.allow_entry


def test_four_consecutive_losses_still_allowed():
    assert RiskEngine().evaluate(state(consecutive_losses=4), NOW).allow_entry


def test_stale_data_blocks_new_orders_but_not_stops():
    verdict = RiskEngine().evaluate(state(data_stale=True), NOW)
    trip = next(t for t in verdict.trips if t.breaker == CircuitBreaker.STALE_DATA)
    assert not verdict.allow_entry
    assert not trip.close_positions
    assert "stop'lar aktif kalıyor" in trip.message


def test_ip_ban_stops_everything_without_retry():
    verdict = RiskEngine().evaluate(state(api_banned=True), NOW)
    trip = next(t for t in verdict.trips if t.breaker == CircuitBreaker.IP_BAN)
    assert trip.level == "CRITICAL"
    assert "Otomatik yeniden deneme yapılmıyor" in trip.message
    assert not verdict.allow_entry


def test_api_error_rate_degrades_but_does_not_block():
    """DEGRADED bir durum bildirimidir; tek başına girişi kapatmaz."""
    verdict = RiskEngine().evaluate(state(api_error_rate=0.25), NOW)
    assert verdict.degraded
    assert verdict.allow_entry


def test_existing_block_still_honoured():
    verdict = RiskEngine().evaluate(state(entries_blocked_until=NOW + timedelta(hours=3)), NOW)
    assert not verdict.allow_entry
    assert any("giriş yasağı" in r for r in verdict.reasons)


def test_expired_block_is_released():
    verdict = RiskEngine().evaluate(state(entries_blocked_until=NOW - timedelta(minutes=1)), NOW)
    assert verdict.allow_entry


def test_manual_halt_blocks():
    assert not RiskEngine().evaluate(state(manual_halt=True), NOW).allow_entry


def test_multiple_breakers_all_reported():
    """Aynı anda birden çok kesici tetiklenirse hepsi raporlanır — biri saklanmaz."""
    verdict = RiskEngine().evaluate(
        state(equity=8_000.0, consecutive_losses=6, data_stale=True), NOW
    )
    breakers = {t.breaker for t in verdict.trips}
    assert CircuitBreaker.MAX_DRAWDOWN in breakers
    assert CircuitBreaker.WEEKLY_LOSS in breakers
    assert CircuitBreaker.DAILY_LOSS in breakers
    assert CircuitBreaker.CONSECUTIVE_LOSSES in breakers
    assert CircuitBreaker.STALE_DATA in breakers


def test_custom_limits_from_definition():
    limits = RiskLimits.from_definition({"daily_loss": -0.02, "max_drawdown": -0.10})
    verdict = RiskEngine(limits).evaluate(state(equity=9_750.0), NOW)
    assert not verdict.allow_entry


def test_state_return_helpers():
    s = state(equity=11_000.0, equity_peak=12_000.0)
    assert s.daily_return == pytest.approx(0.10)
    assert s.drawdown == pytest.approx(11_000 / 12_000 - 1)


def test_zero_baseline_does_not_divide_by_zero():
    s = state(equity=100.0, equity_start_of_day=0.0, equity_peak=0.0)
    assert s.daily_return == 0.0
    assert s.drawdown == 0.0


# --------------------------------------------------------------------------- #
#  API hata oranı penceresi
# --------------------------------------------------------------------------- #
def test_api_error_tracker_windowing():
    tracker = ApiErrorTracker()
    for i in range(10):
        tracker.record(NOW + timedelta(seconds=i), is_error=i < 3)
    assert tracker.rate(NOW + timedelta(seconds=10)) == pytest.approx(0.3)

    # 6 dakika sonra pencere boşalır.
    assert tracker.rate(NOW + timedelta(minutes=6)) == 0.0
    assert len(tracker) == 0


def test_api_error_tracker_empty_is_zero():
    assert ApiErrorTracker().rate(NOW) == 0.0


# --------------------------------------------------------------------------- #
#  Kesici olayı gerçekten yayınlanabiliyor mu? — 2026-08-16
#
# `_check_risk` hem `level=trip.level` geçiyor hem `**trip.as_dict()` açıyordu;
# `as_dict()` zaten `level` taşıdığı için Python `TypeError` fırlatıyordu. Sonuç:
# bir kesici tetiklendiği **anda** karar barı çöküyor ve kesicinin altındaki
# satırlar (DEGRADED'e geçiş, giriş bloğu, kill switch) hiç çalışmıyordu. Risk
# yolu, en az sınanan yol olduğu için bu 15 Ağustos'tan beri fark edilmemişti.
# --------------------------------------------------------------------------- #


class _FakeBus:
    def __init__(self) -> None:
        self.events: list[tuple] = []

    async def emit(self, kind, level="INFO", **payload) -> None:
        self.events.append((str(kind), level, payload))


class _FakeSession:
    def __init__(self) -> None:
        self.added: list = []

    def add(self, obj) -> None:
        self.added.append(obj)


@pytest.mark.asyncio
async def test_kesici_olayi_typeerror_atmadan_yayinlanir():
    from sarnic.bots.worker import BotWorker
    from sarnic.core.enums import EventKind

    verdict = RiskEngine(RiskLimits()).evaluate(state(equity=8_500.0), NOW)  # −%15 → kill
    assert verdict.trips, "test kurulumu bozuk: kesici tetiklenmeliydi"

    bus = _FakeBus()
    worker = BotWorker(bot_id=1, bus=bus)
    session = _FakeSession()

    for trip in verdict.trips:
        await worker._emit(session, EventKind.RISK_CIRCUIT_BREAKER, **trip.as_dict())

    assert len(bus.events) == len(verdict.trips)
    _kind, level, payload = bus.events[0]
    assert level == verdict.trips[0].level
    assert payload["breaker"] == str(verdict.trips[0].breaker)
    assert len(session.added) == len(verdict.trips)


@pytest.mark.asyncio
async def test_check_risk_kesici_tetiklendiginde_cokmez(monkeypatch):
    """Asıl regresyon: kusur `_check_risk`'in çağrı yerindeydi.

    Yukarıdaki test `_emit`'in yükü kabul ettiğini gösterir; bu test kesici
    tetiklendiğinde **karar yolunun** ayakta kaldığını ve kesicinin durum
    değişikliğini gerçekten uyguladığını gösterir. Düzeltmeden önce burada
    `TypeError` yükseliyordu.
    """
    from sarnic.bots import worker as worker_mod
    from sarnic.bots.portfolio import PortfolioSnapshot
    from sarnic.bots.worker import BotWorker
    from sarnic.strategy.definition import StrategyDefinition

    async def _not_stale(_redis) -> bool:
        return False

    async def _no_redis(self):
        return None

    monkeypatch.setattr(worker_mod, "data_is_stale", _not_stale)
    monkeypatch.setattr(BotWorker, "redis", _no_redis)

    bus = _FakeBus()
    w = BotWorker(bot_id=1, bus=bus)

    # −%4 günlük zarar: giriş bloklanır ama kill switch tetiklenmez, yani
    # `_close_all` çağrılmaz ve test yürütme katmanına ihtiyaç duymaz.
    snapshot = PortfolioSnapshot(
        bot_id=1,
        cash=9_600.0,
        equity_start_of_day=10_000.0,
        equity_start_of_week=10_000.0,
        equity_peak=10_000.0,
    )

    class _Bot:
        entries_blocked_until = None
        state = None
        halt_reason = None

    bot = _Bot()
    verdict = await w._check_risk(_FakeSession(), bot, StrategyDefinition(), snapshot)

    assert not verdict.allow_entry, "−%4 günlük zarar girişi bloklamalı"
    assert bot.entries_blocked_until is not None, "kesici durum değişikliği uygulanmadı"
    assert [kind for kind, _, _ in bus.events] == ["risk.circuit_breaker"]


@pytest.mark.asyncio
async def test_rebase_sonrasi_hafta_capasi_yeni_sermayedir(api_session):
    """Sermaye tabanı dıştan sıfırlanınca eski özsermaye kayıp çapası olamaz.

    Maratonun ikinci dakikasında yaşandı: 2985→400 sıfırlaması WEEKLY_LOSS'a
    "−%87 haftalık kayıp" gibi göründü ve 8 botu durdurdu. `rebased_at`
    varken hafta/gün çapası re-base'in gerisine bakmaz; dürüst taban yeni
    sermayenin kendisidir.
    """
    from decimal import Decimal

    from sarnic.bots.portfolio import load_snapshot
    from sarnic.db.models import EquityPoint
    from tests.test_api import make_bot

    bot, _ = await make_bot(api_session, "rebase-test")
    now = datetime.now(UTC)
    hafta_basi = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    # Eski taban: hafta başından önce 2985'lik bir nokta.
    api_session.add(
        EquityPoint(
            bot_id=bot.id,
            at=hafta_basi - timedelta(hours=2),
            equity=Decimal("2985"),
            cash=Decimal("2985"),
            exposure=Decimal("0"),
            open_positions=0,
        )
    )
    bot.capital = Decimal("400")
    bot.cash = Decimal("400")
    await api_session.flush()

    # Kontrol: re-base kaydı YOKKEN çapa eski noktadır (hata buydu).
    zehirli = await load_snapshot(api_session, bot, {}, now=now)
    assert zehirli.equity_start_of_week == 2985.0

    # re-base kaydıyla çapa yeni sermayedir; sahte "−%87" kaybolur.
    bot.config = {"rebased_at": (hafta_basi + timedelta(hours=1)).isoformat()}
    await api_session.flush()
    temiz = await load_snapshot(api_session, bot, {}, now=now)
    assert temiz.equity_start_of_week == 400.0
    assert temiz.equity_start_of_day == 400.0


def test_blok_surerken_kesici_yeniden_tetiklenmez():
    """Bot 4'te yaşandı: her karar barı CONSECUTIVE_LOSSES'ı yeniden tetikleyip
    blokajı ileri kaydırıyordu — 6 saatlik duraklatma sonsuz kilide dönüştü.
    Blok sürerken blok veren kesiciler susar; giriş mevcut-yasak yoluyla kapalı
    kalır."""
    now = datetime(2026, 9, 3, 2, 0, tzinfo=UTC)
    state = RiskState(
        equity=380.0,
        equity_start_of_day=400.0,  # −%5: günlük limit de aşık
        equity_start_of_week=400.0,
        equity_peak=400.0,
        consecutive_losses=9,
        entries_blocked_until=now + timedelta(hours=5),
    )
    verdict = RiskEngine().evaluate(state, now)
    assert not verdict.allow_entry, "blok sürerken giriş kapalı kalmalı"
    tetikler = {str(t.breaker) for t in verdict.trips}
    assert "CircuitBreaker.CONSECUTIVE_LOSSES" not in tetikler
    assert "CircuitBreaker.DAILY_LOSS" not in tetikler

    # Blok dolduktan sonra: seri affedilmişse (0) giriş açılır.
    sonra = now + timedelta(hours=6)
    temiz = RiskState(
        equity=380.0,
        equity_start_of_day=380.0,
        equity_start_of_week=400.0,
        equity_peak=400.0,
        consecutive_losses=0,  # affetme: bloktan sonra işlem yok
        entries_blocked_until=state.entries_blocked_until,
    )
    v2 = RiskEngine().evaluate(temiz, sonra)
    assert v2.allow_entry, "ceza çekildi + seri affedildi → sonda bir deneme hakkı"


@pytest.mark.asyncio
async def test_ardisik_zarar_serisi_blokajdan_sonra_sayilir(api_session):
    """`since` verildiğinde eski kayıplar seriye girmez — çekilen ceza affeder."""
    from decimal import Decimal

    from sarnic.bots.portfolio import consecutive_losses
    from sarnic.db.models import Position, Trade
    from tests.test_api import make_bot

    bot, _ = await make_bot(api_session, "af-test")
    blok = datetime(2026, 9, 3, 7, 30, tzinfo=UTC)
    for i in range(6):  # blokajdan ÖNCE 6 zarar
        poz = Position(
            bot_id=bot.id,
            symbol="XUSDT",
            qty=Decimal("1"),
            entry_price=Decimal("1"),
            entry_time=blok - timedelta(hours=7 - i),
            stop=Decimal("0.9"),
            initial_stop=Decimal("0.9"),
            status="CLOSED",
        )
        api_session.add(poz)
        await api_session.flush()
        api_session.add(
            Trade(
                position_id=poz.id,
                bot_id=bot.id,
                symbol="XUSDT",
                exit_price=Decimal("1"),
                exit_time=blok - timedelta(hours=6 - i),
                exit_reason="STOP",
                pnl=Decimal("-5"),
                pnl_r=Decimal("-1"),
                fees=Decimal("0"),
                slippage_bps=Decimal("0"),
                mfe=Decimal("0"),
                mae=Decimal("-1"),
                hold_hours=Decimal("1"),
                strategy_version_id=bot.strategy_version_id,
            )
        )
    await api_session.flush()

    assert await consecutive_losses(api_session, bot.id) == 6
    assert await consecutive_losses(api_session, bot.id, since=blok) == 0
