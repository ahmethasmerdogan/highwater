"""Puan geçmişi budaması testleri.

En kritik davranış: **kalibrasyon gözlemleri asla silinmez.**
`score_observations.score_id` yabancı anahtarı `ON DELETE CASCADE` olduğu için
eski bir puanı silmek ona bağlı gözlemi de sessizce götürürdü — ve gözlemler
sistemin birincil çıktısıdır. Bu sessiz bir veri kaybı olurdu; testi bu yüzden
var.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from sarnic.db.models import Score, ScoreObservation
from sarnic.scoring.retention import prune_scores

SIMDI = datetime(2026, 8, 20, 12, 0, tzinfo=UTC)


async def _puan_ekle(session, *, gun_once: int, symbol: str = "BTCUSDT") -> Score:
    puan = Score(
        symbol=symbol,
        bar_time=SIMDI - timedelta(days=gun_once),
        timeframe="1h",
        score=75,
        families={"trend": 0.5},
        modifiers={},
        rationale={},
        config_hash="abc",
    )
    session.add(puan)
    await session.flush()
    return puan


async def _gozlem_ekle(session, puan: Score) -> None:
    session.add(
        ScoreObservation(
            score_id=puan.id,
            symbol=puan.symbol,
            bar_time=puan.bar_time,
            score=puan.score,
            families=puan.families,
            fwd_return_24h=0.01,
        )
    )
    await session.flush()


@pytest.mark.asyncio
async def test_eski_puan_silinir(api_session):
    await _puan_ekle(api_session, gun_once=100)
    silinen = await prune_scores(api_session, retention_days=90, now=SIMDI)
    assert silinen == 1
    assert await api_session.scalar(select(func.count()).select_from(Score)) == 0


@pytest.mark.asyncio
async def test_suresi_dolmamis_puan_kalir(api_session):
    await _puan_ekle(api_session, gun_once=89)
    assert await prune_scores(api_session, retention_days=90, now=SIMDI) == 0
    assert await api_session.scalar(select(func.count()).select_from(Score)) == 1


@pytest.mark.asyncio
async def test_gozlemli_puan_sinirin_otesinde_de_korunur(api_session):
    """Budamanın var oluş koşulu: ölçüm verisine dokunmamak."""
    korunacak = await _puan_ekle(api_session, gun_once=200, symbol="ETHUSDT")
    await _gozlem_ekle(api_session, korunacak)
    await _puan_ekle(api_session, gun_once=200, symbol="XRPUSDT")  # gözlemsiz, silinmeli

    silinen = await prune_scores(api_session, retention_days=90, now=SIMDI)

    assert silinen == 1
    kalan = (await api_session.execute(select(Score.symbol))).scalars().all()
    assert kalan == ["ETHUSDT"]
    # Asıl iddia: gözlem hâlâ orada. CASCADE ile birlikte gitseydi kalibrasyon
    # sessizce geçmişini kaybederdi.
    assert await api_session.scalar(select(func.count()).select_from(ScoreObservation)) == 1


@pytest.mark.asyncio
async def test_sifir_gun_budamayi_kapatir(api_session):
    await _puan_ekle(api_session, gun_once=1000)
    assert await prune_scores(api_session, retention_days=0, now=SIMDI) == 0
    assert await api_session.scalar(select(func.count()).select_from(Score)) == 1


@pytest.mark.asyncio
async def test_negatif_deger_de_kapatir(api_session):
    await _puan_ekle(api_session, gun_once=1000)
    assert await prune_scores(api_session, retention_days=-1, now=SIMDI) == 0
    assert await api_session.scalar(select(func.count()).select_from(Score)) == 1
