# FleshMarket — GitHub Auto-Deploy Setup

## Overview

Every push to `main` → GitHub Actions SSHs into your Hetzner server → pulls latest code → reloads server. Zero downtime, ~15 seconds.

---

## One-time setup (do this in order)

### Step 1 — Create your GitHub repo

```bash
# On your local machine, from the FleshMarket project folder
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:YOURNAME/YOURREPO.git
git push -u origin main
```

Make sure `.env`, `*.db`, and `node_modules` are in `.gitignore` — they already are.

---

### Step 2 — Create your Hetzner server

1. Go to [console.hetzner.com](https://console.hetzner.com)
2. Create server → Ubuntu 24.04 → **Dedicated vCPU → CCX23**
3. Add your **personal** SSH public key during creation (so you can SSH in as root)
4. Note your server's IP address

---

### Step 3 — Run the setup script on the server

```bash
# SSH into your fresh server
ssh root@YOUR_SERVER_IP

# Clone just the deploy folder from GitHub (or upload the zip)
# If uploading the zip:
scp FleshMarket_N_deploy.zip root@YOUR_SERVER_IP:/root/
ssh root@YOUR_SERVER_IP
unzip FleshMarket_N_deploy.zip
cd FleshMarket_M

chmod +x deploy/setup_github.sh
./deploy/setup_github.sh yourdomain.com your@email.com git@github.com:YOURNAME/YOURREPO.git
```

The script will **pause** and print two things you need to copy:

---

### Step 4 — Add the Deploy Key to GitHub

The script prints a public key. Copy it, then:

> **GitHub repo → Settings → Deploy keys → Add deploy key**
> - Title: `fleshmarket-server`
> - Key: *(paste public key)*
> - Allow write access: **No**

---

### Step 5 — Add GitHub Actions Secrets

The script also prints your server IP, username, and private key. Add these three secrets:

> **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `SSH_HOST` | Your server IP (e.g. `65.21.x.x`) |
| `SSH_USER` | `fm` |
| `SSH_PRIVATE_KEY` | The entire private key printed by the script (including `-----BEGIN...` lines) |

---

### Step 6 — Press Enter in the terminal

Once you've added the deploy key and secrets, go back to your SSH session and press **Enter** to continue the setup. It will clone the repo, install dependencies, start the server, configure nginx, and get SSL.

---

### Step 7 — Edit your .env

```bash
nano /opt/fleshmarket/server/.env
```

Set `DEV_ACCOUNTS`, `PATREON_WEBHOOK_SECRET` (if using Patreon), etc. Then:

```bash
pm2 restart fleshmarket
```

---

## Daily workflow

```bash
# Make changes locally, then:
git add .
git commit -m "your change"
git push origin main
# → Auto-deploys in ~15 seconds
```

Watch it deploy live in: **GitHub repo → Actions tab**

---

## What's NOT in git (intentional)

| File | Why |
|---|---|
| `server/.env` | Contains secrets — lives only on the server |
| `server/fleshmarket.db` | Database — never overwrite with deploys |
| `server/node_modules/` | Installed fresh on server |

---

## Useful server commands

```bash
pm2 status                    # is it running?
pm2 logs fleshmarket          # live logs
pm2 restart fleshmarket       # restart after .env changes

# Manual deploy without a push
cd /opt/fleshmarket && git pull && pm2 reload fleshmarket

# Backup the database
/opt/fleshmarket/deploy/backup.sh
```
