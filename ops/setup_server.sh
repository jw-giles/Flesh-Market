
#!/usr/bin/env bash
set -euo pipefail

apt update && apt upgrade -y
apt install -y curl git ufw jq

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw allow 7777
yes | ufw enable

# Optional: Caddy for HTTPS
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo tee /etc/apt/trusted.gpg.d/caddy-stable.asc
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

echo "Setup complete. Place your app at /opt/fleshmarket."
