"""TUI biçim yardımcıları — sayı, zaman, seviye.

Kural 6 terminalde de geçerlidir: her sayı sabit genişlik ve sağa hizalı.
Sayı biçimi tr-TR'dir (binlik nokta, ondalık virgül) — panelle aynı dil.
"""

from __future__ import annotations

from datetime import datetime

from rich.text import Text

#: DESIGN §2 paletinin terminal karşılığı.
AMBER = "#FFB000"
GREEN = "#26D07C"
RED = "#FF4D4D"
CYAN = "#4EC9E0"
ORANGE = "#FF8A3D"
GREY = "grey62"
DIM = "grey42"

LEVEL_STYLES = {
    "INFO": GREY,
    "SCORE": AMBER,
    "ENTRY": GREEN,
    "EXIT": CYAN,
    "RISK": ORANGE,
    "WARN": ORANGE,
    "ERROR": RED,
    "CRITICAL": "white on #8B0000",
}


def tr_num(value: float | None, digits: int = 2) -> str:
    """tr-TR sayı: 1.234,56. `None` uydurma sıfır değil, `—`dir."""
    if value is None:
        return "—"
    s = f"{value:,.{digits}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".")


def num_cell(value: float | None, digits: int = 2, style: str = "") -> Text:
    """Sağa hizalı sayı hücresi (kural 6)."""
    return Text(tr_num(value, digits), justify="right", style=style)


def signed_cell(value: float | None, digits: int = 2) -> Text:
    if value is None:
        return Text("—", justify="right", style=DIM)
    style = GREEN if value > 0 else RED if value < 0 else GREY
    isaret = "+" if value > 0 else ""
    return Text(f"{isaret}{tr_num(value, digits)}", justify="right", style=style)


def pct_cell(value: float | None, digits: int = 2) -> Text:
    """Oran → yüzde, işaret yüzde iminin önünde: -%0,4."""
    if value is None:
        return Text("—", justify="right", style=DIM)
    style = GREEN if value > 0 else RED if value < 0 else GREY
    isaret = "+" if value > 0 else "-" if value < 0 else ""
    return Text(f"{isaret}%{tr_num(abs(value) * 100, digits)}", justify="right", style=style)


def local_hms(iso: str | None) -> str:
    """Sunucu damgası (UTC) → yerel saat.

    Eski TUI dize dilimliyordu (`at[11:19]`): sunucu olayları UTC, TUI'nin
    kendi satırları yerel — ekranda yan yana 3 saatlik fark vardı ve sistem
    donmuş sanılıyordu.
    """
    if not iso:
        return datetime.now().astimezone().strftime("%H:%M:%S")
    try:
        return datetime.fromisoformat(iso).astimezone().strftime("%H:%M:%S")
    except ValueError:
        return iso[11:19]


def event_level(kind: str, level: str | None) -> str:
    """Önce türe göre varsayılan, sonra sunucunun seviyesi KAZANIR.

    Eski eşleme tersti: `risk.` öneki sunucudan gelen CRITICAL'ı eziyordu —
    kill switch ve MAX_DRAWDOWN turuncu RISK görünüyor, kırmızı zemin stili
    hiç tetiklenmiyordu.
    """
    out = "INFO"
    if kind == "position.opened":
        out = "ENTRY"
    elif kind == "position.closed":
        out = "EXIT"
    elif kind in ("score.threshold_crossed", "scores.updated"):
        out = "SCORE"
    elif kind.startswith("risk."):
        out = "RISK"
    if level in ("CRITICAL", "ERROR", "WARN"):
        out = level
    return out


def log_text(level: str, message: str, stamp: str) -> Text:
    style = LEVEL_STYLES.get(level, GREY)
    text = Text(no_wrap=True)
    text.append(f"{stamp}  ", style=DIM)
    text.append(f"{level:<8}", style=style)
    text.append(message, style=style if level == "CRITICAL" else "")
    return text
