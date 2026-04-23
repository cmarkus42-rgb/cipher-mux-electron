<p align="center">
  <img src="assets/banner.svg" alt="cipher-mux — terminal cockpit for parallel Claude Code sessions" width="100%">
</p>

<p align="center">
  <b>A terminal cockpit for parallel Claude Code sessions.</b><br>
  Voice input · Pluggable agent adapters · SQLite message bus · MCP server.
</p>

<p align="center">
  <a href="https://github.com/cmarkus42/cipher-mux-electron/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/cmarkus42/cipher-mux-electron/ci.yml?branch=main&label=CI&style=flat-square&labelColor=000000&color=F5F5EC"></a>
  <a href="https://github.com/cmarkus42/cipher-mux-electron/releases"><img alt="Version" src="https://img.shields.io/badge/version-0.8.3--beta-0088A0?style=flat-square&labelColor=000000"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-F5F5EC?style=flat-square&labelColor=000000"></a>
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-F5F5EC?style=flat-square&labelColor=000000"></a>
  <a href="CONTRIBUTING.md#maintenance-status"><img alt="Maintenance" src="https://img.shields.io/badge/maintenance-active-00FF88?style=flat-square&labelColor=000000"></a>
</p>

---

<!--
  SCREENSHOT BLOCK — activate by:
  1. Saving your screenshot as `assets/screenshots/main.png` (2560×1600 or 1920×1200).
  2. Deleting this HTML comment and the two `--` markers around the block below.

  <p align="center">
    <img src="assets/screenshots/main.png" alt="cipher-mux main window — orchestrator pane, chatroom, bug report outbox" width="100%">
  </p>

  <p align="center"><i>Main window — orchestrator pane on the left, session grid in the middle, chatroom panel on the right.</i></p>

  ---
-->


## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [How It Compares](#how-it-compares)
- [FAQ](#faq)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Background

cipher-mux orchestrates multiple Claude Code CLI sessions in embedded tmux panes inside an Electron window. It ships its own MCP server, a SQLite-backed message bus for inter-session communication, voice input for prompts, a task outbox for structured delegation, and a unified project launcher UX. Sessions share context through the message bus; an orchestrator session can delegate work across workers via MCP tools.

The primary audience is developers who run multiple parallel Claude Code sessions and want to eliminate the manual coordination overhead. You should be comfortable with tmux and use Claude Code daily. macOS and Linux are supported; Windows is not planned for v1.

cipher-mux is **not** an editor, not an IDE plugin, not a multi-LLM router, and not an autonomous agent platform. It is a cockpit: you see your sessions, you talk to them, you coordinate them. An Aider adapter is available as a Tier-2 integration with visibly reduced features (no context usage display, no MCP participation, no message bus) - details in the [FAQ](#faq). The full feature set is built for Claude Code.

## Install

### macOS (DMG)

Download the latest `.dmg` from [Releases](https://github.com/cmarkus42/cipher-mux-electron/releases), mount it, drag `cipher-mux.app` to Applications.

**Requirements:** tmux (`brew install tmux`), Claude Code CLI (`npm install -g @anthropic-ai/claude-code`).

### Linux (AppImage)

Download the latest `.AppImage` from [Releases](https://github.com/cmarkus42/cipher-mux-electron/releases), make it executable:

```bash
chmod +x cipher-mux-*.AppImage
./cipher-mux-*.AppImage
```

**Requirements:** tmux (`sudo apt install tmux`), Claude Code CLI.

**Known limitations:** Global hotkeys may not work on Wayland. Voice input requires PulseAudio or PipeWire. See [docs/linux-notes.md](docs/linux-notes.md) for details.

### Development Setup

```bash
git clone https://github.com/cmarkus42/cipher-mux-electron.git
cd cipher-mux
npm install
npm run dev
```

This starts the TypeScript compiler in watch mode and the Vite dev server concurrently. The Electron window opens with hot-reload for the renderer.

```bash
npm run build     # Full production build
npm run test      # Run test suite
npm run lint      # ESLint
npm run dist      # Package as DMG (macOS) or AppImage (Linux)
```

## Usage

> **Walkthrough:** See [docs/HOWTO.md](docs/HOWTO.md) for a hands-on first-run guide (install → first project → orchestrator → first delegation → voice bug report). The section below is a feature overview; the How-To is the narrative version.

### The Grid

The main window shows a grid of terminal panes - each one is a Claude Code session running inside tmux. Click a cell to focus it. The activity rail on the left shows session status, unread messages, and context usage at a glance.

### Starting Sessions

Use the **+** button or the project launcher to start new sessions. The launcher scans your configured project directories, shows available projects, and can kick off sessions with pre-configured instructions.

### Orchestrator

The orchestrator is a dedicated Claude Code session with access to MCP tools (`mux_create_session`, `mux_send`, `mux_read`, `mux_status`, etc.). It can spawn worker sessions, delegate tasks, and coordinate multi-project work. Start it from the activity rail.

### Voice Input

Toggle voice input (bottom-left) to dictate prompts into the focused session. Uses local Whisper for speech-to-text. Push-to-talk by default. The voice pipeline also powers the bug report interview flow - speak a bug report and the system extracts structured data via a local LLM.

### Task Outbox

Capture tasks via voice interview, chatroom, or hotkey. Tasks are stored in SQLite and can be triaged by the orchestrator on your command ("check for bug reports"). The orchestrator reads the outbox, assigns tasks to sessions, and tracks completion.

### Message Bus

Sessions communicate through a SQLite message bus. The chatroom panel shows inter-session messages. The MCP server exposes this as `mux_send` / `mux_read` tools, enabling the orchestrator to coordinate workers without terminal scraping.

## How It Compares

cipher-mux occupies a specific niche. Here is how it relates to similar tools:

| Tool | Focus | Key difference |
|------|-------|---------------|
| **Claude Squad / CCManager** | Terminal-native session multiplexing | Minimalist, no GUI. If you want terminal-only and no overhead, those are the better choice. cipher-mux adds MCP server, voice input, task outbox, and structured orchestration. |
| **Conductor / Nimbalyst** | Polished Mac apps | Commercial, no tmux dependency. If you want a polished Mac-native experience without tmux, look there. |
| **agtx** | OSS orchestrator with Kanban | Closest in the OSS space. Has an orchestrator agent concept and task board. cipher-mux adds Electron UI, voice, and MCP server; agtx goes further on agent delegation. |

All of these are valid choices. Pick what fits your workflow.

## FAQ

### Why does an Aider session look different from a Claude Code session?

Aider is integrated as a **Tier-2 adapter** with intentionally reduced features. Aider sessions show no context percentage (Aider does not report token usage), no message bus badge (Aider has no MCP support), and the orchestrator delegates to Aider via `send_keys` instead of MCP tools. This is not a bug - it is the honest representation of what Aider can and cannot do.

The features that define cipher-mux (message bus, MCP integration, context usage display) are built for Claude Code. If you primarily use Aider, plain `tmux` plus `git worktree` or tools like Claude Squad are more pragmatic.

| Capability | Claude Code | Aider |
|-----------|-------------|-------|
| MCP injection | Yes | No |
| Real-time context usage | Yes | No |
| Skip-permissions mode | Yes | Yes (`--yes`) |
| Message bus participation | Yes | No |
| Project instructions | `CLAUDE.md` | `.aider.conf.yml` / `AGENTS.md` |

### What models does Aider use?

Aider brings its own model configuration. You can run it against local models via Ollama (e.g., Qwen2.5-Coder-32B) - no quality guarantee from cipher-mux's side. Configure Aider's model settings in `.aider.conf.yml` in your project.

### Does cipher-mux work on Linux?

Yes, as AppImage. tmux is required. Known limitations exist for Wayland (global hotkeys) and audio backends (voice input needs PulseAudio or PipeWire). See [docs/linux-notes.md](docs/linux-notes.md).

### Can I write my own adapter?

Yes. See [CONTRIBUTING.md](CONTRIBUTING.md#writing-an-adapter) and the reference stub at `src/main/agent/adapters/_reference-stub.ts`. The [adapter test protocol](docs/contributing/adapter-test-protocol.md) describes the weekend-test workflow for validating a new adapter.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full architecture overview, module map, and contributor entry points.

**Stack:** Electron 34, Preact, Vite, TypeScript (strict), xterm.js (WebGL + Canvas fallback), better-sqlite3 (WAL mode), MCP SDK, tmux Control Mode.

**Key modules:**

```
src/main/          — Electron main process
  tmux/            — TmuxManager, Control Mode parser, output batcher
  message-bus/     — SQLite CRUD, schema, typed messages
  mcp/             — Streamable HTTP MCP server, tools, auth
  session/         — SessionManager, recovery, orchestrator template
  voice/           — Whisper STT, Piper TTS, Silero VAD, interview engine
  task/            — Task state machine, watcher, hooks, MCP tools
src/renderer/      — Preact UI
  components/      — Grid, TerminalPane, ActivityRail, Chatroom, Cockpit
  hooks/           — useTerminal, useSessions, useMessages, useGrid, ...
src/shared/        — Typed IPC channels, domain types, constants
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, test execution, commit conventions, and the PR checklist.

**Maintenance status: active.** This tool is maintained by a single developer as an open-source side project. See CONTRIBUTING.md for the maintenance mode policy.

## Security

Found a vulnerability? Please do not open a public issue. See [SECURITY.md](SECURITY.md) for the private reporting channel and expected timelines.

## License

[MIT](LICENSE) · Copyright (c) 2026 Christian Markus and cipher-mux contributors.

Third-party licenses listed in [NOTICE](NOTICE). Bundled fonts (Rajdhani, Fira Code) use the SIL Open Font License 1.1.
