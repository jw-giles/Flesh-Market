# FleshMarket — Hetzner Deployment Guide

## What you need before starting

| Thing | Details |
|---|---|
| Hetzner VPS | CX22 or better (2 vCPU, 4GB RAM) — Ubuntu 22.04 or 24.04 |
| Domain name | Any registrar. Point an **A record** → your server IP before running setup |
| SSH access | `ssh root@your-server-ip` |

---

## One-time server setup (~5 minutes)

### Step 1 — Upload the project to your server

From your local machine (in the FleshMarket project folder):

```bash
scp -r FleshMarket_M root@YOUR_SERVER_IP:/root/fleshmarket-src
```

Or use FileZilla / Cyberduck if you prefer a GUI.

### Step 2 — SSH in and run setup

```bash
ssh root@YOUR_SERVER_IP
cd /root/fleshmarket-src
chmod +x deploy/setup.sh deploy/update.sh deploy/backup.sh
./deploy/setup.sh yourdomain.com your@email.com
```

That's it. The script will:
- Install Node.js 22, nginx, PM2, certbot
- Configure the firewall (SSH + HTTP/HTTPS only)
- Deploy files to `/opt/fleshmarket`
- Set up nginx as a reverse proxy
- Get a free SSL certificate from Let's Encrypt
- Start the server and set it to auto-start on reboot

---

## After setup — required configuration

### Edit your .env file

```bash
nano /opt/fleshmarket/server/.env
```

The file will look like this — fill in the blanks:

```env
PORT=3000
TRADE_TAX_BPS=25

# Your Patreon webhook secret (from Patreon developer dashboard)
# Leave blank to skip Patreon webhook verification
PATREON_WEBHOOK_SECRET=

# Dev accounts — MrFlesh must be first (owner account)
DEV_ACCOUNTS=MrFlesh,DEV-FIXER,DEV-SLUT,DEV-SMASHER,DEV-GURU,DEV-PEAK

# DB is stored in the server folder by default
# DB_PATH=./fleshmarket.db
```

After editing:

```bash
pm2 restart fleshmarket
```

### Seed dev accounts (first time only)

This creates all dev accounts with proper password hashes:

```bash
cd /opt/fleshmarket/server
node seed_devaccounts.mjs
```

You should see output like:
```
[create] MrFlesh (OWNER ★)
[create] DEV-FIXER
...
[guild] MERCHANTS_GUILD owner set to MrFlesh
All dev accounts seeded.
```

---

## Daily operations

### Check server status
```bash
pm2 status
pm2 logs fleshmarket          # live logs
pm2 logs fleshmarket --lines 50  # last 50 lines
```

### Restart / stop
```bash
pm2 restart fleshmarket
pm2 stop fleshmarket
pm2 start fleshmarket
```

### Deploy a code update
From your local machine — zip the updated project and upload, then on the server:

```bash
cd /root/fleshmarket-src   # or wherever your source is
./deploy/update.sh
```

This syncs files, runs npm install, and does a **zero-downtime reload** — players stay connected.

### Manual backup
```bash
/opt/fleshmarket/deploy/backup.sh
```

Backups are saved to `/opt/fleshmarket/backups/`. The script keeps the last 7.

### Set up automatic daily backups
```bash
crontab -e
```
Add this line (runs at 3am every day):
```
0 3 * * * /opt/fleshmarket/deploy/backup.sh >> /var/log/fleshmarket/backup.log 2>&1
```

---

## File layout on the server

```
/opt/fleshmarket/
├── client/               ← static files (HTML, CSS, JS)
├── server/
│   ├── server.js
│   ├── db.js
│   ├── .env              ← your config (never commit this)
│   ├── fleshmarket.db    ← SQLite database (auto-created)
│   └── seed_devaccounts.mjs
├── backups/              ← auto-created by backup.sh
├── deploy/               ← these scripts
└── ecosystem.config.cjs  ← PM2 config

/var/log/fleshmarket/
├── out.log               ← server stdout
└── error.log             ← server stderr
```

---

## Troubleshooting

### Site shows nginx default page
```bash
nginx -t                          # check config syntax
systemctl reload nginx
ls -la /etc/nginx/sites-enabled/  # should see 'fleshmarket', not 'default'
```

### SSL certificate errors
Make sure your domain's A record points to the server IP, then:
```bash
certbot --nginx -d yourdomain.com
```

### Server won't start
```bash
pm2 logs fleshmarket --lines 100
# or run directly to see full error:
cd /opt/fleshmarket/server && node --experimental-sqlite server.js
```

### Port 3000 already in use
```bash
lsof -i :3000
kill -9 <PID>
pm2 start fleshmarket
```

### WebSockets disconnecting
Make sure nginx has the upgrade headers. Check `/etc/nginx/sites-available/fleshmarket` contains:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 86400s;
```

### Reset the database (nuclear option)
```bash
pm2 stop fleshmarket
rm /opt/fleshmarket/server/fleshmarket.db
pm2 start fleshmarket
cd /opt/fleshmarket/server && node seed_devaccounts.mjs
```

---

## Hetzner recommended specs

| Players | VPS | Cost |
|---|---|---|
| Up to ~50 | CX22 (2 vCPU, 4GB) | ~€4/mo |
| 50–200 | CX32 (4 vCPU, 8GB) | ~€8/mo |
| 200+ | CX42 (8 vCPU, 16GB) | ~€16/mo |

FleshMarket is a single-process Node.js app with SQLite — it's very lean. A CX22 will handle dozens of concurrent players comfortably.

---

## Quick reference card

```bash
# Status
pm2 status
pm2 logs fleshmarket

# Restart
pm2 restart fleshmarket

# Update code
./deploy/update.sh

# Backup DB
./deploy/backup.sh

# Edit config
nano /opt/fleshmarket/server/.env
pm2 restart fleshmarket

# Seed/refresh dev accounts
cd /opt/fleshmarket/server && node seed_devaccounts.mjs

# SSL renewal (automatic, but manual if needed)
certbot renew
```
