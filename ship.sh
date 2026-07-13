#!/usr/bin/env bash
# FleshMarket one-command deploy. Run from the repo root after local testing: ./ship.sh
# Commits everything (message from client/version.json), pushes to GitHub, then
# pulls and restarts on the VPS in one remote line.
set -euo pipefail
main() {
  cd "$(dirname "$0")"
  url="$(git config --get remote.origin.url || true)"
  case "$url" in
    *jw-giles/Flesh-Market*) ;;
    *) echo "[ship] SAFETY STOP: this folder's git remote is '$url', not jw-giles/Flesh-Market."; exit 1 ;;
  esac
  ver="$(grep -o '"version": *"[^"]*"' client/version.json | head -1 | cut -d'"' -f4)"
  git add -A
  if git diff --cached --quiet; then
    echo "[ship] Nothing new to commit; pushing and restarting anyway."
  else
    git commit -m "v$ver"
  fi
  git push
  echo "[ship] Deploying to VPS..."
  ssh root@5.78.119.169 'cd /root/Flesh-Market && git pull && pm2 restart fleshmarket'
  echo "[ship] Live: v$ver deployed. Hard-refresh the game client."
}
main "$@"
