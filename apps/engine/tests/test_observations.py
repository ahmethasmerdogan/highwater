"""İleri getiri gözlemleri — kalibrasyonun besleyicisi (§5.5).

Bu modül sistemin **birincil çıktısının** ham verisini üretir: "puan ileri
getiriyi öngörüyor mu?" sorusunun cevabı buradan çıkan satırlarla hesaplanır.
Buradaki sessiz bir kayma (yanlış referans bar, uzamış ufuk, kaçırılmış ufuk)
kalibrasyon sayfasını yanlış ama inandırıcı bir cevaba götürür. Kapsam %0'dı.

Fiyatlar elle seçildi: 100 → 110 → 121 gibi, getiriler zihinden doğrulanabilsin.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest
from sqlalchemy import func, select

from sarnic.db.models import OHLCV, Score, ScoreObservation
from sarnic.scoring.observations import (
    HORIZONS,
    SETTLE_HOURS,
    backfill_observations,
    forward_returns,
)

BAS = datetime(2026, 3, 1, tzinfo=UTC)


def _cerceve(kapanislar: list[float], *, start: datetime = BAS, saat: int = 1) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "open_time": [
                pd.Timestamp(start + timedelta(hours=i * saat)) for i in range(len(kapanislar))
            ],
            "close": kapanislar,
        }
    )


# --------------------------------------------------------------------------- #
#  forward_returns — elle hesaplanmış değerler
# --------------------------------------------------------------------------- #
def test_getiri_elle_hesaplanan_degerle_uyusur():
    # 0. bar 100, 4. bar 110, 24. bar 200. Beklenen: +%10 ve +%100.
    kapanislar = [100.0] * 25
    kapanislar[4] = 110.0
    kapanislar[24] = 200.0
    sonuc = forward_returns(_cerceve(kapanislar), BAS, {"fwd_return_4h": 4, "fwd_return_24h": 24})
    assert sonuc["fwd_return_4h"] == pytest.approx(0.10)
    assert sonuc["fwd_return_24h"] == pytest.approx(1.00)


def test_referans_puanin_kendi_bari():
    """Getiri, puanın barının kapanışına göre ölçülür — bir önceki bara göre değil."""
    cerceve = _cerceve([50.0, 100.0, 200.0])
    sonuc = forward_returns(cerceve, BAS + timedelta(hours=1), {"fwd_return_1h": 1})
    # Referans 100 (1. bar), hedef 200 (2. bar) → +%100. Referans 50 olsaydı +%300 çıkardı.
    assert sonuc["fwd_return_1h"] == pytest.approx(1.00)


def test_ufuk_dolmamissa_none():
    """Veri hedef bara ulaşmıyorsa uydurulmaz."""
    sonuc = forward_returns(_cerceve([100.0] * 5), BAS, HORIZONS)
    assert sonuc["fwd_return_4h"] == pytest.approx(0.0)
    assert sonuc["fwd_return_24h"] is None
    assert sonuc["fwd_return_72h"] is None


def test_bosluk_ufku_uzatmaz():
    """Hedef bar eksikse getiri **hesaplanmaz**, sonraki bara kaydırılmaz.

    `searchsorted` eşleşme yoksa sonraki barın indeksini verir. Kontrol
    edilmezse veri boşluğu olan bir sembolde "4 saatlik getiri" sessizce 9
    saatlik olur ve kalibrasyon karşılaştırdığını sandığı şeyi karşılaştırmaz.
    """
    tam = _cerceve([100.0] * 10)
    # 4. barı sil: hedef artık yok, ama 5. bar duruyor.
    delikli = tam.drop(index=4).reset_index(drop=True)
    delikli.loc[delikli.index >= 4, "close"] = 999.0

    assert forward_returns(tam, BAS, {"fwd_return_4h": 4})["fwd_return_4h"] == pytest.approx(0.0)
    assert forward_returns(delikli, BAS, {"fwd_return_4h": 4})["fwd_return_4h"] is None


def test_puanin_bari_veride_yoksa_none():
    sonuc = forward_returns(_cerceve([100.0] * 5), BAS + timedelta(minutes=30), HORIZONS)
    assert all(v is None for v in sonuc.values())


def test_bos_cerceve_ve_sifir_fiyat():
    assert all(v is None for v in forward_returns(pd.DataFrame(), BAS, HORIZONS).values())
    sifirli = forward_returns(_cerceve([0.0, 100.0, 100.0]), BAS, {"fwd_return_1h": 1})
    assert sifirli["fwd_return_1h"] is None


def test_negatif_getiri_dogru_isaretli():
    sonuc = forward_returns(_cerceve([100.0, 75.0]), BAS, {"fwd_return_1h": 1})
    assert sonuc["fwd_return_1h"] == pytest.approx(-0.25)


# --------------------------------------------------------------------------- #
#  backfill_observations — veritabanı yolu
# --------------------------------------------------------------------------- #
async def _bar_ekle(
    session, symbol: str, kapanislar: list[float], *, timeframe: str = "1h"
) -> None:
    for i, kapanis in enumerate(kapanislar):
        session.add(
            OHLCV(
                symbol=symbol,
                timeframe=timeframe,
                open_time=BAS + timedelta(hours=i),
                open=kapanis,
                high=kapanis,
                low=kapanis,
                close=kapanis,
                volume=1,
                quote_volume=1,
                trades=1,
                taker_buy_base=1,
                taker_buy_quote=1,
            )
        )
    await session.flush()


async def _puan_ekle(session, symbol: str, saat: int, *, timeframe: str = "1h") -> Score:
    puan = Score(
        symbol=symbol,
        bar_time=BAS + timedelta(hours=saat),
        timeframe=timeframe,
        score=80,
        families={"trend": 0.7},
        modifiers={},
        rationale={},
        config_hash="abc",
    )
    session.add(puan)
    await session.flush()
    return puan


@pytest.mark.asyncio
async def test_gozlem_yazilir_ve_getiri_dogrudur(api_session):
    kapanislar = [100.0] * 30
    kapanislar[4] = 150.0  # +%50, 4 saat sonra
    await _bar_ekle(api_session, "BTCUSDT", kapanislar)
    await _puan_ekle(api_session, "BTCUSDT", 0)

    yazilan = await backfill_observations(api_session, since=BAS, now=BAS + timedelta(hours=30))

    assert yazilan == 1
    gozlem = (await api_session.execute(select(ScoreObservation))).scalar_one()
    assert float(gozlem.fwd_return_4h) == pytest.approx(0.50)
    assert float(gozlem.fwd_return_24h) == pytest.approx(0.0)
    assert gozlem.fwd_return_72h is None  # ufuk henüz dolmadı


@pytest.mark.asyncio
async def test_ufku_dolmamis_puan_yazilmaz(api_session):
    """`SETTLE_HOURS` dolmadan gözlem yazılmaz — yoksa satır hep boş getirili olurdu."""
    await _bar_ekle(api_session, "BTCUSDT", [100.0] * 30)
    await _puan_ekle(api_session, "BTCUSDT", 20)

    # Puandan yalnızca 1 saat sonrası: en kısa ufuk (4s) bile dolmadı.
    yazilan = await backfill_observations(api_session, since=BAS, now=BAS + timedelta(hours=21))
    assert yazilan == 0
    assert await api_session.scalar(select(func.count()).select_from(ScoreObservation)) == 0
    assert SETTLE_HOURS == 4


@pytest.mark.asyncio
async def test_tekrar_calistirmak_kopya_uretmez(api_session):
    """Upsert: aynı puan için ikinci koşu satırı günceller, yenisini eklemez."""
    kapanislar = [100.0] * 80
    kapanislar[4], kapanislar[24] = 110.0, 120.0
    await _bar_ekle(api_session, "BTCUSDT", kapanislar)
    await _puan_ekle(api_session, "BTCUSDT", 0)

    ilk = await backfill_observations(api_session, since=BAS, now=BAS + timedelta(hours=30))
    ikinci = await backfill_observations(api_session, since=BAS, now=BAS + timedelta(hours=80))

    assert ilk == 1 and ikinci == 1
    assert await api_session.scalar(select(func.count()).select_from(ScoreObservation)) == 1
    gozlem = (await api_session.execute(select(ScoreObservation))).scalar_one()
    # İkinci koşuda 72 saatlik ufuk dolmuş olmalı: ilk koşuda NULL'du.
    assert gozlem.fwd_return_72h is not None


@pytest.mark.asyncio
async def test_baska_zaman_dilimi_karismaz(api_session):
    await _bar_ekle(api_session, "BTCUSDT", [100.0] * 30)
    await _puan_ekle(api_session, "BTCUSDT", 0, timeframe="4h")

    yazilan = await backfill_observations(api_session, since=BAS, now=BAS + timedelta(hours=30))
    assert yazilan == 0


@pytest.mark.asyncio
async def test_verisi_olmayan_sembol_atlanir(api_session):
    """Hiç barı olmayan bir sembol için boş satır yazılmaz."""
    await _puan_ekle(api_session, "YOKUSDT", 0)
    yazilan = await backfill_observations(api_session, since=BAS, now=BAS + timedelta(hours=30))
    assert yazilan == 0


# --------------------------------------------------------------------------- #
#  Süpervizör döngüsü — besleyici otomatik çalışmalı
# --------------------------------------------------------------------------- #
def test_supervisor_gozlem_dongusunu_kaydeder():
    """Besleyici bir döngüye bağlı olmalı.

    Bu döngü olmadan `backfill_observations` yalnızca elle çalışıyordu ve kimse
    çalıştırmayınca kalibrasyon sessizce eskiyordu: ölçüldüğünde puanlar 21
    Ağustos'a kadar yazılmışken en yeni gözlem 18 Ağustos'tu. Sayfa dolu
    görünüyor, yalnızca son üç günü göstermiyordu.
    """
    import inspect

    from sarnic.bots import supervisor as sup

    assert hasattr(sup.BotSupervisor, "_observations_loop")
    kaynak = inspect.getsource(sup.BotSupervisor.run)
    assert "sup-observations" in kaynak, "döngü görev listesine eklenmemiş"
    # Aralık makul: en kısa ufuk 4 saat, saatlik koşmak yeni puanları yakalar.
    assert 0 < sup.OBSERVATIONS_INTERVAL <= 4 * 3600
