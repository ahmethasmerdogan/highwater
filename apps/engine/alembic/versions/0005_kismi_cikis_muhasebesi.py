"""positions: kısmi çıkışın sonucu kaybolmasın

Çıkış emri emir defterini tüketip **kısmi** dolabilir — `PaperAdapter` bunu
`PARTIALLY_FILLED` olarak doğru raporluyordu, ama işçi sonucu yok sayıp
pozisyonu her hâlükârda `CLOSED` yapıyordu. Sonuç sessiz bir muhasebe
ayrışması:

  * DB'de pozisyon kapalı, adaptörün envanterinde kalan miktar duruyor;
  * o kalan hiçbir zaman satılamaz, çünkü botun kaydı yok;
  * nakit yalnızca satılan dilim kadar artar, özkaynak eğrisi kalıcı olarak
    yanlış olur.

Kısmi dolum henüz hiç gerçekleşmedi (153 dolan emrin hiçbiri kısmi değil), ama
havuz ince defterli sembollerden oluşuyor ve gerçekleştiğinde hata sessizdir —
hiçbir yerde hata görünmez, sadece rakamlar tutmaz.

Düzeltme: kısmi çıkışta pozisyon kalan miktarla **açık kalır**, satılan dilimin
net sonucu ve komisyonu burada birikir, kapanış işlemi bunları ekleyerek
raporlar.

Revision ID: 0005_kismi_cikis_muhasebesi
Revises: 0004_islem_strateji_surumu
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_kismi_cikis_muhasebesi"
down_revision = "0004_islem_strateji_surumu"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "positions",
        sa.Column("realized_pnl", sa.Numeric(20, 8), nullable=False, server_default="0"),
    )
    op.add_column(
        "positions",
        sa.Column("realized_fees", sa.Numeric(20, 8), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("positions", "realized_fees")
    op.drop_column("positions", "realized_pnl")
