"""Textual TUI — MASTER-SPEC §16, DESIGN §9.

Bloomberg kehribar-siyah kimliği. Dört panel: durum çubuğu, puan tablosu,
açık pozisyonlar, canlı log.

Her sayı monospace ve sağa hizalı (bozulmaz kural 6).
"""

from __future__ import annotations

import asyncio
import contextlib
import os
from datetime import datetime
from typing import ClassVar

from rich.text import Text
from textual import on, work
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import (
    DataTable,
    Footer,
    Header,
    Input,
    Label,
    RichLog,
    Static,
)

from sarnic.tui.client import ApiClient, AuthError

BANNER = r"""
   ▄▄▄  ▄▄▄  ▄▄▄  ▄▄  ▖ ▄▄▄  ▄▄▄
   ▚▄   ▙▄▟  ▚▄▘  ▛▚ ▌  ▐    ▚▄
   ▄▄▛  ▛ ▜  ▛ ▚  ▌ ▚▌  ▟▄▖  ▄▄▛     paper · v0.1.0
   ────────────────────────────────────────────────
"""

# DESIGN §2 paletinin terminal karşılığı.
LEVEL_STYLES = {
    "INFO": "grey62",
    "SCORE": "#FFB000",
    "ENTRY": "#26D07C",
    "EXIT": "#4EC9E0",
    "RISK": "#FF8A3D",
    "WARN": "#FF8A3D",
    "ERROR": "#FF4D4D",
    "CRITICAL": "white on #8B0000",
}

CSS = """
Screen { background: #07090B; color: #C9D3D9; }
#banner { color: #FFB000; height: auto; padding: 0 1; }
#statusbar {
    height: 1; background: #0D1114; color: #C9D3D9; padding: 0 1;
}
#statusbar.stale { background: #8B0000; color: white; }
.panel { border: solid #1A2126; background: #0D1114; }
.panel-title {
    background: #12181C; color: #FFB000; height: 1; padding: 0 1; text-style: bold;
}
#scores { width: 50%; }
#positions { width: 50%; }
#log { height: 40%; }
DataTable { background: #0D1114; }
DataTable > .datatable--header { background: #12181C; color: #FFB000; text-style: bold; }
DataTable > .datatable--cursor { background: #1A2126; }
RichLog { background: #07090B; }
ModalScreen { align: center middle; }
#dialog {
    width: 60; height: auto; border: thick #FFB000; background: #0D1114; padding: 1 2;
}
#dialog Label { color: #FFB000; }
#warning { color: #FF4D4D; text-style: bold; }
"""


class LoginScreen(ModalScreen[tuple[str, str, str]]):
    """Parola + TOTP. 2FA zorunludur."""

    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label("SARNIÇ — giriş")
            yield Input(placeholder="e-posta", id="email")
            yield Input(placeholder="parola", password=True, id="password")
            yield Input(placeholder="doğrulama kodu (6 hane)", id="code", max_length=8)
            yield Static("Enter ile giriş yapın · Esc çıkar", id="hint")

    def on_mount(self) -> None:
        self.query_one("#email", Input).focus()

    @on(Input.Submitted)
    def submit(self) -> None:
        email = self.query_one("#email", Input).value.strip()
        password = self.query_one("#password", Input).value
        code = self.query_one("#code", Input).value.strip()
        if email and password and code:
            self.dismiss((email, password, code))

    def key_escape(self) -> None:
        self.app.exit()


class KillConfirm(ModalScreen[str | None]):
    """Kill switch onayı. Risk uyarısı yumuşatılmaz (DESIGN §7)."""

    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label("KILL SWITCH")
            yield Static(
                "Tüm botlar durur, açık emirler iptal edilir. Geri alınamaz.",
                id="warning",
            )
            yield Input(placeholder="doğrulama kodu (6 hane)", id="code", max_length=8)
            yield Static("Enter onaylar · Esc iptal eder")

    def on_mount(self) -> None:
        self.query_one("#code", Input).focus()

    @on(Input.Submitted)
    def submit(self) -> None:
        code = self.query_one("#code", Input).value.strip()
        self.dismiss(code or None)

    def key_escape(self) -> None:
        self.dismiss(None)


class SarnicTUI(App[None]):
    CSS = CSS
    TITLE = "SARNIÇ"

    BINDINGS: ClassVar = [
        ("p", "pause", "duraklat"),
        ("r", "resume", "devam"),
        ("k", "kill", "KILL"),
        ("f", "focus_filter", "filtre"),
        ("/", "focus_filter", "ara"),
        ("q", "quit", "çık"),
    ]

    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.client = ApiClient(base_url=base_url)
        self.connection_state = "connecting"
        self.status: dict = {}
        self.filter_text = ""
        self._tasks: list[asyncio.Task] = []

    # ------------------------------------------------------------------ #
    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Static(BANNER, id="banner")
        yield Static("bağlanıyor…", id="statusbar")
        with Horizontal():
            with Vertical(id="scores", classes="panel"):
                yield Static("PUAN TABLOSU", classes="panel-title")
                yield DataTable(id="score-table", zebra_stripes=False, cursor_type="row")
            with Vertical(id="positions", classes="panel"):
                yield Static("AÇIK POZİSYONLAR", classes="panel-title")
                yield DataTable(id="position-table", zebra_stripes=False, cursor_type="row")
        with Vertical(id="log", classes="panel"):
            yield Static("CANLI LOG", classes="panel-title")
            yield RichLog(id="log-view", markup=False, highlight=False, wrap=False)
        yield Footer()

    async def on_mount(self) -> None:
        scores = self.query_one("#score-table", DataTable)
        scores.add_columns("sembol", "puan", "trend", "mom", "akış", "vol", "s/r")
        positions = self.query_one("#position-table", DataTable)
        positions.add_columns("sembol", "p/l %", "değer", "stop", "süre")

        credentials = _env_credentials()
        if credentials:
            await self._authenticate(*credentials)
        else:
            self.push_screen(LoginScreen(), self._after_login)

    def _after_login(self, result: tuple[str, str, str] | None) -> None:
        if result is None:
            self.exit()
            return
        self.run_worker(self._authenticate(*result), exclusive=True)

    async def _authenticate(self, email: str, password: str, code: str) -> None:
        try:
            await self.client.login(email, password, code)
        except AuthError as exc:
            self.log_line("ERROR", str(exc))
            self.push_screen(LoginScreen(), self._after_login)
            return
        self.log_line("INFO", f"{email} olarak bağlanıldı")
        self.start_streams()

    def start_streams(self) -> None:
        self._tasks = [
            asyncio.create_task(self._poll_loop(), name="tui-poll"),
            asyncio.create_task(self._event_loop(), name="tui-events"),
        ]

    # ------------------------------------------------------------------ #
    async def _poll_loop(self) -> None:
        while True:
            try:
                await self.refresh_data()
            except Exception as exc:
                self.log_line("ERROR", f"veri alınamadı: {exc}")
            await asyncio.sleep(5)

    async def refresh_data(self) -> None:
        status, scores, positions, portfolio = await asyncio.gather(
            self.client.status(),
            self.client.scores(limit=12),
            self.client.positions(),
            self.client.portfolio(),
        )
        self.status = status
        self.render_status(status, portfolio)
        self.render_scores(scores)
        self.render_positions(positions)

    async def _event_loop(self) -> None:
        def on_state(state: str) -> None:
            self.connection_state = state
            self.render_status(self.status, None)

        try:
            async for message in self.client.stream(on_state=on_state):
                self.handle_event(message)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self.log_line("ERROR", f"olay akışı koptu: {exc}")

    def handle_event(self, message: dict) -> None:
        if message.get("channel") == "history":
            for event in message.get("events", [])[-40:]:
                self.log_event(event)
            return
        if message.get("channel") == "pong":
            return
        event = message.get("event")
        if event:
            self.log_event(event)

    def log_event(self, event: dict) -> None:
        kind = event.get("kind", "")
        payload = event.get("payload", {})
        level = event.get("level", "INFO")
        if kind == "position.opened":
            level = "ENTRY"
        elif kind == "position.closed":
            level = "EXIT"
        elif kind in ("score.threshold_crossed", "scores.updated"):
            level = "SCORE"
        elif kind.startswith("risk."):
            level = "RISK"

        message = payload.get("message") or _fallback_message(kind, payload)
        stamp = event.get("at", "")[11:19]
        self.log_line(level, message, stamp)

    def log_line(self, level: str, message: str, stamp: str | None = None) -> None:
        stamp = stamp or datetime.now().strftime("%H:%M:%S")
        style = LEVEL_STYLES.get(level, "grey62")
        text = Text(no_wrap=True)
        text.append(f"{stamp}  ", style="grey42")
        text.append(f"{level:<8}", style=style)
        text.append(message, style=style if level == "CRITICAL" else "")
        with contextlib.suppress(Exception):
            self.query_one("#log-view", RichLog).write(text)

    # ------------------------------------------------------------------ #
    def render_status(self, status: dict, portfolio: dict | None) -> None:
        bar = self.query_one("#statusbar", Static)
        stale = bool(status.get("market_data_stale"))
        bar.set_class(stale, "stale")

        indicator = {
            "connected": "⬤ CANLI",
            "reconnecting": "⬤ YENİDEN BAĞLANIYOR",
            "connecting": "⬤ BAĞLANIYOR",
        }.get(self.connection_state, "⬤ KOPUK")

        equity = pnl = 0.0
        open_positions = 0
        if portfolio:
            total = portfolio.get("total", {})
            equity = total.get("equity", 0.0)
            bots = portfolio.get("bots", [])
            open_positions = sum(b.get("open_positions", 0) for b in bots)
            pnl = sum(b.get("total_return", 0.0) for b in bots) / max(len(bots), 1)

        parts = [
            f"{status.get('mode', 'paper')}",
            f"{equity:,.2f} USDT",
            f"{pnl * 100:+.2f}%",
            f"{open_positions} poz",
            f"havuz {status.get('universe_size', 0)}",
            f"bot {status.get('running_bots', 0)}/{status.get('total_bots', 0)}",
            f"alarm {status.get('alarms', 0)}",
            indicator,
        ]
        text = "  ·  ".join(parts)
        if stale:
            text += "  ·  CANLI VERİ KESİLDİ — yeni emir gönderilmiyor"
        bar.update(text)

    def render_scores(self, scores: list[dict]) -> None:
        table = self.query_one("#score-table", DataTable)
        table.clear()
        for row in scores:
            if self.filter_text and self.filter_text.upper() not in row["symbol"]:
                continue
            families = row.get("families", {})
            table.add_row(
                row["symbol"],
                _num(row["score"], 1),
                _num(families.get("trend", 0), 1),
                _num(families.get("momentum", 0), 1),
                _num(families.get("flow", 0), 1),
                _num(families.get("vol", 0), 1),
                _num(families.get("sr", 0), 1),
            )

    def render_positions(self, positions: list[dict]) -> None:
        table = self.query_one("#position-table", DataTable)
        table.clear()
        now = datetime.now().astimezone()
        for p in positions:
            pct = p.get("unrealized_pct")
            value = (p.get("last_price") or p["entry_price"]) * p["qty"]
            entry_time = datetime.fromisoformat(p["entry_time"])
            hours = (now - entry_time).total_seconds() / 3600
            colour = "#26D07C" if (pct or 0) >= 0 else "#FF4D4D"
            table.add_row(
                p["symbol"],
                Text(f"{(pct or 0) * 100:+7.2f}", style=colour),
                _num(value, 2),
                _num(p["stop"], 6),
                f"{hours:5.0f}s",
            )

    # ------------------------------------------------------------------ #
    #  Eylemler
    # ------------------------------------------------------------------ #
    @work(exclusive=False)
    async def action_pause(self) -> None:
        for bot in await self.client.bots():
            if bot["state"] in ("PAPER_RUNNING", "DEGRADED"):
                await self.client.pause_bot(bot["id"])
                self.log_line("RISK", f"{bot['name']} duraklatıldı")

    @work(exclusive=False)
    async def action_resume(self) -> None:
        for bot in await self.client.bots():
            if bot["state"] in ("PAUSED", "STOPPED"):
                await self.client.start_bot(bot["id"])
                self.log_line("INFO", f"{bot['name']} devam ediyor")

    def action_kill(self) -> None:
        self.push_screen(KillConfirm(), self._do_kill)

    def _do_kill(self, code: str | None) -> None:
        if not code:
            self.log_line("INFO", "kill switch iptal edildi")
            return
        self.run_worker(self._kill(code))

    async def _kill(self, code: str) -> None:
        try:
            result = await self.client.kill_switch(code)
            self.log_line("CRITICAL", f"KILL SWITCH — {result.get('message', '')}")
        except Exception as exc:
            self.log_line("ERROR", f"kill switch başarısız: {exc}")

    def action_focus_filter(self) -> None:
        self.push_screen(FilterScreen(), self._set_filter)

    def _set_filter(self, value: str | None) -> None:
        self.filter_text = value or ""
        self.log_line("INFO", f"filtre: {self.filter_text or '(temizlendi)'}")

    async def on_unmount(self) -> None:
        for task in self._tasks:
            task.cancel()
        await self.client.close()


class FilterScreen(ModalScreen[str | None]):
    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label("Sembol filtresi")
            yield Input(placeholder="örn. SOL — boş bırakırsanız temizlenir", id="filter")

    def on_mount(self) -> None:
        self.query_one("#filter", Input).focus()

    @on(Input.Submitted)
    def submit(self) -> None:
        self.dismiss(self.query_one("#filter", Input).value.strip())

    def key_escape(self) -> None:
        self.dismiss(None)


def _num(value: float | None, digits: int) -> Text:
    """Sağa hizalı, sabit basamaklı sayı — bozulmaz kural 6."""
    if value is None:
        return Text("—", justify="right")
    return Text(f"{value:,.{digits}f}", justify="right")


def _fallback_message(kind: str, payload: dict) -> str:
    if kind == "pool.updated":
        return (
            f"havuz {payload.get('size')} sembol · giren {len(payload.get('added', []))} "
            f"· çıkan {len(payload.get('removed', []))}"
        )
    if kind == "score.threshold_crossed":
        items = payload.get("symbols", [])[:4]
        return "eşik aşıldı: " + ", ".join(f"{i['symbol']} {i['score']:.1f}" for i in items)
    return kind


def _env_credentials() -> tuple[str, str, str] | None:
    """SSH oturumunda her seferinde parola girmemek için (opsiyonel)."""
    email = os.getenv("SARNIC_TUI_EMAIL")
    password = os.getenv("SARNIC_TUI_PASSWORD")
    code = os.getenv("SARNIC_TUI_CODE")
    if email and password and code:
        return email, password, code
    return None


def run_tui(base_url: str) -> None:
    SarnicTUI(base_url).run()
