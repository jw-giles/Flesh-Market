#!/usr/bin/env bash
# =============================================================================
#  FleshMarket — Hetzner First-Time Setup (GitHub version)
#  Run as root on a fresh Ubuntu 22.04 / 24.04 server.
#
#  Usage:
#    ./deploy/setup_github.sh yourdomain.com your@email.com https://github.com/YOU/REPO.git
#
#  Before running:
#    1. Create your GitHub repo and push the code
#    2. Add your server's deploy public key to GitHub repo → Settings → Deploy Keys
#       (this script will generate and print that key for you)
#    3. Point your domain DNS A record at this server's IP
# =============================================================================

set -euo pipefail
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()  { echo -e "${CYAN}[FM]${RESET}  $*"; }
ok()    { echo -e "${GREEN}[OK]${RESET}  $*"; }
warn()  { echo -e "${YELLOW}[!!]${RESET}  $*"; }
fatal() { echo -e "${RED}[ERR]${RESET} $*" >&2; exit 1; }
hr()    { echo -e "${CYAN}──────────────────────────────────────────────${RESET}"; }

DOMAIN="${1:-}"
EMAIL="${2:-}"
REPO_URL="${3:-}"
APP_DIR="/opt/fleshmarket"
FM_USER="fm"

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║    FLESH MARKET — HETZNER + GITHUB SETUP    ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo ""

[[ $EUID -ne 0 ]]    && fatal "Run as root"
[[ -z "$DOMAIN" ]]   && fatal "Usage: ./setup_github.sh yourdomain.com your@email.com https://github.com/YOU/REPO.git"
[[ -z "$EMAIL" ]]    && fatal "Usage: ./setup_github.sh yourdomain.com your@email.com https://github.com/YOU/REPO.git"
[[ -z "$REPO_URL" ]] && fatal "Usage: ./setup_github.sh yourdomain.com your@email.com https://github.com/YOU/REPO.git"

info "Domain  : $DOMAIN"
info "Email   : $EMAIL"
info "Repo    : $REPO_URL"
hr

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git unzip ufw nginx certbot python3-certbot-nginx sqlite3
ok "System packages ready"
hr

# ── 2. Node.js 22 ─────────────────────────────────────────────────────────────
if ! node --version 2>/dev/null | grep -q "^v2[2-9]"; then
  info "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
ok "Node.js $(node --version)"

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 --quiet
fi
ok "PM2 $(pm2 --version)"
hr

# ── 4. Firewall ───────────────────────────────────────────────────────────────
info "Configuring firewall..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ok "Firewall: SSH + HTTP/HTTPS only"
hr

# ── 5. System user ────────────────────────────────────────────────────────────
if ! id "$FM_USER" &>/dev/null; then
  useradd --system --shell /bin/bash --create-home "$FM_USER"
fi
ok "User '$FM_USER' ready"

# ── 6. Generate deploy SSH key (for GitHub Actions → server) ──────────────────
DEPLOY_KEY_PATH="/home/$FM_USER/.ssh/deploy_key"
AUTHORIZED_KEYS="/home/$FM_USER/.ssh/authorized_keys"

mkdir -p "/home/$FM_USER/.ssh"
chmod 700 "/home/$FM_USER/.ssh"

if [ ! -f "$DEPLOY_KEY_PATH" ]; then
  info "Generating deploy SSH keypair..."
  ssh-keygen -t ed25519 -C "fleshmarket-deploy" -f "$DEPLOY_KEY_PATH" -N ""
  cat "$DEPLOY_KEY_PATH.pub" >> "$AUTHORIZED_KEYS"
  chmod 600 "$AUTHORIZED_KEYS"
  chown -R "$FM_USER:$FM_USER" "/home/$FM_USER/.ssh"
fi

echo ""
echo -e "${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${YELLOW}  ACTION REQUIRED — Add this key to GitHub:${RESET}"
echo -e "${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${CYAN}Repo → Settings → Deploy keys → Add deploy key${RESET}"
echo -e "  Title: fleshmarket-server"
echo -e "  ${YELLOW}Allow write access: NO${RESET} (read-only is fine)"
echo ""
echo -e "${BOLD}PUBLIC KEY:${RESET}"
cat "$DEPLOY_KEY_PATH.pub"
echo ""
echo -e "${BOLD}${YELLOW}  Also add these 3 GitHub Actions Secrets:${RESET}"
echo -e "  ${CYAN}Repo → Settings → Secrets and variables → Actions${RESET}"
echo ""
echo -e "  ${BOLD}SSH_HOST${RESET}        = $(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo -e "  ${BOLD}SSH_USER${RESET}        = $FM_USER"
echo -e "  ${BOLD}SSH_PRIVATE_KEY${RESET} = (contents of deploy private key below)"
echo ""
echo -e "${BOLD}PRIVATE KEY (for SSH_PRIVATE_KEY secret):${RESET}"
cat "$DEPLOY_KEY_PATH"
echo ""
echo -e "${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}"
echo ""
read -rp "Press ENTER once you've added the deploy key to GitHub to continue setup..."
hr

# ── 7. Clone repo ─────────────────────────────────────────────────────────────
info "Cloning repository..."
if [ -d "$APP_DIR/.git" ]; then
  warn "$APP_DIR already has a git repo — pulling instead"
  cd "$APP_DIR" && sudo -u "$FM_USER" git pull origin main
else
  # Use the deploy key for cloning
  GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY_PATH -o StrictHostKeyChecking=no" \
    git clone "$REPO_URL" "$APP_DIR"
  chown -R "$FM_USER:$FM_USER" "$APP_DIR"
fi

# Configure git to use deploy key for future pulls
sudo -u "$FM_USER" git -C "$APP_DIR" config core.sshCommand "ssh -i $DEPLOY_KEY_PATH -o StrictHostKeyChecking=no"
ok "Repository cloned to $APP_DIR"

# ── 8. npm install ────────────────────────────────────────────────────────────
info "Installing npm dependencies..."
cd "$APP_DIR/server"
sudo -u "$FM_USER" npm install --omit=dev --quiet
ok "Dependencies installed"
hr

# ── 9. .env setup ─────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/server/.env" ]; then
  cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
  sed -i 's/^PORT=.*/PORT=3000/' "$APP_DIR/server/.env"
  chown "$FM_USER:$FM_USER" "$APP_DIR/server/.env"
  warn ".env created — edit it now: nano $APP_DIR/server/.env"
fi

# ── 10. Seed dev accounts ─────────────────────────────────────────────────────
info "Initialising database and seeding dev accounts..."
cd "$APP_DIR/server"
if [ ! -f "$APP_DIR/server/fleshmarket.db" ]; then
  sudo -u "$FM_USER" timeout 3 node --experimental-sqlite server.js >/dev/null 2>&1 || true
fi
sudo -u "$FM_USER" node seed_devaccounts.mjs && ok "Dev accounts seeded" || warn "Seed failed — run manually later"
hr

# ── 11. PM2 ecosystem ─────────────────────────────────────────────────────────
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
    env: { NODE_ENV: 'production' },
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

info "Starting FleshMarket..."
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u "$FM_USER" --hp "/home/$FM_USER" | tail -1 | bash || true
ok "Server running and set to auto-start"
hr

# ── 12. nginx ─────────────────────────────────────────────────────────────────
info "Writing nginx config..."
cat > "/etc/nginx/sites-available/fleshmarket" << NGEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${DOMAIN};
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/javascript;
    root ${APP_DIR}/client;
    location /assets/ { expires 7d; add_header Cache-Control "public, immutable"; }
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGEOF

ln -sf /etc/nginx/sites-available/fleshmarket /etc/nginx/sites-enabled/fleshmarket
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx && ok "nginx ready"
hr

# ── 13. SSL ───────────────────────────────────────────────────────────────────
info "Obtaining SSL certificate..."
certbot --nginx --non-interactive --agree-tos \
  --email "$EMAIL" --domains "$DOMAIN" --redirect \
  && ok "SSL certificate installed" \
  || warn "SSL failed — run: certbot --nginx -d $DOMAIN"
systemctl enable certbot.timer 2>/dev/null || true
hr

# ── Done ──────────────────────────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║            SETUP COMPLETE!                  ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Site${RESET}    : https://${DOMAIN}"
echo -e "  ${BOLD}Logs${RESET}    : pm2 logs fleshmarket"
echo -e "  ${BOLD}.env${RESET}    : nano ${APP_DIR}/server/.env  then  pm2 restart fleshmarket"
echo ""
echo -e "  ${YELLOW}Push to main → auto-deploys in ~15 seconds${RESET}"
echo ""
