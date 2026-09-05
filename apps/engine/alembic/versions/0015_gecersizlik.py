"""Ölçüm geçersizlikleri — geçersizlik geriye işler (DESIGN-V4 §2 kural 4).

Bir ölçüm sonradan geçersiz ilan edilebilir. Kayıt SİLİNMEZ: üstü çizili durur
ve sebebi yazılıdır. Silmek yerine çizmenin sebebi ölçülmüş bir olaydır —
2026-09-04'te kalibrasyon rakamı beş ayrı ölçeği tek dağılım sayıyordu ve o
rakam haftalarca kararlara girdi.

Revision ID: 0015_gecersizlik
Revises: 0014_kesit_indeksi
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0015_gecersizlik"
down_revision = "0014_kesit_indeksi"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "measurement_invalidations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("scope", sa.String(length=24), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gecersizlik_kapsam", "measurement_invalidations", ["scope", "key"])
    op.create_index(
        op.f("ix_measurement_invalidations_scope"), "measurement_invalidations", ["scope"]
    )
    op.create_index(op.f("ix_measurement_invalidations_key"), "measurement_invalidations", ["key"])


def downgrade() -> None:
    op.drop_table("measurement_invalidations")
