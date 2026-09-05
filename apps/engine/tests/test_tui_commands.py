"""TUI komut dilbilgisi.

Bu dosya eskiden TUI'yi web terminaliyle karşılaştırıyordu: iki arayüz aynı
dilbilgisini iki kez yazıyordu ve sessizce ayrışabilirlerdi. Web terminali
2026-09-05'te kaldırıldı (DESIGN-V4 §3: "her paneli daha iyi yapan bir ekran"
kontrol odasında bir kaçış vanasıdır, ekran değil). Karşılaştırılacak ikinci
uygulama kalmadığı için çapraz denetim de kalktı; dilbilgisi artık tek
kaynaklı ve bu dosya onu doğrudan koruyor.

TUI'nin kendisi durur: bozulmaz kural 4 — bot headless bir servistir, TUI ona
bağlanan bir istemcidir.
"""

from __future__ import annotations

from sarnic.tui.commands import GLOBAL, PER_SYMBOL, REJECTED, parse_command


def test_dilbilgisi_tek_kaynakli():
    """Her komut tek yerde tanımlı; hiçbiri sessizce yutulmuyor."""
    assert GLOBAL and PER_SYMBOL, "sözlükler boş olamaz"
    for anahtar in (*GLOBAL, *PER_SYMBOL):
        assert anahtar.isupper(), anahtar
        # Hem tanımlı hem reddedilmiş komut ölü koddur: ret önce eşleştiği için
        # hedef hiç okunmaz. CAL tam olarak bu durumdaydı.
        assert anahtar not in REJECTED, f"{anahtar} hem tanımlı hem reddedilmiş"

    # Tanımlı her komut hatasız çözümlenir.
    for anahtar in GLOBAL:
        assert parse_command(anahtar).kind != "error", anahtar
    for anahtar in PER_SYMBOL:
        assert parse_command(f"SOLUSDT {anahtar}").kind != "error", anahtar

    # Reddedilen her komut GEREKÇE taşır ve gerekçe var olan bir yeri gösterir.
    for anahtar, gerekce in REJECTED.items():
        cevap = parse_command(f"SOLUSDT {anahtar}" if anahtar == "G" else anahtar)
        assert cevap.kind == "error" and cevap.message == gerekce, anahtar
        assert len(gerekce) > 20, anahtar
        assert "sayfası" not in gerekce, f"{anahtar} silinmiş v3 sayfasına yönlendiriyor"

    # Özel biçimli iki komut: biri kabul edilir, biri gerekçeyle reddedilir.
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
