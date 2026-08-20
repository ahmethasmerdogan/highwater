#!/usr/bin/env bash
# Paneli **üretim derlemesiyle** çalıştırır (systemd tarafından çağrılır).
#
# Önceden `next dev` kullanılıyordu, çünkü giriş formunun otomatik doldurulması
# `NODE_ENV === "development"` kapısının arkasındaydı. Bedeli ağırdı: 1,6 GB
# bellek ve her sayfada derleme gecikmesi. Kapı artık açık bir bayrak
# (`NEXT_PUBLIC_AUTOFILL`, bkz. `src/lib/dev-auth.ts`), dolayısıyla panel
# üretim derlemesiyle çalışırken de otomatik doldurabiliyor.
#
# Derleme her açılışta yapılır: kod değiştiyse yeni derleme, değişmediyse
# Next.js önbelleği sayesinde birkaç saniye. Kararlılığı `Restart=always` sağlar.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/toolchain/node-v22.14.0-linux-x64/bin:$PATH"
export NEXT_TELEMETRY_DISABLED=1
export NODE_ENV=production

cd "$ROOT/apps/web"

# `.env.local` üretim derlemesinde de okunur; `NEXT_PUBLIC_*` değişkenleri
# derleme anında gömülür, bu yüzden derlemeden **önce** yüklenmiş olmalı.
npm run build

exec npm run start -- --port "${SARNIC_WEB_PORT:-3000}"
