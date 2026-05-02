#!/usr/bin/env bash
# scripts/download-models.sh
# Download Whisper + Piper models for voice bugreport feature.
set -euo pipefail

echo "=== cipher-mux Voice Model Setup ==="
echo ""

# Whisper
WHISPER_DIR="$HOME/Library/Application Support/cipher-mux-electron/models/whisper"
WHISPER_MODEL="ggml-small.bin"
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER_MODEL"

if [ -f "$WHISPER_DIR/$WHISPER_MODEL" ]; then
  echo "[ok] Whisper model already exists: $WHISPER_DIR/$WHISPER_MODEL"
else
  echo "[dl] Downloading Whisper model ($WHISPER_MODEL)..."
  mkdir -p "$WHISPER_DIR"
  curl -L --progress-bar -o "$WHISPER_DIR/$WHISPER_MODEL" "$WHISPER_URL"
  echo "[ok] Whisper model downloaded"
fi

echo ""

# Piper (shared with cipher-desktop)
PIPER_DIR="$HOME/Library/Application Support/cipher-desktop/models/piper"
PIPER_VOICE="vits-piper-de_DE-dii-high"
PIPER_MODEL_DIR="$PIPER_DIR/$PIPER_VOICE"

if [ -d "$PIPER_MODEL_DIR" ] && ls "$PIPER_MODEL_DIR"/*.onnx 1>/dev/null 2>&1; then
  echo "[ok] Piper model already exists: $PIPER_MODEL_DIR"
else
  echo "[info] Piper model not found at: $PIPER_MODEL_DIR"
  echo "  If cipher-desktop is installed, the model may already exist."
  echo "  Otherwise, download manually from:"
  echo "  https://huggingface.co/rhasspy/piper-voices/tree/main/de/de_DE/dii/high"
  echo "  Place .onnx and tokens.txt in: $PIPER_MODEL_DIR/"
  mkdir -p "$PIPER_MODEL_DIR"
  echo "  Directory created."
fi

echo ""
echo "=== Setup Complete ==="
echo "Whisper: $WHISPER_DIR/$WHISPER_MODEL"
echo "Piper:   $PIPER_MODEL_DIR/"
