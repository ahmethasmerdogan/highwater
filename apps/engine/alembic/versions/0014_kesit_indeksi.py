"""Kesit seçicisinin indeksi — (config_hash, timeframe, bar_time).

Panelin zorunlu kesit seçicisi `GROUP BY config_hash, timeframe` ile son barı
buluyordu ve bu, 582 bin satırlık / 1,4 GB'lık `scores` yığınını baştan sona
okuyor, ölçülen 11,5 saniye sürüyordu. Sorgu özyinelemeli atlamalı taramaya
çevrildi; o taramanın çalışması için sıralı öneki bu indeks verir.

Revision ID: 0014
Revises: 0013
"""

from __future__ import annotations

from alembic import op

revision = "0014_kesit_indeksi"
down_revision = "0013_karar_izi"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS: indeks canlıda `CONCURRENTLY` ile önden oluşturuldu
    # (582 bin satırlık tabloyu 10 saniye kilitlememek için). Göç aynı indeksi
    # temiz bir kurulumda da kurar.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_scores_config_tf_bar "
        "ON scores (config_hash, timeframe, bar_time DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_scores_config_tf_bar")
