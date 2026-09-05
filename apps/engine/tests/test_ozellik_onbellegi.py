"""Özellik önbelleği aynı kararı üretmeli (sarnic/features/onbellek.py).

Önbellek bir kısayoldur, karar yolu değil: önbellekten dönen bundle ile taze
hesaplanan bundle **aynı puanı, aynı stopu ve aynı teyit sayılarını** vermek
zorunda. Bu dosya sözleşmeyi birebir karşılaştırarak korur; bozulursa 20 bot
farklı karar verir ve bozulmaz kural 1 sessizce ihlal edilir.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from sarnic.features.onbellek import coz, paketle
from sarnic.features.pipeline import build_bundle
from sarnic.features.sr import stop_from_sr
from sarnic.scoring.engine import ScoringEngine
from tests.conftest import make_ohlcv

START = datetime(2026, 1, 1, tzinfo=UTC)
TF = "1h"


def _bundle(seed: int, symbol: str):
    frames = {
        "1h": make_ohlcv(400, start=START, timeframe_minutes=60, drift=0.0004, vol=0.01, seed=seed),
        "4h": make_ohlcv(300, start=START, timeframe_minutes=240, drift=0.001, vol=0.02, seed=seed),
        "1d": make_ohlcv(
            300, start=START, timeframe_minutes=1440, drift=0.004, vol=0.04, seed=seed
        ),
    }
    return build_bundle(symbol, frames, with_patterns=True, decision_tf=TF)


def _cozulmus(bundle):
    ham = paketle(bundle, TF)
    assert ham is not None
    sonuc = coz(ham)
    assert sonuc is not None
    yeni, ind = sonuc
    yeni.indicators[TF] = ind
    return yeni


def test_puan_onbellekle_birebir_ayni():
    """Kesitsel puanlama önbellekten gelen özelliklerle aynı sonucu vermeli."""
    tazeler = [_bundle(100 + i, f"C{i:02d}USDT") for i in range(12)]
    onbellekliler = [_cozulmus(b) for b in tazeler]

    motor = ScoringEngine()
    a = {r.symbol: r for r in motor.score_cross_section([b.features for b in tazeler])}
    b = {r.symbol: r for r in motor.score_cross_section([b.features for b in onbellekliler])}

    assert set(a) == set(b) and a
    for sembol, taze in a.items():
        assert b[sembol].score == pytest.approx(taze.score, abs=1e-9), sembol
        assert b[sembol].base_score == pytest.approx(taze.base_score, abs=1e-9)
        assert b[sembol].config_hash == taze.config_hash
        assert b[sembol].families == pytest.approx(taze.families)


def test_karar_girdileri_birebir_ayni():
    """Fiyat, ATR, oynaklık, stop ve S/R teyit mesafeleri korunur."""
    taze = _bundle(7, "XUSDT")
    onbellekli = _cozulmus(taze)

    t_ind, o_ind = taze.indicators[TF], onbellekli.indicators[TF]
    assert o_ind.close == pytest.approx(t_ind.close)
    assert o_ind.atr == pytest.approx(t_ind.atr)
    assert o_ind.realized_vol == pytest.approx(t_ind.realized_vol)
    assert o_ind.bar_time == t_ind.bar_time

    for yon in (1, -1):
        t_stop = stop_from_sr(taze.sr, 2.0, entry=t_ind.close, direction=yon)
        o_stop = stop_from_sr(onbellekli.sr, 2.0, entry=o_ind.close, direction=yon)
        assert (t_stop is None) == (o_stop is None), yon
        if t_stop is not None:
            assert o_stop == pytest.approx(t_stop), yon

    t_ust, o_ust = taze.sr.resistance_distance_atr, onbellekli.sr.resistance_distance_atr
    assert (t_ust is None) == (o_ust is None)
    if t_ust is not None:
        assert o_ust == pytest.approx(t_ust)
    t_alt, o_alt = taze.sr.support_distance_atr, onbellekli.sr.support_distance_atr
    assert (t_alt is None) == (o_alt is None)
    if t_alt is not None:
        assert o_alt == pytest.approx(t_alt)

    assert onbellekli.patterns.modifier() == pytest.approx(taze.patterns.modifier())


def test_bozuk_kayit_iska_sayilir():
    """Fail-open: bozuk ya da eski biçimli kayıt None döner, çağıran hesaplar."""
    assert coz("{bozuk json") is None
    assert coz('{"sembol": "X"}') is None
    assert coz("null") is None


def test_karar_dilimi_yoksa_saklanmaz():
    taze = _bundle(9, "YUSDT")
    assert paketle(taze, "15m") is None


def test_bayat_bar_onbellege_girmez():
    """Sağlayıcı geciktiğinde elde bir önceki barın çerçevesi kalır. O çerçeve
    yazılırsa bar sonradan gelse bile herkes bayatı okur ve seanslı pazarın
    tazelik denetimi sonsuza kadar başarısız olur (BIST kolu, 2026-09-04)."""
    taze = _bundle(11, "ZUSDT")
    gercek_bar = taze.indicators[TF].bar_time.to_pydatetime()
    assert paketle(taze, TF, gercek_bar) is not None
    yanlis_bar = gercek_bar + timedelta(hours=1)
    assert paketle(taze, TF, yanlis_bar) is None


# --------------------------------------------------------------------------- #
#  Önbellek izdihamı: 20 kol aynı anda uyanınca yalnız biri hesaplamalı
# --------------------------------------------------------------------------- #
async def test_kilit_tek_yazar_birakir():
    from datetime import UTC, datetime

    from sarnic.features.onbellek import kilit_al

    class SahteRedis:
        def __init__(self) -> None:
            self.anahtarlar: dict[str, str] = {}

        async def set(self, key, value, nx=False, ex=None):
            if nx and key in self.anahtarlar:
                return None
            self.anahtarlar[key] = value
            return True

    r = SahteRedis()
    bar = datetime(2026, 9, 4, 21, tzinfo=UTC)
    sonuclar = [await kilit_al(r, "1h", bar) for _ in range(20)]
    assert sum(sonuclar) == 1, "yalnız bir kol hesaplamalı"
    # Farklı bar ayrı kilit.
    assert await kilit_al(r, "1h", datetime(2026, 9, 4, 22, tzinfo=UTC))


async def test_redis_yoksa_herkes_kendi_hesabini_yapar():
    """Fail-open: kilit alınamıyorsa karar gecikmez."""
    from datetime import UTC, datetime

    from sarnic.features.onbellek import kilit_al

    class BozukRedis:
        async def set(self, *a, **kw):
            raise ConnectionError("redis yok")

    assert await kilit_al(BozukRedis(), "1h", datetime(2026, 9, 4, 21, tzinfo=UTC)) is True
