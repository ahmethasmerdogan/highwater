"""Asenkron oturum fabrikası."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from sarnic.config import settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.database_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
            echo=False,
        )
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            get_engine(), expire_on_commit=False, class_=AsyncSession
        )
    return _sessionmaker


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Yazan kod için: başarıda commit, hatada rollback."""
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI bağımlılığı."""
    async with get_sessionmaker()() as session:
        yield session


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


async def wait_for_db(timeout_seconds: float = 90.0) -> None:
    """Postgres hazır olana kadar bekler — açılış yarışının ilacı.

    Makine açılışında systemd servisleri Docker'daki Postgres'ten önce
    kalkıyor; marketdata `Connect call failed 127.0.0.1:5432` ile ölüp
    10 sn sonra yeniden doğuyordu. Çökme-yeniden-doğma teknik olarak
    çalışsa da journal'a bir traceback bırakıyor ve ilk backfill turunu
    geciktiriyordu. Servisler artık başlamadan önce burada bekler;
    süre dolarsa DÜRÜSTÇE ölür — sonsuz sessiz bekleme yok.
    """
    import asyncio

    from sqlalchemy import text

    from sarnic.core.logging import get_logger

    log = get_logger(__name__)
    started = asyncio.get_event_loop().time()
    bekleme = 1.0
    while True:
        try:
            async with get_engine().connect() as conn:
                await conn.execute(text("SELECT 1"))
            return
        except Exception as exc:
            gecen = asyncio.get_event_loop().time() - started
            if gecen >= timeout_seconds:
                raise TimeoutError(
                    f"PostgreSQL {timeout_seconds:.0f} sn içinde hazır olmadı: {exc}"
                ) from exc
            log.info("db_bekleniyor", elapsed=round(gecen, 1), retry_in=bekleme)
            await asyncio.sleep(bekleme)
            bekleme = min(bekleme * 1.6, 8.0)
