#!/bin/bash
# cutover-rollback.sh — Reverts Cyber Factory Cutover (Welle 5)
#
# Usage: scripts/cutover-rollback.sh [--dry-run]
#
# Runs the migration script in reverse mode, restoring MPO/Watchdog naming.
# After running, restart cipher-mux for changes to take effect.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Cyber Factory Cutover ROLLBACK ==="
echo ""

EXTRA_ARGS=""
if [[ "${1:-}" == "--dry-run" ]]; then
  EXTRA_ARGS="--dry-run"
fi

npx tsx "$SCRIPT_DIR/migrate-to-cyber-factory.ts" --reverse $EXTRA_ARGS

echo ""
echo "Rollback complete. Restart cipher-mux to apply."
