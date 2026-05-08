#!/bin/bash
# scripts/copy-voice-model.sh — Copy cipher_adult voice model to assets for bundling
set -e

VOICE_NAME="vits-piper-de_DE-cipher_adult-medium"
SRC_DIR="$HOME/Library/Application Support/cipher-mux-electron/models/piper/$VOICE_NAME"
DEST_DIR="assets/voices/$VOICE_NAME"

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: Source model not found: $SRC_DIR"
  echo "Install the cipher_adult voice model first."
  exit 1
fi

echo "Copying voice model to $DEST_DIR..."
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

cp "$SRC_DIR/model.onnx" "$DEST_DIR/"
cp "$SRC_DIR/model.onnx.json" "$DEST_DIR/"
cp "$SRC_DIR/tokens.txt" "$DEST_DIR/"
cp -R "$SRC_DIR/espeak-ng-data" "$DEST_DIR/"

echo "Voice model copied ($(du -sh "$DEST_DIR" | cut -f1))"
