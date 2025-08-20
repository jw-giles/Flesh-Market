
# Flesh Market — GitHub + VPS Deploy

This project now includes:
- GitHub Actions CI/CD (`.github/workflows/ci-cd.yml`)
- systemd service (`ops/fleshmarket.service`)
- launcher script (`ops/run.sh`)
- first-time setup (`ops/setup_server.sh`)
- `.env.example` template

## GitHub Setup
1. Push this repo to GitHub.
2. Add repository secrets under Settings → Secrets and variables → Actions:
   - SSH_HOST
   - SSH_USER
   - SSH_KEY
   - REMOTE_DIR (e.g. /opt/fleshmarket)
   - SERVICE_NAME (e.g. fleshmarket)
3. Push to main. CI runs → deploys to VPS.

## VPS Setup
On first login:
```bash
sudo bash ops/setup_server.sh
sudo mkdir -p /opt/fleshmarket
sudo chown -R $USER:$USER /opt/fleshmarket
```
The deploy action will then sync code and start the service.

## Local Run
```bash
npm install
npm start
```
