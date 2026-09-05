"""Komut satırı dilbilgisi — web terminalinden BİREBİR taşındı.

Kaynak: `apps/web/src/lib/terminal-commands.ts`. Sözlük uydurulmaz; iki
arayüz aynı dili konuşur. `tests/test_tui_commands.py` web dosyasını metin
olarak okuyup her anahtarın burada ya karşılandığını ya da açıkça
"reddedilenler" listesinde olduğunu doğrular.

Reddedilenler gerekçeli reddedilir, sessizce yutulmaz (kural 7'nin ruhu):
kullanıcı yazdığı komutun neden çalışmadığını görmelidir.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SYMBOL_PATTERN = re.compile(r"^[A-Z0-9.\-]{2,20}$")

#: Tek kelimelik komutlar → hedef ekran/eylem.
GLOBAL: dict[str, str] = {
    "POOL": "havuz",
    "POS": "pozisyon",
    "ORD": "pozisyon:emirler",
    "LOG": "olay",
    "CAL": "kalibrasyon",
    "SCORES": "nobet",
    "KILL": "kill",
}

#: Sembolle kullanılanlar. G (grafik) bilinçli reddedilir — aşağıda.
PER_SYMBOL: dict[str, str] = {
    "SC": "sembol",
    "SR": "sembol:sr",
}

#: Web'de var, terminalde GEREKÇELİ reddedilen komutlar.
REJECTED: dict[str, str] = {
    "G": "Mum grafiği terminalde çizilmez — panelin İndikatörler sayfasını kullanın.",
    "BT": (
        "Backtest panelden çalıştırılır (Backtest sayfası). "
        "Koşu uzun sürer ve raporu terminalde gösterilemez."
    ),
    "CAL": (
        "Kalibrasyon grafikleri panelde: /kalibrasyon. Terminal özet sayıyı nöbet ekranında verir."
    ),
}


@dataclass(frozen=True, slots=True)
class Command:
    kind: str  # "open" | "symbol" | "scan" | "kill" | "error"
    target: str = ""
    symbol: str = ""
    arg: float | None = None
    message: str = ""


def parse_command(raw: str) -> Command | None:
    parts = raw.strip().upper().split()
    if not parts:
        return None
    first = parts[0]

    if first in REJECTED:
        return Command(kind="error", message=REJECTED[first])
    if first in GLOBAL:
        hedef = GLOBAL[first]
        if hedef == "kill":
            return Command(kind="kill")
        if hedef == "kalibrasyon":
            return Command(kind="error", message=REJECTED["CAL"])
        return Command(kind="open", target=hedef)

    if first == "SCAN":
        if len(parts) < 2 or not parts[1].replace(".", "", 1).isdigit():
            return Command(kind="error", message="SCAN bir sayı bekler. Örnek: SCAN 80")
        return Command(kind="scan", arg=float(parts[1]))

    if first == "BT":
        return Command(kind="error", message=REJECTED["BT"])

    # SEMBOL [SC|SR|G]
    if SYMBOL_PATTERN.match(first):
        if len(parts) == 1:
            return Command(kind="symbol", symbol=first, target="sembol")
        verb = parts[1]
        if verb in REJECTED:
            return Command(kind="error", message=REJECTED[verb])
        if verb in PER_SYMBOL:
            return Command(kind="symbol", symbol=first, target=PER_SYMBOL[verb])
        return Command(kind="error", message=f"Bilinmeyen komut: {verb}. SC ya da SR deneyin.")

    return Command(kind="error", message=f"Anlaşılmadı: {raw.strip()}. Yardım için ? yazın.")
