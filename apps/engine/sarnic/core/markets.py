"""Pazar kavramı — kripto, BIST ve ABD hisseleri tek soyutlamanın altında.

Karar (docs/OPEN-QUESTIONS.md §Çok-pazar): sembol ad-alanı borsa ekiyle
kurulur — ``THYAO.IS``, ``AAPL.US`` — kripto eksiz kalır (``BTCUSDT``).
Bu, ``ohlcv`` birincil anahtarına (symbol, timeframe, open_time) dokunmadan
üç pazarı ayırt edilir kılar; 787 MB'lık hypertable göçü ertelenmiş bir
temizlik olarak notlandı, veri bütünlüğü eksik değil.

Havuz, puanlama ve boyutlandırma **pazar içi** çalışır: kesitsel yüzdelikler
pazarlar arası karışmaz, TRY cirosu USD cirosuyla asla aynı sıralamaya girmez.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Market:
    code: str  # "CRYPTO" | "BIST" | "US"
    #: ISO-10383 MIC ya da takvim adı; exchange_calendars anahtarı.
    calendar: str  # "24/7" | "XIST" | "XNYS"
    quote_currency: str  # "USDT" | "TRY" | "USD"
    #: Sembol soneki. Kripto için boş — mevcut adlar değişmez.
    suffix: str
    #: Bu pazarın karar dilimi. Hisselerde 1h verisi meşru ve ücretsiz
    #: bulunamadı (araştırma: docs/OPEN-QUESTIONS.md); günlük barla çalışır.
    decision_timeframe: str
    #: Yılda kaç işlem günü — yıllıklandırmanın pazar-farkında tabanı.
    #: 8760 sabitini hisseye uygulamak volatiliteyi ~2,3 kat şişiriyordu.
    trading_days_per_year: int


CRYPTO = Market(
    code="CRYPTO",
    calendar="24/7",
    quote_currency="USDT",
    suffix="",
    decision_timeframe="1h",
    trading_days_per_year=365,
)

BIST = Market(
    code="BIST",
    calendar="XIST",
    quote_currency="TRY",
    suffix=".IS",
    decision_timeframe="1d",
    trading_days_per_year=248,
)

US = Market(
    code="US",
    calendar="XNYS",
    quote_currency="USD",
    suffix=".US",
    decision_timeframe="1d",
    trading_days_per_year=252,
)

MARKETS: dict[str, Market] = {m.code: m for m in (CRYPTO, BIST, US)}


def market_of(symbol: str) -> Market:
    """Sembolün pazarı — tek kaynak, her katman bunu kullanır.

    Eğe göre çözülür; ek yoksa kripto. ``endswith`` yeterli: BIST/US ekleri
    nokta içerir ve kripto sembollerinde nokta yoktur.
    """
    if symbol.endswith(BIST.suffix):
        return BIST
    if symbol.endswith(US.suffix):
        return US
    return CRYPTO


def bars_per_year(market: Market, timeframe: str) -> float:
    """Pazar + dilim → yıllık bar sayısı.

    Kripto 7/24: 365 gün × 24 saat. Hisse: işlem günü sayısı × gün içi bar
    sayısı; 1d için doğrudan işlem günü sayısı. Hisselerde gün içi dilim
    v1'de kullanılmıyor ama formül dürüst kalsın diye seans süresiyle
    hesaplanır (BIST ~8 saat, ABD 6,5 saat).
    """
    from sarnic.core.enums import TIMEFRAME_MINUTES

    minutes = TIMEFRAME_MINUTES[timeframe]
    if market.code == "CRYPTO":
        return round(365 * 24 * 60 / minutes)
    if timeframe == "1d":
        return float(market.trading_days_per_year)
    session_minutes = 480 if market.code == "BIST" else 390
    return market.trading_days_per_year * (session_minutes / minutes)
