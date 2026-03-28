#!/usr/bin/env bash
# =============================================================================
#  FleshMarket — Hetzner VPS Setup Script
#  Run as root on a fresh Ubuntu 22.04 / 24.04 server
#
#  Usage:
#    chmod +x setup.sh
#    ./setup.sh yourdomain.com your@email.com
#
#  What this does:
#    1. Updates system packages
#    2. Installs Node.js 22, PM2, nginx, certbot
#    3. Configures firewall (ufw)
#    4. Copies FleshMarket files to /opt/fleshmarket
#    5. Creates a dedicated 'fm' system user
#    6. Sets up .env, seeds dev accounts
#    7. Creates nginx reverse proxy config
#    8. Obtains Let's Encrypt SSL cert
#    9. Starts the server under PM2 + saves on boot
# =============================================================================

set -euo pipefail
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()  { echo -e "${CYAN}[FM]${RESET}  $*"; }
ok()    { echo -e "${GREEN}[OK]${RESET}  $*"; }
warn()  { echo -e "${YELLOW}[!!]${RESET}  $*"; }
fatal() { echo -e "${RED}[ERR]${RESET} $*" >&2; exit 1; }
hr()    { echo -e "${CYAN}──────────────────────────────────────────────${RESET}"; }

# ── Args ──────────────────────────────────────────────────────────────────────
DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/opt/fleshmarket"
FM_USER="fm"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║      FLESH MARKET — HETZNER SETUP           ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo ""

[[ $EUID -ne 0 ]] && fatal "Run as root:  sudo ./setup.sh yourdomain.com your@email.com"
[[ -z "$DOMAIN" ]] && fatal "Usage: ./setup.sh yourdomain.com your@email.com"
[[ -z "$EMAIL" ]]  && fatal "Usage: ./setup.sh yourdomain.com your@email.com"

info "Domain : $DOMAIN"
info "Email  : $EMAIL"
info "App dir: $APP_DIR"
hr

# ── 1. System update ──────────────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git unzip ufw nginx certbot python3-certbot-nginx
ok "System packages up to date"
hr

# ── 2. Node.js 22 via NodeSource ──────────────────────────────────────────────
if ! node --version 2>/dev/null | grep -q "^v2[2-9]"; then
  info "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
NODE_VER=$(node --version)
ok "Node.js $NODE_VER"

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 --quiet
fi
ok "PM2 $(pm2 --version)"
hr

# ── 4. Firewall ──────────────────────────────────────────────────────────────
info "Configuring firewall..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ok "Firewall: SSH + HTTP(S) open, everything else blocked"
hr

# ── 5. System user ───────────────────────────────────────────────────────────
if ! id "$FM_USER" &>/dev/null; then
  info "Creating system user '$FM_USER'..."
  useradd --system --shell /bin/bash --create-home "$FM_USER"
fi
ok "User '$FM_USER' ready"

# ── 6. Deploy app files ──────────────────────────────────────────────────────
info "Deploying app to $APP_DIR..."
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.db' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  "$PROJECT_ROOT/server/" "$APP_DIR/server/"
rsync -a --delete "$PROJECT_ROOT/client/" "$APP_DIR/client/"

chown -R "$FM_USER:$FM_USER" "$APP_DIR"
ok "Files deployed"

# ── 7. npm install ───────────────────────────────────────────────────────────
info "Installing npm dependencies..."
cd "$APP_DIR/server"
sudo -u "$FM_USER" npm install --omit=dev --quiet
ok "Dependencies installed"

# ── 8. .env setup ────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/server/.env" ]; then
  info "Creating .env..."
  cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
  # Set production port to 3000 (nginx will proxy from 80/443)
  sed -i 's/^PORT=.*/PORT=3000/' "$APP_DIR/server/.env"
  chown "$FM_USER:$FM_USER" "$APP_DIR/server/.env"
  warn ".env created at $APP_DIR/server/.env — EDIT IT before starting (add DEV_ACCOUNTS etc.)"
else
  ok ".env already exists — leaving untouched"
fi

# ── 9. Seed dev accounts ─────────────────────────────────────────────────────
info "Seeding dev accounts..."
# Start server briefly to create the DB, then seed
cd "$APP_DIR/server"
if [ ! -f "$APP_DIR/server/fleshmarket.db" ]; then
  info "First run — starting server for 3s to initialise DB..."
  sudo -u "$FM_USER" timeout 3 node --experimental-sqlite server.js >/dev/null 2>&1 || true
fi
sudo -u "$FM_USER" node seed_devaccounts.mjs && ok "Dev accounts seeded" || warn "Seed failed — run manually: cd $APP_DIR/server && node seed_devaccounts.mjs"
hr

# ── 10. PM2 ecosystem file ───────────────────────────────────────────────────
info "Writing PM2 ecosystem config..."
cat > "$APP_DIR/ecosystem.config.cjs" << PMEOF
module.exports = {
  apps: [{
    name        : 'fleshmarket',
    script      : 'server.js',
    cwd         : '${APP_DIR}/server',
    interpreter : 'node',
    interpreter_args: '--experimental-sqlite',
    user        : '${FM_USER}',
    instances   : 1,
    exec_mode   : 'fork',
    autorestart : true,
    watch       : false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV : 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file  : '/var/log/fleshmarket/error.log',
    out_file    : '/var/log/fleshmarket/out.log',
    merge_logs  : true,
  }]
};
PMEOF

mkdir -p /var/log/fleshmarket
chown "$FM_USER:$FM_USER" /var/log/fleshmarket
chown "$FM_USER:$FM_USER" "$APP_DIR/ecosystem.config.cjs"
ok "PM2 config written"

# ── 11. Start with PM2 ───────────────────────────────────────────────────────
info "Starting FleshMarket with PM2..."
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u "$FM_USER" --hp "/home/$FM_USER" | tail -1 | bash || true
ok "FleshMarket started and set to auto-start on boot"
hr

# ── 12. nginx config ─────────────────────────────────────────────────────────
info "Writing nginx config for $DOMAIN..."
cat > "/etc/nginx/sites-available/fleshmarket" << NGEOF
# FleshMarket — nginx reverse proxy
# HTTP → redirect to HTTPS (certbot will manage this block)
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Let certbot do its challenge
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${DOMAIN};

    # SSL — certbot will fill these in
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN"        always;
    add_header X-Content-Type-Options "nosniff"    always;
    add_header Referrer-Policy "strict-origin"     always;
    add_header X-XSS-Protection "1; mode=block"   always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/javascript;
    gzip_min_length 1024;

    # Static client files — served directly by nginx (fast)
    root ${APP_DIR}/client;

    location /assets/ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # API + WebSocket → Node.js
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }

    # WebSocket upgrade
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGEOF

ln -sf /etc/nginx/sites-available/fleshmarket /etc/nginx/sites-enabled/fleshmarket
rm -f /etc/nginx/sites-enabled/default
nginx -t && ok "nginx config valid" || fatal "nginx config has errors — check /etc/nginx/sites-available/fleshmarket"
systemctl reload nginx
hr

# ── 13. SSL via certbot ───────────────────────────────────────────────────────
info "Obtaining SSL certificate for $DOMAIN..."
info "(Make sure your DNS A record points to this server's IP first)"
certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  --domains "$DOMAIN" \
  --redirect \
  && ok "SSL certificate installed" \
  || warn "SSL failed — DNS may not be propagated yet. Run manually: certbot --nginx -d $DOMAIN"

# certbot auto-renewal
systemctl enable certbot.timer 2>/dev/null || true
ok "Certbot auto-renewal enabled"
hr

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║            SETUP COMPLETE!                  ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Site${RESET}      :  https://${DOMAIN}"
echo -e "  ${BOLD}App dir${RESET}   :  ${APP_DIR}"
echo -e "  ${BOLD}Logs${RESET}      :  /var/log/fleshmarket/"
echo -e "  ${BOLD}PM2 status${RESET}:  pm2 status"
echo -e "  ${BOLD}PM2 logs${RESET}  :  pm2 logs fleshmarket"
echo -e "  ${BOLD}.env${RESET}      :  ${APP_DIR}/server/.env"
echo ""
echo -e "  ${YELLOW}NEXT STEPS:${RESET}"
echo -e "  1. Edit ${APP_DIR}/server/.env  (check PORT=3000, add PATREON secret if needed)"
echo -e "  2. Verify dev accounts: cd ${APP_DIR}/server && node seed_devaccounts.mjs"
echo -e "  3. Restart after .env changes:  pm2 restart fleshmarket"
echo ""
