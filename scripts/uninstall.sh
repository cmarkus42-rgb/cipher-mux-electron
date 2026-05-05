#!/bin/bash
# cipher-mux — Complete Uninstall
# Removes the app and ALL user data, config, models, databases.
# Run this to get a clean slate for fresh-install testing.

set -euo pipefail

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   cipher-mux — Complete Uninstall        ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  This will remove:"
echo "    • /Applications/cipher-mux.app"
echo "    • ~/.config/cipher-mux/          (entities, notes, config, models)"
echo "    • ~/Library/Application Support/cipher-mux-electron/ (Electron userData, Piper models)"
echo "    • ~/Library/Caches/cipher-mux-electron/"
echo "    • ~/Library/Preferences/com.cipher.mux.plist"
echo "    • ~/Library/Saved Application State/com.cipher.mux.savedState/"
echo "    • ~/Library/Logs/cipher-mux-electron/"
echo "    • tmux sessions (cmux-*)"
echo ""
echo "  ⚠ This is irreversible. Notes, memories, and config will be gone."
echo ""
read -n 1 -s -r -p "  Press any key to continue (Ctrl+C to abort)..."
echo ""
echo ""

# 1. Kill running tmux sessions
echo "  → Killing cipher-mux tmux sessions..."
tmux list-sessions 2>/dev/null | grep "^cmux-" | cut -d: -f1 | while read session; do
  tmux kill-session -t "$session" 2>/dev/null && echo "    killed: $session"
done || true
echo "  ✓ tmux sessions cleaned"

# 2. Kill the app if running
echo "  → Quitting cipher-mux app..."
pkill -f "cipher-mux" 2>/dev/null || true
sleep 1
echo "  ✓ App stopped"

# 3. Remove the app bundle
echo "  → Removing /Applications/cipher-mux.app..."
rm -rf /Applications/cipher-mux.app 2>/dev/null || sudo rm -rf /Applications/cipher-mux.app
echo "  ✓ App removed"

# 4. Remove config directory (~/.config/cipher-mux/)
#    Contains: entities/, notes/, models/whisper/, global-rules.md,
#    cipher-mux-config.json, companion.db, messages.db, etc.
echo "  → Removing ~/.config/cipher-mux/..."
rm -rf "$HOME/.config/cipher-mux"
echo "  ✓ Config removed"

# 5. Remove Electron userData (~/Library/Application Support/cipher-mux-electron/)
#    Contains: Piper models, Electron internal state, logs
echo "  → Removing ~/Library/Application Support/cipher-mux-electron/..."
rm -rf "$HOME/Library/Application Support/cipher-mux-electron"
echo "  ✓ Application Support removed"

# 6. Remove caches
echo "  → Removing caches..."
rm -rf "$HOME/Library/Caches/cipher-mux-electron"
rm -rf "$HOME/Library/Caches/com.cipher.mux"
rm -rf "$HOME/Library/Caches/com.cipher.mux.ShipIt"
echo "  ✓ Caches removed"

# 7. Remove preferences
echo "  → Removing preferences..."
rm -f "$HOME/Library/Preferences/com.cipher.mux.plist"
defaults delete com.cipher.mux 2>/dev/null || true
echo "  ✓ Preferences removed"

# 8. Remove saved state
echo "  → Removing saved application state..."
rm -rf "$HOME/Library/Saved Application State/com.cipher.mux.savedState"
echo "  ✓ Saved state removed"

# 9. Remove logs
echo "  → Removing logs..."
rm -rf "$HOME/Library/Logs/cipher-mux-electron"
echo "  ✓ Logs removed"

echo ""
echo "  ══════════════════════════════════════════"
echo "  ✓ cipher-mux completely uninstalled."
echo "  "
echo "  NOT removed (system tools, still useful):"
echo "    • Homebrew    (/opt/homebrew/)"
echo "    • tmux        (brew uninstall tmux)"
echo "    • Node.js     (brew uninstall node)"
echo "    • Whisper/Piper models were inside ~/.config/cipher-mux/ → gone"
echo "  ══════════════════════════════════════════"
echo ""
