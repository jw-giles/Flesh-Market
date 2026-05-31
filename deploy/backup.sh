#!/usr/bin/env bash
# =============================================================================
#  FleshMarket — Database Backup (VPS-side)
#  Safe SQLite snapshot using the .backup command (consistent even while live).
#  Keeps the 14 most recent backups, then rotates the oldest out.
#
#  Usage:  ./deploy/backup.sh
#  Cron (daily 3am):
#    0 3 * * * /root/Flesh-Market/deploy/backup.sh >> /var/log/fleshmarket-backup.log 2>&1
#
#  Paths can be overridden by env vars if your install differs:
#    APP_DIR=/path/to/Flesh-Market ./deploy/backup.sh
# =============================================================================

set -euo pipefail

# Default to the real deploy path; override with APP_DIR=... if needed.
APP_DIR="${APP_DIR:-/root/Flesh-Market}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
DB_PATH="${DB_PATH:-$APP_DIR/server/fleshmarket.db}"
KEEP="${KEEP:-14}"

DATE=$(date +%Y-%m-%d_%H-%M-%S)
DEST="$BACKUP_DIR/fleshmarket_$DATE.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "[$(date)] ERROR: DB not found at $DB_PATH"
  echo "[$(date)] Set the correct path:  APP_DIR=/your/path ./deploy/backup.sh"
  exit 1
fi

# Prefer sqlite3 .backup (consistent hot copy). Fall back to cp if sqlite3 absent.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$DEST'"
else
  echo "[$(date)] WARN: sqlite3 not installed, using cp (less safe while live)"
  cp "$DB_PATH" "$DEST"
fi

SIZE=$(du -sh "$DEST" | cut -f1)
echo "[$(date)] Backup OK -> $DEST ($SIZE)"

# ── Rotation: keep the newest $KEEP, delete the rest ─────────────────────────
mapfile -t BACKUPS < <(ls -1 "$BACKUP_DIR"/fleshmarket_*.db 2>/dev/null | sort)
COUNT=${#BACKUPS[@]}
if [ "$COUNT" -gt "$KEEP" ]; then
  TO_DELETE=$(( COUNT - KEEP ))
  for ((i=0; i<TO_DELETE; i++)); do
    rm -f "${BACKUPS[$i]}"
    echo "[$(date)] Rotated out: ${BACKUPS[$i]}"
  done
fi

echo "[$(date)] Total backups in $BACKUP_DIR: $(ls -1 "$BACKUP_DIR"/fleshmarket_*.db 2>/dev/null | wc -l)"
