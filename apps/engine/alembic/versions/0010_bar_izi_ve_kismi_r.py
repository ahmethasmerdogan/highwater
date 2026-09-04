"""Bar izi ve kısmi-R muhasebesi.

- bots.last_bar_at: tüketilen son karar barı. Eskiden yalnız bellekteydi;
  her worker yeniden doğuşunda son bar YENİDEN koşuyordu (günde ~50 kez) —
  puan/özsermaye upsert olduğu için zararsız ama çıkış/giriş/rotasyon
  idempotent değil.
- positions.entry_qty, positions.realized_points: kısmi kâr almada R'nin
  giriş miktarına göre ağırlıklanması için (backtest ile aynı formül).

Revision ID: 0010_bar_izi_ve_kismi_r
Revises: 0009_kismi_kar
"""

import sqlalchemy as sa
from alembic import op

revision = "0010_bar_izi_ve_kismi_r"
down_revision = "0009_kismi_kar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bots", sa.Column("last_bar_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "positions",
        sa.Column("entry_qty", sa.Numeric(28, 10), nullable=False, server_default="0"),
    )
    op.add_column(
        "positions",
        sa.Column("realized_points", sa.Numeric(28, 8), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("positions", "realized_points")
    op.drop_column("positions", "entry_qty")
    op.drop_column("bots", "last_bar_at")
