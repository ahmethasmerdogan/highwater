"""Toplu dolgu testleri — SYSTEM-REVIEW §5b.

Buradaki testlerin varlık sebebi tek bir güvenlik iddiasıdır:

    `archive_only=True` iken dolgu **hiçbir REST çağrısı yapmaz.**

Bu iddia, aday kümesinin geçmişini çalışan bir sistemin yanında doldurmayı
güvenli kılan şeydir. Hız sınırlayıcı süreç içi bir tekildir (Redis ile
koordine değil), yani ikinci bir süreçten REST'e gitmek aynı IP ağırlık
bütçesini iki yerden harcamak olurdu — bozulmaz kural 5'in koruduğu şey budur.
`data.binance.vision` ise statik bir CDN'dir ve o bütçeye tabi değildir.

İddia sınanmazsa, biri ileride REST adımını koşulsuz hâle getirdiğinde koruma
sessizce kaybolur ve bunu kimse fark etmez.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from sarnic.data.binance import Kline
from sarnic.data.marketdata import MarketDataService


class ExplodingRest:
    """Çağrılırsa testi düşüren sahte REST istemcisi."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def klines(self, *args, **kwargs):
        self.calls.append("klines")
        raise AssertionError(
            "archive_only=True iken REST'e gidildi — bozulmaz kural 5 koruması delinmiş."
        )

    async def exchange_info(self):
        self.calls.append("exchange_info")
        raise AssertionError("archive_only=True iken exchange_info çağrıldı.")

    async def close(self) -> None:
        pass


class FakeArchive:
    """Sabit sayıda bar döndüren sahte arşiv."""

    def __init__(self, bars: int = 30) -> None:
        self.bars = bars
        self.downloads: list[tuple[str, str]] = []

    async def download(self, symbol: str, timeframe: str, start, end) -> list[Kline]:
        self.downloads.append((symbol, timeframe))
        base = datetime(2026, 1, 1, tzinfo=UTC)
        return [
            Kline(
                symbol=symbol,
                timeframe=timeframe,
                open_time=base + timedelta(days=i),
                open=100.0 + i,
                high=101.0 + i,
                low=99.0 + i,
                close=100.5 + i,
                volume=1000.0,
                quote_volume=100_000.0,
                trades=250,
                taker_buy_base=500.0,
                taker_buy_quote=50_000.0,
            )
            for i in range(self.bars)
        ]

    async def close(self) -> None:
        pass


def _service() -> tuple[MarketDataService, ExplodingRest, FakeArchive]:
    rest = ExplodingRest()
    service = MarketDataService(rest=rest)  # type: ignore[arg-type]
    archive = FakeArchive()
    service.archive = archive  # type: ignore[assignment]
    return service, rest, archive


@pytest.mark.asyncio
async def test_archive_only_never_touches_rest(monkeypatch):
    """Asıl sözleşme: arşiv-yalnız modda tek bir REST çağrısı bile olmaz."""
    service, rest, archive = _service()

    written: list[int] = []

    async def fake_upsert(session, klines):
        written.append(len(klines))
        return len(klines)

    # DB'ye gerçekten yazmıyoruz; test edilen şey REST'e gidilip gidilmediği.
    monkeypatch.setattr("sarnic.data.marketdata.upsert_klines", fake_upsert)
    monkeypatch.setattr("sarnic.data.marketdata.session_scope", _null_session_scope)
    # `last_bar_time` de sahteleniyor: koruma kaldırıldığında kod REST adımına
    # **ulaşabilmeli** ki test asıl iddiayla (REST'e gidildi) düşsün, yoluna
    # çıkan bir DB çağrısıyla değil.
    monkeypatch.setattr("sarnic.data.marketdata.last_bar_time", _no_last_bar)

    count = await service.backfill(
        "TESTUSDT", "1d", days=40, audit=False, archive_only=True
    )

    assert rest.calls == [], "arşiv-yalnız modda REST'e gidilmemeliydi"
    assert archive.downloads == [("TESTUSDT", "1d")]
    assert count == 30
    assert written == [30]


@pytest.mark.asyncio
async def test_archive_only_skips_audit(monkeypatch):
    """`audit=False` denetim yazmamalı.

    500 sembollük bir dolguda denetim açık bırakılırsa, her sembolün tarihsel
    aykırı değerleri `data_quality` tablosuna yazılır ve **hiç kapanmaz**
    (SYSTEM-REVIEW §4b). Veri kalitesi sayfası okunmaz hâle gelir.
    """
    service, _, _ = _service()

    audited: list[str] = []

    async def fake_audit(symbol, timeframe, limit=2000):
        audited.append(symbol)
        return 0

    monkeypatch.setattr(service, "audit_symbol", fake_audit)
    monkeypatch.setattr(
        "sarnic.data.marketdata.upsert_klines", _count_upsert
    )
    monkeypatch.setattr(
        "sarnic.data.marketdata.session_scope", _null_session_scope
    )

    await service.backfill("TESTUSDT", "1d", days=40, audit=False, archive_only=True)
    assert audited == []

    await service.backfill("TESTUSDT", "1d", days=40, audit=True, archive_only=True)
    assert audited == ["TESTUSDT"]


# --------------------------------------------------------------------------- #
#  Yardımcılar
# --------------------------------------------------------------------------- #
class _NullSession:
    async def execute(self, *a, **k):
        return None

    async def commit(self):
        return None


class _NullScope:
    async def __aenter__(self):
        return _NullSession()

    async def __aexit__(self, *exc):
        return False


def _null_session_scope():
    return _NullScope()


async def _count_upsert(session, klines):
    return len(klines)


async def _no_last_bar(session, symbol, timeframe):
    """Kayıtlı bar yok → REST adımı (varsa) mutlaka denenir."""
    return None
