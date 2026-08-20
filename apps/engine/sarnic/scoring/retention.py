"""Puan geçmişi budaması.

`scores` sistemin en büyük tablosudur: her bar × her sembol × her puanlama
konfigürasyonu için bir satır ve satır başına ~2 KB (`rationale`, `families`,
`modifiers` jsonb alanları). Ölçüldü: 354.689 satır = 787 MB, günde ~15 bin
satır (~30 MB) büyüyor. Sınırsız büyüyen tek tablo buydu; `spread_samples`'ın
7 günlük budaması zaten vardı, `ohlcv` ise kalıcı olmalı.

**Kalibrasyon gözlemleri asla silinmez.** `score_observations.score_id`
yabancı anahtarı `ON DELETE CASCADE`'dir; eski bir puanı silmek, ona bağlı
gözlemi de sessizce silerdi. Gözlemler sistemin birincil çıktısıdır —
puanlamanın öngörü gücü olup olmadığının tek kanıtı. Bu yüzden budama,
gözlemi olan bir puana **dokunmaz**; sınırı geçse bile bırakır.

Bunun bedeli: gözlemli satırlar (şu an %15) hiç silinmez, dolayısıyla büyüme
sıfırlanmaz, ~%15'e iner. Bu bilinçli bir takas — ölçümü korumak, diskten
tasarruf etmekten önce gelir.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.clock import utcnow
from sarnic.core.logging import get_logger
from sarnic.db.models import Score, ScoreObservation

log = get_logger(__name__)


async def prune_scores(
    session: AsyncSession, *, retention_days: int, now: datetime | None = None
) -> int:
    """Saklama süresini aşmış, gözlemi olmayan puanları siler.

    `retention_days` 0 veya negatifse budama kapalıdır ve hiçbir şey silinmez.
    """
    if retention_days <= 0:
        return 0

    cutoff = (now or utcnow()) - timedelta(days=retention_days)
    gozlemli = exists(
        select(ScoreObservation.score_id).where(ScoreObservation.score_id == Score.id)
    )
    silinen = (
        await session.execute(delete(Score).where(Score.bar_time < cutoff, ~gozlemli))
    ).rowcount

    if silinen:
        log.info("scores_pruned", removed=silinen, older_than=cutoff.isoformat())
    return silinen
