"""Bar başına özellik önbelleği — aynı hesabı 20 kez yapmayı bitirir.

**Neden.** Özellik üretimi (`build_bundle`: indikatörler, S/R, formasyon)
yalnızca `(sembol, karar dilimi, bar)` üçlüsüne bağlıdır; strateji ayarından
tamamen bağımsızdır. Bota bağlı olan tek şey puanlama ağırlıklarıdır ve o
adım ölçüldüğünde 0,01 saniye sürüyor. Buna karşılık 2026-09-04'te filodaki
26 worker'ın **20'si** aynı anda uyanıp aynı 114 sembol için aynı hesabı
baştan yapıyordu: bar başına ~438 çekirdek-saniye ve 2,07 milyon OHLCV
satırı okuması, bunun 19/20'si birebir tekrar. Karar süresi p50 157 saniyeye
çıkmıştı (ölçüm: `bot_events.scores.updated.duration_ms`).

**Ne saklanır.** Bundle'ın tamamı değil, karar yolunun fiilen okuduğu alanlar:
puanlama girdisi (`SymbolFeatures`), karar dilimindeki kapanış/ATR/oynaklık ve
S/R'nin stop ile teyit için gereken üç sayısı. Sözleşme dar tutuldu ki
önbellekten dönen nesne ile taze hesaplanan nesne aynı kararı üretsin;
`tests/test_ozellik_onbellegi.py` bunu birebir karşılaştırarak korur.

**Emniyet.** Anahtar bar zamanını içerir, TTL üç bar süresidir: bayat veri
servis edilemez. Redis'e ulaşılamazsa ya da kayıt bozuksa modül sessizce boş
döner — çağıran normal yoldan hesaplar (fail-open). Önbellek bir karar yolu
değil, aynı sayının ikinci kez hesaplanmasını önleyen bir kısayoldur;
backtest bu modülü hiç kullanmaz ve bozulmaz kural 1 korunur.
"""

from __future__ import annotations

import json
import math
from datetime import datetime

import pandas as pd
import structlog

from sarnic.features.indicators import IndicatorSet
from sarnic.features.pipeline import SymbolBundle
from sarnic.features.sr import Level, SRResult
from sarnic.scoring.engine import SymbolFeatures
from sarnic.strategy.definition import TIMEFRAME_MINUTES

log = structlog.get_logger(__name__)

#: Sözleşme sürümü — paket biçimi değişirse eski kayıtlar okunmaz.
SURUM = 2


#: Sözleşme sürümü 2: paketleme artık karar barını doğruluyor (bkz. `paketle`).
def _anahtar(timeframe: str, bar_time: datetime) -> str:
    return f"sarnic:ozellik:v{SURUM}:{timeframe}:{int(bar_time.timestamp())}"


def _sonlu(x: float | None) -> float | None:
    """JSON `NaN` üretmesin: sonsuz/NaN değerler `None` olarak taşınır."""
    if x is None:
        return None
    x = float(x)
    return x if math.isfinite(x) else None


def _geri(x: float | None) -> float:
    return float("nan") if x is None else float(x)


def paketle(bundle: SymbolBundle, timeframe: str, bar_time: datetime | None = None) -> str | None:
    """Bir bundle'ı JSON'a indirger.

    `None` döner (yani ÖNBELLEĞE GİRMEZ) iki halde: karar dilimi eksikse, ya da
    bundle'ın barı istenen karar barı DEĞİLSE. İkincisi kritik: sağlayıcı gün
    sonunu gecikmeli bastığında bir kol henüz gelmemiş barı hesaplamaya çalışır
    ve elinde bir önceki barın çerçevesi kalır. O çerçeve önbelleğe yazılırsa
    bar sonradan gelse bile herkes bayat kaydı okur ve seanslı pazarın tazelik
    denetimi sonsuza kadar başarısız olur — 2026-09-04'te BIST kolu tam bunu
    yaşadı: 04.09 barı 56 sembolle veritabanındayken kol "hiçbiri puanlanamadı"
    deyip 03.09'da dondu, üstelik 1d TTL'i üç gün.
    """
    ind = bundle.indicators.get(timeframe)
    if ind is None:
        return None
    if bar_time is not None:
        if ind.bar_time is None:
            return None
        if ind.bar_time.timestamp() != bar_time.timestamp():
            return None
    f = bundle.features
    sr = bundle.sr
    return json.dumps(
        {
            "sembol": bundle.symbol,
            "ind": {
                "tf": ind.timeframe,
                "bar_time": ind.bar_time.isoformat() if ind.bar_time is not None else None,
                "close": _sonlu(ind.close),
                "atr": _sonlu(ind.atr),
                "realized_vol": _sonlu(ind.realized_vol),
            },
            "sr": (
                None
                if sr is None
                else {
                    "price": _sonlu(sr.price),
                    "atr": _sonlu(sr.atr),
                    "destek": _sonlu(sr.nearest_support.price) if sr.nearest_support else None,
                    "direnc": (
                        _sonlu(sr.nearest_resistance.price) if sr.nearest_resistance else None
                    ),
                }
            ),
            "ozellik": {
                "bar_time": f.bar_time.isoformat() if f.bar_time is not None else None,
                "raw": {k: _sonlu(v) for k, v in f.raw.items()},
                "pattern_modifier": _sonlu(f.pattern_modifier) or 0.0,
                "candle_modifier": _sonlu(f.candle_modifier) or 0.0,
                "ret_24h": _sonlu(f.ret_24h),
                "sr": f.sr,
                "pattern_labels": list(f.pattern_labels),
                "usable": bool(f.usable),
                "note": f.note,
            },
        },
        separators=(",", ":"),
    )


class OnbellekFormasyon:
    """`patterns.modifier()` sözleşmesini karşılayan minimal taşıyıcı.

    Formasyon motorunun tamamı saklanmaz; karar yolunun okuduğu tek şey
    düzeltme katsayısıdır ve o zaten `SymbolFeatures.pattern_modifier`
    içinde taşınır.
    """

    __slots__ = ("_mod",)

    def __init__(self, mod: float) -> None:
        self._mod = mod

    def modifier(self) -> float:
        return self._mod


def coz(ham: str) -> SymbolBundle | None:
    """JSON'dan karar yolunun kullanabileceği minimal bundle'ı kurar."""
    try:
        d = json.loads(ham)
        i = d["ind"]
        o = d["ozellik"]
        ind = IndicatorSet(
            symbol=d["sembol"],
            timeframe=i.get("tf", ""),
            bar_time=pd.Timestamp(i["bar_time"]) if i["bar_time"] else None,
            close=_geri(i["close"]),
            atr=_geri(i["atr"]),
            realized_vol=_geri(i["realized_vol"]),
        )
        s = d.get("sr")
        sonuc_sr = (
            None
            if s is None
            else SRResult(
                symbol=d["sembol"],
                timeframe="",
                price=_geri(s["price"]),
                atr=_geri(s["atr"]),
                nearest_support=(
                    Level(price=s["destek"], kind="support") if s["destek"] is not None else None
                ),
                nearest_resistance=(
                    Level(price=s["direnc"], kind="resistance") if s["direnc"] is not None else None
                ),
            )
        )
        feats = SymbolFeatures(
            symbol=d["sembol"],
            bar_time=datetime.fromisoformat(o["bar_time"]) if o["bar_time"] else None,
            raw={k: _geri(v) for k, v in o["raw"].items()},
            pattern_modifier=float(o["pattern_modifier"]),
            candle_modifier=float(o["candle_modifier"]),
            ret_24h=_geri(o["ret_24h"]),
            sr=o.get("sr") or {},
            pattern_labels=list(o.get("pattern_labels") or []),
            usable=bool(o["usable"]),
            note=o.get("note", ""),
        )
        return SymbolBundle(
            symbol=d["sembol"],
            indicators={},  # karar dilimi aşağıda yerleştirilir
            sr=sonuc_sr,
            patterns=OnbellekFormasyon(feats.pattern_modifier),
            features=feats,
        ), ind
    except Exception:  # bozuk kayıt önbellek ıskası sayılır
        return None


async def oku(redis, timeframe: str, bar_time: datetime, symbols: list[str]) -> dict[str, object]:
    """Önbellekteki sembolleri döner. Hata hâlinde boş sözlük (fail-open)."""
    if not symbols:
        return {}
    try:
        ham = await redis.hmget(_anahtar(timeframe, bar_time), symbols)
    except Exception:
        log.debug("ozellik_onbellek_okunamadi", timeframe=timeframe)
        return {}
    out: dict[str, object] = {}
    for sembol, deger in zip(symbols, ham, strict=True):
        if not deger:
            continue
        cozulmus = coz(deger.decode() if isinstance(deger, bytes) else deger)
        if cozulmus is None:
            continue
        bundle, ind = cozulmus
        bundle.indicators[timeframe] = ind
        out[sembol] = bundle
    return out


async def kilit_al(redis, timeframe: str, bar_time: datetime, saniye: int = 240) -> bool:
    """Bu barın hesabını üstlenmek için tek yazar kilidi.

    Önbellek tek başına yetmiyordu: 20 kol **aynı saniyede** uyanıp önbelleği
    boş buluyor, hepsi hesaplıyor ve hepsi yazıyordu (önbellek izdihamı).
    Ölçüldü 2026-09-04 21:00Z: 20 bot 160–177 sn'de aynı anda bitiriyor.
    Kilidi alan hesaplar, alamayanlar `bekle` ile sonucu paylaşır.
    """
    try:
        return bool(
            await redis.set(_anahtar(timeframe, bar_time) + ":kilit", "1", nx=True, ex=saniye)
        )
    except Exception:
        return True  # Redis yoksa herkes kendi hesabını yapar (fail-open)


async def bekle(
    redis, timeframe: str, bar_time: datetime, symbols: list[str], azami_saniye: float = 60.0
) -> dict[str, object]:
    """Kilidi tutan kolun yazmasını bekler; dolan önbelleği döner.

    Bekleme `asyncio.sleep` ile: olay döngüsü serbest kalır, nabız atmaya
    devam eder. Süre dolarsa elde ne varsa onunla döner — çağıran eksikleri
    kendisi hesaplar, yani kilit sahibi ölse bile karar gecikmez.

    Azami süre dar tutuldu (60 sn): bekleyen kol bar kilidini elinde tuttuğu
    için gözetim turu (stop denetimi) o sürede çalışamaz. Kilit sahibinin
    ölçülen hesap süresi ~20–25 sn; 60 sn hem tampon bırakır hem stopları
    uzun süre bekletmez.
    """
    import asyncio

    beklenen = len(symbols)
    gecen = 0.0
    while gecen < azami_saniye:
        await asyncio.sleep(2.0)
        gecen += 2.0
        var = await oku(redis, timeframe, bar_time, symbols)
        # Havuzun tamamı gelmese de büyük kısmı geldiyse yeter: kalanı çağıran
        # hesaplar. %90 eşiği, tek tük veri boşluğu için beklemeyi keser.
        if len(var) >= max(1, int(beklenen * 0.9)):
            return var
    return await oku(redis, timeframe, bar_time, symbols)


async def yaz(redis, timeframe: str, bar_time: datetime, bundles: list[SymbolBundle]) -> int:
    """Hesaplanan bundle'ları önbelleğe koyar. Dönüş: yazılan sembol sayısı."""
    paket = {}
    for b in bundles:
        veri = paketle(b, timeframe, bar_time)
        if veri is not None:
            paket[b.symbol] = veri
    if not paket:
        return 0
    try:
        anahtar = _anahtar(timeframe, bar_time)
        await redis.hset(anahtar, mapping=paket)
        # Üç bar ömrü: gecikmeli uyanan bir worker hâlâ bulur, bayat veri yaşamaz.
        await redis.expire(anahtar, TIMEFRAME_MINUTES.get(timeframe, 60) * 60 * 3)
    except Exception:
        log.debug("ozellik_onbellek_yazilamadi", timeframe=timeframe)
        return 0
    return len(paket)
