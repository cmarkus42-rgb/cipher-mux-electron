# Screenshots

This folder holds visual assets referenced from the repo README and the How-To.

## Required

| File | Used in | Notes |
|------|---------|-------|
| `main.png` | README, HOWTO | Main window with orchestrator pane + session grid + chatroom panel. Recommended 2560×1600 or 1920×1200. |
| `orchestrator.png` | HOWTO § "Start the orchestrator" | Close-up of the orchestrator session with a `mux_*` tool call visible. |
| `cockpit.png` | HOWTO § "Project launcher" | Cockpit/Kickoff view with project cards. |
| `voice-bugreport.png` | HOWTO § "Voice bug reports" | The voice interview overlay or the resulting bug report entry. |

## Conventions

- PNG preferred over JPG. Transparent background where it helps.
- macOS screenshots: use `⌘⇧4` with Space-bar window capture for the Electron window (keeps the rounded corners and shadow). Strip personal paths before committing.
- Linux screenshots: `grim -g "$(slurp)"` (Wayland) or `gnome-screenshot -w` (X11).
- Light theme (Ivory) is preferred for the main banner screenshot since it reads better against GitHub's dark-mode README rendering. Dark theme shots go into the HOW-TO where the context calls for it.
- Maximum file size ~500 KB per image; run through `pngquant --quality=75-90` before committing.

## Brand mark vs. app icon

- `/cipher-mux-icon.png` (repo root) — large 1024×1024 app icon, also in `/assets/icon.png` and `/assets/icon.icns`.
- `/assets/banner.svg` — the wordmark banner rendered in the README top.
- The brand mark (monochrome lock + circuit traces, without the terminal window) is used in sparse contexts: favicon, social preview, About dialog. If you add a standalone brand mark, put it here as `brand-mark.svg` / `brand-mark.png`.
