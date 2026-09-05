"""İşlem takvimi — bar hizalamasının pazar-farkında tek kaynağı.

Mevcut kod bar hizalamasını epoch aritmetiğiyle yapıyordu; kripto 7/24
olduğu için bu doğruydu. Hisselerde aynı aritmetik piyasa kapalıyken var
olmayan barı "kapanmış" sayar, hafta sonunu veri arızası sanır ve onarımcı
sonsuza kadar olmayan barları doldurmaya çalışır.

`Crypto247Calendar` eski davranışı BİREBİR sarar (regresyon riski sıfır);
`ExchangeSessionCalendar` `exchange_calendars`'a (Apache-2.0, XIST + XNYS
doğrulandı) dayanır. Karar dilimi hisselerde 1d olduğu için v1'de yalnızca
**seans günü** hizalaması gerekir: 1d barın açılışı seans tarihinin UTC gece
yarısı olarak saklanır — OHLCV deposundaki mevcut kripto 1d kuralıyla aynı,
yani depo katmanında özel durum yok.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Protocol

from sarnic.core.enums import TIMEFRAME_MINUTES


class TradingCalendar(Protocol):
    code: str

    def is_open(self, moment: datetime) -> bool: ...

    def last_closed_bar(self, moment: datetime, timeframe: str) -> datetime: ...

    def expected_bars(self, start: datetime, end: datetime, timeframe: str) -> int: ...


def _utc(moment: datetime) -> datetime:
    return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment.astimezone(UTC)


class Crypto247Calendar:
    """7/24 pazar — mevcut epoch aritmetiğinin birebir kendisi."""

    code = "24/7"

    def is_open(self, moment: datetime) -> bool:
        return True

    def last_closed_bar(self, moment: datetime, timeframe: str) -> datetime:
        minutes = TIMEFRAME_MINUTES[timeframe]
        epoch_minutes = int(_utc(moment).timestamp() // 60)
        floored = (epoch_minutes // minutes) * minutes
        return datetime.fromtimestamp(floored * 60, tz=UTC) - timedelta(minutes=minutes)

    def expected_bars(self, start: datetime, end: datetime, timeframe: str) -> int:
        minutes = TIMEFRAME_MINUTES[timeframe]
        span = (_utc(end) - _utc(start)).total_seconds() / 60
        return max(0, int(span // minutes) + 1)


class ExchangeSessionCalendar:
    """Seanslı pazar (XIST, XNYS) — yalnızca 1d dilimi destekler (v1 kararı)."""

    def __init__(self, code: str) -> None:
        self.code = code

    @property
    def _cal(self):
        return _load(self.code)

    def is_open(self, moment: datetime) -> bool:
        moment = _utc(moment)
        try:
            return bool(self._cal.is_open_on_minute(moment))
        except Exception:
            # Takvim penceresi dışı (çok eski/çok ileri): kapalı say.
            return False

    def _sessions(self, start: datetime, end: datetime):
        cal = self._cal
        return cal.sessions_in_range(_utc(start).date().isoformat(), _utc(end).date().isoformat())

    def last_closed_session(self, moment: datetime) -> datetime | None:
        """`moment` anında KAPANMIŞ son seansın tarihi (UTC gece yarısı).

        Look-ahead koruması: seans kapanmadan o günün barı yok sayılır.
        """
        cal = self._cal
        moment = _utc(moment)
        # Son 30 takvim günü içinde kapanışı geçmiş en yeni seansı ara (10 idi:
        # bayram + iki hafta sonu 9 günü buluyor, bir köprü günü kırıyordu).
        for back in range(0, 30):
            day = (moment - timedelta(days=back)).date()
            try:
                if not cal.is_session(day.isoformat()):
                    continue
                close = cal.session_close(day.isoformat())
            except Exception:
                continue
            if close <= moment:
                return datetime(day.year, day.month, day.day, tzinfo=UTC)
        return None

    def last_closed_bar(self, moment: datetime, timeframe: str) -> datetime:
        if timeframe != "1d":
            raise ValueError(
                f"{self.code} takvimi v1'de yalnızca 1d destekler; {timeframe} istendi. "
                "Gün içi hisse verisi için meşru ücretsiz kaynak yok "
                "(docs/OPEN-QUESTIONS.md §Çok-pazar)."
            )
        son = self.last_closed_session(moment)
        if son is None:
            # Takvim penceresi dışında kalındıysa dürüst davran: çok eski
            # bir tarih döndür ki "yeni bar var" sanılmasın.
            return datetime(1970, 1, 1, tzinfo=UTC)
        return son

    def expected_bars(self, start: datetime, end: datetime, timeframe: str) -> int:
        if timeframe != "1d":
            raise ValueError(f"{self.code} v1'de yalnızca 1d destekler.")
        try:
            return len(self._sessions(start, end))
        except Exception:
            return 0


@lru_cache(maxsize=8)
def _load(code: str):
    import exchange_calendars as xcals

    # Pencereyi geniş tut: İş Yatırım 2000'e kadar geçmiş veriyor.
    return xcals.get_calendar(code, start="2000-01-01")


@lru_cache(maxsize=8)
def calendar_for(code: str) -> TradingCalendar:
    if code == "24/7":
        return Crypto247Calendar()
    return ExchangeSessionCalendar(code)
