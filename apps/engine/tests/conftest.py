"""Ortak test araçları.

Sentetik ama **gerçekçi** OHLCV üretir: deterministik seed, kontrol edilebilir
trend ve volatilite. Finansal hesaplamalarda ayrıca elle hesaplanmış küçük
fixture'lar kullanılır (bkz. `test_indicators.py`).
"""

from __future__ import annotations

import os

# Testler **canlı** Redis'e yazmamalı.
#
# Bu bir teori değil, yaşandı: 2026-08-19'da üretim veritabanında `size: 0`,
# `snapshot_id: 1` payload'lı 57 `pool.updated` bildirimi bulundu. Zaman
# damgaları test koşumuyla birebir aynıydı. Testler gerçek `EventBus`'ı
# kullanıyor, olaylar canlı Redis'e gidiyor ve **çalışan bildirim servisi**
# onları üç kullanıcının gelen kutusuna yazıyordu. Discord entegrasyonu açık
# olsaydı testler kullanıcıya mesaj gönderecekti.
#
# Ayrı bir mantıksal Redis veritabanı (15) yeterli ve ucuz. Ayar `settings`
# okunmadan **önce** konmalı; bu yüzden import sırasında.
os.environ.setdefault("SARNIC_REDIS_URL", "redis://localhost:6379/15")

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd
import pytest
import pytest_asyncio

BASE_TIME = datetime(2026, 1, 1, tzinfo=UTC)


def make_ohlcv(
    bars: int = 400,
    *,
    start: datetime = BASE_TIME,
    timeframe_minutes: int = 60,
    start_price: float = 100.0,
    drift: float = 0.0005,
    vol: float = 0.01,
    seed: int = 42,
    volume: float = 1000.0,
) -> pd.DataFrame:
    """Geometrik rastgele yürüyüş. `drift > 0` → yükselen trend."""
    rng = np.random.default_rng(seed)
    steps = rng.normal(drift, vol, bars)
    close = start_price * np.exp(np.cumsum(steps))

    open_ = np.concatenate([[start_price], close[:-1]])
    spread = np.abs(rng.normal(0, vol / 2, bars)) * close
    high = np.maximum(open_, close) + spread
    low = np.minimum(open_, close) - spread
    low = np.maximum(low, 1e-8)

    vols = np.abs(rng.normal(volume, volume * 0.3, bars))
    taker = vols * rng.uniform(0.35, 0.65, bars)

    times = [start + timedelta(minutes=timeframe_minutes * i) for i in range(bars)]
    return pd.DataFrame(
        {
            "open_time": pd.to_datetime(times, utc=True),
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": vols,
            "quote_volume": vols * close,
            "trades": np.full(bars, 100, dtype=int),
            "taker_buy_base": taker,
            "taker_buy_quote": taker * close,
        }
    )


def make_frames(symbol_seed: int = 0, bars: int = 400) -> dict[str, pd.DataFrame]:
    """Bir sembol için 1h / 4h / 1d çerçeveleri."""
    return {
        "1h": make_ohlcv(bars, timeframe_minutes=60, seed=symbol_seed),
        "4h": make_ohlcv(max(bars // 2, 260), timeframe_minutes=240, seed=symbol_seed + 100),
        "1d": make_ohlcv(max(bars // 4, 260), timeframe_minutes=1440, seed=symbol_seed + 200),
    }


@pytest.fixture
def ohlcv() -> pd.DataFrame:
    return make_ohlcv()


@pytest.fixture
def uptrend() -> pd.DataFrame:
    return make_ohlcv(400, drift=0.004, vol=0.008, seed=7)


@pytest.fixture
def downtrend() -> pd.DataFrame:
    return make_ohlcv(400, drift=-0.004, vol=0.008, seed=11)


@pytest.fixture
def universe_frames() -> dict[str, dict[str, pd.DataFrame]]:
    """20 sembollük küçük bir havuz — kesitsel puanlama testleri için."""
    return {f"COIN{i:02d}USDT": make_frames(symbol_seed=i) for i in range(20)}


# --------------------------------------------------------------------------- #
#  API test koşum takımı
#
#  Uçlar bugüne kadar hiç test edilmemişti; kusurlar ancak canlı sistemde
#  fark ediliyordu (§9.11 WebSocket, §9.12 `numpy.bool_`, §9.14 karışmış
#  konfigürasyonlar, kalibrasyonun eksik gövdesi). Hepsi bir uç testiyle
#  yakalanabilirdi.
#
#  Takım **ayrı bir veritabanı** kullanır (`sarnic_test`): canlı sistem
#  çalışırken testin onun verisine dokunması kabul edilemez.
# --------------------------------------------------------------------------- #
TEST_DB = "sarnic_test"


def _admin_url() -> str:
    from sarnic.config import settings

    return settings.database_url.rsplit("/", 1)[0] + "/postgres"


def _test_url() -> str:
    from sarnic.config import settings

    return settings.database_url.rsplit("/", 1)[0] + f"/{TEST_DB}"


async def _postgres_available() -> bool:
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(_admin_url(), isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect():
            return True
    except Exception:
        return False
    finally:
        await engine.dispose()


# Test veritabanı bir kez kurulur; bayrak modül düzeyinde tutulur.
# `scope="session"` bir fixture **kullanılamıyor**: pytest-asyncio her teste yeni
# bir olay döngüsü verir ve asyncpg bağlantıları döngüye bağlıdır — oturum
# kapsamlı bir motor ikinci testte `InterfaceError` ile patlar.
_DB_READY = False


@pytest_asyncio.fixture
async def api_engine():
    """Test veritabanına bağlı, teste özel bir motor."""
    global _DB_READY
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    if not await _postgres_available():
        pytest.skip("PostgreSQL çalışmıyor")

    if not _DB_READY:
        admin = create_async_engine(_admin_url(), isolation_level="AUTOCOMMIT")
        async with admin.connect() as conn:
            # `CREATE DATABASE` işlem içinde çalışamaz; AUTOCOMMIT bu yüzden.
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": TEST_DB}
            )
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
        await admin.dispose()

        from sarnic.db.models import Base

        setup = create_async_engine(_test_url())
        async with setup.begin() as conn:
            # Alembic yerine `create_all`: uç testleri şema geçmişini değil,
            # şemanın **son hâlini** hedefler. TimescaleDB hypertable'ı düz
            # tablo olarak kurulur — sorgular açısından fark yok.
            #
            # Önce `drop_all`: `create_all` **mevcut** tabloya sütun eklemez.
            # Modele yeni bir alan girdiğinde test veritabanı sessizce eski
            # şemada kalıyor ve testler "column does not exist" ile, yani
            # koddaki bir hatayı gösteriyormuş gibi düşüyordu. Bu iki kez oldu
            # (migrasyon 0003 ve 0005); her seferinde veritabanını elle silmek
            # gerekti. Tablolar test verisi taşıdığı için düşürmek ucuzdur.
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        await setup.dispose()
        _DB_READY = True

    engine = create_async_engine(_test_url(), poolclass=None)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def api_session(api_engine) -> AsyncIterator:
    """Her test temiz tablolarla başlar."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from sarnic.db.models import Base

    async with api_engine.begin() as conn:
        tables = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))

    maker = async_sessionmaker(api_engine, expire_on_commit=False, class_=AsyncSession)
    async with maker() as session:
        yield session


class FakeRedis:
    """Uç testleri için yeterli Redis taklidi.

    Gerçek Redis'e bağlanmak testleri hem yavaşlatır hem de canlı sistemin
    anahtarlarına dokunma riski taşır.
    """

    def __init__(self, tickers: dict | None = None) -> None:
        self._hashes: dict[str, dict[str, str]] = {}
        if tickers:
            import json

            self._hashes["sarnic:md:tickers"] = {s: json.dumps(v) for s, v in tickers.items()}

    async def hgetall(self, key: str) -> dict[str, str]:
        return self._hashes.get(key, {})

    async def get(self, key: str):
        return None

    async def set(self, *args, **kwargs) -> None:
        return None

    async def aclose(self) -> None:
        return None


@pytest_asyncio.fixture
async def api_client(api_session, api_engine) -> AsyncIterator:
    """Kimlik doğrulaması yapılmış bir `httpx` istemcisi."""
    import httpx

    from sarnic.api.deps import get_redis
    from sarnic.api.main import create_app
    from sarnic.db.session import get_session

    app = create_app()

    # `get_session` bir async üreteçtir; onu üreteçle değiştirmek FastAPI'de
    # üretecin **kendisini** bağımlılık değeri yapar. Doğrudan oturumu
    # döndüren bir coroutine gerekiyor.
    async def override_session():
        return api_session

    async def override_redis():
        return FakeRedis()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_redis] = override_redis

    transport = httpx.ASGITransport(app=app)
    # `lifespan` çalıştırılmaz: WebSocket hub'ı ve Redis bağlantısı uç
    # testlerinin konusu değil ve gerçek Redis'e bağlanırdı.
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def admin_token(api_session) -> str:
    """Testler için bir ADMIN kullanıcı ve erişim jetonu üretir."""
    from sarnic.core.enums import Role
    from sarnic.core.security import create_access_token, hash_password
    from sarnic.db.models import User

    user = User(
        email="test@sarnic.local",
        password_hash=hash_password("test-parola"),
        role=Role.ADMIN,
        display_name="Test",
        is_active=True,
    )
    api_session.add(user)
    await api_session.commit()
    return create_access_token(user.id, str(Role.ADMIN))


@pytest.fixture
def auth(admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}


def utc(year: int, month: int, day: int, hour: int = 0) -> datetime:
    """Testlerde tekrar eden tz-aware zaman kurucusu."""
    return datetime(year, month, day, hour, tzinfo=UTC)


@pytest_asyncio.fixture
async def test_database(api_engine, api_session):
    """Küresel oturum fabrikasını test veritabanına yöneltir.

    Arka plan servisleri (`MarketDataService`, süpervizör, işçi) kendi
    oturumlarını `session_scope()` ile açar — bu tasarım doğrudur, çünkü bir
    FastAPI isteğinin parçası değillerdir. Ama test ederken küresel fabrikanın
    **canlı** veritabanına bakması, testin üretim verisine yazması demektir.
    Bu fixture fabrikayı test veritabanına bağlar ve sonunda geri alır.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from sarnic.db import session as session_module

    previous_engine = session_module._engine
    previous_maker = session_module._sessionmaker

    session_module._engine = api_engine
    session_module._sessionmaker = async_sessionmaker(
        api_engine, expire_on_commit=False, class_=type(api_session)
    )
    try:
        yield api_engine
    finally:
        session_module._engine = previous_engine
        session_module._sessionmaker = previous_maker
