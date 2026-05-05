#!/bin/bash
# cipher-mux Installer
# Double-click this file to install cipher-mux to /Applications.

clear
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       cipher-mux — Installer         ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Find the DMG volume (this script lives inside it)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="cipher-mux.app"
APP_SRC="$SCRIPT_DIR/$APP_NAME"
APP_DEST="/Applications/$APP_NAME"

if [ ! -d "$APP_SRC" ]; then
  echo "  ✗ $APP_NAME not found next to this script."
  echo "    Make sure you opened the DMG first."
  echo ""
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi

echo "  This will:"
echo "    1. Copy $APP_NAME to /Applications"
echo "    2. Remove the macOS quarantine flag (xattr -cr)"
echo "       → Without this, macOS blocks unsigned apps."
echo ""

# Check if already installed
if [ -d "$APP_DEST" ]; then
  echo "  ⚠ $APP_NAME already exists in /Applications."
  echo "    It will be replaced with this version."
  echo ""
fi

read -n 1 -s -r -p "  Press any key to install (or Ctrl+C to cancel)..."
echo ""
echo ""

# Copy app
echo "  → Copying to /Applications..."
if cp -R "$APP_SRC" /Applications/ 2>/dev/null; then
  echo "  ✓ Copied."
else
  echo "  → Needs admin permission..."
  sudo cp -R "$APP_SRC" /Applications/
  if [ $? -ne 0 ]; then
    echo "  ✗ Copy failed."
    read -n 1 -s -r -p "  Press any key to close."
    exit 1
  fi
  echo "  ✓ Copied."
fi

# Remove quarantine
echo "  → Removing quarantine flag..."
xattr -cr "$APP_DEST" 2>/dev/null
echo "  ✓ Quarantine removed."

echo ""
echo "  ══════════════════════════════════════"
echo "  ✓ Installation complete!"
echo "  "
echo "  You can now start cipher-mux from"
echo "  Applications or Spotlight."
echo "  ══════════════════════════════════════"
echo ""
read -n 1 -s -r -p "  Press any key to close."
