#!/bin/bash
# scripts/copy-voice-model.sh — Copy bundled voice models to assets for bundling
set -e

copy_voice() {
  local VOICE_NAME="$1"
  local ONNX_NAME="$2"  # original .onnx filename (may differ from model.onnx)
  local SRC_DIR="$HOME/.config/cipher-mux/models/piper/$VOICE_NAME"
  local DEST_DIR="assets/voices/$VOICE_NAME"

  if [ ! -d "$SRC_DIR" ]; then
    echo "ERROR: Source model not found: $SRC_DIR"
    echo "Install the voice model first."
    exit 1
  fi

  echo "Copying $VOICE_NAME to $DEST_DIR..."
  rm -rf "$DEST_DIR"
  mkdir -p "$DEST_DIR"

  # Normalize to model.onnx for consistent local naming
  if [ -f "$SRC_DIR/model.onnx" ]; then
    cp "$SRC_DIR/model.onnx" "$DEST_DIR/model.onnx"
    cp "$SRC_DIR/model.onnx.json" "$DEST_DIR/model.onnx.json"
  elif [ -f "$SRC_DIR/$ONNX_NAME.onnx" ]; then
    cp "$SRC_DIR/$ONNX_NAME.onnx" "$DEST_DIR/model.onnx"
    cp "$SRC_DIR/$ONNX_NAME.onnx.json" "$DEST_DIR/model.onnx.json"
  else
    echo "ERROR: No .onnx file found in $SRC_DIR"
    exit 1
  fi

  [ -f "$SRC_DIR/tokens.txt" ] && cp "$SRC_DIR/tokens.txt" "$DEST_DIR/"
  [ -d "$SRC_DIR/espeak-ng-data" ] && cp -R "$SRC_DIR/espeak-ng-data" "$DEST_DIR/"

  echo "  Done ($(du -sh "$DEST_DIR" | cut -f1))"
}

copy_voice "vits-piper-de_DE-cipher_adult-medium" "de_DE-cipher_adult-medium"
copy_voice "vits-piper-de_DE-dii-high" "de_DE-dii-high"

echo "All bundled voices copied."
