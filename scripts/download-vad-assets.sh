#!/bin/bash
# Download VAD assets for voice pipeline
# Source: vorgaenger-app or npm @ricky0123/vad-web

set -e
ASSETS_DIR="src/renderer/public/vad-assets"

if [ -f "$ASSETS_DIR/silero_vad_legacy.onnx" ]; then
  echo "VAD assets already present in $ASSETS_DIR"
  exit 0
fi

vorgaenger-app="~/projects/vorgaenger-app/src/renderer/shared/vad-assets"

if [ -d "$vorgaenger-app" ]; then
  echo "Copying VAD assets from vorgaenger-app..."
  mkdir -p "$ASSETS_DIR"
  cp "$vorgaenger-app"/* "$ASSETS_DIR/"
  echo "Done. Assets in $ASSETS_DIR"
else
  echo "ERROR: vorgaenger-app VAD assets not found at $vorgaenger-app"
  echo "Please install @ricky0123/vad-web and copy assets manually."
  exit 1
fi
