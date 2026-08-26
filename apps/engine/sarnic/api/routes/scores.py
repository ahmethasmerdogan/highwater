"""Puan ve kalibrasyon uçları — §15.

Kalibrasyon sayfası sistemin dürüstlük organıdır: sonuç düzse bu uç düz veri
döndürür ve yorumu yumuşatmaz (§5.5).
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.api.deps import CurrentUser, SessionDep
from sarnic.api.schemas import ScoreDetail, ScoreOut
from sarnic.bots.supervisor import RUNNING_STATES
from sarnic.core.clock import utcnow
from sarnic.db.models import Bot, Score, ScoreObservation, StrategyVersion
from sarnic.scoring.calibration import build_report
from sarnic.scoring.engine import DEFAULT_MIN_SCORE, ScoringEngine
from sarnic.scoring.registry import DEFAULT_FAMILY_WEIGHTS
from sarnic.strategy.definition import StrategyDefinition

router = APIRouter(tags=["scores"])


async def _default_config(session) -> tuple[str, str] | None:
    """Panelin varsayılan sıralaması: bot sırasına göre ilki.

    Bot eşlemesi kurulamazsa (tanım bozuk, bot silinmiş) mevcut çiftlerden
    sözlük sırasına göre ilki seçilir — keyfi ama **deterministik**.
    """
    present = {
        (h, tf)
        for h, tf in (
            await session.execute(select(Score.config_hash, Score.timeframe).distinct())
        ).all()
    }
    if not present:
        return None
    for key, _label in await _config_labels(session):
        if key in present:
            return key
    return min(present)


async def _config_labels(session) -> list[tuple[tuple[str, str], str]]:
    """`((config_hash, zaman_dilimi), etiket)` — bot sırasına göre.

    Kimlik yalnızca hash değil, **hash + zaman dilimi**dir: aynı ağırlıklar 1
    saatlik ve 15 dakikalık botlarda aynı hash'i üretir, ama bunlar farklı
    sıralamalardır ve tek listede birleştirilemez.

    Puanlama konfigürasyonunun hash'i botun strateji tanımından türer; `scores`
    tablosunda `bot_id` yoktur (aynı konfigürasyonu birden çok bot paylaşabilir).
    Bu yüzden eşleme, her botun tanımından hash'i **yeniden hesaplayarak**
    kurulur. Aynı hash'i üreten botlar tek bir girdide birleşir.
    """
    rows = (
        await session.execute(
            select(Bot.name, StrategyVersion.definition)
            .join(StrategyVersion, StrategyVersion.id == Bot.strategy_version_id)
            .order_by(Bot.id)
        )
    ).all()

    labels: dict[tuple[str, str], list[str]] = {}
    for name, definition in rows:
        try:
            parsed = StrategyDefinition.from_dict(definition)
        except Exception:  # bozuk tanım listeyi düşürmemeli
            continue
        engine = ScoringEngine(
            weights=parsed.scoring.weights,
            use_pattern=parsed.scoring.modifiers.get("pattern", True),
            use_candle=parsed.scoring.modifiers.get("candle", True),
            use_crowding=parsed.scoring.modifiers.get("crowding", True),
        )
        labels.setdefault((engine.config_hash(), parsed.timeframe), []).append(name)
    return [(key, " · ".join(names)) for key, names in labels.items()]


@router.get("/scores/configs")
async def score_configs(session: SessionDep, user: CurrentUser) -> list[dict]:
    """Puanlama sıralamaları — panelin strateji seçicisi için.

    Aynı anda birden çok bot farklı ağırlıklarla puanlar. Hepsini tek listede
    karıştırmak sıralamanın anlamını yok eder: aynı sembol iki farklı puanla
    iki kez görünür. Panel bu uçtan sıralamaları alır ve her seferinde **tek**
    birini gösterir.

    Son bar **her zaman dilimi için ayrı** hesaplanır. Küresel tek bir son bar
    kullanılıyordu ve 15 dakikalık botlar eklendiğinde 1 saatlik sıralamalar
    panelden tamamen kayboldu: 05:45'te 15m barı vardı, 1h barı 05:00'daydı ve
    "son bar" 05:45 olduğu için saatlik konfigürasyonlar hiç listelenmedi.
    Kullanıcı saatlik havuza baktığını sanarken 15 dakikalık puanları görüyordu.
    """
    son_barlar = {
        (h, tf): bar
        for h, tf, bar in (
            await session.execute(
                select(Score.config_hash, Score.timeframe, func.max(Score.bar_time)).group_by(
                    Score.config_hash, Score.timeframe
                )
            )
        ).all()
    }
    if not son_barlar:
        return []

    counts: dict[tuple[str, str], tuple[int, float]] = {}
    for (h, tf), bar in son_barlar.items():
        row = (
            await session.execute(
                select(func.count(), func.max(Score.score)).where(
                    Score.config_hash == h, Score.timeframe == tf, Score.bar_time == bar
                )
            )
        ).one()
        counts[(h, tf)] = (row[0], float(row[1] or 0.0))

    labeled = [(key, label) for key, label in await _config_labels(session) if key in counts]
    # Bir bota bağlanamayan sıralama (silinmiş/değişmiş bot) gizlenmez —
    # veri oradadır, saklamak dürüst olmaz.
    bilinen = dict(labeled)
    labeled += [(key, "bilinmeyen yapılandırma") for key in counts if key not in bilinen]

    return [
        {
            "config_hash": h,
            "timeframe": tf,
            "label": label,
            "symbols": counts[(h, tf)][0],
            "top_score": round(counts[(h, tf)][1], 2),
            "bar_time": son_barlar[(h, tf)].isoformat(),
        }
        for (h, tf), label in labeled
    ]


@router.get("/scores", response_model=list[ScoreOut])
async def latest_scores(
    session: SessionDep,
    user: CurrentUser,
    limit: int = 100,
    min_score: float = 0.0,
    config_hash: str | None = None,
    timeframe: str | None = None,
) -> list[ScoreOut]:
    """Anlık sıralama — seçilen sıralamanın son barındaki puanlar.

    `config_hash` verilmezse **tek** bir sıralama seçilir (bot sırasına göre
    ilki). Birden çok konfigürasyonu karıştırmak sıralamayı anlamsız kılar;
    sessizce karıştırmaktansa açıkça birini seçip panele hangisi olduğunu
    `/scores/configs` üzerinden bildiriyoruz.

    Son bar, seçilen sıralamanın **kendi zaman diliminde** aranır. Küresel son
    bar kullanılıyordu; 15 dakikalık botlar eklenince 1 saatlik havuz panelden
    kayboldu, çünkü "son bar" hep 15m barıydı.
    """
    secim = (config_hash, timeframe) if config_hash and timeframe else None
    if secim is None:
        varsayilan = await _default_config(session)
        if varsayilan is None:
            return []
        secim = (config_hash or varsayilan[0], timeframe or varsayilan[1])

    last_bar = (
        await session.execute(
            select(func.max(Score.bar_time)).where(
                Score.config_hash == secim[0], Score.timeframe == secim[1]
            )
        )
    ).scalar_one_or_none()
    if last_bar is None:
        return []

    conditions = [
        Score.bar_time == last_bar,
        Score.score >= min_score,
        Score.config_hash == secim[0],
        Score.timeframe == secim[1],
    ]

    rows = (
        await session.execute(
            select(Score).where(*conditions).order_by(Score.score.desc()).limit(min(limit, 500))
        )
    ).scalars()
    return [
        ScoreOut(
            symbol=r.symbol,
            bar_time=r.bar_time,
            score=float(r.score),
            families=r.families,
            modifiers=r.modifiers,
            config_hash=r.config_hash,
        )
        for r in rows
    ]


@router.get("/scores/{symbol}", response_model=ScoreDetail)
async def score_detail(
    symbol: str, session: SessionDep, user: CurrentUser, config_hash: str | None = None
) -> ScoreDetail:
    """Tek sembolün puan kartı.

    `config_hash` **gerekli**: iki konfigürasyon aynı sembole farklı puan verir
    ve konfigürasyon belirtilmezse hangi satırın döneceği rastgele olur —
    tabloda tıklanan puan ile kartta yazan puan tutmayabilirdi. Verilmezse
    listedeki ile aynı varsayılan seçilir.
    """
    conditions = [Score.symbol == symbol.upper()]
    if config_hash:
        conditions.append(Score.config_hash == config_hash)
    else:
        last_bar = (
            await session.execute(
                select(Score.bar_time)
                .where(Score.symbol == symbol.upper())
                .order_by(Score.bar_time.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        varsayilan = await _default_config(session) if last_bar else None
        if varsayilan is not None:
            conditions.append(Score.config_hash == varsayilan[0])
            conditions.append(Score.timeframe == varsayilan[1])

    row = (
        await session.execute(
            select(Score).where(*conditions).order_by(Score.bar_time.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{symbol} için puan kaydı yok.")
    return ScoreDetail(
        symbol=row.symbol,
        bar_time=row.bar_time,
        score=float(row.score),
        families=row.families,
        modifiers=row.modifiers,
        rationale=row.rationale,
        config_hash=row.config_hash,
    )


@router.get("/scores/{symbol}/history")
async def score_history(
    symbol: str,
    session: SessionDep,
    user: CurrentUser,
    days: int = 7,
    config_hash: str | None = None,
) -> list[dict]:
    """Puan geçmişi. Konfigürasyon filtresi olmadan çizgi iki seri arasında
    zikzak yapar — her bar için iki farklı puan vardır."""
    since = utcnow() - timedelta(days=min(days, 90))
    conditions = [Score.symbol == symbol.upper(), Score.bar_time >= since]

    if config_hash is not None:
        conditions.append(Score.config_hash == config_hash)
    else:
        varsayilan = await _default_config(session)
        if varsayilan is not None:
            conditions.append(Score.config_hash == varsayilan[0])
            conditions.append(Score.timeframe == varsayilan[1])

    rows = (
        await session.execute(
            select(Score.bar_time, Score.score, Score.families)
            .where(*conditions)
            .order_by(Score.bar_time)
        )
    ).all()
    return [{"bar_time": t.isoformat(), "score": float(s), "families": f} for t, s, f in rows]


@router.get("/calibration")
async def calibration(
    session: SessionDep,
    user: CurrentUser,
    horizon: str = "24h",
    days: int = 180,
) -> dict:
    """Desil grafiği, Spearman ve aile bazında IC (§5.5)."""
    column = {
        "4h": ScoreObservation.fwd_return_4h,
        "24h": ScoreObservation.fwd_return_24h,
        "72h": ScoreObservation.fwd_return_72h,
    }.get(horizon)
    if column is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "horizon 4h, 24h veya 72h olmalı.")

    since = utcnow() - timedelta(days=min(days, 730))
    rows = (
        await session.execute(
            select(
                ScoreObservation.bar_time,
                ScoreObservation.score,
                column,
                ScoreObservation.families,
            ).where(ScoreObservation.bar_time >= since, column.isnot(None))
        )
    ).all()

    # Gözlem yokken de **tam** rapor gövdesi döndürülür. Kısa devre yapan eski
    # sürüm yalnızca beş alan veriyordu; panel `rolling_spearman.filter(...)`
    # çağırdığında `undefined` üzerinde patlıyor ve kalibrasyon sayfası —
    # sistemin dürüstlük organı — hiç açılmıyordu. Ayrıca elle yazılmış metin,
    # `_insufficient_message`'in ürettiğiyle çelişiyordu (§9.9'da düzeltilen
    # hatanın aynısı ikinci bir yerde duruyormuş).
    if not rows:
        return build_report(
            horizon=horizon,
            times=[],
            scores=np.array([], dtype=float),
            returns=np.array([], dtype=float),
        ).as_dict()

    times: list[datetime] = [r[0] for r in rows]
    scores = np.array([float(r[1]) for r in rows], dtype=float)
    returns = np.array([float(r[2]) for r in rows], dtype=float)
    family_values = {
        family: np.array([float((r[3] or {}).get(family, np.nan)) for r in rows], dtype=float)
        for family in DEFAULT_FAMILY_WEIGHTS
    }

    report = build_report(
        horizon=horizon,
        times=times,
        scores=scores,
        returns=returns,
        family_values=family_values,
        gate=await _entry_gate(session),
    )
    return report.as_dict()


async def _entry_gate(session: AsyncSession) -> float:
    """Botların fiilen kullandığı giriş kapısı.

    Kalibrasyonun "kapı kenarı" ölçümü, sistemin gerçekten aldığı bölgeyi
    göstermek zorunda; sabit bir sayı yazmak, ayar değiştiğinde paneli sessizce
    yanlış bölgeyi raporlar hâle getirirdi. Birden çok bot varsa **en düşük**
    kapı alınır: sistemin işlem yapmaya başladığı sınır orasıdır.
    """
    rows = (
        (
            await session.execute(
                select(StrategyVersion.definition)
                .join(Bot, Bot.strategy_version_id == StrategyVersion.id)
                .where(Bot.state.in_(RUNNING_STATES))
            )
        )
        .scalars()
        .all()
    )
    kapilar = [float((d or {}).get("entry", {}).get("min_score", DEFAULT_MIN_SCORE)) for d in rows]
    return min(kapilar) if kapilar else DEFAULT_MIN_SCORE
