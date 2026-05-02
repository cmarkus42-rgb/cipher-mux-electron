#!/usr/bin/env bash
# backup-cipher-mux-state.sh — Backup ConfigStore + SQLite DBs
# Usage: ./scripts/backup-cipher-mux-state.sh [--target <dir>]
#
# Defaults to ~/cipher-mux-backups/YYYY-MM-DD if no --target given.

set -euo pipefail

CONFIG_DIR="$HOME/.config/cipher-mux"
TARGET=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --target) TARGET="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  TARGET="$HOME/cipher-mux-backups/$(date +%Y-%m-%d)"
fi

mkdir -p "$TARGET"

echo "Backing up cipher-mux state to: $TARGET"

# ConfigStore (JSON)
if [[ -f "$CONFIG_DIR/config.json" ]]; then
  cp "$CONFIG_DIR/config.json" "$TARGET/config.json"
  echo "  config.json"
fi

# SQLite databases
for db in "$CONFIG_DIR"/*.db "$CONFIG_DIR"/*.sqlite; do
  if [[ -f "$db" ]]; then
    cp "$db" "$TARGET/$(basename "$db")"
    echo "  $(basename "$db")"
  fi
done

# WAL files (if any)
for wal in "$CONFIG_DIR"/*.db-wal "$CONFIG_DIR"/*.sqlite-wal; do
  if [[ -f "$wal" ]]; then
    cp "$wal" "$TARGET/$(basename "$wal")"
    echo "  $(basename "$wal")"
  fi
done

# Notes directory (lightweight copy of metadata)
if [[ -d "$CONFIG_DIR/notes" ]]; then
  mkdir -p "$TARGET/notes"
  cp "$CONFIG_DIR/notes"/*.md "$TARGET/notes/" 2>/dev/null || true
  echo "  notes/ ($(ls "$TARGET/notes/" 2>/dev/null | wc -l | tr -d ' ') files)"
fi

echo ""
echo "Backup complete: $TARGET"
echo "Restore: cp $TARGET/* $CONFIG_DIR/"
ls -lh "$TARGET/"
