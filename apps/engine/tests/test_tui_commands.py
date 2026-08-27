"""TUI komut dilbilgisi web terminaliyle birebir mi?

Sözlük uydurulmaz: `apps/web/src/lib/terminal-commands.ts` metin olarak
okunur, GLOBAL ve PER_SYMBOL anahtarları regex ile çıkarılır ve her birinin
Python tarafında ya karşılandığı ya da AÇIKÇA reddedildiği doğrulanır.
İki arayüz sessizce ayrışamaz.
"""

from __future__ import annotations

import re
from pathlib import Path

from sarnic.tui.commands import GLOBAL, PER_SYMBOL, REJECTED, parse_command

WEB_TS = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "terminal-commands.ts"
)


def _keys(block: str) -> set[str]:
    return set(re.findall(r"^\s{2}([A-Z]+):", block, re.M))


def test_grammar_matches_web_terminal():
    src = WEB_TS.read_text(encoding="utf-8")
    global_block = src.split("const GLOBAL")[1].split("};")[0]
    per_symbol_block = src.split("const PER_SYMBOL")[1].split("};")[0]

    for key in _keys(global_block):
        assert key in GLOBAL or key in REJECTED, f"web GLOBAL {key} TUI'de karşılıksız"
    for key in _keys(per_symbol_block):
        assert key in PER_SYMBOL or key in REJECTED, f"web PER_SYMBOL {key} TUI'de karşılıksız"

    # SCAN ve BT özel biçimlidir; ikisi de ele alınmalı.
    assert parse_command("SCAN 80").kind == "scan"
    assert parse_command("BT SOLUSDT").kind == "error"


def test_global_commands():
    assert parse_command("POS").target == "pozisyon"
    assert parse_command("ORD").target == "pozisyon:emirler"
    assert parse_command("LOG").target == "olay"
    assert parse_command("POOL").target == "havuz"
    assert parse_command("KILL").kind == "kill"


def test_symbol_commands():
    cmd = parse_command("SOLUSDT")
    assert cmd.kind == "symbol" and cmd.symbol == "SOLUSDT"
    assert parse_command("SOLUSDT SC").target == "sembol"
    assert parse_command("SOLUSDT SR").target == "sembol:sr"
    # Ekli hisse sembolleri de geçer — çok pazar.
    assert parse_command("THYAO.IS").symbol == "THYAO.IS"


def test_rejections_carry_reasons():
    # Reddedilen komut sessizce yutulmaz; gerekçesi vardır.
    for raw in ("SOLUSDT G", "BT SOLUSDT", "CAL"):
        cmd = parse_command(raw)
        assert cmd.kind == "error" and len(cmd.message) > 20, raw


def test_scan_validation():
    assert parse_command("SCAN").kind == "error"
    assert parse_command("SCAN abc").kind == "error"
    assert parse_command("SCAN 75.5").arg == 75.5


def test_garbage_is_an_error_not_none():
    cmd = parse_command("asdf qwer zxcv")
    assert cmd is not None and cmd.kind == "error"
    assert parse_command("   ") is None
