#!/usr/bin/env bash
# =============================================================================
#  FleshMarket — Update Script
#  Run from your local machine or on the server after pulling new code.
#  Usage (from project root):  ./deploy/update.sh
#         Or on server:         cd /opt/fleshmarket && ./deploy/update.sh
# =============================================================================

set -euo pipefail
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[OK]${RESET}  $*"; }
info() { echo -e "${CYAN}[FM]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[!!]${RESET}  $*"; }

APP_DIR="/opt/fleshmarket"
FM_USER="fm"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

info "Deploying updated files to $APP_DIR..."

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
