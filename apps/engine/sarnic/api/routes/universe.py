"""Havuz uçları — §15."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import delete, select

from sarnic.api.deps import CurrentUser, RedisDep, RequireAdmin, SessionDep, write_audit
from sarnic.api.schemas import BlacklistIn, SnapshotDetail, SnapshotOut
from sarnic.db.models import Blacklist, UniverseSnapshot
from sarnic.universe.engine import UniverseEngine, UniverseInputUnavailable

router = APIRouter(prefix="/universe", tags=["universe"])


def _to_out(snap: UniverseSnapshot) -> SnapshotOut:
    return SnapshotOut(
        id=snap.id,
        taken_at=snap.taken_at,
        reason=snap.reason,
        config_hash=snap.config_hash,
        size=len(snap.symbols),
        added=snap.added,
        removed=snap.removed,
    )


VALID_MARKETS = {"CRYPTO", "BIST", "US"}


@router.get("/current", response_model=SnapshotDetail)
async def current(
    session: SessionDep, user: CurrentUser, market: str = "CRYPTO"
) -> SnapshotDetail:
    """Pazarın güncel havuzu. Havuz pazar başınadır — TRY cirosu USD
    cirosuyla aynı sıralamaya girmez; panel pazarları ayrı sekmelerde gösterir."""
    if market not in VALID_MARKETS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "market CRYPTO, BIST veya US olmalı.")
    snap = await UniverseEngine().latest_snapshot(session, market=market)
    if snap is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Bu pazar için henüz havuz oluşturulmadı."
            + (" Yönetici panelinden yenileme başlatın." if market == "CRYPTO" else ""),
        )
    return SnapshotDetail(**_to_out(snap).model_dump(), symbols=snap.symbols, funnel=snap.funnel)


@router.get("/snapshots", response_model=list[SnapshotOut])
async def snapshots(
    session: SessionDep, user: CurrentUser, limit: int = 50, market: str = "CRYPTO"
) -> list[SnapshotOut]:
    if market not in VALID_MARKETS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "market CRYPTO, BIST veya US olmalı.")
    rows = (
        await session.execute(
            select(UniverseSnapshot)
            .where(UniverseSnapshot.market == market)
            .order_by(UniverseSnapshot.taken_at.desc())
            .limit(min(limit, 200))
        )
    ).scalars()
    return [_to_out(s) for s in rows]


@router.get("/snapshots/{snapshot_id}", response_model=SnapshotDetail)
async def snapshot_detail(
    snapshot_id: int, session: SessionDep, user: CurrentUser
) -> SnapshotDetail:
    snap = (
        await session.execute(select(UniverseSnapshot).where(UniverseSnapshot.id == snapshot_id))
    ).scalar_one_or_none()
    if snap is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snapshot bulunamadı.")
    return SnapshotDetail(**_to_out(snap).model_dump(), symbols=snap.symbols, funnel=snap.funnel)


@router.get("/funnel")
async def funnel(session: SessionDep, user: CurrentUser) -> dict:
    """Filtre hunisi — her adımın kaç coin elediği (§3.2)."""
    snap = await UniverseEngine().latest_snapshot(session)
    if snap is None:
        return {"taken_at": None, "funnel": [], "final": 0}
    return {
        "taken_at": snap.taken_at.isoformat(),
        "funnel": snap.funnel,
        "final": len(snap.symbols),
    }


@router.post("/refresh", response_model=SnapshotOut)
async def refresh(
    request: Request, session: SessionDep, redis: RedisDep, admin: RequireAdmin
) -> SnapshotOut:
    try:
        result = await UniverseEngine().refresh(session, redis, reason="manual")
    except UniverseInputUnavailable as exc:
        # 503: geçici bir veri kesintisi, kullanıcı hatası değil.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    await write_audit(
        session,
        request,
        admin.id,
        "universe.refresh",
        payload={"size": len(result.symbols), "snapshot_id": result.snapshot_id},
    )
    await session.commit()
    snap = (
        await session.execute(
            select(UniverseSnapshot).where(UniverseSnapshot.id == result.snapshot_id)
        )
    ).scalar_one()
    return _to_out(snap)


@router.get("/blacklist")
async def list_blacklist(session: SessionDep, user: CurrentUser) -> list[dict]:
    rows = (await session.execute(select(Blacklist))).scalars()
    return [
        {"symbol": r.symbol, "reason": r.reason, "created_at": r.created_at.isoformat()}
        for r in rows
    ]


@router.post("/blacklist", status_code=status.HTTP_201_CREATED)
async def add_blacklist(
    payload: BlacklistIn, request: Request, session: SessionDep, admin: RequireAdmin
) -> dict:
    symbol = payload.symbol.upper()
    exists = (
        await session.execute(select(Blacklist).where(Blacklist.symbol == symbol))
    ).scalar_one_or_none()
    if exists is None:
        session.add(Blacklist(symbol=symbol, reason=payload.reason, created_by=admin.id))
    await write_audit(session, request, admin.id, "universe.blacklist_add", target=symbol)
    await session.commit()
    return {
        "symbol": symbol,
        "message": "Kara listeye alındı. Bir sonraki havuz yenilemesinde çıkarılacak.",
    }


@router.delete("/blacklist/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_blacklist(
    symbol: str, request: Request, session: SessionDep, admin: RequireAdmin
) -> None:
    await session.execute(delete(Blacklist).where(Blacklist.symbol == symbol.upper()))
    await write_audit(
        session, request, admin.id, "universe.blacklist_remove", target=symbol.upper()
    )
    await session.commit()
