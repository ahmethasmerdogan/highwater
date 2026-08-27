"""trades.pnl giriş komisyonunu düşmüyordu

İşçi kapanışta komisyonun tamamını `trades.fees`'e yazıyordu
(`entry_fees + realized_fees + result.fees`), ama kârdan yalnızca çıkış
tarafını düşüyordu (`pnl = ... + gross - result.fees`). İki alan birbiriyle
çelişiyordu: `fees` komisyonun tamamını sayıyor, `pnl` yarısını.

Hata sessizdi. Nakit ve özsermaye doğru kalıyor — giriş komisyonu zaten giriş
anında nakitten düşülmüştü. Yalnızca `trades` tablosu, yani panelin "net
kâr/zarar" olarak gösterdiği sayı şişkindi. 160 işlemde 144,64 USDT, yani
raporlanan kârın yaklaşık %9,5'i.

Kanıt, açık pozisyonu olmayan bir botta mutabakatın kuruşuna tutmasıdır
(bot #4): özsermaye − sermaye = 319,70; `sum(pnl)` = 379,89;
`sum(entry_fees)` = 60,19; farkı = 319,70.

Backtest motoru (backtest/engine.py) baştan beri doğru hesaplıyordu
(`pnl = (price - entry) * qty - fee - entry_fees`). İkisinin ayrışması,
"backtest, paper ve canlı aynı sonucu üretir" kuralını fiilen bozuyordu:
aynı işlem iki motorda iki farklı kâr raporluyordu.

Bu göç geçmiş satırları düzeltir. Geri alma, aynı miktarı geri ekler —
eski (yanlış) davranışa dönmek istenirse diye.

Revision ID: 0006_islem_kari_giris_komisyonu
Revises: 0005_kismi_cikis_muhasebesi
"""

from __future__ import annotations

from alembic import op

revision = "0006_islem_kari_giris_komisyonu"
down_revision = "0005_kismi_cikis_muhasebesi"
branch_labels = None
depends_on = None


# Yalnızca giriş komisyonu düşülmemiş satırlar düzeltilir. Göç ikinci kez
# çalışırsa (ya da düzeltilmiş satırlar araya karışırsa) aynı miktarı iki kez
# düşmemesi için işaret, `pnl`'in `fees` ile tutarsızlığı değil — böyle bir
# işaret yok. Bu yüzden göç tek yönlü ve bir kez çalışacak şekilde yazıldı;
# alembic sürüm tablosu bunu zaten garanti eder.
_DUZELT = """
    UPDATE trades t
       SET pnl = t.pnl - p.entry_fees
      FROM positions p
     WHERE p.id = t.position_id
       AND p.entry_fees <> 0
"""

_GERI = """
    UPDATE trades t
       SET pnl = t.pnl + p.entry_fees
      FROM positions p
     WHERE p.id = t.position_id
       AND p.entry_fees <> 0
"""


def upgrade() -> None:
    op.execute(_DUZELT)


def downgrade() -> None:
    op.execute(_GERI)
