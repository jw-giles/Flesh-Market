#!/usr/bin/env bash
# =============================================================================
#  FleshMarket — Update Script
#  Run from your local machine or on the server after pulling new code.
#  Usage (from project root):  ./deploy/update.sh
#         Or on server:         cd "$FM_APP_DIR" && ./deploy/update.sh
#
#  NOT THE CANONICAL DEPLOY. ./ship.sh in the repo root is: it commits, pushes,
#  and has the server git pull and restart. This rsync path predates it and is
#  kept for a machine that was set up by deploy/setup.sh.
#
#  IT POINTED AT THE WRONG DIRECTORY. APP_DIR was hardcoded to /opt/fleshmarket
#  while the live server runs from /root/Flesh-Market, and rsync CREATES a
#  missing destination. Running this on the VPS built a second, dead copy of the
#  app at a path nothing serves, and then called pm2 reload on the real process.
#  The guard below refuses rather than inventing a tree.
# =============================================================================

set -euo pipefail
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[OK]${RESET}  $*"; }
info() { echo -e "${CYAN}[FM]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[!!]${RESET}  $*"; }

APP_DIR="${FM_APP_DIR:-/root/Flesh-Market}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# REFUSE RATHER THAN CREATE. rsync makes a missing destination, so a wrong
# APP_DIR does not fail, it succeeds somewhere useless and then reloads the live
# process anyway. An install is identified by the file every build carries.
if [ ! -f "$APP_DIR/client/version.json" ]; then
  echo "[update] No FleshMarket install at $APP_DIR (no client/version.json)." >&2
  echo "[update] Set FM_APP_DIR=/path/to/install if it lives somewhere else." >&2
  exit 1
fi
# Refusing to sync a tree onto itself, which deletes as much as it copies.
if [ "$(cd "$APP_DIR" && pwd -P)" = "$PROJECT_ROOT" ]; then
  echo "[update] $APP_DIR is this checkout. Nothing to sync; use ./ship.sh." >&2
  exit 1
fi
# Ownership follows whoever already owns the install rather than a name baked in
# here. The live box runs as root; a setup.sh box runs as 'fm'.
FM_USER="${FM_USER:-$(stat -c %U "$APP_DIR" 2>/dev/null || echo root)}"

info "Deploying updated files to $APP_DIR (owner $FM_USER)..."

# Sync code (preserve .env and DB)
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.db' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  "$PROJECT_ROOT/server/" "$APP_DIR/server/"
rsync -a --delete "$PROJECT_ROOT/client/" "$APP_DIR/client/"
chown -R "$FM_USER:$FM_USER" "$APP_DIR"
ok "Files synced"

# Update dependencies if package.json changed
info "Checking dependencies..."
cd "$APP_DIR/server"
sudo -u "$FM_USER" npm install --omit=dev --quiet
ok "Dependencies up to date"

# Reload (zero-downtime restart)
info "Reloading FleshMarket..."
pm2 reload fleshmarket
ok "Server reloaded"

pm2 status
echo ""
ok "Update complete → $(pm2 jlist 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); [print('  Status:', p['pm2_env']['status'], '| Uptime:', p['pm2_env'].get('pm_uptime','?')) for p in d if p['name']=='fleshmarket']" 2>/dev/null || echo 'see pm2 status')"
