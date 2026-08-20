"""Kıyas ölçütü — botlar eşit ağırlıklı sepeti yenebiliyor mu?

Faz 0a'nın **3. testi** buydu ve sistem o testte kaybetti: en yüksek 5 puanlı
coinden kurulan portföy (0,168×), aynı havuzun eşit ağırlıklı sepetinden
(0,178×) daha kötü sonuç verdi. Rapor bunu yazdı ama **canlı sistem bunu
göstermiyordu** — panel yalnızca "+%0,29" diyordu ve bu sayı tek başına
hiçbir şey ifade etmez.

Bir strateji ancak *alternatifinden* iyiyse değerlidir. Alternatif burada
"hiç seçme, havuzdaki her şeyi eşit al ve tut"tur. Bu modül o alternatifi
aynı pencerede, aynı veriyle hesaplar.

Kasıtlı olarak sepete **maliyet uygulanmaz**: al-ve-tut bir kez alır, botlar
ise devir yapar. Devir maliyeti stratejinin kendi yüküdür ve kıyastan
düşülmesi tabloyu botların lehine çevirirdi.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.logging import get_logger
from sarnic.data.store import load_frames

log = get_logger(__name__)

# Sepette bir sembolün sayılması için başlangıç ve bitişte fiyatı olmalı.
# Yeni listelenen ya da veri boşluğu olan semboller sessizce dışarıda kalır.
MIN_SYMBOLS = 3


@dataclass(slots=True)
class BenchmarkPoint:
    at: datetime
    #: Başlangıcı 1,0 kabul eden çarpan (1,02 = %2 kazanç).
    value: float
    #: O anda sepette fiyatı bilinen sembol sayısı — dürüstlük için taşınır.
    symbols: int


def equal_weight_curve(
    frames: dict[str, pd.DataFrame], start: datetime, end: datetime
) -> list[BenchmarkPoint]:
    """Eşit ağırlıklı al-ve-tut sepetinin normalize edilmiş eğrisi.

    Her sembol `start` anındaki kapanışına bölünür; sepet, bu oranların
    her bar için ortalamasıdır. Bu **yeniden dengelenmeyen** bir sepettir:
    başta eşit alınır, sonra dokunulmaz.
    """
    series: list[pd.Series] = []
    for symbol, df in frames.items():
        if df.empty:
            continue
        frame = df[(df["open_time"] >= start) & (df["open_time"] <= end)]
        if len(frame) < 2:
            continue
        base = float(frame["close"].iloc[0])
        if base <= 0:
            continue
        series.append(
            pd.Series(
                frame["close"].to_numpy(dtype=float) / base,
                index=pd.DatetimeIndex(frame["open_time"]),
                name=symbol,
            )
        )

    if len(series) < MIN_SYMBOLS:
        log.info("benchmark_insufficient_symbols", symbols=len(series))
        return []

    matrix = pd.concat(series, axis=1).sort_index()
    # İleri doldurma: bir sembolün barı eksikse son bilinen fiyatı geçerlidir.
    # Doldurmadan ortalama almak, o barda o sembolü sepetten çıkarmak olurdu.
    matrix = matrix.ffill()

    counts = matrix.notna().sum(axis=1)
    values = matrix.mean(axis=1, skipna=True)

    return [
        BenchmarkPoint(at=at.to_pydatetime(), value=float(value), symbols=int(counts.loc[at]))
        for at, value in values.items()
        if pd.notna(value)
    ]


async def build_benchmark(
    session: AsyncSession,
    symbols: list[str],
    start: datetime,
    end: datetime,
    timeframe: str = "1h",
) -> list[BenchmarkPoint]:
    """Havuzdaki sembollerle eşit ağırlıklı sepeti kurar."""
    if not symbols:
        return []
    # Pencere **sorguda** sınırlanır. Önceden `limit=5000` ile 44 sembolün
    # ~208 günlük verisi çekilip 23 bara indiriliyordu; uç 1,4 saniye sürüyor
    # ve panel bunu iki dakikada bir yeniliyordu.
    frames = await load_frames(session, symbols, timeframe, start=start, end=end, limit=5000)
    return equal_weight_curve(frames, start, end)


def normalize(curve: list[dict], key: str = "equity") -> list[dict]:
    """Bir özsermaye eğrisini başlangıcı 1,0 olan çarpana çevirir.

    Botlar 5.000, sepet 1,0 ile başlıyor; aynı eksende çizebilmek için ikisi de
    çarpana indirgenir. Mutlak sayı zaten ayrı bir kutuda duruyor.

    `at` **olduğu gibi** geçirilir — `equity_curve` onu ISO dizesi olarak
    üretir ve dönüştürmek iki farklı zaman biçimi doğururdu.
    """
    if not curve:
        return []
    base = float(curve[0][key])
    if base <= 0:
        return []
    return [{"at": point["at"], "value": float(point[key]) / base} for point in curve]
