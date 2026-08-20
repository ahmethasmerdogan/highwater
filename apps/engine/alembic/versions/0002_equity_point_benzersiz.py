"""equity_points: (bot_id, at) benzersiz olsun

Bir bot, bir an için tek bir özsermaye noktasına sahiptir. Kısıt yokken bot
yeniden başladığında aynı bar tekrar işleniyor ve nokta ikinci, üçüncü kez
yazılıyordu. Panel bot eğrilerini topladığı için 15.000'lik toplam özsermaye
o anda 45.000 görünüyordu (2026-08-15 12:00 — her bot 3'er kayıt, toplam 9).

Ölçümün temeli olan grafik, olmayan bir kâr gösteriyordu.

Migrasyon önce mevcut kopyaları temizler: her `(bot_id, at)` için **en son
yazılan** satır (en büyük `id`) tutulur — o, barın en güncel hesabıdır.

Revision ID: 0002_equity_point_benzersiz
Revises: 0001_ilk_sema
"""

from __future__ import annotations

from alembic import op

revision = "0002_equity_point_benzersiz"
down_revision = "0001_ilk_sema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM equity_points a
        USING equity_points b
        WHERE a.bot_id = b.bot_id
          AND a.at = b.at
          AND a.id < b.id
        """
    )
    op.create_unique_constraint("uq_equity_point", "equity_points", ["bot_id", "at"])


def downgrade() -> None:
    op.drop_constraint("uq_equity_point", "equity_points", type_="unique")
