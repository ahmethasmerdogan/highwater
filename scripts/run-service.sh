#!/usr/bin/env bash
# Bir SARNIÇ servisini oturumdan bağımsız, kendini yeniden başlatan biçimde çalıştırır.
#   kullanım: scripts/run-service.sh <servis> [ek argümanlar]
# Servis çökerse 10 sn sonra yeniden başlar; log /tmp/sarnic-<servis>.log içine yazılır.
set -u
SERVICE="${1:?servis adı gerekli}"; shift || true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="/tmp/sarnic-${SERVICE}.log"

export PATH="$HOME/.local/bin:$PATH"
set -a; . "$ROOT/.env"; set +a
cd "$ROOT/apps/engine" || exit 1

while true; do
  echo "=== $(date -Is) · $SERVICE başlatılıyor ===" >> "$LOG"
  uv run python -m sarnic.cli "$SERVICE" "$@" >> "$LOG" 2>&1
  code=$?
  echo "=== $(date -Is) · $SERVICE çıktı (kod $code), 10 sn sonra yeniden ===" >> "$LOG"
  sleep 10
done
