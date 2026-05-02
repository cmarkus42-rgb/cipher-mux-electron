#!/bin/bash
# Download VAD assets for voice pipeline
# Source: cipher-desktop or npm @ricky0123/vad-web

set -e
ASSETS_DIR="src/renderer/public/vad-assets"

if [ -f "$ASSETS_DIR/silero_vad_legacy.onnx" ]; then
  echo "VAD assets already present in $ASSETS_DIR"
  exit 0
fi

CIPHER_DESKTOP="/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-desktop-electron/src/renderer/shared/vad-assets"

if [ -d "$CIPHER_DESKTOP" ]; then
  echo "Copying VAD assets from cipher-desktop..."
  mkdir -p "$ASSETS_DIR"
  cp "$CIPHER_DESKTOP"/* "$ASSETS_DIR/"
  echo "Done. Assets in $ASSETS_DIR"
else
  echo "ERROR: cipher-desktop VAD assets not found at $CIPHER_DESKTOP"
  echo "Please install @ricky0123/vad-web and copy assets manually."
  exit 1
fi
