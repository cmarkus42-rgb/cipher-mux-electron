/**
 * Companion reference files deployer.
 *
 * Deploys all 4 reference files for the Companion entity.
 * Content sourced from Wissensbase-Note (2026-05-11) and code verification.
 */

import * as fs from 'fs';
import * as path from 'path';

export function deployCompanionRef(projectPath: string): void {
  const refDir = path.join(projectPath, 'ref');

  const files: Array<{ name: string; content: string }> = [
    { name: 'features.md', content: REF_FEATURES },
    { name: 'mcp-tools.md', content: REF_MCP_TOOLS },
    { name: 'shortcuts.md', content: REF_SHORTCUTS },
    { name: 'slash-commands.md', content: REF_SLASH_COMMANDS },
  ];

  for (const file of files) {
    const filePath = path.join(refDir, file.name);
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}

const REF_FEATURES = `# Feature Reference — cipher-mux

Complete catalog of all user-facing features. For how to use them, see the guides. This is for quick lookup.

---

## Grid & Sessions

**SessionGrid** — Main window area. Up to 7 columns × 3 rows = 21 cells. Each cell holds a session, a notes editor, or a launcher. Drag cells to swap positions.

**Leere Zelle** — Shows a \\\`+\\\` button. Click opens the Launcher-Popup.

**SessionCell** — One terminal pane running Claude Code in tmux. Header shows session name, entity color dot, context usage bar, and 9 control buttons.

**Session Header Buttons** (left to right on the right side):

| Icon | Function |
|------|----------|
| Scan | Focus Mode (Cmd+Shift+F) |
| ↓/↑ | Expand cell to full grid height / collapse |
| GitBranch | Fork session (parallel copy) |
| Camera | Screenshot — snapshot, path inserted into session |
| ⇄ | Switch project |
| ↑ | Send to background |
| Terminal | Open shell in project directory |
| ExternalLink | Pop Out — session as separate window |
| ✕ | Close session |

**Entity Color Coding:**

| Entity | Color |
|--------|-------|
| Workshop | Blue |
| Cyber Factory | Purple |
| Companion | Orange |
| Refinement | Red |
| Launcher | Green |
| Voice Relay | Violet |
| Audit | Dark Red |
| Ideation Partner | Teal |
| Debugger | Coral |
| Testing Assistant | Light Green |
| Bugreport | Grey |

**Launcher-Popup** — Opens via \\\`+\\\` in empty cell or Cmd+N. Three tabs:

- **Presets** — Entity list with color dots. Running presets show dot + "running" status. Non-singletons show \\\`+\\\` for multiple instances. Click to start or focus.
- **Path** — Project folder picker. Recent paths as quick-select. Options: Shell Only, Skip Permissions, Resume, Fork.
- **Notes** — Open or create a note in this cell.

**NotesCell** — CodeMirror 6 markdown editor. Tab bar for multiple notes. Auto-save (2s) + manual save (Cmd+S) with Ollama tag suggestions.

**Grid Controls** — Status bar buttons: spalten +/− (columns), zeilen +/− (rows). Min 1×1, max 7×3.

**Drag & Drop** — Sessions: drag header to swap. Sidebar sessions onto grid cells. Notes from sidebar onto cells (empty = open note, occupied = send content to session). Files from Finder onto session: shell-escaped paths inserted into terminal.

---

## Status Bar

Left to right:

**Voice Control — 3-State Radio:**

Three buttons: \\\`OFF\\\` / \\\`STT\\\` / \\\`COM\\\`

- **OFF** — Voice off
- **STT** — Speech-to-Text: mic → text into focused session
- **COM** — Conversation mode via Voice Relay

**LED** (dot next to buttons): off / green (ready) / red (recording) / yellow (processing)

**Session-Target** (STT only): shows target session with ◉ pin button. COM shows "Voice Relay".

| Element | Function |
|---------|----------|
| OFF / STT / COM | Select voice mode |
| LED | Voice status |
| Session-Target + ◉ | Target session + pin toggle (STT only) |
| spalten −/+ | Grid columns (1–7) |
| zeilen −/+ | Grid rows (1–3) |
| workspaces | Open Workspaces window |
| sidebar | Toggle sidebar |
| Theme name | Open theme editor |
| einstellungen | Open settings dialog |
| Version (right, clickable) | Check for updates |

---

## Focus Mode

**Activate:** Scan icon in session header or Cmd+Shift+F.

Session expands to 2×2. Floating Focus-Bar:
- **Session-Name** — **CTX XX%** — **Aa** (font size 8–36px) — **ESC**

**Exit:** ESC key, ESC button, or Scan icon again.

**Notes cells:** No CTX display. Detach button (own window) available.

---

## Pop-Out & Detachable Windows

**Session Pop-Out (ExternalLink):** Session opens as separate Electron window. Terminal continues. 28px drag region + Dock button (back to grid).

**Sidebar Detach (⧉):** Sidebar as separate window. ⇤ docks back.

---

## Sidebar

Toggle via \\\`sidebar\\\` in status bar. LED indicates when content is available. 5 collapsible sections:

### 1. Notes
Note browser with search and tag filter. Workspace-active → auto-filtered to \\\`workspace:<Name>\\\`.
- Single-click → details/preview
- Double-click → open in grid cell
- Drag → onto grid cell
- Bulk: delete (15s undo) or edit tags

### 2. Background Sessions
Sessions not in grid. Card shows name + context bar.
- Single-click → expand (path, context bar, terminal preview refreshing every 5s)
- Double-click → pull into grid
- Drag → onto target cell

### 3. Orphaned Sessions *(conditional)*
tmux sessions cipher-mux doesn't recognize. Per session: Adopt or Kill.

### 4. Companion Memory
Stored memories from past sessions. Collapsed by default. Searchable.

### 5. Messages
Message Bus feed — sender, time, text.

---

## Workspaces & Characters

**Workspaces Window** — Separate BrowserWindow. Access: status bar \\\`workspaces\\\` button. 4 tabs:

### Tab: Workspaces
Grid layout editor. Visual editor with merge handles (vertical cell spanning). Cell inspector: assign preset + project + custom prompt per cell.

**Workspace-level settings:** Workspace Prompt (injected into all sessions), Context Directories, Default Tags (\\\`klasse:wert\\\`), Notes Global toggle.

**Default-Workspace:** Star button → auto-loaded on app start.

### Tab: Companion
**Characters** (Personas) — control tone and style for all entity sessions. The active character block is injected into every session.

**6 built-in Characters:**

| Name | Character |
|------|-----------|
| Relay (default) | Calm, precise, science-journalist. No praise without verification. |
| Cipher | Positive cyberpunk, pragmatically loyal. Dry, efficient, dark humor. |
| Wayne | Pragmatic enthusiast. "We'll get this done" attitude, light nerd humor. |
| Der Kyniker | Maximum compression. Facts, code, error analysis only. Yes/No when possible. |
| Theaitetos | Guides through questions, not answers. Exposes gaps and confirmation bias. |
| Der Glitch | Breaks thought patterns. Unconventional metaphors, questions the premise. |

**Global Override:** Checkbox — this character overrides all preset-specific assignments.

Custom characters: Name + color + prompt text.

### Tab: Presets
Preset editor. Global Rules (always first entry) + all entity presets. Builtin presets are read-only — "Copy as Custom" creates editable copy. New custom preset via "+ New".

### Tab: Tags
Tag management. Tag classes and predefined tags configurable.

---

## Entities (10 Presets)

| Entity | Role |
|--------|------|
| **Companion** | Entry point, teaching, advice. Reads user-profile.json, adapts to skill level. |
| **Voice Relay** | Companion for pure voice interaction. Same persona, optimized for speech. |
| **Workshop** | Small jobs, maintenance, single tasks. Bugreport triage coordinator. |
| **Cyber Factory** | Large structured projects. Architect phase → wave plan → parallel workers → testing handoff. |
| **Refinement** | Requirements package → gap analysis → detail spec with REQ-IDs → CF handoff. |
| **Ideation Partner** | Raw ideas → research → focus → requirements package → Refinement handoff. |
| **Testing Assistant** | Execute testcases, adversarial probing, security checks, findings report → Workshop. |
| **Debugger** | Findings → root cause → fix plan → worker session → verification. Small = self, large = Workshop/CF. |
| **Audit** | Code review, security, ADR consistency. Loop until clean. Release recommendation. |
| **Launcher** | Project kickoff workflow. Scans projects, starts orchestration. |

**Lifecycle:** Ideation → Refinement → Cyber Factory → Testing → Debugger. Workshop coordinates, Audit runs parallel.

---

## Themes (13)

CSS custom property-based. Applied via \\\`body[data-theme="id"]\\\`. Theme editor accessible via theme name in status bar.

*Cipher Defaults:*
| ID | Name | Character |
|---|---|---|
| cipher-ivory | Cipher Ivory | Clean light, default light mode |
| cipher-dark | Cipher Dark | Warm dark, default dark mode |

*Coder Classics:*
| ID | Name | Character |
|---|---|---|
| blueprint | Blueprint | Engineer draft, cyan + indigo |
| warm-paper | Warm Paper | Minimal sepia |
| gruvbox-dark | Gruvbox Dark | Warm retro coder classic |
| nord | Nord | Cool Scandinavian frost |
| synthwave | Synthwave | 80s magenta + violet |
| matrix | Matrix | Phosphor green on black |

*Style:*
| ID | Name | Character |
|---|---|---|
| brutalist | Brutalist | Black/white + signal red |

*Accessibility:*
| ID | Name | Character |
|---|---|---|
| high-contrast | High Contrast | WCAG AAA accessible |
| cvd-deuteranopia | CVD: Deuteranopia | Red-green, Okabe-Ito palette |
| cvd-tritanopia | CVD: Tritanopia | Blue-yellow, magenta/green |
| cvd-achromatopsia | CVD: Achromatopsia | Full color blindness, greyscale |

Theme editor: token groups, terminal font/size/line-height, preview/revert/save/save-as/reset/export.

---

## Voice / TTS

**3 Voice Modes:** OFF / STT / COM

**STT:** Whisper.cpp via \\\`@fugood/whisper.node\\\`. Model: \\\`~/.config/cipher-mux/models/whisper/ggml-small.bin\\\`. Runs locally, no network.

**VAD:** Silero ONNX in browser. Detects speech start/end automatically.

**Voice Commands:** "abschicken"/"absenden"/"senden" = Enter. "neue zeile" = newline. "hoch"/"runter" = scroll. "ganz hoch"/"ganz runter" = top/bottom. "zum marker" = last answer. "grid hoch/runter/links/rechts" = grid navigation. "kopieren" = copy selection. "einfügen" = paste clipboard.

**Voice Pin:** ◉ button pins voice to a specific session.

**COM Mode:** Connects to Voice Relay — full session optimized for speech. TTS as primary output channel.

**TTS Configuration** (einstellungen → Sprache):
- TTS on/off, Engine (Piper local / macOS), Verbosity (Minimal / All Relevant)
- Installed Voices: set active, preview, delete
- Voice Catalog: browse and download Piper voices, filter by language/quality

**Barge-In:** Speaking while TTS is active interrupts playback.

**BT Shutter:** Bluetooth remote control. Auto mode (= submit) or Manual mode (= start/stop recording).

---

## Notes Editor

**NoteManager** — Filesystem CRUD. Global: \\\`~/.config/cipher-mux/notes/\\\`. Workspace-scoped: \\\`~/.config/cipher-mux/notes/workspace-<id>/\\\`.

**Format** — Markdown with YAML frontmatter (gray-matter). Fields: title, tags.

**Editor** — CodeMirror 6 with live markdown rendering. Headings, bold, italic, links, code blocks, blockquotes.

**Auto-Save** — 2-second debounce. Writes file, no tagging.

**Manual Save (Cmd+S)** — Writes file AND triggers Ollama auto-tagging. Model: gemma4:26b. Suggests up to 5 tags.

**Tags** — Format: \\\`klasse:wert\\\`. Exclusive classes: \\\`status\\\`, \\\`kind\\\`. Tag autocomplete from repository.

**Delete** — Via tab bar trash icon or sidebar hover-reveal button. Both show confirmation dialog.

**Testcase Notes** — Special \\\`noteType: testcase\\\` with tri-state checkboxes (open/pass/fail), comments, screenshots.

---

## Bugreport Dialog

Open: Cmd+B or button in einstellungen → General.

**Workflow:**
1. Type: Bug / Feature Request toggle
2. Description textarea (STT input supported)
3. Screenshot: optional file picker
4. Enrich: starts a Claude session that analyzes → generates structured report (title, severity, tags, steps to reproduce). Preview is editable.
5. Submit: saves as Note with \\\`kind:bugreport\\\` tag.

---

## Recovery Dialog

Appears on startup when sessions exist. **Two phases:**

**Phase 1 — Restore:** List of saved sessions. "Ja" restores previous grid layout. "Nein" discards.

**Phase 2 — Orphans:** Unknown tmux sessions (checkbox list). Actions: Confirm (adopt selected), Kill All, Ignore All.

---

## Settings (einstellungen)

6 tabs:

### General
- Skip Permissions — \\\`--dangerously-skip-permissions\\\` for all new sessions
- Keep Working — save sessions on quit (recovery on next start)
- Bugreport button

### Sprache
- Language: Deutsch / English
- Voice/TTS: TTS on/off, Engine, Verbosity, Voice Commands on/off, Submit Mode (auto/manual), BT Shutter on/off
- Installed Voices, Voice Catalog

### Themes
13 built-in + custom themes. Theme editor with token groups, terminal font/size/line-height.

### Shortcuts
Keyboard shortcuts by category.

### A11y
Accessibility settings. Connects with CVD themes.

### About
Version, links (cipher-mux.dev, Docs, GitHub), credits.

---

## Limitations

- **macOS only** — tmux dependency (Homebrew)
- **Max 21 sessions** — 7×3 grid limit
- **Context warning** — orange at 80%+ usage, red at 90%+
- **Message retention** — 7 days, auto-cleanup every 6 hours
- **Whisper model** — must be at \\\`~/.config/cipher-mux/models/whisper/ggml-small.bin\\\`
- **better-sqlite3 ABI** — separate rebuilds for test (Node.js) vs app (Electron)
- **Preact, not React** — ~3KB, React-compatible API, some ecosystem libs need aliasing
`;

const REF_MCP_TOOLS = `# MCP Tools Reference — cipher-mux

All tools available via the cipher-mux MCP server. Used by the Workshop, Cyber Factory, and any session with MCP access.

---

## Session Management

### mux_create_session

Create a new Claude Code session in a tmux pane.

| Parameter | Type | Required | Description |
|---|---|---|---|
| name | string | yes | Display name for the session |
| projectPath | string | yes | Absolute path to project directory |
| command | string | no | Initial command to run in the session |
| visible | boolean | no | If true, session appears in the grid with focus |

**Use case:** Workshop spawning a worker for a specific task.
**Returns:** Session object with id, name, tmuxSession.
**Note:** After creation, wait 8-10 seconds before sending instructions (Worker-Startup Protocol).

### mux_kill_session

Terminate a session and its tmux pane.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |

**Use case:** Cleaning up completed or stuck workers.

### mux_sessions

List all active sessions.

*No parameters.*

**Returns:** Array of session objects (id, name, projectPath, tmuxSession, contextUsage).
**Use case:** Checking what is running before creating new sessions.

### mux_status

Get cipher-mux system health.

*No parameters.*

**Returns:** Session count, message bus availability, MCP server state.
**Use case:** Verifying the system is healthy before starting work.

---

## Message Bus

### mux_send

Send a message to the bus, optionally with direct tmux delivery.

| Parameter | Type | Required | Description |
|---|---|---|---|
| topic | string | yes | Message topic: status, bug, review, chat, system |
| sender | string | yes | Sender identifier (e.g., session name) |
| text | string | yes | Message content |
| sessionId | string | no | Target session ID for direct tmux push delivery |
| sessionName | string | no | Target session name for direct tmux push delivery |

**Use case (bus only):** Status updates, progress reports. Other sessions read when they check.
**Use case (with sessionId):** Sending task instructions directly into a worker's terminal via tmux send-keys. This is how the Workshop delivers initial prompts.
**Important:** Without sessionId/sessionName, the message only goes to the bus. Sessions do not auto-read the bus — they must call mux_read explicitly.

### mux_read

Read messages from the bus.

| Parameter | Type | Required | Description |
|---|---|---|---|
| topic | string | no | Filter by topic (status, bug, review, chat, system) |
| limit | number | no | Max messages to return (default: 20) |

**Returns:** Array of messages (id, topic, sender, text, timestamp).
**Use case:** Workshop monitoring worker progress, reading bug reports.

---

## Context Monitoring

### mux_context_usage

Get real-time token usage from the StatusLine monitor.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | no | Specific session ID. Omit to get all sessions. |

**Returns:** Context usage data: tokens used, tokens total, percentage, cost estimate.
**Use case:** Checking if a worker has room for more work, detecting context-full sessions.

---

## Task Queue

### mux_task_create

Create a task in the persistent queue.

| Parameter | Type | Required | Description |
|---|---|---|---|
| title | string | yes | Task title |
| description | string | no | Detailed task description |
| source | string | no | Task origin (default: "workshop") |
| parent_id | string | no | Parent task ID (for sub-tasks) |
| policy | object | no | Execution policy (stall_timeout, max_retries, hooks) |

**Returns:** Created task with ID.
**Use case:** Workshop creating work items, Cyber Factory creating sub-project tasks.

### mux_task_update

Update a task's state or result.

| Parameter | Type | Required | Description |
|---|---|---|---|
| task_id | string | yes | Task ID |
| state | enum | no | New state: dispatched, running, done, failed |
| session_id | string | no | Assigned session (required for dispatched→running) |
| result | object | no | Task result: { summary: string, data: any } |

**State machine:** queued → dispatched → running → done/failed

### mux_task_list

Query tasks with filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| state | string | no | Filter by state |
| source | string | no | Filter by source |
| parent_id | string | no | Filter by parent task ID |
| session_id | string | no | Filter by assigned session |

### mux_task_get

Get a single task with its children.

| Parameter | Type | Required | Description |
|---|---|---|---|
| task_id | string | yes | Task ID |

---

## Bug Reports

### mux_bugreport_resolve

Mark a bugreport as fixed or failed.

| Parameter | Type | Required | Description |
|---|---|---|---|
| bugId | string | yes | Bug ID |
| status | enum | yes | Resolution: "fixed" or "failed" |
| summary | string | yes | What was done — fix description or failure reason |
| branchName | string | no | Git branch containing the fix (fixed only) |
| filesChanged | string[] | no | List of changed files |

**Use case:** Worker completing a bug fix, Workshop closing the bug.

---

## Notes

### mux_notes_create

Create a new note.

| Parameter | Type | Required | Description |
|---|---|---|---|
| title | string | yes | Note title |
| body | string | yes | Markdown content |
| tags | string[] | no | Tags (\\\`klasse:wert\\\` format) |
| scope | string | no | "global" or "workspace" |

### mux_notes_list

List notes with optional filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| tag | string | no | Filter by tag |
| scope | string | no | Filter by scope |

---

## Companion Memory

### companion_memory_write

Write a memory entry (scope-aware).

| Parameter | Type | Required | Description |
|---|---|---|---|
| content | string | yes | Memory content |
| kind | string | no | fact, preference, interaction, event |
| scope_kind | string | no | user, workspace, session |
| scope_id | string | no | Workspace ID or Session ID |

### companion_memory_recall

Recall recent memories with scope filter.

| Parameter | Type | Required | Description |
|---|---|---|---|
| limit | number | no | Max entries (default: 10) |
| scope_kind | string | no | Filter by scope kind |
| scope_id | string | no | Filter by scope ID |

### companion_memory_search

Full-text search in memories.

| Parameter | Type | Required | Description |
|---|---|---|---|
| query | string | yes | Search query |

### companion_memory_forget

Delete a memory entry.

| Parameter | Type | Required | Description |
|---|---|---|---|
| id | string | yes | Memory entry ID |

---

## App Control

These tools let sessions control the cipher-mux UI — grid layout, session placement, sidebar visibility, voice output, scrolling.

### mux_grid_resize

Change the grid dimensions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| cols | number | yes | Number of columns (1-7) |
| rows | number | yes | Number of rows (1-3) |

### mux_grid_place

Place a session in a specific grid cell.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |
| col | number | yes | Column index (0-based) |
| row | number | yes | Row index (0-based) |

### mux_session_focus

Focus a session in the grid.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |

### mux_session_eject

Eject a session to background.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |

### mux_sidebar_toggle

Toggle sidebar visibility.

| Parameter | Type | Required | Description |
|---|---|---|---|
| visible | boolean | no | Force visible (true) or hidden (false). Omit to toggle. |

### mux_tts_speak

Speak text via TTS with priority control.

| Parameter | Type | Required | Description |
|---|---|---|---|
| text | string | yes | Text to speak |
| sessionId | string | no | Source session ID (for priority routing) |
| priority | string | no | Priority level |

### mux_cell_scroll

Scroll a terminal cell programmatically.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Target session ID |
| direction | string | yes | up, down, top, bottom, or to-marker |

---

## UI Control

### mux_ui_highlight

Highlight a UI element for demonstration.

### mux_ui_open

Open a specific UI element or dialog.

### mux_ui_choreography

Run a choreographed UI sequence.

### mux_theme_set

Set the active theme.

| Parameter | Type | Required | Description |
|---|---|---|---|
| themeId | string | yes | Theme ID (e.g., "cipher-dark") |

---

## Project Launcher

### kickoff_complete

Signal that project scaffolding is finished.

| Parameter | Type | Required | Description |
|---|---|---|---|
| projectPath | string | yes | Absolute path to the project directory |
| projectName | string | yes | Project name (kebab-case) |
| detectedStack | string | no | Detected tech stack |

**Fallback:** Writing an empty \\\`.kickoff-complete\\\` file achieves the same effect.

---

## Entity Handoffs

### mux_cyber_factory_diagnose
Diagnose a Cyber Factory run.

### mux_cyber_factory_handoff_testing
Hand off from Cyber Factory to Testing Assistant.

### mux_cyber_factory_handoff_debugger
Hand off from Cyber Factory to Debugger.

### mux_debugger_findings_intake
Submit findings to the Debugger.

### mux_entity_start
Start an entity session.
`;

const REF_SHORTCUTS = `# Keyboard Shortcuts & UI Actions

Quick reference for all input methods in cipher-mux.

---

## Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| Cmd+N | Open Launcher-Popup | Global |
| Cmd+B | Open bugreport dialog | Global |
| Cmd+Shift+F | Toggle Focus Mode | Session cell |
| Ctrl+Shift+Space | Toggle voice input mode | Global (voice enabled) |
| Cmd+S | Save note + trigger auto-tagging | Notes editor |
| Cmd+C | Copy selected text / cancel running process | Terminal |
| Cmd+V | Paste from clipboard | Terminal |
| Cmd+1–5 | Grid navigation (focus cell by index) | Global |
| Escape | Close active dialog, exit Focus Mode | Any dialog / Focus |
| Enter | Submit in dialogs | KickoffDialog, SessionDialog |

---

## Status Bar Actions (Click)

| Button | Action |
|---|---|
| OFF / STT / COM | Select voice mode |
| spalten + | Add grid column (max 7) |
| spalten − | Remove grid column (min 1) |
| zeilen + | Add grid row (max 3) |
| zeilen − | Remove grid row (min 1) |
| workspaces | Open Workspaces window |
| sidebar | Show or hide sidebar panel |
| Theme name | Open theme editor |
| einstellungen | Open settings dialog |

---

## Cell Header Actions (Click)

| Button | Action |
|---|---|
| Scan | Toggle Focus Mode |
| ↥ / ↧ | Expand / collapse cell height (2+ rows only) |
| GitBranch | Fork session |
| Camera | Screenshot |
| ⇄ | Open Project Popup to switch project |
| ↑ | Send session to background |
| \\\$ | Open plain shell in session's project directory |
| ExternalLink | Pop Out as separate window |
| ✕ | Close session and free the cell |
| Drag header | Swap cell position with another cell |

---

## Sidebar Actions

| Action | How |
|---|---|
| Detach sidebar | Click ⧉ at sidebar top |
| Open note in grid | Double-click note in Notes section |
| Delete note | Hover note → click 🗑 (or bulk select) |
| Filter by tag | Click tag chip in Notes section |
| Pull background session to grid | Double-click session card in Background section |
| Adopt orphaned session | Click "Adoptieren" in Orphaned section |

---

## Notes Editor Actions

| Action | How |
|---|---|
| Create note | Click + in tab bar |
| Close note tab | Click × on tab |
| Delete note | Click 🗑 in tab bar (with confirm) |
| Save + auto-tag | Cmd+S |
| Auto-save (no tags) | Automatic after 2s inactivity |

---

## Voice Commands (while recording)

| Say this | Does this |
|---|---|
| "abschicken" / "absenden" / "senden" | Press Enter (submit) |
| "neue zeile" | Insert newline |
| "hoch" / "runter" | Scroll one page up/down |
| "ganz hoch" / "ganz runter" | Scroll to top/bottom |
| "zum marker" | Scroll to last answer |
| "grid hoch/runter/links/rechts" | Move grid focus |
| "kopieren" | Copy current selection |
| "einfügen" | Paste clipboard into focused session |
| (any other speech) | Transcribed as text, inserted without Enter |
`;

const REF_SLASH_COMMANDS = `# Slash Commands — Claude Code

Schnellreferenz fuer alle \\\`/\\\`-Befehle in Claude Code. Diese funktionieren in jeder Claude-Code-Session (auch innerhalb von cipher-mux).

---

## Session & Navigation

| Befehl | Was es tut |
|---|---|
| \\\`/help\\\` | Hilfe und Tastenkuerzel anzeigen |
| \\\`/status\\\` | Aktuellen Session-Status anzeigen (Modell, Kontext, Permissions) |
| \\\`/compact\\\` | Konversation komprimieren — reduziert Token-Verbrauch, behält Kernkontext. Optional mit Custom-Prompt: \\\`/compact focus on the API changes\\\` |
| \\\`/clear\\\` | Konversation komplett leeren (Neustart ohne Session zu beenden) |
| \\\`/resume\\\` | Letzte Konversation dieser Session fortsetzen |

---

## Konfiguration

| Befehl | Was es tut |
|---|---|
| \\\`/config\\\` | Einstellungen anzeigen und aendern (Theme, Modell, etc.) |
| \\\`/model\\\` | Aktives Modell wechseln (z.B. auf Sonnet, Haiku) |
| \\\`/permissions\\\` | Aktuelle Tool-Permissions anzeigen und verwalten |
| \\\`/allowed-tools\\\` | Liste aller aktuell erlaubten Tools |
| \\\`/fast\\\` | Zwischen Standard- und Fast-Modus umschalten (gleiches Modell, schnellerer Output) |

---

## Arbeiten mit Code

| Befehl | Was es tut |
|---|---|
| \\\`/commit\\\` | Aenderungen committen — Claude analysiert Diff und schlaegt Commit-Message vor |
| \\\`/pr\\\` | Pull Request erstellen — analysiert Branch-Diff, erstellt Titel + Beschreibung |
| \\\`/review\\\` | Code-Review des aktuellen Diffs oder einer PR |
| \\\`/init\\\` | CLAUDE.md im aktuellen Projekt initialisieren |

---

## Kontext & Memory

| Befehl | Was es tut |
|---|---|
| \\\`/memory\\\` | Projekt-Memory anzeigen und verwalten (CLAUDE.md-basiert) |
| \\\`/cost\\\` | Token-Verbrauch und Kosten der aktuellen Session anzeigen |
| \\\`/context\\\` | Kontextfenster-Auslastung anzeigen |

---

## Erweitert

| Befehl | Was es tut |
|---|---|
| \\\`/bug\\\` | Bug-Report an Anthropic senden |
| \\\`/doctor\\\` | Claude Code Installation pruefen (Abhaengigkeiten, Konfiguration) |
| \\\`/login\\\` | Authentifizierung erneuern |
| \\\`/logout\\\` | Session abmelden |

---

## Tipps

- **\\\`/compact\\\` ist dein bester Freund** bei langen Sessions. Wenn der Kontext voll wird, komprimiert es die Konversation und du kannst weiterarbeiten statt neu zu starten.
- **\\\`/cost\\\`** hilft beim Ueberblick — besonders wenn mehrere Sessions parallel laufen.
- **\\\`!\\\`-Prefix** ist kein Slash-Command, aber wichtig: \\\`! git status\\\` fuehrt den Befehl direkt in der Shell aus, ohne dass Claude ihn interpretiert.
- **Custom Slash Commands** kannst du in \\\`.claude/commands/\\\` als Markdown-Dateien anlegen. Der Dateiname wird zum Befehl: \\\`.claude/commands/deploy.md\\\` → \\\`/deploy\\\`.
`;
