"""Sembol uçları: OHLCV, S/R seviyeleri, formasyonlar — grafik sayfasının kaynağı."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, status

from sarnic.api.deps import CurrentUser, SessionDep
from sarnic.core.enums import TIMEFRAME_MINUTES
from sarnic.data.store import load_frame
from sarnic.features.patterns import compute_patterns
from sarnic.features.sr import compute_sr

router = APIRouter(prefix="/symbols", tags=["symbols"])


@router.get("/{symbol}/ohlcv")
async def ohlcv(
    symbol: str,
    session: SessionDep,
    user: CurrentUser,
    tf: str = "1h",
    limit: int = 500,
    to: datetime | None = None,
) -> list[dict]:
    if tf not in TIMEFRAME_MINUTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Bilinmeyen zaman dilimi: {tf}")
    df = await load_frame(session, symbol.upper(), tf, end=to, limit=min(limit, 5000))
    return [
        {
            "time": int(row.open_time.timestamp()),
            "open": row.open,
            "high": row.high,
            "low": row.low,
            "close": row.close,
            "volume": row.volume,
        }
        for row in df.itertuples()
    ]


@router.get("/{symbol}/sr")
async def sr_levels(symbol: str, session: SessionDep, user: CurrentUser, tf: str = "1h") -> dict:
    df = await load_frame(session, symbol.upper(), tf, limit=1000)
    if df.empty:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{symbol} için veri yok.")
    result = compute_sr(df, symbol.upper(), tf)
    return {
        **result.as_dict(),
        "price": result.price,
        "levels": [
            {
                "price": lv.price,
                "kind": lv.kind,
                "strength": lv.strength,
                "touches": lv.touches,
            }
            for lv in result.levels
        ],
    }


@router.get("/{symbol}/patterns")
async def patterns(symbol: str, session: SessionDep, user: CurrentUser, tf: str = "1h") -> dict:
    df = await load_frame(session, symbol.upper(), tf, limit=1000)
    if df.empty:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{symbol} için veri yok.")
    result = compute_patterns(df, symbol.upper(), tf)
    return {
        "symbol": symbol.upper(),
        "timeframe": tf,
        "matches": [m.as_dict() for m in result.matches],
        "candle_signals": result.candle_signals,
        "pattern_modifier": result.modifier(),
        "candle_modifier": result.candle_modifier(),
        "note": ("Formasyon bir tetikleyici değil, çarpandır. Puana katkısı ±10 ile sınırlıdır."),
    }
