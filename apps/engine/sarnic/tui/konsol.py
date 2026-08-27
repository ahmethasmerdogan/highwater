"""Açılış konsolu — fastfetch tarzı durum kartı + canlı AL/SAT akışı.

Sistem açılınca bir terminalde bu çalışır: solda SARNIÇ işareti (ASCII),
sağda kutulu durum bölümleri (fastfetch dili: ``├─`` satırları, dolum
çubukları), altında gerçek zamanlı işlem akışı. Bozulmaz kural 4 geçerli:
bu bir İSTEMCİDİR — veri FastAPI'den, olaylar WS'ten gelir; konsolu
kapatmak botları durdurmaz.

Kimlik: ``SARNIC_TUI_EMAIL / SARNIC_TUI_PASSWORD / SARNIC_TUI_CODE``
ortam değişkenleri (autostart için) ya da etkileşimli giriş.
"""

from __future__ import annotations

import asyncio
import contextlib
import getpass
import os
from datetime import datetime

from rich.columns import Columns
from rich.console import Console, Group
from rich.text import Text

from sarnic.tui.client import ApiClient, AuthError, human_error
from sarnic.tui.format import event_level, local_hms, log_text, tr_num

AMBER = "#FFB000"
GREEN = "#26D07C"
RED = "#FF4D4D"
CYAN = "#4EC9E0"
DIM = "grey42"
GREY = "grey62"

# SARNIÇ işareti — kubbeli hazne, su seviyesi, sudan yükselen ölçüm oku.
LOGO = r"""
        .:+###########+:.
      +#####################+
    +########*'''''*##########+
   +######*           *########+
  +######               ########+
  ######      .#####.     #######
  #####      ########+     ######
  #####     +###+####+     ######
  #####    +###+  +###+    ######
  #####   ####+    ++##+   ######
  ##### -####        ###-  ######
  #####    ..  ####   ..   ######
  ######~~~~~~+####+~~~~~~#######
  +#####~~+~~~#####+~~~+~~######+
   +####+~~~~~~~~~~~~~~~~+#####+
    +########################+
      +####################+
        ':+##############:'
"""


def _bar(ratio: float | None, width: int = 14) -> Text:
    """Fastfetch dolum çubuğu: [■■■■■·········] %36."""
    out = Text()
    out.append("[", style=DIM)
    if ratio is None:
        out.append("·" * width, style=DIM)
    else:
        dolu = max(0, min(width, round(ratio * width)))
        renk = GREEN if ratio < 0.7 else AMBER if ratio < 0.9 else RED
        out.append("■" * dolu, style=renk)
        out.append("·" * (width - dolu), style=DIM)
    out.append("]", style=DIM)
    if ratio is not None:
        out.append(f" %{tr_num(ratio * 100, 0)}", style=GREY)
    return out


def _section(title: str, rows: list[tuple[str, Text]]) -> Group:
    """Fastfetch bölümü: ── Başlık ── çizgisi + ├─ satırları."""
    genis = max((len(k) for k, _ in rows), default=6)
    cizgi = Text()
    cizgi.append("┌─", style=DIM)
    cizgi.append(f" {title} ", style=f"bold {GREEN}")
    cizgi.append("─" * max(4, 30 - len(title)), style=DIM)
    parcalar: list[Text] = [cizgi]
    for i, (etiket, deger) in enumerate(rows):
        satir = Text()
        satir.append("└─ " if i == len(rows) - 1 else "├─ ", style=DIM)
        satir.append(f"{etiket:<{genis}}  ", style=f"bold {AMBER}")
        satir.append_text(deger)
        parcalar.append(satir)
    return Group(*parcalar)


def _uptime() -> str:
    try:
        with open("/proc/uptime") as f:
            saniye = float(f.read().split()[0])
        saat, dakika = int(saniye // 3600), int((saniye % 3600) // 60)
        return f"{saat} saat, {dakika} dk"
    except OSError:
        return "—"


class Konsol:
    def __init__(self, base_url: str) -> None:
        self.client = ApiClient(base_url=base_url)
        self.console = Console()

    # ------------------------------------------------------------------ #
    async def login(self) -> str:
        email = os.getenv("SARNIC_TUI_EMAIL")
        password = os.getenv("SARNIC_TUI_PASSWORD")
        code = os.getenv("SARNIC_TUI_CODE")
        if not (email and password and code):
            self.console.print(Text("SARNIÇ — giriş", style=f"bold {AMBER}"))
            email = input("  e-posta : ").strip()
            password = getpass.getpass("  parola  : ")
            code = input("  kod     : ").strip()
        await self.client.login(email, password, code)
        return email

    # ------------------------------------------------------------------ #
    async def header(self, email: str) -> None:
        status: dict = {}
        live: dict = {}
        with contextlib.suppress(Exception):
            status = await self.client.status()
        with contextlib.suppress(Exception):
            live = await self.client.portfolio()

        equity = live.get("equity")
        getiri = live.get("total_return")
        maruziyet = None
        if live.get("equity"):
            maruziyet = (live.get("exposure") or 0.0) / live["equity"]

        getiri_text = Text("—", style=DIM)
        if getiri is not None:
            renk = GREEN if getiri >= 0 else RED
            isaret = "+" if getiri > 0 else "-" if getiri < 0 else ""
            getiri_text = Text(f"{isaret}%{tr_num(abs(getiri) * 100, 2)}", style=renk)

        durum = _section(
            "Durum",
            [
                ("MOD", Text(str(status.get("mode", "—")), style=GREY)),
                (
                    "ÖZSERMAYE",
                    Text(f"{tr_num(equity, 2)} USDT" if equity is not None else "—", style=GREY),
                ),
                ("GETİRİ", getiri_text),
                (
                    "POZİSYON",
                    Text(str(live.get("open_positions", "—")), style=GREY),
                ),
                ("HAVUZ", Text(str(status.get("universe_size", "—")), style=GREY)),
                (
                    "BOT",
                    Text(
                        f"{status.get('running_bots', '—')}/{status.get('total_bots', '—')}",
                        style=GREY,
                    ),
                ),
                ("MARUZİYET", _bar(maruziyet)),
            ],
        )
        oturum = _section(
            "Oturum",
            [
                (
                    "GİRİŞ",
                    Text(
                        f"{email} // {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S')}",
                        style=GREY,
                    ),
                )
            ],
        )
        calisma = _section(
            "Çalışma / Tarih",
            [
                ("AÇIK KALMA", Text(_uptime(), style=GREY)),
                (
                    "TARİH",
                    Text(datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S"), style=GREY),
                ),
            ],
        )

        selam = Text()
        selam.append("Rast gele! ", style=f"bold {AMBER}")
        selam.append(email.split("@")[0].capitalize() + ".", style=f"bold {GREEN}")

        noktalar = Text("  ".join("●" * 1 for _ in range(8)))
        for i, stil in enumerate(
            [DIM, "white", CYAN, "#a855f7", "#1d4ed8", CYAN, GREEN, RED]
        ):
            noktalar.stylize(stil, i * 3, i * 3 + 1)

        sag = Group(
            Text(f"Selam, {email.split('@')[0]}", style="bold white"),
            Text(),
            durum,
            Text(),
            oturum,
            Text(),
            calisma,
            Text(),
            selam,
            Text(),
            noktalar,
        )
        logo = Text(LOGO, style=AMBER)
        self.console.print(Columns([logo, sag], padding=(0, 4)))
        self.console.print()
        cizgi = Text("── CANLI AKIŞ ", style=f"bold {AMBER}")
        cizgi.append("─" * max(10, self.console.width - 15), style=DIM)
        self.console.print(cizgi)

    # ------------------------------------------------------------------ #
    async def feed(self) -> None:
        """WS olay akışı — AL/SAT satırları. Kopunca kendisi yeniden bağlanır."""

        def on_state(state: str) -> None:
            stil = GREEN if state == "connected" else RED
            mesaj = "bağlandı" if state == "connected" else "yeniden bağlanıyor…"
            self.console.print(Text(f"⬤ {mesaj}", style=stil))

        async for message in self.client.stream(on_state=on_state):
            if message.get("channel") == "history":
                for event in (message.get("events") or [])[-15:]:
                    self._line(event)
                continue
            event = message.get("event")
            if event:
                self._line(event)

    def _line(self, event: dict) -> None:
        kind = event.get("kind", "")
        payload = event.get("payload") or {}
        stamp = local_hms(event.get("at"))
        if kind == "position.opened":
            metin = Text()
            metin.append(f"{stamp}  ", style=DIM)
            metin.append("AL   ", style=f"bold {GREEN}")
            metin.append(f"{event.get('symbol') or '?':<12}", style="white")
            metin.append(str(payload.get("message") or ""), style=GREY)
            self.console.print(metin)
            return
        if kind == "position.closed":
            pnl = float(payload.get("pnl") or 0.0)
            r = float(payload.get("pnl_r") or 0.0)
            renk = GREEN if pnl > 0 else RED
            metin = Text()
            metin.append(f"{stamp}  ", style=DIM)
            metin.append("SAT  ", style=f"bold {CYAN}")
            metin.append(f"{event.get('symbol') or '?':<12}", style="white")
            metin.append(
                f"{'+' if pnl > 0 else ''}{tr_num(pnl, 2)} USDT  "
                f"({'+' if r > 0 else ''}{tr_num(r, 2)}R)  ",
                style=f"bold {renk}",
            )
            metin.append(str(payload.get("reason") or ""), style=DIM)
            self.console.print(metin)
            return
        seviye = event_level(kind, event.get("level"))
        if seviye in ("RISK", "WARN", "ERROR", "CRITICAL"):
            mesaj = str(payload.get("message") or kind)
            self.console.print(log_text(seviye, mesaj, stamp))

    # ------------------------------------------------------------------ #
    async def run(self) -> None:
        try:
            email = await self.login()
        except AuthError as exc:
            self.console.print(Text(f"Giriş başarısız: {exc}", style=RED))
            return
        except Exception as exc:  # API kapalı vb.
            self.console.print(Text(human_error(exc), style=RED))
            return
        self.console.clear()
        await self.header(email)
        try:
            await self.feed()
        finally:
            await self.client.close()


def run_konsol(base_url: str) -> None:
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(Konsol(base_url).run())
