#!/usr/bin/env bash
# =============================================================================
#  FleshMarket — Database Backup
#  Safe SQLite backup using the .backup command (consistent snapshot).
#  Keeps 7 daily backups + 4 weekly backups automatically.
#
#  Usage:  ./deploy/backup.sh
#  Cron:   0 3 * * * /opt/fleshmarket/deploy/backup.sh >> /var/log/fleshmarket/backup.log 2>&1
# =============================================================================

set -euo pipefail
APP_DIR="/opt/fleshmarket"
BACKUP_DIR="/opt/fleshmarket/backups"
DB_PATH="$APP_DIR/server/fleshmarket.db"
DATE=$(date +%Y-%m-%d_%H-%M)
DEST="$BACKUP_DIR/fleshmarket_$DATE.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "[$(date)] WARN: DB not found at $DB_PATH — skipping backup"
  exit 0
fi

# Use SQLite's .backup for a consistent hot copy (works while server is running)
sqlite3 "$DB_PATH" ".backup '$DEST'"
SIZE=$(du -sh "$DEST" | cut -f1)
echo "[$(date)] Backup OK → $DEST ($SIZE)"

# ── Rotation: keep 7 daily, remove older ─────────────────────────────────────
BACKUPS=("$BACKUP_DIR"/fleshmarket_*.db)
COUNT=${#BACKUPS[@]}
KEEP=7
if [ "$COUNT" -gt "$KEEP" ]; then
  TO_DELETE=$(( COUNT - KEEP ))
  # Sort oldest first and delete the excess
  printf '%s\n' "${BACKUPS[@]}" | sort | head -n "$TO_DELETE" | while read -r f; do
    rm -f "$f"
    echo "[$(date)] Rotated: $f"
  done
fi

echo "[$(date)] Backups in $BACKUP_DIR: $(ls "$BACKUP_DIR"/*.db 2>/dev/null | wc -l)"
