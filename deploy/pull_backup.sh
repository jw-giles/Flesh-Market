#!/usr/bin/env bash
# =============================================================================
#  FleshMarket — Pull a DB backup to your LOCAL machine (run from Git Bash)
#  SSHes to the VPS, makes a fresh consistent snapshot, downloads it to your
#  local Downloads folder, and timestamps it.
#
#  Usage (from your machine, Git Bash):
#    ./deploy/pull_backup.sh
#
#  Override the VPS target or local dest if needed:
#    VPS=root@5.78.119.169 DEST_DIR=~/Downloads ./deploy/pull_backup.sh
# =============================================================================

set -euo pipefail

VPS="${VPS:-root@5.78.119.169}"
APP_DIR="${APP_DIR:-/root/Flesh-Market}"
DEST_DIR="${DEST_DIR:-$HOME/Downloads}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
LOCAL_FILE="$DEST_DIR/fleshmarket_backup_$DATE.db"

mkdir -p "$DEST_DIR"

echo "==> Triggering a fresh backup on the VPS ($VPS)..."
# Run the VPS backup script (creates a consistent snapshot in $APP_DIR/backups).
ssh "$VPS" "APP_DIR='$APP_DIR' bash '$APP_DIR/deploy/backup.sh'" || {
  echo "ERROR: remote backup failed. Check SSH access and that $APP_DIR/deploy/backup.sh exists."
  exit 1
}

echo "==> Finding the newest backup on the VPS..."
REMOTE_LATEST=$(ssh "$VPS" "ls -1t '$APP_DIR/backups/'fleshmarket_*.db 2>/dev/null | head -1")
if [ -z "$REMOTE_LATEST" ]; then
  echo "ERROR: no backups found in $APP_DIR/backups on the VPS."
  exit 1
fi
echo "    newest remote backup: $REMOTE_LATEST"

echo "==> Downloading to $LOCAL_FILE ..."
scp "$VPS:$REMOTE_LATEST" "$LOCAL_FILE"

SIZE=$(du -sh "$LOCAL_FILE" | cut -f1)
echo "==> Done. Saved $LOCAL_FILE ($SIZE)"
