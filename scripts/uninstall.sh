#!/bin/bash
# cipher-mux — Nuclear Uninstall
# Removes EVERYTHING that cipher-mux brought to this machine:
# the app, all user data, tmux, Node.js, and Homebrew itself.
# Use this to simulate a fresh Mac for install testing.

set -euo pipefail

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   cipher-mux — Nuclear Uninstall             ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  This will remove EVERYTHING cipher-mux brought:"
echo ""
echo "    App & Data:"
echo "    • /Applications/cipher-mux.app"
echo "    • ~/.config/cipher-mux/          (entities, notes, config, models)"
echo "    • ~/Library/Application Support/cipher-mux-electron/"
echo "    • ~/Library/Caches/cipher-mux-electron/"
echo "    • ~/Library/Preferences/com.cipher.mux.plist"
echo "    • ~/Library/Saved Application State/com.cipher.mux.savedState/"
echo "    • ~/Library/Logs/cipher-mux-electron/"
echo "    • All cmux-* and cipher-mux-control tmux sessions"
echo ""
echo "    System Tools (installed by cipher-mux setup):"
echo "    • tmux"
echo "    • Node.js"
echo "    • Claude Code CLI"
echo "    • Homebrew itself (/opt/homebrew/)"
echo ""
echo "  ⚠ This is NUCLEAR. Homebrew and all brew-installed packages will be gone."
echo "  ⚠ If you use Homebrew for other things, Ctrl+C NOW."
echo ""
read -n 1 -s -r -p "  Press any key to continue (Ctrl+C to abort)..."
echo ""
echo ""

# ── 1. Kill tmux sessions ─────────────────────────────────────────────────
echo "  → Killing all cipher-mux tmux sessions..."
tmux kill-server 2>/dev/null || true
echo "  ✓ tmux server killed"

# ── 2. Kill the app ───────────────────────────────────────────────────────
echo "  → Quitting cipher-mux app..."
osascript -e 'quit app "cipher-mux"' 2>/dev/null || true
pkill -f "cipher-mux" 2>/dev/null || true
sleep 1
echo "  ✓ App stopped"

# ── 3. Remove app bundle ─────────────────────────────────────────────────
echo "  → Removing /Applications/cipher-mux.app..."
rm -rf /Applications/cipher-mux.app 2>/dev/null || sudo rm -rf /Applications/cipher-mux.app
echo "  ✓ App removed"

# ── 4. Remove config directory ────────────────────────────────────────────
echo "  → Removing ~/.config/cipher-mux/..."
rm -rf "$HOME/.config/cipher-mux"
echo "  ✓ Config removed"

# ── 5. Remove Electron userData ───────────────────────────────────────────
echo "  → Removing ~/Library/Application Support/cipher-mux-electron/..."
rm -rf "$HOME/Library/Application Support/cipher-mux-electron"
echo "  ✓ Application Support removed"

# ── 6. Remove caches ─────────────────────────────────────────────────────
echo "  → Removing caches..."
rm -rf "$HOME/Library/Caches/cipher-mux-electron"
rm -rf "$HOME/Library/Caches/com.cipher.mux"
rm -rf "$HOME/Library/Caches/com.cipher.mux.ShipIt"
echo "  ✓ Caches removed"

# ── 7. Remove preferences ────────────────────────────────────────────────
echo "  → Removing preferences..."
rm -f "$HOME/Library/Preferences/com.cipher.mux.plist"
defaults delete com.cipher.mux 2>/dev/null || true
echo "  ✓ Preferences removed"

# ── 8. Remove saved state ────────────────────────────────────────────────
echo "  → Removing saved application state..."
rm -rf "$HOME/Library/Saved Application State/com.cipher.mux.savedState"
echo "  ✓ Saved state removed"

# ── 9. Remove logs ───────────────────────────────────────────────────────
echo "  → Removing logs..."
rm -rf "$HOME/Library/Logs/cipher-mux-electron"
echo "  ✓ Logs removed"

# ── 10. Remove Claude Code CLI ───────────────────────────────────────────
echo "  → Removing Claude Code CLI..."
if command -v claude >/dev/null 2>&1; then
  # npm global install
  npm uninstall -g @anthropic-ai/claude-code 2>/dev/null || true
  # Native binary locations
  rm -f /usr/local/bin/claude 2>/dev/null || true
  rm -rf "$HOME/.claude" 2>/dev/null || true
  echo "  ✓ Claude Code removed"
else
  echo "  ✓ Claude Code not found (already clean)"
fi

# ── 11. Remove tmux ──────────────────────────────────────────────────────
echo "  → Removing tmux..."
if command -v brew >/dev/null 2>&1; then
  brew uninstall tmux 2>/dev/null || true
fi
echo "  ✓ tmux removed"

# ── 12. Remove Node.js ───────────────────────────────────────────────────
echo "  → Removing Node.js..."
if command -v brew >/dev/null 2>&1; then
  brew uninstall --force node 2>/dev/null || true
  brew uninstall --force node@22 node@20 node@18 2>/dev/null || true
fi
# Clean up npm caches and global dir
rm -rf "$HOME/.npm" 2>/dev/null || true
rm -rf "$HOME/.node-gyp" 2>/dev/null || true
echo "  ✓ Node.js removed"

# ── 13. Remove Homebrew ──────────────────────────────────────────────────
echo "  → Removing Homebrew (this takes a moment)..."
if command -v brew >/dev/null 2>&1; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)" -- --force 2>/dev/null || true
  # Clean up leftover dirs
  sudo rm -rf /opt/homebrew 2>/dev/null || true
  sudo rm -rf /usr/local/Homebrew 2>/dev/null || true
  sudo rm -rf /usr/local/Caskroom 2>/dev/null || true
  echo "  ✓ Homebrew removed"
else
  echo "  ✓ Homebrew not found (already clean)"
fi

# ── 14. Remove /tmp leftovers ────────────────────────────────────────────
echo "  → Cleaning /tmp/cipher-mux/..."
rm -rf /tmp/cipher-mux 2>/dev/null || true
echo "  ✓ Temp files removed"

echo ""
echo "  ══════════════════════════════════════════════"
echo "  ✓ Nuclear uninstall complete."
echo "  "
echo "  Removed: cipher-mux, config, notes, models,"
echo "           Claude Code, tmux, Node.js, Homebrew."
echo "  "
echo "  This machine is clean. Ready for fresh install test."
echo "  ══════════════════════════════════════════════"
echo ""
