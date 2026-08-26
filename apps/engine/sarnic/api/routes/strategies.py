"""Strateji ve backtest uçları — §12 / §11.

Bir strateji versiyonu paper'a alındıktan sonra **değiştirilemez** (`frozen`);
düzenleme yeni versiyon üretir. Böylece her işlemin hangi tam konfigürasyonla
açıldığı bilinir.
"""

from __future__ import annotations

import asyncio
import sys

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from sarnic.api.deps import BusDep, CurrentUser, RequireTrader, SessionDep, write_audit
from sarnic.api.schemas import (
    BacktestCreate,
    BacktestOut,
    StrategyCreate,
    StrategyOut,
    StrategyVersionCreate,
    StrategyVersionOut,
)
from sarnic.core.logging import get_logger
from sarnic.db.models import Backtest, BacktestResult, Bot, Strategy, StrategyVersion
from sarnic.strategy.definition import StrategyDefinition, StrategyValidationError

log = get_logger(__name__)
router = APIRouter(tags=["strategies"])


def _version_out(v: StrategyVersion) -> StrategyVersionOut:
    return StrategyVersionOut.model_validate(v)


@router.get("/strategies", response_model=list[StrategyOut])
async def list_strategies(session: SessionDep, user: CurrentUser) -> list[StrategyOut]:
    rows = (await session.execute(select(Strategy).order_by(Strategy.id))).scalars().all()
    return [
        StrategyOut(
            id=s.id,
            name=s.name,
            owner_id=s.owner_id,
            created_at=s.created_at,
            versions=[_version_out(v) for v in sorted(s.versions, key=lambda x: x.version)],
        )
        for s in rows
    ]


@router.post("/strategies", response_model=StrategyOut, status_code=status.HTTP_201_CREATED)
async def create_strategy(
    payload: StrategyCreate, request: Request, session: SessionDep, user: RequireTrader
) -> StrategyOut:
    definition = (
        _validate(payload.definition)
        if payload.definition is not None
        else StrategyDefinition(name=payload.name)
    )
    strategy = Strategy(name=payload.name, owner_id=user.id)
    session.add(strategy)
    await session.flush()

    version = StrategyVersion(
        strategy_id=strategy.id,
        version=1,
        definition=definition.to_dict(),
        definition_hash=definition.hash(),
        frozen=False,
    )
    session.add(version)
    await write_audit(session, request, user.id, "strategy.create", target=str(strategy.id))
    await session.commit()
    await session.refresh(strategy)
    return StrategyOut(
        id=strategy.id,
        name=strategy.name,
        owner_id=strategy.owner_id,
        created_at=strategy.created_at,
        versions=[_version_out(version)],
    )


@router.get("/strategies/{strategy_id}/versions", response_model=list[StrategyVersionOut])
async def list_versions(
    strategy_id: int, session: SessionDep, user: CurrentUser
) -> list[StrategyVersionOut]:
    rows = (
        await session.execute(
            select(StrategyVersion)
            .where(StrategyVersion.strategy_id == strategy_id)
            .order_by(StrategyVersion.version)
        )
    ).scalars()
    return [_version_out(v) for v in rows]


@router.post(
    "/strategies/{strategy_id}/versions",
    response_model=StrategyVersionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_version(
    strategy_id: int,
    payload: StrategyVersionCreate,
    request: Request,
    session: SessionDep,
    user: RequireTrader,
) -> StrategyVersionOut:
    strategy = (
        await session.execute(select(Strategy).where(Strategy.id == strategy_id))
    ).scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Strateji bulunamadı.")

    definition = _validate(payload.definition)
    next_version = int(
        (
            await session.execute(
                select(func.coalesce(func.max(StrategyVersion.version), 0)).where(
                    StrategyVersion.strategy_id == strategy_id
                )
            )
        ).scalar_one()
        + 1
    )
    definition.version = next_version
    version = StrategyVersion(
        strategy_id=strategy_id,
        version=next_version,
        definition=definition.to_dict(),
        definition_hash=definition.hash(),
        frozen=False,
    )
    session.add(version)
    await write_audit(session, request, user.id, "strategy.version_create", target=str(strategy_id))
    await session.commit()
    return _version_out(version)


@router.post("/strategies/versions/{version_id}/freeze", response_model=StrategyVersionOut)
async def freeze_version(
    version_id: int, request: Request, session: SessionDep, user: RequireTrader
) -> StrategyVersionOut:
    version = await _load_version(session, version_id)
    version.frozen = True
    await write_audit(session, request, user.id, "strategy.freeze", target=str(version_id))
    await session.commit()
    return _version_out(version)


# --------------------------------------------------------------------------- #
#  Backtest
# --------------------------------------------------------------------------- #
@router.get("/backtests", response_model=list[BacktestOut])
async def list_backtests(
    session: SessionDep, user: CurrentUser, limit: int = 50
) -> list[BacktestOut]:
    rows = (
        await session.execute(
            select(Backtest).order_by(Backtest.created_at.desc()).limit(min(limit, 200))
        )
    ).scalars()
    return [
        BacktestOut(
            id=b.id,
            strategy_version_id=b.strategy_version_id,
            status=b.status,
            error=b.error,
            approximate_universe=b.approximate_universe,
            params=b.params,
            started_at=b.started_at,
            finished_at=b.finished_at,
            created_at=b.created_at,
        )
        for b in rows
    ]


@router.post("/backtests", response_model=BacktestOut, status_code=status.HTTP_202_ACCEPTED)
async def create_backtest(
    payload: BacktestCreate,
    request: Request,
    session: SessionDep,
    bus: BusDep,
    user: RequireTrader,
) -> BacktestOut:
    version = await _load_version(session, payload.strategy_version_id)
    if payload.end <= payload.start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitiş tarihi başlangıçtan sonra olmalı.")

    # Tek makine, tek koşu. Sınır olmadığında panelden arka arkaya başlatılan
    # koşular makineyi doyuruyor; her biri ayrı süreçte olsa bile çekirdek
    # sayısı kadar backtest aynı anda tüm sistemi yavaşlatır.
    busy = (
        await session.execute(
            select(func.count(Backtest.id)).where(Backtest.status.in_(("QUEUED", "RUNNING")))
        )
    ).scalar_one()
    if busy:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Zaten çalışan bir backtest var. Bitmesini bekleyin — koşular tek tek yürütülür.",
        )

    backtest = Backtest(
        strategy_version_id=version.id,
        owner_id=user.id,
        params=payload.model_dump(mode="json"),
        status="QUEUED",
    )
    session.add(backtest)
    await write_audit(session, request, user.id, "backtest.create", target=str(version.id))
    await session.commit()

    # Koşu **ayrı bir süreçte** çalışır.
    #
    # Önceden `asyncio.create_task` ile API'nin olay döngüsünde koşuyordu.
    # Backtest motoru CPU-bağımlı ve senkron; bir barı işlerken döngüye
    # dönmüyor. 2853 bar × 83 sembolluk bir koşu API'yi 34 dakika boyunca
    # %100 CPU'da tuttu, panel hiç açılmadı ve kimse giriş yapamadı. Ayrı
    # süreç bu bağı koparır: koşu çökerse API ayakta kalır, API yeniden
    # başlarsa koşu devam eder.
    await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "sarnic.cli",
        "backtest-run",
        str(backtest.id),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        start_new_session=True,
    )

    return BacktestOut(
        id=backtest.id,
        strategy_version_id=version.id,
        status=backtest.status,
        error=None,
        approximate_universe=False,
        params=backtest.params,
        started_at=None,
        finished_at=None,
        created_at=backtest.created_at,
    )


@router.get("/backtests/{backtest_id}")
async def get_backtest(backtest_id: int, session: SessionDep, user: CurrentUser) -> dict:
    backtest = (
        await session.execute(select(Backtest).where(Backtest.id == backtest_id))
    ).scalar_one_or_none()
    if backtest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backtest bulunamadı.")

    results = (
        (
            await session.execute(
                select(BacktestResult).where(BacktestResult.backtest_id == backtest_id)
            )
        )
        .scalars()
        .all()
    )

    return {
        "id": backtest.id,
        "strategy_version_id": backtest.strategy_version_id,
        "status": backtest.status,
        "error": backtest.error,
        "approximate_universe": backtest.approximate_universe,
        "params": backtest.params,
        "started_at": backtest.started_at.isoformat() if backtest.started_at else None,
        "finished_at": backtest.finished_at.isoformat() if backtest.finished_at else None,
        "results": [
            {
                "cost_scenario": r.cost_scenario,
                "metrics": r.metrics,
                "equity_curve": r.equity_curve,
                "trades": r.trades,
                "benchmarks": r.benchmarks,
                "flags": r.flags,
            }
            for r in results
        ],
    }


def _validate(raw: dict) -> StrategyDefinition:
    try:
        return StrategyDefinition.from_dict(raw).require_valid()
    except StrategyValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


async def _load_version(session, version_id: int) -> StrategyVersion:
    version = (
        await session.execute(select(StrategyVersion).where(StrategyVersion.id == version_id))
    ).scalar_one_or_none()
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Strateji versiyonu bulunamadı.")
    return version


async def freeze_if_used(session, version_id: int) -> None:
    """Bir versiyon bir bota bağlandığı anda dondurulur."""
    used = (
        await session.execute(
            select(func.count(Bot.id)).where(Bot.strategy_version_id == version_id)
        )
    ).scalar_one()
    if used:
        version = await _load_version(session, version_id)
        version.frozen = True
