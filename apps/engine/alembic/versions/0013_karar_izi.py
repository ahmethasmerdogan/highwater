"""Karar izi: entry_decisions.

Retler bugüne kadar serbest metin `bot_events` satırıydı; "sistem ölçtüğü
kenarı eliyor mu" sorusu ancak elle metin ayrıştırarak cevaplanabiliyordu
(KAR-TESHISI §9). Karar hunisi (DESIGN-V4 §4) bu tablo olmadan kurulamaz.

Revision ID: 0013_karar_izi
Revises: 0012_bildirim_temizlik_indeksi
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013_karar_izi"
down_revision = "0012_bildirim_temizlik_indeksi"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entry_decisions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "bot_id",
            sa.Integer(),
            sa.ForeignKey("bots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("bar_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(32), nullable=True),
        sa.Column("direction", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("stage", sa.String(16), nullable=False),
        sa.Column("score", sa.Numeric(6, 2), nullable=True),
        sa.Column(
            "percentiles",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("adet", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("rejected_by", sa.String(48), nullable=True),
        sa.Column("reject_detail", sa.Text(), nullable=True),
        sa.Column("target_notional", sa.Numeric(20, 8), nullable=True),
        sa.Column("final_notional", sa.Numeric(20, 8), nullable=True),
        sa.Column("binding_constraint", sa.String(32), nullable=True),
        sa.Column("fill_ratio", sa.Numeric(8, 4), nullable=True),
        sa.Column("position_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_entry_dec_bot_bar", "entry_decisions", ["bot_id", "bar_time"])
    op.create_index("ix_entry_decisions_bar_time", "entry_decisions", ["bar_time"])
    op.create_index("ix_entry_decisions_bot_id", "entry_decisions", ["bot_id"])


def downgrade() -> None:
    op.drop_table("entry_decisions")
