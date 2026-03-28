#!/usr/bin/env bash
# ============================================================
#  Flesh Market — Linux / macOS launcher
#  Requires Node.js 22.5 or newer (uses built-in node:sqlite)
# ============================================================

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()  { echo -e "${CYAN}[FM]${RESET} $*"; }
ok()    { echo -e "${GREEN}[OK]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[!!]${RESET} $*"; }
fatal() { echo -e "${RED}[ERR]${RESET} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║       FLESH MARKET  —  SERVER        ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}"
echo ""

cd "$(dirname "$0")"

# ── 1. Check Node.js is installed ───────────────────────────
if ! command -v node &>/dev/null; then
  fatal "Node.js not found.\n\n  Install it from: https://nodejs.org  (need v22.5+)\n\n  Quick install by distro:\n    Ubuntu/Debian : sudo apt install nodejs npm\n    Arch          : sudo pacman -S nodejs npm\n    Fedora/RHEL   : sudo dnf install nodejs\n    macOS (brew)  : brew install node\n\n  Or use nvm for any version:\n    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash\n    nvm install 22 && nvm use 22"
fi

# ── 2. Verify Node 22.5+ (node:sqlite requirement) ──────────
NODE_VER=$(node -e "process.stdout.write(process.version.slice(1))")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VER" | cut -d. -f2)

if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  fatal "Node.js v${NODE_VER} found, but v22.5+ is required.\n\n  The server uses the built-in node:sqlite module (added in v22.5).\n  Update at https://nodejs.org  or run:\n    nvm install 22 && nvm use 22"
fi

ok "Node.js v${NODE_VER}"

# ── 3. npm install if deps are missing ──────────────────────
NEED_INSTALL=0
[ ! -d node_modules ]         && NEED_INSTALL=1
[ ! -d node_modules/express ] && NEED_INSTALL=1
[ ! -d node_modules/ws ]      && NEED_INSTALL=1
[ ! -d node_modules/dotenv ]  && NEED_INSTALL=1

if [ "$NEED_INSTALL" -eq 1 ]; then
  info "Installing dependencies..."
  npm install --no-audit --no-fund
  ok "Dependencies installed."
else
  ok "Dependencies present."
fi

# ── 4. Bootstrap .env on first run ──────────────────────────
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
  warn "Edit server/.env to configure PORT, DEV_ACCOUNTS, etc."
fi

# ── 5. Free the port ────────────────────────────────────────
PORT="${PORT:-7777}"

kill_port() {
  local p=$1 pid=""
  if command -v lsof &>/dev/null; then
    pid=$(lsof -ti tcp:"$p" 2>/dev/null | head -1 || true)
  elif command -v ss &>/dev/null; then
    pid=$(ss -tlnp 2>/dev/null \
      | awk -v port=":$p" '$4 ~ port"$" {match($6,/pid=([0-9]+)/,a); if(a[1]) print a[1]}' \
      | head -1 || true)
  elif command -v fuser &>/dev/null; then
    pid=$(fuser "${p}/tcp" 2>/dev/null | awk '{print $1}' | head -1 || true)
  fi
  if [ -n "$pid" ]; then
    warn "Port $p occupied by PID $pid — freeing..."
    kill -9 "$pid" 2>/dev/null || true
    sleep 1
    ok "Port $p is free."
  fi
}

kill_port "$PORT"

# ── 6. Auto-open browser after a short delay ────────────────
URL="http://localhost:${PORT}"
(
  sleep 2
  if   command -v xdg-open  &>/dev/null; then xdg-open  "$URL" &>/dev/null
  elif command -v gnome-open &>/dev/null; then gnome-open "$URL" &>/dev/null
  elif command -v open       &>/dev/null; then open       "$URL" &>/dev/null
  else warn "Open your browser at: $URL"; fi
) &

# ── 7. Start ────────────────────────────────────────────────
echo ""
ok "Server starting → ${BOLD}${URL}${RESET}"
echo -e "    ${CYAN}Ctrl+C to stop${RESET}"
echo ""

export PORT="$PORT"
exec node --experimental-sqlite server.js
