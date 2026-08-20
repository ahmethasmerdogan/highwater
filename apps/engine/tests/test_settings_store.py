"""Çalışma zamanı ayarları — `settings` tablosu motora gerçekten bağlı mı?

Panelde düzenlenebilir görünen ama motorun okumadığı bir ayar, hiçbir şey
yapmayan bir düğmedir. Bu dosya o düğmenin kabloya bağlı olduğunu kanıtlar.
"""

from __future__ import annotations

import pytest

from sarnic.core import settings_store
from sarnic.db.models import Setting
from sarnic.universe.filters import UniverseConfig


@pytest.fixture(autouse=True)
def _clear_cache():
    """Her test taze başlar; TTL önbelleği testler arasında sızmamalı."""
    settings_store.invalidate()
    yield
    settings_store.invalidate()


@pytest.mark.asyncio
async def test_missing_group_returns_empty(api_session):
    assert await settings_store.load_group(api_session, "universe") == {}


@pytest.mark.asyncio
async def test_group_is_read_back(api_session):
    api_session.add(Setting(key="universe", value={"top_n": 40}))
    await api_session.commit()

    assert await settings_store.load_group(api_session, "universe") == {"top_n": 40}


@pytest.mark.asyncio
async def test_cache_is_dropped_on_invalidate(api_session):
    api_session.add(Setting(key="universe", value={"top_n": 40}))
    await api_session.commit()
    assert (await settings_store.load_group(api_session, "universe"))["top_n"] == 40

    row = await api_session.get(Setting, "universe")
    row.value = {"top_n": 55}
    await api_session.commit()

    # Önbellek düşürülmeden eski değer görünür — davranış budur, kusur değil.
    assert (await settings_store.load_group(api_session, "universe"))["top_n"] == 40

    settings_store.invalidate()
    assert (await settings_store.load_group(api_session, "universe"))["top_n"] == 55


@pytest.mark.asyncio
async def test_non_dict_group_is_ignored(api_session):
    """Bozuk bir kayıt varsayılanları bozmaz."""
    api_session.add(Setting(key="universe", value=["bozuk"]))
    await api_session.commit()

    assert await settings_store.load_group(api_session, "universe") == {}


def test_overrides_change_config_and_hash():
    """Ayar değişikliği `config_hash`'i de değiştirir.

    Değiştirmeseydi, farklı filtrelerle üretilmiş iki snapshot aynı hash'i
    taşır ve determinizm testi yalan söylerdi (bozulmaz kural 3).
    """
    base = UniverseConfig()
    merged = base.merged({"top_n": 40, "min_age_days": 90})

    assert merged.top_n == 40
    assert merged.min_age_days == 90
    assert merged.hash() != base.hash()
    # Temel yapılandırma değişmez: her yenileme aynı yerden başlar.
    assert base.top_n == UniverseConfig().top_n


def test_unknown_keys_are_dropped():
    """Tanınmayan alan sessizce düşer; API zaten 422 ile reddeder."""
    merged = UniverseConfig().merged({"top_n": 40, "uydurma_alan": 1})
    assert merged.top_n == 40
    assert not hasattr(merged, "uydurma_alan")
