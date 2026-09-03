"""Kısmi kâr alma: positions.partial_done.

H2 (MEYDAN-OKUMA 2026-09-04): fiyat +partial_tp_r R'ye ulaşınca pozisyonun
bir kesri satılır, kalan iz sürer. Karar bir kez verilir; "bir kez" bilgisi
bu sütunda yaşar. Dilimin sonucu zaten realized_pnl/realized_fees'te birikir.

Revision ID: 0009_kismi_kar
Revises: 0008_kaldirac
"""

import sqlalchemy as sa
from alembic import op

revision = "0009_kismi_kar"
down_revision = "0008_kaldirac"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "positions",
        sa.Column("partial_done", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("positions", "partial_done")
