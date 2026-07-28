#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups/live-rollback-v47-2026-07-28"

cp "$BACKUP_DIR/public/index.html" "$ROOT_DIR/public/index.html"
cp "$BACKUP_DIR/api/quote.js" "$ROOT_DIR/api/quote.js"
cp "$BACKUP_DIR/server.js" "$ROOT_DIR/server.js"

echo "Restored v47 from $BACKUP_DIR"