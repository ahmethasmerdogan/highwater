#!/usr/bin/env bash
# systemd tarafından çağrılır; servisi ön planda çalıştırır.
# Yeniden başlatmayı systemd yönetir (Restart=always), bu betik döngü kurmaz.
#
#   kullanım: scripts/run-once.sh <servis> [ek argümanlar]
set -euo pipefail

SERVICE="${1:?servis adı gerekli}"
shift || true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

# .env'i yükle (yorum ve boş satırları atlayarak).
set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

cd "$ROOT/apps/engine"
exec uv run python -m sarnic.cli "$SERVICE" "$@"
