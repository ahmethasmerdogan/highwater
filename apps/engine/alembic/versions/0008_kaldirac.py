"""Kaldıraç: positions.leverage + trades.leverage.

Sahibin kararıyla kapsama girdi (2026-08-27). Paper motorunda simüle
edilir; 1 = spot davranışı, mevcut tüm satırlar 1'dir. Borç maliyeti
kapanışta trade.fees içine tahakkuk eder — ayrı kolon gerekmez, maliyet
maliyettir.

Revision ID: 0008_kaldirac
Revises: 0007_cok_pazar
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_kaldirac"
down_revision = "0007_cok_pazar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "positions",
        sa.Column("leverage", sa.Numeric(6, 2), nullable=False, server_default="1"),
    )
    op.add_column(
        "trades",
        sa.Column("leverage", sa.Numeric(6, 2), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("trades", "leverage")
    op.drop_column("positions", "leverage")
