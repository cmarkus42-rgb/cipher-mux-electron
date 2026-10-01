# How-To — cipher-mux from zero to the first delegation

This is the narrative walkthrough. If you already know the tool and want reference, read
[README § Usage](../README.md#usage), the architecture in [ARCHITECTURE.md](../ARCHITECTURE.md),
or the tool list in [docs/mcp-tools.md](mcp-tools.md).

Audience: a developer who uses an agent CLI daily, is comfortable with tmux, and has never
opened cipher-mux before. From a fresh install to a running delegation: **15–25 minutes**.

> **This document was rewritten on 2026-10-01 against the code.** The version before it
> described an **Orchestrator** role that no longer exists — it was renamed to **Workshop**
> months ago, and `ipc-hub.ts` even deletes its leftover directory on startup. It also offered
> an AppImage for Linux (there is none), named Aider as an adapter (there is none), pointed at
> a GitHub org that does not exist, and asked for Node ≥ 18 where the project needs 22. If you
> find another claim here that the code contradicts, the code wins and this file is wrong.

---

## Table of Contents

1. [Before you start](#before-you-start)
2. [Install](#install)
3. [First launch](#first-launch)
4. [Start your first session](#start-your-first-session)
5. [Start the Workshop](#start-the-workshop)
6. [Your first delegation](#your-first-delegation)
7. [Voice](#voice)
8. [Notes](#notes)
9. [Tasks](#tasks)
10. [Keyboard shortcuts](#keyboard-shortcuts)
11. [Troubleshooting](#troubleshooting)
12. [Next steps](#next-steps)

---

## Before you start

cipher-mux is glue. It does not replace your agent CLI, tmux, or your editor.

### Required

- **macOS 12+.** There is no Linux and no Windows build. The architecture sits on tmux,
  `osascript` and the macOS Keychain.
- **tmux** — `tmux -V`. Any 3.x works. `brew install tmux`.
- **At least one agent CLI**, and you must be able to use it from a terminal first:
  - **Claude Code** (Tier 1, the default) — `npm install -g @anthropic-ai/claude-code`, then
    `claude login` once.
  - **Codex CLI** or **opencode** (Tier 2) also work. The setup wizard neither installs nor
    checks them — that is on you, including the login. **opencode without an authenticated
    provider reaches its prompt and then does nothing on any input.**
- **Node.js 22** if you build from source. `engines.node` says `>=22 <23`, `.nvmrc` says 22,
  and npm evaluates neither — so this is on you. Under a newer Node, `better-sqlite3` does not
  compile and `npm run test` silently runs **zero** tests.

### Optional

- **Ollama** with a small instruction-tuned model, for auto-tagging notes. Default is
  `127.0.0.1:11434` and the model `gemma4:26b`; both are configurable. Without Ollama, tagging
  is skipped and everything else works.
- **A Bluetooth remote** (BT Shutter class) for hands-free voice.

---

## Install

### macOS (DMG)

1. Download the latest `.dmg` from
   [Releases](https://github.com/cmarkus42-rgb/cipher-mux-electron/releases).
2. Mount it, drag `cipher-mux.app` into Applications.
3. **Remove the quarantine flag once:** `xattr -cr /Applications/cipher-mux.app`. The DMG is
   unsigned on purpose — notarisation needs an Apple developer account this project does not
   have.

### From source

```bash
git clone https://github.com/cmarkus42-rgb/cipher-mux-electron.git
cd cipher-mux-electron
npm install
npm run dev     # tsc --watch + Vite, hot reload in the renderer
```

`npm start` is **not** a build. It is `electron .` plus a dependency rebuild; Electron runs
what is in `dist/`. If you change the main process and want to see it, run `npm run build:main`
first — `npm run build:renderer` for renderer changes.

---

## First launch

Three things happen:

1. **Dependency check** — is `tmux` on the `PATH`, is a CLI reachable.
2. **The content directory** is created: `~/.config/cipher-mux/`. Role directories
   (`entities/`), run directories (`runs/`), notes, voice models and the bugreport outbox live
   there.
3. **The MCP server starts** on `127.0.0.1:3100` with a bearer token. The token is generated
   once and kept in the config so restarted sessions reconnect.

> **The settings file is not in `~/.config/cipher-mux/`.** It is
> `~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json`, i.e.
> `app.getPath('userData')`. There *is* a `~/.config/cipher-mux/config.json` and cipher-mux
> **does not read it** — editing that file changes nothing and costs an evening. Treat the real
> one like a credential file; the MCP bearer token is in it.

### Hub setup (once)

You are asked for a **Hub directory** — the central folder for your projects. The suggestion is
`~/cipher-mux/`. The app creates it with a `projects/` subfolder and remembers the path.

You land in the grid: empty launcher cells, the activity rail on the left, the sidebar on the
right.

---

## Start your first session

Click a launcher cell, switch to the **Path** tab, pick a project folder — the picker opens in
your Hub's `projects/` by default. Behind the scenes:

1. a tmux session is created,
2. a pane inside it runs the CLI for that role with the project directory as cwd,
3. the MCP URL and bearer token are injected so the session can reach the `mux_*` tools, and
   the context-usage hook reports back,
4. the session lands in the next free cell.

The cell header shows name, status dot and context usage. All three CLIs report usage — Claude
Code through a statusline hook, Codex from its rollout JSONL, opencode through a plugin. A `—`
means nothing has been measured **yet**, not that it cannot be.

Focus follows the mouse: click a cell. `Cmd+Shift+W/A/S/D` moves focus without the mouse.

---

## Start the Workshop

The **Workshop** is the coordinator for everyday work: it distributes tasks, watches context,
and rotates workers. For large projects there is **Cyber Factory** instead — wave plans,
parallel workers, its own run state.

Both are *roles* ("entities"), and a role is three things:

- its **own directory** under `~/.config/cipher-mux/entities/<id>/` with the authored material
  (`preset.md`, skills, guides),
- a **run directory** under `~/.config/cipher-mux/runs/<workspaceId>/<entityId>/` where the
  generated files land (project instructions, MCP config, hooks) — this separation is what
  stops two workspaces from overwriting each other's instructions,
- a **CLI and optionally a model**, pickable per role in the preset editor.

**Launch it:** click a launcher cell and pick **Workshop** from the role list. On first start
its directory and instruction file are generated. `preset.md` is written **once** so your edits
survive; if a corrected template ships later, the preset editor says so and offers **Vorlage
übernehmen**.

**Verify it works:** type `list my active sessions`. It should call `mux_status` and return
JSON. If it tries a shell command instead, the MCP tools are not reaching it — see
[Troubleshooting](#troubleshooting).

---

## Your first delegation

1. In the Workshop pane, type:

   ```
   Start a session for the project at ~/code/my-app and have it summarise the
   top-level README.md.
   ```

2. It calls `mux_create_session`; a pane opens in the next free cell.

3. **Wait 8–10 seconds before sending the first instruction.** tmux, the shell and the CLI all
   need to come up. Then check with `tmux capture-pane`, then send keys. This is not politeness
   — a prompt sent too early lands in a shell that is not listening yet.

4. Instructions go to a session via **`tmux send-keys`**, not via `mux_send`.

> **The message bus is deprecated.** `mux_send` / `mux_read` still write to SQLite, and the
> module still carries the database behind the task manager, but it is **not** the way to say
> something to a session. Older documents describe a chatroom loop; that was the model up to
> v0.9.x.

**What to calibrate against:**

- Sessions do not share conversation history. What crosses a boundary is what you hand over:
  a **handoff note**, a file in the project, or a direct `tmux send-keys`.
- A handoff note carries an anchor commit, and the world state — branch, commits, diff since
  the anchor — is computed when the note is **dispatched**, not when it was written. A note
  that sat for three days describes the repository as it is now.
- Context usage is per session. Above ~80 % act rather than hope: wrap up, split, or rotate.

---

## Voice

Voice is optional. Without the native modules the microphone stays hidden.

### Dictation

1. Enable voice with the **voice pill** in the status bar. Three modes: **OFF**, **STT**
   (microphone → text into the focused session), **COM** (spoken conversation through the
   Voice-Relay role with speech output).
2. In an active voice session, **Ctrl+Shift+Space** is push-to-talk. It does **not** switch
   voice on — it only works while voice is already active.
3. Whisper transcribes locally. No network, no cloud.

**The fixed commands are German**, and transcription defaults to German: `hoch`, `runter`,
`ganz hoch`, `ganz runter`, `zum marker` for scrolling, `grid hoch` / `zelle links` for grid
navigation, `abschicken` to press Enter. Dictation itself follows whatever Whisper hears. An
English command vocabulary does not exist yet.

### Voice bug report

`Cmd+B` opens the bug-report dialog. The report lands under
`~/.config/cipher-mux/bugreports/`. With Ollama running, the raw transcript is enriched into
structured fields.

---

## Notes

A Markdown editor (CodeMirror 6) that lives in a grid cell next to the sessions that produce
the material. Notes are files under `~/.config/cipher-mux/notes/`, each a `.md` with YAML
frontmatter.

- **Open:** any empty cell → **Notes**. Or drag a note from the sidebar onto a cell.
- **Save:** `Cmd+S`. That also triggers auto-tagging. Auto-save fires a couple of seconds after
  you stop typing and does **not** tag.
- **Delete:** sidebar card or the tab's trash icon, both with confirmation.

### Tags are an axis model, not free text

Five axes in code plus two classes whose values you edit in the Tag Manager. You choose from
`kind`, `phase`, `status`, `severity`, `component`; the Mux sets `workspace` and `entity` from
the connection itself. **An unknown tag fails the call** — `mux_notes_create` rejects
`["bugreport", "open"]` and accepts `["kind:bugreport", "status:open"]`. Five tags is a
recommendation, not a limit: above it you get a warning and keep every tag.

Auto-tagging asks a local Ollama and then **filters** the answer down to the axes. Filtering
rather than asking nicely is deliberate: asking produced 14 classes and 29 `kind` values.

---

## Tasks

A SQLite-backed task queue with a state machine. The states are the ones in
`task-manager.ts`, not a tidier version of them:

```
queued → dispatched → running → validating → completed
   ↘        ↘           ↘  ↘
  failed   stalled    stalled failed        (stalled → queued, failed → queued)
```

Tasks are created through `mux_task_create` — by a role, or by you through the UI. Update them
**as you go**, not at the end: other sessions read the state.

---

## Keyboard shortcuts

Deliberately small; most navigation is mouse-driven. `Cmd+Shift+?` opens the full list inside
the app.

| Key | Action |
|-----|--------|
| `Cmd+N` | Launcher in the first empty cell |
| `Cmd+B` | Bug report dialog |
| `Cmd+Shift+F` | Focus Mode on the focused cell (again, or `Escape`, to leave) |
| `Cmd+Shift+W` / `A` / `S` / `D` | Move focus up / left / down / right |
| `Cmd+Shift+?` | Shortcut list |
| `Cmd+S` | Save note (and tag it) |
| `Escape` | Leave Focus Mode, close dialog |
| `Ctrl+Shift+Space` | Push-to-talk — **only while voice is active** |
| `Cmd+Alt+I` | DevTools |

Your CLI's own keys (`ESC ESC`, `/`, …) work inside the pane as in any terminal. Zoom
accelerators are stripped from the Electron menu so they do not clash with the renderer.

---

## Troubleshooting

### A role does not see the `mux_*` tools

- The MCP server listens on `127.0.0.1:3100`. A port conflict is the most common cause — and
  note that **the installed app and a `npm start` from the repo both want 3100**; the second
  one quits silently.
- A session started outside cipher-mux has no MCP configuration and cannot reach the tools.
  Start it from the launcher.
- **Under Codex, check the directory trust.** Codex loads project-local config, hooks and
  policies **only** from a trusted directory, and a later "Yes" does **not** load them
  afterwards: the session then sits at its prompt with no tools, no usage hook and no role
  boundary, looking perfectly healthy. The Mux writes the run directory into
  `~/.codex/config.toml` for exactly this reason.

### `tmux: command not found` on startup

cipher-mux extends `PATH` with the usual Homebrew and Nix locations before spawning tmux, but a
GUI-launched Electron app on macOS can miss what your `~/.zshrc` sets. Workaround: start the
app from a terminal, or `launchctl setenv PATH "$PATH"`.

### Voice does nothing

- Microphone permission: System Settings → Privacy & Security → Microphone.
- The voice pill must be in **STT** or **COM**. In OFF, push-to-talk does nothing by design.
- The Whisper model lives under `~/.config/cipher-mux/models/whisper/` — **not** in the
  settings directory.

### Sessions are gone after a restart

They should not be: tmux keeps them and the restore brings them back. If they are gone,
`/tmp/kw-debug.json` is written at **every** startup — success and failure — and names the
phase, the error, and what was recovered or orphaned. That file is the first thing to read.

### The terminal looks wrong

Scrollback torn, lines split, content jumping: the diagnosis for all of it is in
`docs/superpowers/specs/2026-10-01-terminal-darstellung.md`, with what is fixed and what is
still open. If you hit something that is not in there, that is a finding worth an issue.

---

## Next steps

- **Pick a CLI per role.** Field **CLI** in the preset editor, **Default CLI** in Settings →
  General. See [README § Agent CLIs](../README.md#agent-clis).
- **Write an adapter.** [CONTRIBUTING § Writing an Adapter](../CONTRIBUTING.md#writing-an-adapter),
  the stub at `src/main/agent/adapters/_reference-stub.ts`, and the
  [adapter test protocol](contributing/adapter-test-protocol.md). Read the headers of
  `adapters/codex.ts` and `adapters/opencode.ts` first — they list what was measured and what
  was not, including four silent failure modes that produce a session which comes up, looks
  healthy, and has no tools.
- **Read the ADRs** under [docs/decisions/](decisions/) for *why* the architecture looks like
  this.
- **Feedback:**
  [open an issue](https://github.com/cmarkus42-rgb/cipher-mux-electron/issues/new/choose).
