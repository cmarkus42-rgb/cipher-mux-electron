# Linux Notes

cipher-mux runs on Linux as an AppImage. Most features work identically to macOS. This document covers known differences and limitations.

## Requirements

- **tmux** — `sudo apt install tmux` (or equivalent for your distro)
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **Node.js** >= 18 (for development builds)

## Known Limitations

### Global Hotkeys on Wayland

Electron's global shortcut API has limited support on Wayland compositors. In-app keyboard shortcuts work normally, but system-wide hotkeys (e.g., global push-to-talk) may not register.

**Workaround:** Use X11 session or configure Wayland-specific keybinding tools (e.g., `wtype`, compositor-specific config) to send keypresses to the cipher-mux window.

### Voice Input / Audio

Voice input (Whisper STT, Silero VAD) requires a working audio backend:

- **PulseAudio** — works out of the box
- **PipeWire** — works via PulseAudio compatibility layer (usually enabled by default on modern distros)
- **ALSA only** — may require additional configuration

The Piper TTS engine requires platform-specific sherpa-onnx binaries. If the optional `sherpa-onnx-node` dependency fails to install, voice features will be unavailable but the rest of the app works normally.

### File Open Dialog

On macOS, review files open in CotEditor. On Linux, `xdg-open` is used instead, which opens the file in your default text editor.

### AppImage Notes

- The AppImage is self-contained. No system-level installation required.
- To integrate with your desktop environment, use `AppImageLauncher` or manually create a `.desktop` file.
- If the AppImage fails to start, ensure FUSE is available: `sudo apt install libfuse2` (Ubuntu 22.04+).

## Building from Source

```bash
git clone https://github.com/cmarkus42/cipher-mux-electron.git
cd cipher-mux-electron
npm install
npm run dev          # Development mode
npm run dist:linux   # Build AppImage
```

The AppImage output is written to `out/`.

## Tested Distributions

- Ubuntu 22.04 LTS (primary target)
- Ubuntu 24.04 LTS
- Fedora 39+
- Arch Linux (rolling)

Other distributions with tmux and Node.js 18+ should work but are not actively tested.
