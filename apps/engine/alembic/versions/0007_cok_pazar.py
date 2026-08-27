"""Çok pazar: universe_snapshots.market kolonu.

BIST ve ABD havuzları kripto havuzuyla aynı tabloya yazılır ama pazar
başına ayrışır — kripto botu BIST snapshot'ını görmemeli. Mevcut satırlar
CRYPTO'dur (bugüne kadar tek pazar vardı).

Sembol ad-alanı borsa ekiyle kurulduğu için (THYAO.IS, AAPL.US) ohlcv
birincil anahtarına dokunulmaz; karar docs/OPEN-QUESTIONS.md §Çok-pazar.

Revision ID: 0007
Revises: 0006
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_cok_pazar"
down_revision = "0006_islem_kari_giris_komisyonu"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "universe_snapshots",
        sa.Column("market", sa.String(8), nullable=False, server_default="CRYPTO"),
    )
    op.create_index("ix_universe_snapshots_market", "universe_snapshots", ["market"])


def downgrade() -> None:
    op.drop_index("ix_universe_snapshots_market", table_name="universe_snapshots")
    op.drop_column("universe_snapshots", "market")
