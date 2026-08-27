"""TUI güvenlik senaryoları — sahte ApiClient ile `App.run_test()`.

Faz 1'in kabul kriterleri:
(a) API ulaşılamazken uygulama KAPANMAZ; çubuk sıfır uydurmaz, `—` basar.
(b) Filo ekranında `r`, devre kesiciyle durmuş botu ONAYSIZ başlatmaz.
(c) Bir botun eylemi 403 dönerse hata Türkçedir ve uygulama ayakta kalır.
"""

from __future__ import annotations

import httpx
import pytest

from sarnic.tui.app import ConfirmScreen, FleetScreen, SarnicTUI, WatchScreen
from sarnic.tui.client import human_error
from sarnic.tui.format import event_level, local_hms, tr_num


class FakeClient:
    """Gerçek ApiClient ile aynı yüzey; ağ yok."""

    def __init__(self) -> None:
        self.access_token = "test"
        self.refresh_token = "test"
        self.started: list[int] = []
        self.bots_payload = [
            {
                "id": 1,
                "name": "Normal bot",
                "state": "PAUSED",
                "timeframe": "1h",
                "capital": 1000.0,
                "cash": 1000.0,
                "equity": 1000.0,
                "open_positions": 0,
                "halt_reason": None,
            },
            {
                "id": 2,
                "name": "Kesici bot",
                "state": "PAUSED",
                "timeframe": "1h",
                "capital": 1000.0,
                "cash": 900.0,
                "equity": 900.0,
                "open_positions": 0,
                "halt_reason": "WEEKLY_LOSS",
            },
        ]

    async def close(self) -> None:
        return

    async def status(self) -> dict:
        raise httpx.ConnectError("bağlantı yok")

    async def portfolio(self) -> dict:
        raise httpx.ConnectError("bağlantı yok")

    async def scores(self, **kw) -> list[dict]:
        raise httpx.ConnectError("bağlantı yok")

    async def positions(self) -> list[dict]:
        raise httpx.ConnectError("bağlantı yok")

    async def bots(self) -> list[dict]:
        return self.bots_payload

    async def system_load(self) -> dict:
        return {"load_1": 1.0, "cores": 4}

    async def bot_events(self, bot_id: int, limit: int = 30) -> list[dict]:
        return []

    async def start_bot(self, bot_id: int) -> dict:
        self.started.append(bot_id)
        return {}

    async def pause_bot(self, bot_id: int) -> dict:
        req = httpx.Request("POST", "http://x")
        raise httpx.HTTPStatusError(
            "403", request=req, response=httpx.Response(403, request=req, json={"detail": "yetki"})
        )

    async def stop_bot(self, bot_id: int) -> dict:
        return {}

    async def kill_bot(self, bot_id: int) -> dict:
        return {}

    async def score_configs(self) -> list[dict]:
        return []

    async def stream(self, on_state=None):  # pragma: no cover
        return
        yield  # noqa


def _app() -> SarnicTUI:
    app = SarnicTUI("http://test")
    app.client = FakeClient()  # type: ignore[assignment]
    return app


@pytest.mark.asyncio
async def test_api_down_shows_dashes_not_zeros():
    """(a) API kapalı: uygulama yaşar, çubukta sıfır değil — vardır."""
    app = _app()
    async with app.run_test(size=(120, 40)) as pilot:
        await pilot.pause()
        # Giriş ekranı üstte; altındaki nöbet ekranını al.
        screen = next(s for s in app.screen_stack if isinstance(s, WatchScreen))
        await screen.fetch()
        line = app.status_line()
        assert "—" in line
        assert "0,00 USDT" not in line
        # Hata Türkçe loglandı, uygulama ayakta.
        assert any("ulaşılamıyor" in str(t) for t in app.log_buffer)


@pytest.mark.asyncio
async def test_resume_on_circuit_breaker_bot_asks_confirmation():
    """(b) halt_reason dolu bota `r`: start ÇAĞRILMAZ, onay ekranı açılır."""
    app = _app()
    async with app.run_test(size=(120, 40)) as pilot:
        await app.switch_mode("filo")
        await pilot.pause()
        screen = app.screen
        assert isinstance(screen, FleetScreen)
        await screen.fetch()
        await pilot.pause()
        table = screen.query_one("#fleet-table")
        table.move_cursor(row=1)  # Kesici bot
        screen.key_r()
        await pilot.pause()
        assert isinstance(app.screen, ConfirmScreen)
        assert app.client.started == []  # onaysız start yok
        app.screen.key_escape()
        await pilot.pause()
        assert app.client.started == []


@pytest.mark.asyncio
async def test_normal_bot_resume_and_403_is_turkish():
    """(c) Normal bota r çalışır; 403 Türkçe loglanır, uygulama ölmez."""
    app = _app()
    async with app.run_test(size=(120, 40)) as pilot:
        await app.switch_mode("filo")
        await pilot.pause()
        screen = app.screen
        await screen.fetch()  # type: ignore[attr-defined]
        await pilot.pause()
        table = screen.query_one("#fleet-table")
        table.move_cursor(row=0)
        screen.key_r()  # normal bot: onaysız başlar
        await pilot.pause()
        assert app.client.started == [1]
        screen.key_p()  # 403 dönecek
        await pilot.pause()
        assert any("yetkiniz yok" in str(t) for t in app.log_buffer)


def test_human_error_translations():
    req = httpx.Request("GET", "http://x")
    e401 = httpx.HTTPStatusError("", request=req, response=httpx.Response(401, request=req))
    e409 = httpx.HTTPStatusError("", request=req, response=httpx.Response(409, request=req))
    assert "oturum düştü" in human_error(e401)
    assert "bot bu durumda değil" in human_error(e409)
    assert "ulaşılamıyor" in human_error(httpx.ConnectError("x"))
    # Ham httpx metni ve MDN linki asla geçmez.
    assert "developer.mozilla.org" not in human_error(e409)


def test_format_helpers():
    assert tr_num(1234.5) == "1.234,50"
    assert tr_num(None) == "—"
    # UTC damga yerel saate çevrilir (dilimleme değil).
    assert len(local_hms("2026-08-27T12:00:00+00:00")) == 8
    # Sunucunun CRITICAL'ı tür eşlemesini EZER.
    assert event_level("risk.circuit_breaker", "CRITICAL") == "CRITICAL"
    assert event_level("risk.circuit_breaker", None) == "RISK"
    assert event_level("position.opened", None) == "ENTRY"
