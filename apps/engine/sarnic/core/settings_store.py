"""Çalışma zamanı ayarları — `settings` tablosunu motora bağlar.

`sarnic.config.Settings` **ortam** ayarıdır: veritabanı adresi, JWT sırrı,
API portu. Bunlar süreç başlarken okunur ve çalışırken değişmez; değişmemeleri
de doğrudur.

Bu modül farklı bir şeyi taşır: **karar parametreleri.** Havuz filtrelerinin
eşikleri, risk devre kesicilerinin sınırları, maliyet varsayımları. Bunlar
paneldeki Ayarlar sayfasından değiştirilir ve motorun bir sonraki döngüde
onları görmesi gerekir — aksi hâlde sayfa yalnızca bir vitrindir.

**Neden önbellek var:** havuz yenileme saatte bir çalışır ama puanlama döngüsü
her bar için birden çok kez ayar okur. Her okumada DB'ye gitmek gereksizdir;
her okumada süreç ömrü boyunca önbellekte kalmak ise ayarları etkisiz kılardı.
Kısa bir TTL ikisinin arasıdır: bir ayar değişikliği en geç `_TTL` saniye
içinde etkiye girer.

Ayarların **şeması yoktur**: değer JSONB'dir ve grup adı (`universe`, `risk`,
`costs`) altında bir sözlük tutar. Şemayı bilen taraf, ayarı tüketen
dataclass'tır (`UniverseConfig.merged`, `RiskLimits.from_definition`). Böylece
yeni bir eşik eklemek için migration gerekmez.
"""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.logging import get_logger
from sarnic.db.models import Setting

log = get_logger(__name__)

_TTL_SECONDS = 30.0
_cache: dict[str, Any] | None = None
_cached_at: float = 0.0


async def load_all(session: AsyncSession, *, force: bool = False) -> dict[str, Any]:
    """Tüm ayar gruplarını döndürür. `force=True` önbelleği atlar."""
    global _cache, _cached_at

    now = time.monotonic()
    if not force and _cache is not None and (now - _cached_at) < _TTL_SECONDS:
        return _cache

    rows = (await session.execute(select(Setting))).scalars().all()
    _cache = {row.key: row.value for row in rows}
    _cached_at = now
    return _cache


async def load_group(session: AsyncSession, group: str) -> dict[str, Any]:
    """Bir ayar grubunu sözlük olarak döndürür; yoksa boş sözlük.

    Boş sözlük dönmek bilinçlidir: tüketen taraf kendi varsayılanını korur.
    Ayar tablosu boşsa sistem varsayılanlarla çalışmaya devam eder.
    """
    data = await load_all(session)
    value = data.get(group)
    if not isinstance(value, dict):
        if value is not None:
            log.warning("settings_group_not_a_dict", group=group, kind=type(value).__name__)
        return {}
    return value


def invalidate() -> None:
    """Önbelleği düşürür — bir ayar yazıldığı anda çağrılır."""
    global _cache, _cached_at
    _cache = None
    _cached_at = 0.0
