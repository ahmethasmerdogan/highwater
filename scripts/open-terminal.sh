#!/usr/bin/env bash
# SARNIÇ canlı akışını **ayrı bir pencerede** açar.
#
# Neden ayrı pencere: servisler systemd altında sessiz çalışıyor
# (`sarnic-supervisor`, `sarnic-marketdata`, …). Sessiz çalışmaları doğru —
# bozulmaz kural 4: "TUI botun kendisi değildir; bot headless bir servistir."
# Ama sistemin canlı olduğunu görmek için her seferinde `journalctl` yazmak
# gerekiyordu. Bu betik o pencereyi açar; **pencereyi kapatmak işlemleri
# durdurmaz.**
#
#   kullanım: scripts/open-terminal.sh [tui|konsol|log|shell]
#     tui    (varsayılan) Textual arayüzü — beş ekranlı terminal
#     konsol fastfetch tarzı durum kartı + canlı AL/SAT akışı
#     log    supervisor + worker + marketdata loglarının birleşik akışı
#     shell  motor sanal ortamı yüklü bir kabuk
#
# Terminal emülatörü otomatik seçilir; `SARNIC_TERMINAL` ile ezilebilir.
set -euo pipefail

MODE="${1:-tui}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --------------------------------------------------------------------------- #
# Pencerenin içinde çalışacak komut
# --------------------------------------------------------------------------- #
case "$MODE" in
  tui)
    INNER="cd '$ROOT/apps/engine' && exec uv run python -m sarnic.cli tui"
    TITLE="HIGHWATER · terminal arayüzü"
    ;;
  konsol)
    INNER="cd '$ROOT/apps/engine' && exec uv run python -m sarnic.cli konsol"
    TITLE="HIGHWATER · canlı akış"
    ;;
  log)
    # `--follow` üç birimi tek akışta birleştirir; `-n 200` açılışta bağlamı verir.
    INNER="exec journalctl --user -n 200 -f -u sarnic-supervisor -u sarnic-marketdata -u sarnic-notifier -u sarnic-api"
    TITLE="SARNIÇ · canlı log"
    ;;
  shell)
    INNER="cd '$ROOT/apps/engine' && exec \$SHELL"
    TITLE="SARNIÇ · kabuk"
    ;;
  *)
    echo "bilinmeyen mod: $MODE (tui|log|shell)" >&2
    exit 2
    ;;
esac

# `.env` yüklenir: TUI, API adresini oradan okur.
PRELUDE="set -a; . '$ROOT/.env'; set +a; export PATH=\"\$HOME/.local/bin:\$PATH\";"
COMMAND="$PRELUDE $INNER"

# --------------------------------------------------------------------------- #
# Emülatör seçimi
# --------------------------------------------------------------------------- #
pick_terminal() {
  if [[ -n "${SARNIC_TERMINAL:-}" ]]; then
    echo "$SARNIC_TERMINAL"
    return
  fi
  for candidate in konsole alacritty kitty wezterm ghostty foot gnome-terminal xfce4-terminal xterm; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return
    fi
  done
  echo ""
}

TERM_BIN="$(pick_terminal)"

if [[ -z "$TERM_BIN" ]]; then
  # Grafik oturum yoksa (SSH, sunucu) pencereyi açmaya çalışmak anlamsız;
  # komutu bu terminalde çalıştırmak doğru davranıştır.
  echo "Terminal emülatörü bulunamadı — komut bu pencerede çalıştırılıyor." >&2
  exec bash -lc "$COMMAND"
fi

case "$TERM_BIN" in
  konsole)
    exec konsole --title "$TITLE" -e bash -lc "$COMMAND"
    ;;
  gnome-terminal)
    exec gnome-terminal --title="$TITLE" -- bash -lc "$COMMAND"
    ;;
  xfce4-terminal)
    exec xfce4-terminal --title="$TITLE" --command "bash -lc \"$COMMAND\""
    ;;
  alacritty)
    exec alacritty --title "$TITLE" -e bash -lc "$COMMAND"
    ;;
  kitty)
    exec kitty --title "$TITLE" bash -lc "$COMMAND"
    ;;
  wezterm)
    exec wezterm start -- bash -lc "$COMMAND"
    ;;
  ghostty)
    exec ghostty -e bash -lc "$COMMAND"
    ;;
  foot)
    exec foot --title="$TITLE" bash -lc "$COMMAND"
    ;;
  *)
    exec "$TERM_BIN" -e bash -lc "$COMMAND"
    ;;
esac
