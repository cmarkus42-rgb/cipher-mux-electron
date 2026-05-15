# How-To — cipher-mux from Zero to First Delegation

This is the narrative walkthrough. If you already know the tool and just need reference, read the feature overview in the [README](../README.md#usage) or the architecture doc in [ARCHITECTURE.md](../ARCHITECTURE.md).

Audience: a developer who uses Claude Code daily, is comfortable with tmux, and has never opened cipher-mux before. Expected time from a fresh install to a running orchestrator delegation: **15–25 minutes**.

---

## Table of Contents

1. [Before you start](#before-you-start)
2. [Install](#install)
3. [First launch](#first-launch)
4. [Start your first session](#start-your-first-session)
5. [Start the orchestrator](#start-the-orchestrator)
6. [Your first delegation](#your-first-delegation)
7. [Voice input](#voice-input)
8. [Notes editor](#notes-editor)
9. [The task outbox](#the-task-outbox)
10. [Keyboard shortcuts](#keyboard-shortcuts)
11. [Troubleshooting](#troubleshooting)
12. [Next steps](#next-steps)

---

## Before you start

cipher-mux is glue. It does not replace Claude Code, tmux, or your editor. Make sure the pieces below are in place.

### Required

- **Node.js ≥ 18** — `node --version`
- **tmux** — `tmux -V` (any version ≥ 3.2 works)
  - macOS: `brew install tmux`
  - Linux: `sudo apt install tmux` (Debian/Ubuntu) or equivalent
- **Claude Code CLI** — `claude --version`
  - `npm install -g @anthropic-ai/claude-code`
  - Run `claude login` once before using cipher-mux so the CLI is authenticated.

### Optional

- **Ollama** with a small instruction-tuned model (e.g. `llama3.2:3b` or `qwen2.5:7b`) if you want the Ollama-enriched bug-report interview. Without Ollama, voice bug reports still work but skip the enrichment step.
- **git** with working SSH for cloning into projects.

If any of those are missing, cipher-mux will tell you on first launch (a dependency-check runs at startup).

---

## Install

### macOS (DMG)

1. Download the latest `.dmg` from [Releases](https://github.com/cmarkus42/cipher-mux-electron/releases).
2. Mount it. Drag `cipher-mux.app` into Applications.
3. First open: right-click the app → **Open** (Gatekeeper needs this once for unsigned beta builds).

### Linux (AppImage)

```bash
chmod +x cipher-mux-*.AppImage
./cipher-mux-*.AppImage
```

If you see `libfuse` errors on Ubuntu 22.04+: `sudo apt install libfuse2`.

For desktop integration (icon, menu entry), install [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or write a `.desktop` file manually.

### Development build (any platform)

```bash
git clone https://github.com/cmarkus42/cipher-mux-electron.git
cd cipher-mux-electron
npm install
npm run dev
```

`npm run dev` runs TypeScript in watch mode and Vite dev server concurrently. The Electron window opens with hot-reload for the renderer.

---

## First launch

On first start, cipher-mux does three things:

1. **Dependency check** — verifies `tmux` and `claude` are on your `PATH`.
2. **Creates the app data directory** — `~/.config/cipher-mux/` on Linux and macOS. Config file `config.json`, SQLite databases (`messages.db`, `tasks.db`), and the bugreport outbox live here.
3. **Starts the MCP server** — on `127.0.0.1:3100` (configurable) with a bearer token. The token is generated on first run and stored in `config.json` so that spawned sessions reconnect across restarts. Treat `config.json` like a credential file.

You land in the **cockpit view**: an empty grid with launcher cells, the activity rail on the far left, and the sidebar on the right.

### Hub setup (first launch only)

On first launch, cipher-mux asks you to choose a **Hub directory** — the central folder for all your projects. The default suggestion is `~/cipher-mux/`. After confirming, the app creates the folder (with a `projects/` subfolder) and remembers the path. This dialog appears only once.

---

## Start your first session

Click a launcher cell in the grid, switch to the **Path** tab, and pick a project folder. The folder picker opens in your Hub's `projects/` directory by default. Behind the scenes:

1. cipher-mux creates a tmux session named `cipher-mux-<ulid>`.
2. It spawns a pane inside that session running `claude` with the project directory as CWD.
3. It injects the MCP server URL and bearer token via a `statusLine` hook so Claude Code reports context usage back.
4. The session is placed into the next free cell on the grid.

You should now see a live Claude Code prompt inside an Electron pane. The top-left corner of the pane shows session name, status dot, and context usage (`12% / 180k`). If the context percentage shows `—`, that session's adapter does not report usage (Aider sessions always show `—`).

To switch focus between panes: click. Most navigation in cipher-mux is mouse-driven by design — see [Keyboard shortcuts](#keyboard-shortcuts) for the small set of reserved hotkeys.

---

## Start the orchestrator

The orchestrator is **just another Claude Code session**, with two differences:

- it has access to the `mux_*` MCP tools (`mux_create_session`, `mux_send`, `mux_read`, `mux_status`, `mux_context_usage`, `mux_task_*`);
- it starts with a structured `CLAUDE.md` template that describes how to coordinate workers (see [ADR-008](decisions/ADR-008-orchestrator-template.md)).

**Launch it:**

- Activity rail → **Orchestrator** icon → **Start**.
- On first launch, cipher-mux generates `~/.config/cipher-mux/orchestrator/CLAUDE.md` from the template. You can edit it later; your changes survive upgrades.

The orchestrator lands in its own pane, marked with a green tag in the activity rail. It announces its MCP tool set on startup.

**Verify it works:** type `list my active sessions` into the orchestrator prompt. It should call `mux_status` and return a JSON blob describing all sessions. If it instead tries to run a shell command, the MCP tools are not reaching it — check the MCP server log in the Info/Help tab.

---

## Your first delegation

A realistic first workflow: spawn a worker, hand it a task, watch the chatroom.

1. In the orchestrator pane, type:

   ```
   Create a new session for the project at ~/code/my-app. Send it a greeting
   and ask it to summarize the top-level README.md.
   ```

2. The orchestrator calls `mux_create_session` (you'll see the tool call rendered in Claude Code's output). A new pane opens in the next grid cell.

3. The orchestrator then calls `mux_send` with the greeting. The message appears in the **chatroom panel** on the right.

4. The worker session reads the message (via `mux_read`), acts on it, and replies with a summary. The reply is visible both in the worker's own pane and in the chatroom.

That's the whole loop: orchestrator coordinates, workers execute, the message bus is the shared context.

**Observations to calibrate against:**

- Workers do not magically read your mind. The orchestrator's `CLAUDE.md` tells it to poll the message bus — if your worker is idle, it's waiting for a message or a tmux keystroke.
- Context usage is shown per-session. When a worker hits ~85 %, the orchestrator receives a warning (configurable) and can decide to split work or wrap up the session.
- Claude Code sessions do not share conversation history. The message bus is the only cross-session memory unless you dump a file to the project dir.

---

## Voice input

Voice is optional. If you skipped the `sherpa-onnx-node` and `@fugood/whisper.node` optional deps, voice features are disabled and the UI hides the microphone button.

### Dictation into a pane

1. Focus a session pane.
2. Hold **Ctrl+Shift+Space** (push-to-talk). A red dot appears in the bottom-left status bar while recording.
3. Speak. Release.
4. Whisper transcribes locally. The text is sent to the focused pane via tmux `send-keys`.

This is not a replacement for typing — it's for long prose prompts where typing slows you down.

### Voice bug report

The voice pipeline also powers a structured bug-report interview:

1. Press **Cmd+B** (macOS) / **Ctrl+B** (Linux), or click the bugreport icon in the activity rail.
2. An overlay opens with an interview script. **Escape** cancels at any time.
3. Speak the report. The VAD detects silence, Whisper transcribes, Piper reads back the next question.
4. If Ollama is running, the raw transcript is enriched into structured fields (reproduction steps, expected vs. actual, env info).
5. The final report lands in `~/.config/cipher-mux/bugreports/outbox/` as a markdown file with front-matter.

The orchestrator can pick up these reports — `mux_task_list` surfaces them as tasks ready for triage.

---

## Notes editor

cipher-mux includes a lightweight Markdown editor that lives alongside terminal sessions in the grid. Think of it as scratch space for design notes, meeting logs, or architecture decisions — right next to the sessions that produce them.

### Opening a notes cell

From any empty grid slot (the launcher cell with the three buttons), click **Notes**. The cell switches to the notes editor view with a tab bar at the top.

Alternatively, if the sidebar is open, the **NOTES** section lists all notes for the current scope. Double-click a note to open it in the notes cell.

### Creating and editing

- Click **+** in the tab bar to create a new note.
- Notes are Markdown with live syntax highlighting (headings, bold, italic, code, links, lists).
- **Cmd+S** (macOS) / **Ctrl+S** (Linux) saves and triggers auto-tagging (see below).
- Auto-save fires 2 seconds after you stop typing — this writes the file but does **not** trigger tagging.

### Where notes are stored

Notes live under `~/.config/cipher-mux/notes/`. Each note is a `.md` file with YAML frontmatter:

```yaml
---
title: My design note
tags:
  - architecture
  - cipher-mux
---
# My design note

Content here...
```

If a workspace is active, notes are scoped to `~/.config/cipher-mux/notes/workspace-<id>/`. Global notes are always visible.

### Auto-tagging

When you save with Cmd+S and Ollama is running locally (`127.0.0.1:11433`), cipher-mux sends the note content to the configured model (default: `gemma4:26b`) and receives up to 5 tag suggestions. Tags are written into the frontmatter automatically.

A seed repository of ~27 tags covers common categories (trading, infra, coding, project, etc.). New tags discovered by the model are added to the repository. Tag counts track how often each tag is used.

Without Ollama, tagging is skipped silently — notes work fine without it.

### Sidebar integration

The sidebar's **NOTES** section shows:

- A **search field** that filters by title and tag name.
- **Tag filter chips** — click a tag to filter, click again to remove the filter. Multiple tags are AND-combined.
- **Note cards** with title, tags, and last-modified date. Double-click to open.
- A **delete button** (✕) appears on hover. Confirmation required.

### Deleting notes

Two ways to delete:

1. **From the sidebar:** hover over a note card, click the ✕ button.
2. **From the tab bar:** when a note is active, a trash icon appears on its tab. Click to delete.

Both require confirmation. Deletion removes the `.md` file from disk permanently.

---

## The task outbox

cipher-mux ships a SQLite-backed task outbox with a state machine:

```
inbox  →  in-progress  →  done
                       ↘  parked
                       ↘  dropped
```

Tasks land in `inbox` from three sources:

1. **Voice bug reports** (above)
2. **Chatroom messages** tagged with `#task` (configurable)
3. **Direct MCP calls** — the orchestrator itself, or any Claude Code session with MCP access, can call `mux_task_create`

Triage from the orchestrator:

```
Check the task outbox. For each inbox task, decide:
- route it to an existing session,
- spawn a new session for it,
- or park it with a reason.
```

The orchestrator iterates through `mux_task_list`, calls `mux_task_update` on each, and spawns sessions via `mux_create_session` where needed.

---

## Keyboard shortcuts

cipher-mux deliberately keeps the global hotkey surface small. Most navigation is mouse-driven. The full reference lives in Info/Help → Shortcuts inside the app.

| Key | Scope | Action |
|-----|-------|--------|
| `Cmd+B` / `Ctrl+B` | global | Open bug report dialog |
| `Escape` | global | Close dialog / overlay |
| `Ctrl+Shift+Space` | session pane | Push-to-talk voice input into focused pane |
| `Cmd+C` / `Cmd+V` | terminal | Copy / paste (xterm.js defaults) |

Claude Code's own shortcuts (`ESC ESC` to interrupt, `/` to switch model, etc.) work inside the pane exactly as in a standalone terminal.

Zoom accelerators (`Cmd+-`, `Cmd+=`, `Cmd+0`) are intentionally stripped from the Electron menu so they do not clash with renderer-level handling.

---

## Troubleshooting

### The orchestrator does not see `mux_*` tools

- Open the Info/Help view. The MCP status line should read `listening on 127.0.0.1:3100`.
- If not: check the main-process logs. Port conflict is the most common cause (another app on 3100). Change the port in Settings → Advanced.
- If a session was spawned manually outside of cipher-mux, it will not have the MCP env vars and cannot reach the `mux_*` tools. Restart the session from the activity rail so cipher-mux injects the bearer token.

### `tmux: command not found` on app start

cipher-mux patches `PATH` to include common Homebrew and Nix paths before spawning tmux, but GUI-launched Electron apps on macOS can miss PATH extensions set in `~/.zshrc`. Workaround: run `launchctl setenv PATH "$PATH"` from a shell, or start the app from a terminal.

### Voice input does nothing

- Check microphone permission (macOS: System Settings → Privacy & Security → Microphone).
- On Linux, voice needs PulseAudio or PipeWire. Check with `pactl info`.
- Open the Info/Help → Features tab. The **Voice** row should show `ready`. If it shows `disabled (optional deps missing)`, reinstall with `npm install` (or download a full DMG that bundles the native modules).

### Session crashed / zombie pane

- The activity rail marks crashed sessions with a red dot.
- Click → **Recover** attempts to reattach to the tmux session.
- If the tmux session is truly gone, **Dismiss** removes the pane. Any unsaved terminal state is lost (Claude Code sessions are not file-system persistent).

### Grid cell heights are wrong

Grid uses a fixed 380 px cell height by design ([fixed in 0.8.3-beta](../CHANGELOG.md)). If you see clipped panes: update to the latest release.

---

## Next steps

- **Write an adapter.** If you use a coding agent other than Claude Code or Aider, see [CONTRIBUTING.md § Writing an Adapter](../CONTRIBUTING.md#writing-an-adapter) and the [adapter test protocol](contributing/adapter-test-protocol.md).
- **Customize the orchestrator template.** `~/.config/cipher-mux/orchestrator/CLAUDE.md` is your playground.
- **Read the ADRs** under [docs/decisions/](decisions/) to understand *why* the architecture looks the way it does. ADR-002 (MCP transport) and ADR-008 (orchestrator template) are the highest-leverage reads.
- **Feedback:** [open an issue](https://github.com/cmarkus42/cipher-mux-electron/issues/new/choose). Bug reports with a voice-bug-report export attached are the gold standard.
