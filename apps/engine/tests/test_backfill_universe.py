"""Backfill point-in-time havuzu kullanmalı — bozulmaz kural 2.

Yaşanmış hata: `pool_symbols` yalnızca EN SON snapshot'ı döndürüyor, o küme de
tüm geçmiş barlara uygulanıyordu. Bugünün havuzu geçmişte o havuzda olmayan
sembolleri içerir ve bir sembolün bugün havuzda olmasının sebebi genellikle o
dönemde yükselmiş olmasıdır — geçmişe geri yerleştirildiğinde ölçüme olmayan
bir kenar bindirir.

Ölçülen bedeli: kirli pencerede kapı 75,2 kenarı +%0,413 (t=2,74), aynı
yöntemle temiz pencerede +%0,025 (t=0,06). Kenarın tamamı yanlılıktı ve
buna dayanan tüm parametre kararları geçersizdi.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from sarnic.backtest.engine import UniverseTimeline


def _snap(gun: int, semboller: list[str]):
    class _S:
        taken_at: datetime = datetime(2026, 8, gun, tzinfo=UTC)
        symbols: ClassVar[list[dict]] = [{"symbol": s} for s in semboller]

    return _S()


def test_havuz_bar_anindaki_hali_ile_cozulur():
    """Sonradan havuza giren sembol, girmeden önceki barlarda görünmemeli."""
    timeline = UniverseTimeline(
        [_snap(1, ["AAA", "BBB"]), _snap(10, ["AAA", "BBB", "SONRADAN"])],
        fallback=[],
    )

    assert "SONRADAN" not in timeline.at(datetime(2026, 8, 5, tzinfo=UTC))
    assert "SONRADAN" in timeline.at(datetime(2026, 8, 15, tzinfo=UTC))


def test_havuzdan_cikan_sembol_gecmiste_kalir():
    """Havuzdan düşen sembol, düşmeden önceki barlarda hâlâ havuzdadır.

    Bunun tersi hayatta kalma yanlılığıdır: yalnızca bugün ayakta kalanlarla
    geçmişi ölçmek, sonucu sistematik olarak iyimser yapar.
    """
    timeline = UniverseTimeline(
        [_snap(1, ["AAA", "DUSEN"]), _snap(10, ["AAA"])],
        fallback=[],
    )

    assert "DUSEN" in timeline.at(datetime(2026, 8, 5, tzinfo=UTC))
    assert "DUSEN" not in timeline.at(datetime(2026, 8, 15, tzinfo=UTC))


def test_snapshot_yoksa_yaklasik_isaretlenir():
    """Snapshot arşivi o döneme uzanmıyorsa sonuç sessizce sunulmamalı."""
    timeline = UniverseTimeline([_snap(10, ["AAA"])], fallback=["AAA", "BBB"])

    assert timeline.at(datetime(2026, 8, 1, tzinfo=UTC)) == ["AAA", "BBB"]
    assert timeline.approximate
    assert "YAKLAŞIK EVREN" in timeline.note()


def test_backfill_sabit_sembol_listesi_kullanmaz():
    """Puanlama döngüsü havuzu bar bazlı çözmeli.

    Bu testin kaynak metnine bakması bilinçli: hata, döngünün `symbols`
    değişkenini doğrudan kullanmasıydı ve bu yalnızca çağrı yapısından
    görülebilir.
    """
    import inspect

    from sarnic.scoring import backfill

    kaynak = inspect.getsource(backfill.backfill_scores)

    assert "timeline.at(bar)" in kaynak, "havuz bar bazlı çözülmüyor"
    assert "engine._cuts(data, symbols, bar)" not in kaynak, (
        "sabit sembol listesi hâlâ kullanılıyor"
    )
