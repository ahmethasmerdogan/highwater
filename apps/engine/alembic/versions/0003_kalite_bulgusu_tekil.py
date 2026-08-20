"""data_quality_reports: aynı açık bulgu iki kez yazılmasın

`SYSTEM-REVIEW` §4b. Denetim her saat çalışıyor ve **aynı tarihsel barı**
yeniden raporluyordu. Aykırı değer kayıtları hiç kapanmadığı için birikim
sonsuzdu: ölçüldüğünde 250 aykırı değer satırı yalnızca **23** gerçek bulguyu
temsil ediyordu — biri 40, biri 32 kez yazılmıştı.

Zarar diskte değil panelde: veri kalitesi sayfası yüzlerce "açık sorun"
gösteriyor, bunların çoğu aynı birkaç tarihsel altcoin pompasının kopyası ve
sayfa okunmaz hâle geliyor.

Reddedilen iki alternatif (§4b):
  * aykırı değeri "çözüldü" saymak — tarihsel bir barın özelliği çözülmez;
  * denetimi son N barla sınırlamak — o zaman geçmişteki bozuk tick hiç
    görünmez.

Çözüm: bulgunun değişmeyen kimliği (`fingerprint`) + **kısmi** benzersiz
indeks. Kısmi olması önemli: indeks yalnızca açık kayıtlarda geçerlidir, yani
kapanmış bir boşluk yeniden oluşursa yazılabilir (o gerçekten yeni bir olaydır),
aykırı değer ise hiç kapanmadığından bir daha yazılmaz.

Kimlik kuralı `data.quality.finding_fingerprint` ile birebir aynı olmalıdır;
buradaki SQL onun karşılığıdır. Tüm `detail` sözlüğü kimlik olamaz: kuyruk
boşluğunun `end` ve `missing_bars` alanları her denetimde ilerler.

Migrasyon önce kopyaları temizler: her kimlik için **en eski** satır (en küçük
`id`) tutulur — bulgunun ilk görüldüğü an, saklanmaya değer olan bilgidir.

Revision ID: 0003_kalite_bulgusu_tekil
Revises: 0002_equity_point_benzersiz
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0003_kalite_bulgusu_tekil"
down_revision = "0002_equity_point_benzersiz"
branch_labels = None
depends_on = None


# `finding_fingerprint` fonksiyonunun SQL karşılığı. İkisi ayrışırsa mevcut
# satırlar yeni yazılanlarla eşleşmez ve tekilleştirme sessizce çalışmaz.
FINGERPRINT_SQL = """
    CASE
        WHEN kind IN ('outlier', 'sanity')
            THEN COALESCE(detail ->> 'open_time', '')
        WHEN kind = 'gap'
            THEN COALESCE(detail ->> 'start', 'veri-yok')
        ELSE ''
    END
"""


def upgrade() -> None:
    op.add_column(
        "data_quality_reports",
        sa.Column("fingerprint", sa.Text(), nullable=False, server_default=""),
    )

    # Mevcut satırların kimliğini doldur. Beklenen alan yoksa (bilinmeyen tür
    # ya da eksik `detail`) sözlüğün kendisi kimlik olur — Python tarafındaki
    # `json.dumps(..., sort_keys=True)` ile aynı sonucu vermesi için anahtarlar
    # sıralanır.
    op.execute(
        f"""
        UPDATE data_quality_reports
        SET fingerprint = CASE
            WHEN ({FINGERPRINT_SQL}) <> '' THEN ({FINGERPRINT_SQL})
            ELSE COALESCE(detail::text, '{{}}')
        END
        """
    )

    # Açık kayıtlardaki kopyaları temizle; en eski satır kalır.
    op.execute(
        """
        DELETE FROM data_quality_reports a
        USING data_quality_reports b
        WHERE NOT a.resolved
          AND NOT b.resolved
          AND a.symbol = b.symbol
          AND a.timeframe = b.timeframe
          AND a.kind = b.kind
          AND a.fingerprint = b.fingerprint
          AND a.id > b.id
        """
    )

    op.create_index(
        "uq_quality_open",
        "data_quality_reports",
        ["symbol", "timeframe", "kind", "fingerprint"],
        unique=True,
        postgresql_where=sa.text("NOT resolved"),
    )


def downgrade() -> None:
    op.drop_index("uq_quality_open", table_name="data_quality_reports")
    op.drop_column("data_quality_reports", "fingerprint")
