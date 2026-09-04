"""Bildirim temizliğine kısmi indeks — silme işi tabloyu baştan sona tarıyor.

UYGULANMADI. Ölçüm sonucu bırakıldı; `alembic upgrade head` çağrısı kasten
yapılmadı (canlı sistem, 2026-09-04).

Ölçüm (2026-09-04, `pg_stat_user_tables`, istatistikler hiç sıfırlanmamış):

    notifications: seq_scan = 3.184, seq_tup_read = 373.609.695

Sistemdeki en büyük sıralı-tarama kaynağı bu. Kaynağı süpervizördeki saklama
işi (`bots/supervisor.py:454`):

    DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ...

`read_at` üzerinde indeks yok, dolayısıyla her koşuda 123.576 satırın tamamı
okunuyor. Üstelik iş neredeyse hiçbir şey **silmiyor**: satırların 123.509'u
okunmamış (kullanıcı 1: 43.421 bildirimin 43.421'i okunmamış). Yani tarama
başına ~117 bin satır okunup ~0 satır siliniyor.

Kısmi indeks yalnızca `read_at IS NOT NULL` satırları (bugün 67 tane) taşır:
birkaç kilobayt, ve silme işi tam taramadan indeks taramasına iner. Yazma
maliyeti de yok denecek kadar az — bildirimler okunmamış doğuyor, indekse
ancak biri okuduğunda giriyorlar.

Bu indeks **belirtiyi** ucuzlatır, hastalığı değil: asıl mesele okunmamış
bildirimlerin sınırsız birikmesi (günde ~600, hiç okunmuyor). Okunmamış
bildirime saklama süresi koymak bir ürün kararıdır — uydurulmadı,
`docs/OPEN-QUESTIONS.md`'ye yazılması gerekir.

Revision ID: 0012_bildirim_temizlik_indeksi
Revises: 0011_kisa_yon
"""

import sqlalchemy as sa

from alembic import op

revision = "0012_bildirim_temizlik_indeksi"
down_revision = "0011_kisa_yon"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_notifications_okunmus_temizlik",
        "notifications",
        ["created_at"],
        postgresql_where=sa.text("read_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_okunmus_temizlik", table_name="notifications")
