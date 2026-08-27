"""Textual TUI — MASTER-SPEC §16, DESIGN §9. Bloomberg kehribar-siyah.

Beş ekran, tek tuşla geçiş:
  [1] NÖBET   — durum çubuğu, puan tablosu, açık pozisyonlar, canlı log
  [2] SEMBOL  — Puan Kartı'nın metin hâli (aileler, sebepler, S/R merdiveni)
  [3] FİLO    — bot listesi + bot başına eylem (p/r/s/x SEÇİLİ bota)
  [4] POZİSYON— açık / kapanan / emirler sekmeleri
  [5] OLAY    — tam ekran log; Space dondurur, L seviye süzer

Komut satırı `:` — dilbilgisi web terminaliyle birebir (`commands.py`).

Bozulmaz kural 4: TUI botun kendisi değildir. Burada DB/Binance yoktur;
her veri FastAPI'den gelir, her eylem FastAPI'ye gider.

Yoklama ekran başınadır: aktif olmayan ekranın zamanlayıcısı durur —
beş ekranın beşi birden API'yi dövmez.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
from collections import deque
from typing import ClassVar

from rich.text import Text
from textual import on, work
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen, Screen
from textual.widgets import (
    DataTable,
    Footer,
    Input,
    Label,
    RichLog,
    Sparkline,
    Static,
    TabbedContent,
    TabPane,
)

from sarnic.tui.client import ApiClient, AuthError, human_error
from sarnic.tui.commands import parse_command
from sarnic.tui.format import (
    AMBER,
    DIM,
    GREEN,
    GREY,
    ORANGE,
    RED,
    event_level,
    local_hms,
    log_text,
    num_cell,
    pct_cell,
    signed_cell,
    tr_num,
)

CSS = """
Screen { background: #07090B; color: #C9D3D9; }
#statusbar { height: 1; background: #0D1114; color: #C9D3D9; padding: 0 1; }
#statusbar.stale { background: #8B0000; color: white; }
.panel { border: solid #1A2126; background: #0D1114; }
.panel-title {
    background: #12181C; color: #FFB000; height: 1; padding: 0 1; text-style: bold;
}
#scores { width: 55%; }
#positions { width: 45%; }
#log { height: 32%; }
DataTable { background: #0D1114; }
DataTable > .datatable--header { background: #12181C; color: #FFB000; text-style: bold; }
DataTable > .datatable--cursor { background: #1A2126; }
RichLog { background: #07090B; }
Sparkline { height: 2; }
Sparkline > .sparkline--min-color { color: #6b4a00; }
Sparkline > .sparkline--max-color { color: #FFB000; }
ModalScreen { align: center middle; }
#dialog {
    width: 64; height: auto; border: thick #FFB000; background: #0D1114; padding: 1 2;
}
#dialog Label { color: #FFB000; }
#warning { color: #FF4D4D; text-style: bold; }
.section-title { color: #FFB000; text-style: bold; height: 1; padding: 0 1; }
.mono { padding: 0 1; }
#cmdline { dock: bottom; height: 1; display: none; }
#cmdline.open { display: block; }
"""


# --------------------------------------------------------------------- #
#  Modal ekranlar
# --------------------------------------------------------------------- #
class LoginScreen(ModalScreen[tuple[str, str, str]]):
    """Parola + TOTP. 2FA zorunludur."""

    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label("HIGHWATER — giriş")
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
                "Tüm botlar durur, açık emirler iptal edilir. Geri alınamaz.", id="warning"
            )
            yield Input(placeholder="doğrulama kodu (6 hane)", id="code", max_length=8)
            yield Static("Enter onaylar · Esc iptal eder")

    def on_mount(self) -> None:
        self.query_one("#code", Input).focus()

    @on(Input.Submitted)
    def submit(self) -> None:
        self.dismiss(self.query_one("#code", Input).value.strip() or None)

    def key_escape(self) -> None:
        self.dismiss(None)


class ConfirmScreen(ModalScreen[bool]):
    """Genel onay — devre kesiciyle durmuş botu başlatmak gibi."""

    def __init__(self, baslik: str, mesaj: str) -> None:
        super().__init__()
        self._baslik = baslik
        self._mesaj = mesaj

    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label(self._baslik)
            yield Static(self._mesaj, id="warning")
            yield Static("e onaylar · Esc vazgeçer")

    def key_e(self) -> None:
        self.dismiss(True)

    def key_escape(self) -> None:
        self.dismiss(False)


class CommandLine(ModalScreen[str | None]):
    """Komut satırı — dilbilgisi web terminaliyle birebir."""

    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label("Komut")
            yield Input(placeholder="POS · LOG · SCAN 80 · SOLUSDT SC · THYAO.IS …", id="cmd")
            yield Static("Enter çalıştırır · Esc kapatır", id="hint")

    def on_mount(self) -> None:
        self.query_one("#cmd", Input).focus()

    @on(Input.Submitted)
    def submit(self) -> None:
        self.dismiss(self.query_one("#cmd", Input).value.strip())

    def key_escape(self) -> None:
        self.dismiss(None)


class SymbolPrompt(ModalScreen[str | None]):
    def compose(self) -> ComposeResult:
        with Vertical(id="dialog"):
            yield Label("Sembol")
            yield Input(placeholder="örn. SOLUSDT ya da THYAO.IS", id="sym")

    def on_mount(self) -> None:
        self.query_one("#sym", Input).focus()

    @on(Input.Submitted)
    def submit(self) -> None:
        self.dismiss(self.query_one("#sym", Input).value.strip().upper() or None)

    def key_escape(self) -> None:
        self.dismiss(None)


# --------------------------------------------------------------------- #
#  Ortak ekran tabanı
# --------------------------------------------------------------------- #
class BaseScreen(Screen):
    """Durum çubuğu + ekran içeriği. Yoklama yalnız ekran GÖRÜNÜRKEN çalışır."""

    POLL_SECONDS = 5.0

    @property
    def tui(self) -> SarnicTUI:
        return self.app  # type: ignore[return-value]

    def compose(self) -> ComposeResult:
        yield Static("bağlanıyor…", id="statusbar")
        yield from self.compose_body()
        yield Footer()

    def compose_body(self) -> ComposeResult:  # pragma: no cover - alt sınıflar doldurur
        yield from ()

    def on_screen_resume(self) -> None:
        self._timer = self.set_interval(self.POLL_SECONDS, self._tick, pause=False)
        self._tick()

    def on_screen_suspend(self) -> None:
        timer = getattr(self, "_timer", None)
        if timer is not None:
            timer.stop()

    def _tick(self) -> None:
        if self.tui.client.access_token:
            self.run_worker(self.fetch(), exclusive=True, exit_on_error=False)

    async def fetch(self) -> None:  # pragma: no cover - alt sınıflar doldurur
        return

    def render_statusbar(self) -> None:
        with contextlib.suppress(Exception):
            bar = self.query_one("#statusbar", Static)
            bar.set_class(bool(self.tui.status.get("market_data_stale")), "stale")
            bar.update(self.tui.status_line())


# --------------------------------------------------------------------- #
#  [1] NÖBET
# --------------------------------------------------------------------- #
class WatchScreen(BaseScreen):
    def compose_body(self) -> ComposeResult:
        with Horizontal():
            with Vertical(id="scores", classes="panel"):
                yield Static("PUAN TABLOSU", classes="panel-title", id="scores-title")
                yield DataTable(id="score-table", zebra_stripes=False, cursor_type="row")
            with Vertical(id="positions", classes="panel"):
                yield Static("AÇIK POZİSYONLAR", classes="panel-title")
                yield DataTable(id="position-table", zebra_stripes=False, cursor_type="row")
        with Vertical(id="log", classes="panel"):
            yield Static("CANLI LOG", classes="panel-title")
            yield RichLog(id="log-view", markup=False, highlight=False, wrap=False)

    def on_mount(self) -> None:
        scores = self.query_one("#score-table", DataTable)
        scores.add_columns("sembol", "puan", "Δ1B", "trend", "mom", "akış", "vol", "s/r")
        positions = self.query_one("#position-table", DataTable)
        positions.add_columns("sembol", "bot", "p/l %", "R", "değer", "stop", "süre")
        for satir in self.tui.log_buffer:
            self.query_one("#log-view", RichLog).write(satir)

    async def fetch(self) -> None:
        tui = self.tui
        # Panel başına bağımsız: biri düşünce dördü birden donmaz.
        results = await asyncio.gather(
            tui.client.status(),
            tui.client.scores(
                limit=14,
                config_hash=tui.active_config.get("config_hash"),
                timeframe=tui.active_config.get("timeframe"),
                min_score=tui.min_score,
            ),
            tui.client.positions(),
            tui.client.portfolio(),
            return_exceptions=True,
        )
        status, scores, positions, portfolio = results
        if not isinstance(status, BaseException):
            tui.status = status
        if not isinstance(portfolio, BaseException):
            tui.portfolio = portfolio
        elif isinstance(portfolio, Exception):
            tui.portfolio = {}
            tui.log_line("ERROR", f"portföy alınamadı: {human_error(portfolio)}")
        self.render_statusbar()
        if isinstance(scores, BaseException):
            tui.log_line("ERROR", f"puanlar alınamadı: {human_error(scores)}")
        else:
            self.render_scores(scores)
        if isinstance(positions, BaseException):
            tui.log_line("ERROR", f"pozisyonlar alınamadı: {human_error(positions)}")
        else:
            self.render_positions(positions)

    def render_scores(self, scores: list[dict]) -> None:
        tui = self.tui
        cfg = tui.active_config
        title = self.query_one("#scores-title", Static)
        if cfg:
            bar = local_hms(cfg.get("bar_time")) if cfg.get("bar_time") else "—"
            title.update(
                f"PUAN TABLOSU · {cfg.get('timeframe', '?')} · "
                f"{cfg.get('label') or 'adsız'} {str(cfg.get('config_hash', ''))[:4]} · bar {bar}"
                + (f" · süzgeç ≥{tr_num(tui.min_score, 0)}" if tui.min_score else "")
            )
        table = self.query_one("#score-table", DataTable)
        table.clear()
        for row in scores:
            symbol = row["symbol"]
            if tui.filter_text and tui.filter_text not in symbol:
                continue
            fam = row.get("families", {})
            onceki = tui.prev_scores.get(symbol)
            delta = None if onceki is None else row["score"] - onceki
            table.add_row(
                symbol,
                num_cell(row["score"], 1),
                signed_cell(delta, 1),
                num_cell(fam.get("trend"), 1),
                num_cell(fam.get("momentum"), 1),
                num_cell(fam.get("flow"), 1),
                num_cell(fam.get("vol"), 1),
                num_cell(fam.get("sr"), 1),
                key=symbol,
            )
        bar_time = scores[0].get("bar_time") if scores else None
        if bar_time and bar_time != tui.prev_bar_time:
            tui.prev_bar_time = bar_time
            tui.prev_scores = {r["symbol"]: r["score"] for r in scores}

    def render_positions(self, positions: list[dict]) -> None:
        table = self.query_one("#position-table", DataTable)
        table.clear()
        botlar = {b["bot_id"]: b["name"] for b in self.tui.portfolio.get("bots", [])}
        from datetime import datetime

        now = datetime.now().astimezone()
        for p in positions:
            pct = p.get("unrealized_pct")
            value = (p.get("last_price") or p["entry_price"]) * p["qty"]
            entry = datetime.fromisoformat(p["entry_time"])
            hours = (now - entry).total_seconds() / 3600
            risk = p["entry_price"] - p["initial_stop"]
            r = (
                ((p.get("last_price") or p["entry_price"]) - p["entry_price"]) / risk
                if risk > 0
                else None
            )
            table.add_row(
                p["symbol"],
                Text(str(botlar.get(p["bot_id"], p["bot_id"]))[:14], style=DIM),
                pct_cell(pct),
                signed_cell(r, 2),
                num_cell(value, 2),
                num_cell(p["stop"], 6),
                Text(f"{hours:5.0f}s", justify="right", style=GREY),
            )

    @on(DataTable.RowSelected, "#score-table")
    def open_symbol(self, event: DataTable.RowSelected) -> None:
        if event.row_key and event.row_key.value:
            self.tui.show_symbol(str(event.row_key.value))


# --------------------------------------------------------------------- #
#  [2] SEMBOL — Puan Kartı'nın metin hâli
# --------------------------------------------------------------------- #
class SymbolScreen(BaseScreen):
    POLL_SECONDS = 30.0

    def compose_body(self) -> ComposeResult:
        with Vertical(classes="panel"):
            yield Static("SEMBOL", classes="panel-title", id="sym-title")
            yield Static("", classes="mono", id="sym-score")
            yield Static("", classes="mono", id="sym-bar")
            yield Static("Son 7 gün", classes="section-title")
            yield Sparkline([], id="sym-spark")
            yield Static("Başlıca sebepler", classes="section-title")
            yield Static("", classes="mono", id="sym-drivers")
            yield Static("Yüzdelikler", classes="section-title")
            yield Static("", classes="mono", id="sym-pct")
        with Horizontal():
            with Vertical(classes="panel"):
                yield Static("S/R MERDİVENİ", classes="panel-title")
                yield DataTable(id="sym-sr", zebra_stripes=False, cursor_type="none")
            with Vertical(classes="panel"):
                yield Static("FORMASYONLAR", classes="panel-title")
                yield Static("", classes="mono", id="sym-pat")

    def on_mount(self) -> None:
        self.query_one("#sym-sr", DataTable).add_columns("tür", "fiyat", "güç", "dokunuş")

    async def fetch(self) -> None:
        tui = self.tui
        symbol = tui.current_symbol
        self.render_statusbar()
        if not symbol:
            self.query_one("#sym-title", Static).update("SEMBOL — seçilmedi ( s ile seç )")
            return
        cfg = tui.active_config.get("config_hash")
        detail, sr, pat, hist = await asyncio.gather(
            tui.client.score_detail(symbol, cfg),
            tui.client.sr_levels(symbol),
            tui.client.patterns(symbol),
            tui.client.score_history(symbol, days=7, config_hash=cfg),
            return_exceptions=True,
        )
        self.query_one("#sym-title", Static).update(f"SEMBOL · {symbol}")

        if isinstance(detail, BaseException):
            self.query_one("#sym-score", Static).update(
                Text(f"puan alınamadı: {human_error(detail)}", style=RED)
            )
        else:
            self.render_detail(detail)
        if not isinstance(hist, BaseException) and hist:
            self.query_one("#sym-spark", Sparkline).data = [h["score"] for h in hist]
        if isinstance(sr, BaseException):
            self.query_one("#sym-sr", DataTable).clear()
        else:
            self.render_sr(sr)
        if not isinstance(pat, BaseException):
            self.render_patterns(pat)

    def render_detail(self, detail: dict) -> None:
        fam = detail.get("families", {})
        mods = detail.get("modifiers", {})
        rationale = detail.get("rationale") or {}
        score = detail.get("score", 0.0)

        # Yığılmış aile çubuğu — gerçek oranlarda blok karakter; düzeltme
        # çubuğun SONUNDA ayrı parça (katkı ≠ düzeltme, DESIGN §5).
        line = Text()
        renkler = {
            "trend": "#1d4ed8",
            "momentum": "#ea580c",
            "flow": "#0d9488",
            "vol": "#a855f7",
            "sr": "#db2777",
        }
        for aile in ("trend", "momentum", "flow", "vol", "sr"):
            deger = fam.get(aile) or 0.0
            blok = max(0, round(deger))
            line.append("█" * blok + " ", style=renkler[aile])
        toplam_mod = sum(v for v in mods.values() if isinstance(v, int | float))
        if toplam_mod:
            line.append(
                f"▏{'+' if toplam_mod > 0 else ''}{tr_num(toplam_mod, 1)}",
                style=AMBER if toplam_mod > 0 else RED,
            )
        basi = Text()
        basi.append(f"PUAN {tr_num(score, 1)}", style=f"bold {AMBER}")
        aileler = ("trend", "momentum", "flow", "vol", "sr")
        basi.append(
            "   " + "  ".join(f"{a} {tr_num(fam.get(a), 1)}" for a in aileler),
            style=GREY,
        )
        self.query_one("#sym-score", Static).update(basi)
        self.query_one("#sym-bar", Static).update(line)

        drivers = rationale.get("top_drivers") or []
        metin = Text()
        for d in drivers[:3]:
            metin.append(f"  • {d}\n", style=GREY)
        if not drivers:
            metin.append("  —", style=DIM)
        self.query_one("#sym-drivers", Static).update(metin)

        pcts = rationale.get("percentiles") or {}
        satir = "  ".join(f"{k} {tr_num(v, 0)}" for k, v in list(pcts.items())[:8]) or "—"
        self.query_one("#sym-pct", Static).update(Text(satir, style=GREY))

    def render_sr(self, sr: dict) -> None:
        table = self.query_one("#sym-sr", DataTable)
        table.clear()
        tur = {"support": "destek", "resistance": "direnç", "poc": "POC", "value_area": "değer"}
        for lv in (sr.get("levels") or [])[:12]:
            table.add_row(
                tur.get(lv.get("kind"), lv.get("kind", "?")),
                num_cell(lv.get("price"), 6),
                Text("●" * min(5, round(lv.get("strength") or 0)), style=AMBER),
                num_cell(lv.get("touches"), 0),
            )

    def render_patterns(self, pat: dict) -> None:
        matches = pat.get("matches") or []
        metin = Text()
        for m in matches[:6]:
            ad = m.get("name") or m.get("pattern") or "?"
            metin.append(f"  {ad}\n", style=GREY)
        if not matches:
            metin.append("  aktif formasyon yok", style=DIM)
        self.query_one("#sym-pat", Static).update(metin)

    def key_s(self) -> None:
        self.app.push_screen(SymbolPrompt(), self._set_symbol)

    def _set_symbol(self, symbol: str | None) -> None:
        if symbol:
            self.tui.current_symbol = symbol
            self._tick()


# --------------------------------------------------------------------- #
#  [3] FİLO — bot başına eylem
# --------------------------------------------------------------------- #
class FleetScreen(BaseScreen):
    POLL_SECONDS = 10.0

    def compose_body(self) -> ComposeResult:
        with Vertical(classes="panel"):
            yield Static("FİLO", classes="panel-title", id="fleet-title")
            yield DataTable(id="fleet-table", zebra_stripes=False, cursor_type="row")
        with Vertical(id="log", classes="panel"):
            yield Static("SEÇİLİ BOTUN OLAYLARI (⏎)", classes="panel-title")
            yield RichLog(id="fleet-events", markup=False, highlight=False, wrap=False)

    def on_mount(self) -> None:
        table = self.query_one("#fleet-table", DataTable)
        table.add_columns(
            "id", "ad", "durum", "tf", "sermaye", "özsermaye", "getiri", "nakit", "poz", "sebep"
        )

    async def fetch(self) -> None:
        tui = self.tui
        bots, live, load, status = await asyncio.gather(
            tui.client.bots(),
            tui.client.portfolio(),
            tui.client.system_load(),
            tui.client.status(),
            return_exceptions=True,
        )
        if not isinstance(status, BaseException):
            tui.status = status
        if not isinstance(live, BaseException):
            tui.portfolio = live
        self.render_statusbar()
        if isinstance(load, BaseException):
            self.query_one("#fleet-title", Static).update("FİLO")
        else:
            self.query_one("#fleet-title", Static).update(
                f"FİLO · yük {tr_num(load.get('load_1'), 2)} / {load.get('cores', '?')} çekirdek"
            )
        if isinstance(bots, BaseException):
            tui.log_line("ERROR", f"botlar alınamadı: {human_error(bots)}")
            return
        self._bots = {b["id"]: b for b in bots}
        table = self.query_one("#fleet-table", DataTable)
        onceki = table.cursor_row
        table.clear()
        renk = {
            "PAPER_RUNNING": GREEN,
            "PAUSED": ORANGE,
            "DEGRADED": ORANGE,
            "ERROR": RED,
            "STOPPED": DIM,
            "DRAFT": DIM,
        }
        for b in bots:
            getiri = (
                (b["equity"] / b["capital"] - 1)
                if b.get("equity") is not None and b.get("capital")
                else None
            )
            table.add_row(
                Text(str(b["id"]), justify="right", style=DIM),
                Text(b["name"][:34]),
                Text(b["state"], style=renk.get(b["state"], GREY)),
                b["timeframe"],
                num_cell(b.get("capital"), 0),
                num_cell(b.get("equity"), 2),
                pct_cell(getiri),
                num_cell(b.get("cash"), 0),
                num_cell(b.get("open_positions"), 0),
                Text((b.get("halt_reason") or "")[:18], style=ORANGE),
                key=str(b["id"]),
            )
        with contextlib.suppress(Exception):
            if onceki is not None and table.row_count:
                table.move_cursor(row=min(onceki, table.row_count - 1))

    def _selected_bot(self) -> dict | None:
        table = self.query_one("#fleet-table", DataTable)
        if table.cursor_row is None or not table.row_count:
            return None
        key = table.coordinate_to_cell_key((table.cursor_row, 0)).row_key.value
        return getattr(self, "_bots", {}).get(int(key)) if key else None

    # Eylemler SEÇİLİ bota — toplu p/r kaldırıldı (tehlikeliydi).
    def key_p(self) -> None:
        bot = self._selected_bot()
        if bot:
            self._act("pause", bot)

    def key_r(self) -> None:
        bot = self._selected_bot()
        if not bot:
            return
        if bot.get("halt_reason"):
            # Devre kesiciyle durmuş botu tek tuşla, sebebini göstermeden
            # başlatmak eski TUI'nin en tehlikeli davranışıydı.
            self.app.push_screen(
                ConfirmScreen(
                    "DEVRE KESİCİ",
                    f"{bot['name']} şu sebeple durdu: {bot['halt_reason']}.\n"
                    "Sebep ortadan kalkmadıysa başlatmak aynı kaybı tekrarlar.",
                ),
                lambda onay: self._act("start", bot) if onay else None,
            )
            return
        self._act("start", bot)

    def key_s(self) -> None:
        bot = self._selected_bot()
        if bot:
            self._act("stop", bot)

    def key_x(self) -> None:
        bot = self._selected_bot()
        if not bot:
            return
        self.app.push_screen(
            ConfirmScreen(
                "BOT KILL",
                f"{bot['name']} durdurulacak ve açık pozisyonları kapatılacak.",
            ),
            lambda onay: self._act("kill", bot) if onay else None,
        )

    @work(exclusive=False, exit_on_error=False)
    async def _act(self, verb: str, bot: dict) -> None:
        tui = self.tui
        try:
            fn = {
                "pause": tui.client.pause_bot,
                "start": tui.client.start_bot,
                "stop": tui.client.stop_bot,
                "kill": tui.client.kill_bot,
            }[verb]
            await fn(bot["id"])
            tui.log_line("INFO", f"{bot['name']}: {verb} gönderildi")
        except Exception as exc:
            tui.log_line("ERROR", f"{bot['name']}: {human_error(exc)}")
        self._tick()

    @on(DataTable.RowSelected, "#fleet-table")
    def show_events(self) -> None:
        bot = self._selected_bot()
        if bot:
            self.run_worker(self._load_events(bot), exclusive=True, exit_on_error=False)

    async def _load_events(self, bot: dict) -> None:
        view = self.query_one("#fleet-events", RichLog)
        view.clear()
        try:
            events = await self.tui.client.bot_events(bot["id"], limit=30)
        except Exception as exc:
            view.write(log_text("ERROR", human_error(exc), local_hms(None)))
            return
        for ev in events:
            seviye = event_level(ev.get("kind", ""), ev.get("level"))
            mesaj = (ev.get("payload") or {}).get("message") or ev.get("kind", "")
            view.write(log_text(seviye, str(mesaj), local_hms(ev.get("created_at"))))


# --------------------------------------------------------------------- #
#  [4] POZİSYON / İŞLEM
# --------------------------------------------------------------------- #
class PositionsScreen(BaseScreen):
    POLL_SECONDS = 15.0

    def compose_body(self) -> ComposeResult:
        with TabbedContent(id="pos-tabs"):
            with TabPane("Açık", id="tab-open"):
                yield DataTable(id="pos-open", zebra_stripes=False, cursor_type="row")
            with TabPane("Kapanan", id="tab-closed"):
                yield DataTable(id="pos-closed", zebra_stripes=False, cursor_type="row")
            with TabPane("Emirler", id="tab-orders"):
                yield DataTable(id="pos-orders", zebra_stripes=False, cursor_type="row")

    def on_mount(self) -> None:
        self.query_one("#pos-open", DataTable).add_columns(
            "sembol", "bot", "miktar", "giriş", "güncel", "stop", "p/l %", "R", "süre"
        )
        self.query_one("#pos-closed", DataTable).add_columns(
            "sembol", "bot", "çıkış", "sebep", "k/z", "R", "süre"
        )
        self.query_one("#pos-orders", DataTable).add_columns(
            "zaman", "sembol", "yön", "durum", "miktar", "fiyat", "sebep"
        )

    async def fetch(self) -> None:
        tui = self.tui
        positions, trades, orders, status = await asyncio.gather(
            tui.client.positions(),
            tui.client.trades(limit=40),
            tui.client.orders(limit=40),
            tui.client.status(),
            return_exceptions=True,
        )
        if not isinstance(status, BaseException):
            tui.status = status
        self.render_statusbar()
        botlar = {b["bot_id"]: b["name"] for b in tui.portfolio.get("bots", [])}
        from datetime import datetime

        now = datetime.now().astimezone()

        if not isinstance(positions, BaseException):
            table = self.query_one("#pos-open", DataTable)
            table.clear()
            for p in positions:
                entry = datetime.fromisoformat(p["entry_time"])
                hours = (now - entry).total_seconds() / 3600
                risk = p["entry_price"] - p["initial_stop"]
                last = p.get("last_price")
                r = ((last or p["entry_price"]) - p["entry_price"]) / risk if risk > 0 else None
                table.add_row(
                    p["symbol"],
                    Text(str(botlar.get(p["bot_id"], p["bot_id"]))[:16], style=DIM),
                    num_cell(p["qty"], 4),
                    num_cell(p["entry_price"], 6),
                    num_cell(last, 6),
                    num_cell(p["stop"], 6),
                    pct_cell(p.get("unrealized_pct")),
                    signed_cell(r, 2),
                    Text(f"{hours:5.0f}s", justify="right", style=GREY),
                )
        if not isinstance(trades, BaseException):
            table = self.query_one("#pos-closed", DataTable)
            table.clear()
            sebep = {
                "STOP": "stop",
                "TRAILING": "iz süren",
                "BREAKEVEN": "başabaş",
                "SCORE": "puan",
                "TIME": "süre",
                "ROTATION": "rotasyon",
                "KILL_SWITCH": "KILL",
                "DELIST": "delist",
            }
            for t in trades:
                sure = None
                if t.get("entry_time") and t.get("exit_time"):
                    d1 = datetime.fromisoformat(t["entry_time"])
                    d2 = datetime.fromisoformat(t["exit_time"])
                    sure = (d2 - d1).total_seconds() / 3600
                table.add_row(
                    t["symbol"],
                    Text(str(botlar.get(t["bot_id"], t["bot_id"]))[:16], style=DIM),
                    local_hms(t.get("exit_time")),
                    sebep.get(t.get("exit_reason"), t.get("exit_reason", "?")),
                    signed_cell(t.get("pnl"), 2),
                    signed_cell(t.get("pnl_r"), 2),
                    Text("—" if sure is None else f"{sure:4.0f}s", justify="right", style=GREY),
                )
        if not isinstance(orders, BaseException):
            table = self.query_one("#pos-orders", DataTable)
            table.clear()
            for o in orders:
                table.add_row(
                    local_hms(o.get("created_at")),
                    o["symbol"],
                    "alış" if str(o.get("side", "")).upper() == "BUY" else "satış",
                    o.get("status", "?"),
                    num_cell(o.get("qty"), 4),
                    num_cell(o.get("avg_price") or o.get("price"), 6),
                    Text((o.get("reject_reason") or "")[:28], style=DIM),
                )

    def show_orders_tab(self) -> None:
        with contextlib.suppress(Exception):
            self.query_one("#pos-tabs", TabbedContent).active = "tab-orders"


# --------------------------------------------------------------------- #
#  [5] OLAY — tam ekran log
# --------------------------------------------------------------------- #
class EventsScreen(BaseScreen):
    POLL_SECONDS = 30.0  # yalnız durum çubuğu; olaylar WS'ten düşer

    LEVELS = ("HEPSİ", "SCORE", "ENTRY", "EXIT", "RISK", "WARN", "ERROR", "CRITICAL")

    def __init__(self) -> None:
        super().__init__()
        self.level_index = 0
        self.frozen = False

    def compose_body(self) -> ComposeResult:
        with Vertical(classes="panel"):
            yield Static(
                "OLAY AKIŞI · L seviye · Space dondur", classes="panel-title", id="ev-title"
            )
            yield RichLog(id="events-view", markup=False, highlight=False, wrap=False)

    def on_screen_resume(self) -> None:
        super().on_screen_resume()
        self._repaint()

    async def fetch(self) -> None:
        with contextlib.suppress(Exception):
            self.tui.status = await self.tui.client.status()
        self.render_statusbar()

    def _repaint(self) -> None:
        view = self.query_one("#events-view", RichLog)
        view.clear()
        seviye = self.LEVELS[self.level_index]
        for level, satir in self.tui.event_buffer:
            if seviye == "HEPSİ" or level == seviye:
                view.write(satir)
        self.query_one("#ev-title", Static).update(
            f"OLAY AKIŞI · seviye: {seviye} · {'DONDURULDU' if self.frozen else 'akıyor'}"
            " · L seviye · Space dondur"
        )

    def add_event(self, level: str, satir: Text) -> None:
        if self.frozen:
            return
        seviye = self.LEVELS[self.level_index]
        if seviye == "HEPSİ" or level == seviye:
            with contextlib.suppress(Exception):
                self.query_one("#events-view", RichLog).write(satir)

    def key_l(self) -> None:
        self.level_index = (self.level_index + 1) % len(self.LEVELS)
        self._repaint()

    def key_space(self) -> None:
        # Akan ekrandan bir şey okunamaz — Bloomberg'in kırmızı <CANCEL>
        # tuşunun taşınabilir karşılığı.
        self.frozen = not self.frozen
        with contextlib.suppress(Exception):
            self.query_one("#events-view", RichLog).auto_scroll = not self.frozen
        self._repaint()


# --------------------------------------------------------------------- #
#  Uygulama
# --------------------------------------------------------------------- #
class SarnicTUI(App[None]):
    CSS = CSS
    TITLE = "HIGHWATER"

    MODES: ClassVar = {
        "nobet": WatchScreen,
        "sembol": SymbolScreen,
        "filo": FleetScreen,
        "pozisyon": PositionsScreen,
        "olay": EventsScreen,
    }

    BINDINGS: ClassVar = [
        ("1", "mode('nobet')", "nöbet"),
        ("2", "mode('sembol')", "sembol"),
        ("3", "mode('filo')", "filo"),
        ("4", "mode('pozisyon')", "pozisyon"),
        ("5", "mode('olay')", "olay"),
        (":", "command", "komut"),
        ("k", "kill", "KILL"),
        ("f", "focus_filter", "filtre"),
        ("q", "quit", "çık"),
    ]

    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.client = ApiClient(base_url=base_url)
        self.connection_state = "connecting"
        self.status: dict = {}
        self.portfolio: dict = {}
        self.filter_text = ""
        self.min_score = 0.0
        self.configs: list[dict] = []
        self.active_config: dict = {}
        self.current_symbol = ""
        self.prev_scores: dict[str, float] = {}
        self.prev_bar_time: str | None = None
        self.log_buffer: deque[Text] = deque(maxlen=400)
        self.event_buffer: deque[tuple[str, Text]] = deque(maxlen=1000)
        self._tasks: list[asyncio.Task] = []

    async def on_mount(self) -> None:
        await self.switch_mode("nobet")
        credentials = _env_credentials()
        if credentials:
            self.run_worker(self._authenticate(*credentials), exit_on_error=False)
        else:
            self.push_screen(LoginScreen(), self._after_login)

    def _after_login(self, result: tuple[str, str, str] | None) -> None:
        if result is None:
            self.exit()
            return
        self.run_worker(self._authenticate(*result), exclusive=True, exit_on_error=False)

    async def _authenticate(self, email: str, password: str, code: str) -> None:
        try:
            await self.client.login(email, password, code)
        except AuthError as exc:
            self.log_line("ERROR", str(exc))
            self.push_screen(LoginScreen(), self._after_login)
            return
        except Exception as exc:
            # API kapalıyken traceback ile ölmek yerine söylenir ve giriş
            # ekranına dönülür.
            self.log_line("ERROR", human_error(exc))
            self.push_screen(LoginScreen(), self._after_login)
            return
        self.log_line("INFO", f"{email} olarak bağlanıldı")
        await self._load_configs()
        self._tasks = [asyncio.create_task(self._event_loop(), name="tui-events")]
        # Aktif ekran hemen tazelensin.
        if isinstance(self.screen, BaseScreen):
            self.screen._tick()

    async def _load_configs(self) -> None:
        try:
            self.configs = await self.client.score_configs()
        except Exception as exc:
            self.log_line("ERROR", f"sıralamalar alınamadı: {human_error(exc)}")
            self.configs = []
        if self.configs and not self.active_config:
            self.active_config = self.configs[0]

    # ------------------------------------------------------------------ #
    async def _event_loop(self) -> None:
        def on_state(state: str) -> None:
            self.connection_state = state

        try:
            async for message in self.client.stream(on_state=on_state):
                self.handle_event(message)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self.log_line("ERROR", f"olay akışı koptu: {human_error(exc)}")

    def handle_event(self, message: dict) -> None:
        if message.get("channel") == "history":
            for event in message.get("events", [])[-60:]:
                self.log_event(event)
            return
        if message.get("channel") == "pong":
            return
        event = message.get("event")
        if event:
            self.log_event(event)
            if event.get("kind") == "scores.updated" and isinstance(self.screen, WatchScreen):
                self.screen._tick()

    def log_event(self, event: dict) -> None:
        kind = event.get("kind", "")
        payload = event.get("payload", {})
        level = event_level(kind, event.get("level"))
        message = payload.get("message") or _fallback_message(kind, payload)
        self.log_line(level, str(message), local_hms(event.get("at")))

    def log_line(self, level: str, message: str, stamp: str | None = None) -> None:
        satir = log_text(level, message, stamp or local_hms(None))
        self.log_buffer.append(satir)
        self.event_buffer.append((level, satir))
        with contextlib.suppress(Exception):
            self.query_one("#log-view", RichLog).write(satir)
        if isinstance(self.screen, EventsScreen):
            self.screen.add_event(level, satir)

    # ------------------------------------------------------------------ #
    def status_line(self) -> str:
        status, portfolio = self.status, self.portfolio
        indicator = {
            "connected": "⬤ CANLI",
            "reconnecting": "⬤ YENİDEN BAĞLANIYOR",
            "connecting": "⬤ BAĞLANIYOR",
        }.get(self.connection_state, "⬤ KOPUK")

        # Veri yokken sıfır UYDURULMAZ — çizgi basılır.
        if portfolio:
            equity = tr_num(portfolio.get("equity"), 2)
            getiri = portfolio.get("total_return")
            getiri_s = f"{'+' if (getiri or 0) > 0 else ''}%{tr_num(abs(getiri or 0) * 100, 2)}"
            poz = str(portfolio.get("open_positions", "—"))
        else:
            equity, getiri_s, poz = "—", "—", "—"
        parts = [
            f"{status.get('mode', '—')}",
            f"{equity} USDT",
            getiri_s,
            f"{poz} poz",
            f"havuz {status.get('universe_size', '—')}",
            f"bot {status.get('running_bots', '—')}/{status.get('total_bots', '—')}",
            f"alarm {status.get('alarms', '—')}",
            indicator,
        ]
        text = "  ·  ".join(str(p) for p in parts)
        if status.get("market_data_stale"):
            text += "  ·  CANLI VERİ KESİLDİ — yeni emir gönderilmiyor"
        return text

    # ------------------------------------------------------------------ #
    #  Eylemler
    # ------------------------------------------------------------------ #
    async def action_mode(self, mode: str) -> None:
        await self.switch_mode(mode)

    def show_symbol(self, symbol: str) -> None:
        self.current_symbol = symbol
        self.run_worker(self.switch_mode("sembol"), exit_on_error=False)

    def action_command(self) -> None:
        self.push_screen(CommandLine(), self._run_command)

    def _run_command(self, raw: str | None) -> None:
        if not raw:
            return
        cmd = parse_command(raw)
        if cmd is None:
            return
        if cmd.kind == "error":
            self.log_line("WARN", cmd.message)
            return
        if cmd.kind == "kill":
            self.action_kill()
            return
        if cmd.kind == "scan":
            self.min_score = cmd.arg or 0.0
            self.log_line("INFO", f"puan süzgeci: ≥ {tr_num(self.min_score, 0)}")
            self.run_worker(self.switch_mode("nobet"), exit_on_error=False)
            return
        if cmd.kind == "symbol":
            self.show_symbol(cmd.symbol)
            return
        if cmd.kind == "open":
            hedef = cmd.target.split(":")[0]
            if hedef == "havuz":
                self.run_worker(self._show_pool(), exclusive=True, exit_on_error=False)
                return
            self.run_worker(self._open_target(cmd.target), exit_on_error=False)

    async def _open_target(self, target: str) -> None:
        hedef, _, alt = target.partition(":")
        await self.switch_mode(hedef)
        if hedef == "pozisyon" and alt == "emirler" and isinstance(self.screen, PositionsScreen):
            self.screen.show_orders_tab()

    async def _show_pool(self) -> None:
        try:
            snap = await self.client.universe()
        except Exception as exc:
            self.log_line("ERROR", f"havuz alınamadı: {human_error(exc)}")
            return
        self.log_line(
            "INFO",
            f"havuz {snap.get('size')} sembol · giren {len(snap.get('added', []))} "
            f"· çıkan {len(snap.get('removed', []))} · {snap.get('reason', '')}",
        )

    def action_kill(self) -> None:
        self.push_screen(KillConfirm(), self._do_kill)

    def _do_kill(self, code: str | None) -> None:
        if not code:
            self.log_line("INFO", "kill switch iptal edildi")
            return
        self.run_worker(self._kill(code), exit_on_error=False)

    async def _kill(self, code: str) -> None:
        try:
            result = await self.client.kill_switch(code)
            self.log_line("CRITICAL", f"KILL SWITCH — {result.get('message', '')}")
        except Exception as exc:
            self.log_line("ERROR", f"kill switch başarısız: {human_error(exc)}")

    def action_focus_filter(self) -> None:
        self.push_screen(FilterScreen(), self._set_filter)

    def _set_filter(self, value: str | None) -> None:
        self.filter_text = (value or "").upper()
        self.log_line("INFO", f"filtre: {self.filter_text or '(temizlendi)'}")

    def action_cycle_config(self) -> None:
        if not self.configs:
            return
        idx = next(
            (
                i
                for i, c in enumerate(self.configs)
                if c.get("config_hash") == self.active_config.get("config_hash")
                and c.get("timeframe") == self.active_config.get("timeframe")
            ),
            -1,
        )
        self.active_config = self.configs[(idx + 1) % len(self.configs)]
        self.prev_scores = {}
        self.prev_bar_time = None
        if isinstance(self.screen, WatchScreen):
            self.screen._tick()

    def key_c(self) -> None:
        self.action_cycle_config()

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
