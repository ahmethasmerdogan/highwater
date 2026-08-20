#!/usr/bin/env bash
# Geri yükleme provası — Faz 11 kapı maddesi.
#
# Alınmamış yedek gibi, geri yüklenebildiği **kanıtlanmamış** yedek de yoktur.
# Bu betik en son dökümü ayrı bir veritabanına geri yükler, satır sayılarını
# canlıyla karşılaştırır ve sonra prova veritabanını siler.
#
# Canlı `sarnic` veritabanına hiç dokunulmaz; yalnızca `sarnic_prova` yaratılır
# ve silinir. İsim sabit kodlanmıştır ki bir değişken boş kalırsa canlıyı
# hedeflemesin.
set -euo pipefail

KAP="${SARNIC_PG_CONTAINER:-sarnic-postgres-1}"
DIZIN="${SARNIC_BACKUP_DIR:-$HOME/.local/share/sarnic/yedek}"
PROVA_DB="sarnic_prova"

DOSYA="${1:-$(ls -1t "$DIZIN"/sarnic-*.dump 2>/dev/null | head -1)}"
[ -n "$DOSYA" ] && [ -f "$DOSYA" ] || { echo "HATA: yedek dosyası bulunamadı." >&2; exit 1; }
echo "prova edilen yedek: $DOSYA"

psql() { docker exec -i "$KAP" psql -U sarnic -v ON_ERROR_STOP=1 "$@"; }

temizle() { psql -d postgres -qc "DROP DATABASE IF EXISTS $PROVA_DB;" >/dev/null 2>&1 || true; }
trap temizle EXIT

temizle
psql -d postgres -qc "CREATE DATABASE $PROVA_DB;"

# TimescaleDB dökümleri geri yüklenirken uzantı önce kurulmalı ve arka plan
# işleri geçici olarak durdurulmalıdır; aksi hâlde chunk katalogları çakışır.
psql -d "$PROVA_DB" -qc "CREATE EXTENSION IF NOT EXISTS timescaledb;"
psql -d "$PROVA_DB" -qc "SELECT timescaledb_pre_restore();" >/dev/null
docker exec -i "$KAP" pg_restore -U sarnic -d "$PROVA_DB" --no-owner --no-privileges < "$DOSYA" >/dev/null 2>&1 || true
psql -d "$PROVA_DB" -qc "SELECT timescaledb_post_restore();" >/dev/null

# Karşılaştırma: kalıcı durumu taşıyan tablolar. `ohlcv` hypertable olduğu için
# ayrıca sayılır — chunk'lar geri gelmediyse en belirgin buradan anlaşılır.
TABLOLAR="bots positions trades orders equity_points scores score_observations universe_snapshots users strategy_versions ohlcv"

printf '\n%-22s %14s %14s  %s\n' "tablo" "canlı" "prova" "sonuç"
HATA=0
for t in $TABLOLAR; do
  a=$(psql -d sarnic     -tAc "SELECT count(*) FROM $t;")
  b=$(psql -d "$PROVA_DB" -tAc "SELECT count(*) FROM $t;" 2>/dev/null || echo "YOK")
  # Canlı sistem prova sürerken yazmaya devam eder; prova sayısının canlıdan
  # küçük olması normaldir, büyük olması veya tablonun hiç gelmemesi değildir.
  if [ "$b" = "YOK" ]; then sonuc="✗ tablo geri gelmedi"; HATA=1
  elif [ "$b" -eq 0 ] && [ "$a" -gt 0 ]; then sonuc="✗ boş geldi"; HATA=1
  elif [ "$b" -gt "$a" ]; then sonuc="✗ fazla satır"; HATA=1
  else sonuc="✓"
  fi
  printf '%-22s %14s %14s  %s\n' "$t" "$a" "$b" "$sonuc"
done

echo
if [ "$HATA" -eq 0 ]; then
  echo "PROVA BAŞARILI — yedek geri yüklenebiliyor."
else
  echo "PROVA BAŞARISIZ — yukarıdaki satırlara bakın." >&2
fi
exit "$HATA"
