# Security Policy

## Supported Versions

cipher-mux is pre-1.0 and ships from a single maintained branch. Only the latest release receives security fixes.

| Version | Supported |
|---------|-----------|
| `0.9.x` (current beta) | Yes |
| `< 0.9.0`              | No  |

When 1.0 ships, this table will change to cover the last two minor versions.

## Reporting a Vulnerability

**Do not open a public issue for security problems.**

Send a private report to:

- **Email:** `cmarkus42+cipher-mux-security@googlemail.com`
- **Subject prefix:** `[SECURITY]`
- Optional: GPG key on request

Include, as much as you can:

- affected version (output of `cipher-mux --version` or the git SHA from the About dialog)
- operating system and tmux version
- reproduction steps
- impact you observed
- whether the issue is already public anywhere

### What to expect

This is an open-source side project maintained by one person. I aim for the following, without contractual guarantees:

| Step | Target |
|------|--------|
| Acknowledge receipt | within 72 hours |
| Initial assessment  | within 7 days |
| Fix or mitigation   | depends on severity; critical issues prioritized |
| Public disclosure   | coordinated after a fix is available |

If you do not hear back within 7 days, please send a follow-up. Mail can get lost.

## Scope

In scope:

- the Electron app (`src/main`, `src/renderer`, `src/shared`)
- the bundled MCP server (`src/main/mcp`)
- the message bus and task outbox storage layer
- the voice pipeline (STT, TTS, VAD)
- release artifacts (DMG, AppImage)

Out of scope:

- third-party dependencies listed in `NOTICE` — report those upstream
- Claude Code CLI itself — report to Anthropic
- tmux, Node.js, Electron, or OS-level issues — report to those projects

## Hardening Notes (context for reporters)

cipher-mux runs locally. It does not connect to remote services by default except:

- Claude Code sessions reach Anthropic's API (not via cipher-mux)
- the MCP server binds to `127.0.0.1:3100` (configurable) with bearer-token auth; the token is generated on first run and persisted in the app config so that spawned Claude Code sessions can reconnect across restarts

Electron is configured with `contextIsolation: true`, `nodeIntegration: false`, and a minimal `contextBridge` surface (`window.cipherMux`). The renderer never touches Node APIs directly.

`sandbox: false` is required because the preload script uses Node.js APIs (`ipcRenderer`, `webUtils`) that are unavailable in a sandboxed renderer. The combination of contextIsolation + no nodeIntegration ensures the renderer cannot access Node directly — the preload bridge is the only surface.

SQLite databases live under the user's application data directory and are not shared between users on the same machine.

## Credit

Reporters who follow coordinated disclosure are credited in `CHANGELOG.md` under a `Security` section (opt-out on request).
