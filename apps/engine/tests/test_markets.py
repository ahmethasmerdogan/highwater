"""Çok pazar: sembol→pazar çözümü, yıllıklandırma ve takvim hizalaması.

Kritik güvence: kripto yolu BİREBİR eski davranışta kalır — bu testlerin
yarısı regresyon korumasıdır.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd
import pytest

from sarnic.core.calendar import calendar_for
from sarnic.core.markets import BIST, CRYPTO, US, bars_per_year, market_of
from sarnic.data.quality import find_gaps, find_trailing_gap
from sarnic.data.store import last_closed_bar


def test_market_of_suffix():
    assert market_of("BTCUSDT") is CRYPTO
    assert market_of("THYAO.IS") is BIST
    assert market_of("AAPL.US") is US


def test_bars_per_year_crypto_unchanged():
    # Eski sabit: 365*24 = 8760 (1h) — kriptoda değer birebir korunur.
    assert bars_per_year(CRYPTO, "1h") == 8760
    assert bars_per_year(CRYPTO, "1d") == 365


def test_bars_per_year_equities():
    # 8760'ı hisseye uygulamak volatiliteyi ~2,3 kat şişiriyordu.
    assert bars_per_year(BIST, "1d") == 248
    assert bars_per_year(US, "1d") == 252


def test_crypto_last_closed_bar_unchanged():
    # Epoch aritmetiğinin birebir aynısı.
    moment = datetime(2026, 8, 27, 14, 35, tzinfo=UTC)
    assert last_closed_bar(moment, "1h") == datetime(2026, 8, 27, 13, 0, tzinfo=UTC)
    assert last_closed_bar(moment, "1h", market_code="CRYPTO") == datetime(
        2026, 8, 27, 13, 0, tzinfo=UTC
    )


def test_bist_last_closed_bar_weekend():
    # Cumartesi: kapanmış son seans cumadır. Epoch aritmetiği "dün" derdi —
    # bot hafta sonu boyunca var olmayan barları puanlamaya çalışırdı.
    cumartesi = datetime(2026, 8, 29, 12, 0, tzinfo=UTC)
    assert last_closed_bar(cumartesi, "1d", market_code="BIST") == datetime(2026, 8, 28, tzinfo=UTC)


def test_bist_last_closed_bar_before_close():
    # Perşembe 12:00 UTC — BIST 15:00 UTC'de kapanır; o günün barı SAYILMAZ
    # (look-ahead yasağı), kapanmış son seans çarşambadır.
    persembe_ogle = datetime(2026, 8, 27, 12, 0, tzinfo=UTC)
    assert last_closed_bar(persembe_ogle, "1d", market_code="BIST") == datetime(
        2026, 8, 26, tzinfo=UTC
    )


def test_us_last_closed_bar_after_close():
    # NYSE 20:00 UTC'de kapanır; 21:00'de o günün barı kapanmıştır.
    aksam = datetime(2026, 8, 26, 21, 0, tzinfo=UTC)
    assert last_closed_bar(aksam, "1d", market_code="US") == datetime(2026, 8, 26, tzinfo=UTC)


def _daily_frame(symbol: str, days: list[str]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "open_time": [pd.Timestamp(d, tz="UTC") for d in days],
            "open": 10.0,
            "high": 11.0,
            "low": 9.0,
            "close": 10.5,
            "volume": 100.0,
        }
    )


def test_weekend_is_not_a_gap_for_bist():
    # Cuma → Pazartesi: takvim-farkında denetimde boşluk YOKTUR.
    df = _daily_frame("THYAO.IS", ["2026-08-21", "2026-08-24", "2026-08-25"])
    assert find_gaps(df, "THYAO.IS", "1d") == []


def test_missing_session_is_a_gap_for_bist():
    # Salı seansı atlanmış: bu GERÇEK bir boşluktur.
    df = _daily_frame("THYAO.IS", ["2026-08-24", "2026-08-26"])
    gaps = find_gaps(df, "THYAO.IS", "1d")
    assert len(gaps) == 1
    assert gaps[0].missing_bars == 1


def test_weekend_gap_still_reported_for_crypto():
    # Kripto 7/24: hafta sonu barları GERÇEKTEN olmalı; eski davranış korunur.
    df = _daily_frame("BTCUSDT", ["2026-08-21", "2026-08-24"])
    gaps = find_gaps(df, "BTCUSDT", "1d")
    assert len(gaps) == 1
    assert gaps[0].missing_bars == 2


def test_trailing_gap_ignores_weekend_for_bist():
    # Son bar cuma, bugün pazar: BIST durmadı, piyasa kapalı.
    df = _daily_frame("THYAO.IS", ["2026-08-27", "2026-08-28"])
    pazar = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)
    assert find_trailing_gap(df, "THYAO.IS", "1d", pazar) is None


def test_calendar_for_is_cached_and_dispatches():
    assert calendar_for("24/7").code == "24/7"
    assert calendar_for("XIST").code == "XIST"
    assert calendar_for("24/7") is calendar_for("24/7")


@pytest.mark.asyncio
async def test_hisse_ticker_gercek_ciro_tasir():
    """quote_volume="0" likidite tavanını sıfıra klempliyordu — hiçbir hisse
    botu hiçbir zaman pozisyon açamıyordu (tek iz: "kısıtlar sonrası boyut
    sıfır"). Ticker son seansın gerçek cirosunu taşımalı."""
    import json

    from sarnic.data.equities import EquityDataService

    class _Redis:
        def __init__(self):
            self.hashes = {}
            self.keys = {}

        async def hset(self, key, mapping):
            self.hashes.setdefault(key, {}).update(mapping)

        async def expire(self, key, ttl):
            pass

        async def set(self, key, value, ex=None):
            self.keys[key] = value

    r = _Redis()

    async def factory():
        return r

    svc = EquityDataService(factory)
    svc._last_close = {"THYAO.IS": 302.25, "ADP.US": 286.16}
    svc._last_ciro = {"THYAO.IS": 4.2e9, "ADP.US": 5.7e8}
    await svc._write_state()

    tickers = {k: json.loads(v) for k, v in r.hashes["sarnic:md:tickers"].items()}
    assert float(tickers["THYAO.IS"]["quote_volume"]) == 4.2e9
    assert float(tickers["ADP.US"]["quote_volume"]) == 5.7e8
    # Ciro bilinmiyorsa 0 kalır — likidite tavanı temkinli tarafta.
    svc._last_ciro = {}
    await svc._write_state()
    tickers = {k: json.loads(v) for k, v in r.hashes["sarnic:md:tickers"].items()}
    assert float(tickers["ADP.US"]["quote_volume"]) == 0.0
