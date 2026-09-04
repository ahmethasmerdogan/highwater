"""Kısa yön: trades.side.

`positions.side` baştan beri var (BUY varsayılan); kapanan işlemin yönü ise
yalnız pozisyona join ile bulunabiliyordu. İşlem listesi, istatistik ve
panel yön dağılımı için kolon eklenir; mevcut satırlar BUY (uzun).

Revision ID: 0011_kisa_yon
Revises: 0010_bar_izi_ve_kismi_r
"""

import sqlalchemy as sa
from alembic import op

revision = "0011_kisa_yon"
down_revision = "0010_bar_izi_ve_kismi_r"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trades",
        sa.Column("side", sa.String(8), nullable=False, server_default="BUY"),
    )


def downgrade() -> None:
    op.drop_column("trades", "side")
