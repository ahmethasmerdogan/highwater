"""trades: işlemi üreten strateji sürümü kaydedilsin

Sürümlemenin amacı "her işlemin hangi tam konfigürasyonla açıldığının
bilinmesi"dir (`strategy/definition.py` başlığı). `trades` tablosunda o bağ
yoktu ve iki somut zarara yol açıyordu:

1. **Ardışık zarar sayacı sürüm sınırını aşıyordu.** Sayaç bir botun *tüm*
   işlemlerine bakıyordu. 2026-08-18'de bot 3'ün stop ayarı düzeltildi; ama
   eski dar-stop ayarının 9 kaybı sayaçta durduğu için yeni ayar daha ilk
   barında devre kesiciye takıldı ve 6 saat duraklatıldı. Yeni kural, eski
   kuralın hatalarıyla cezalandırıldı.

2. **Performans sürüm bazında ölçülemiyordu.** "Bu değişiklik işe yaradı mı"
   sorusunun cevabı verilerde yoktu.

Eski satırlar `NULL` kalır: hangi sürümden geldikleri geriye dönük olarak
bilinemez ve uydurulmaz. Sayaç `NULL` satırları saymaz, dolayısıyla düzeltme
yürürlüğe girdiği anda seriler temiz başlar.

Revision ID: 0004_islem_strateji_surumu
Revises: 0003_kalite_bulgusu_tekil
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0004_islem_strateji_surumu"
down_revision = "0003_kalite_bulgusu_tekil"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("strategy_version_id", sa.BigInteger(), nullable=True))
    op.create_index("ix_trades_strategy_version_id", "trades", ["strategy_version_id"])
    op.create_foreign_key(
        "fk_trades_strategy_version",
        "trades",
        "strategy_versions",
        ["strategy_version_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_trades_strategy_version", "trades", type_="foreignkey")
    op.drop_index("ix_trades_strategy_version_id", table_name="trades")
    op.drop_column("trades", "strategy_version_id")
