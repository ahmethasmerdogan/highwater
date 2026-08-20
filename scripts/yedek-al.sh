#!/usr/bin/env bash
# Gecelik yedek — PostgreSQL'in tamamı (Faz 11 kapı maddesi).
#
# Neden `pg_dump -Fc`: sıkıştırılmış, seçmeli geri yüklemeye izin veren ve
# sürüm farklarına düz SQL'den daha dayanıklı biçim. TimescaleDB hypertable'ları
# (`ohlcv`) normal tablo gibi dökülür; geri yüklemede uzantı önce kurulur.
#
# Redis yedeklenmez: içindeki her şey (akış olayları, önbellek) yeniden
# üretilebilir. Kalıcı durum — botlar, pozisyonlar, işlemler, puanlar, havuz
# anlık görüntüleri — yalnızca PostgreSQL'dedir.
set -euo pipefail

KAP="${SARNIC_PG_CONTAINER:-sarnic-postgres-1}"
DIZIN="${SARNIC_BACKUP_DIR:-$HOME/.local/share/sarnic/yedek}"
SAKLA="${SARNIC_BACKUP_KEEP:-14}"   # kaç günlük yedek tutulacak

mkdir -p "$DIZIN"
DAMGA="$(date -u +%Y%m%dT%H%M%SZ)"
HEDEF="$DIZIN/sarnic-$DAMGA.dump"

docker exec "$KAP" pg_dump -U sarnic -d sarnic -Fc --compress=6 > "$HEDEF.parca"
mv "$HEDEF.parca" "$HEDEF"          # yarım dosya asla geçerli yedek sayılmasın

BOYUT=$(stat -c %s "$HEDEF")
# 1 MB'ın altı, dökümün boş çıktığı anlamına gelir; sessizce geçilmemeli.
if [ "$BOYUT" -lt 1000000 ]; then
  echo "HATA: yedek şüpheli derecede küçük ($BOYUT bayt): $HEDEF" >&2
  exit 1
fi

# Eskileri buda.
ls -1t "$DIZIN"/sarnic-*.dump 2>/dev/null | tail -n "+$((SAKLA + 1))" | xargs -r rm --

echo "yedek alındı: $HEDEF ($((BOYUT / 1024 / 1024)) MB)"
