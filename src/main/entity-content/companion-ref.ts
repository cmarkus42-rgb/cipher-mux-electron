/**
 * Companion reference files deployer.
 *
 * Deploys all 4 reference files for the Companion entity.
 * Content sourced from ~/.config/cipher-mux/entities/companion/ref/
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
    if (fs.existsSync(filePath)) continue;
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}

const REF_FEATURES = `# Feature Reference — cipher-mux v0.9.6

Complete catalog of all user-facing features. For how to use them, see the guides. This is for quick lookup.

---

## Grid & Sessions

**SessionGrid** — Main window area. Up to 7 columns × 3 rows = 21 cells. Each cell holds a session, a notes editor, or a launcher. Drag cells to swap positions.

**SessionCell** — One terminal pane running Claude Code in tmux. Header shows: session name, context usage % (green/orange/red), and control buttons (height toggle, project switch, shell, close).

**LauncherCell** — Empty grid slot with three action buttons: "projekt" (open project), "session" (raw terminal), "notes" (markdown editor).

**NotesCell** — CodeMirror 6 markdown editor. Tab bar for multiple notes. Auto-save (2s) + manual save (Cmd+S) with Ollama tag suggestions.

**Grid Controls** — Status bar buttons: spalten +/− (columns), zeilen +/− (rows). Min 1×1, max 7×3. Window auto-resizes.

**RowSpan Expand** — ↥ button expands a cell to full grid height. ↧ collapses back. Only visible with 2+ rows.

**Drag & Drop** — Drag cell header to swap with another cell.

---

## Sidebar

**SidebarPanel** — Right-side collapsible panel. Toggle via "sidebar" button in status bar. LED indicator shows when content is available.

**Detach** — ⧉ button opens sidebar as separate window. Auto-reattaches when closed.

**Messages Tab** — Inter-session chat feed (topic: "chat"). Visible when Orchestrator is active. Shows sender + time + message text.

**Background Sessions Tab** — Sessions not in grid. Shows name, project, context bar, live terminal preview (refreshes every 5s). Click to add to grid.

**Input Requests Tab** — MPO questions needing user decision. Shows question, 2-4 options (one recommended), custom answer field. Submit with Cmd+Enter. Visible when MPO is active.

**Notes Tab** — Always visible. Search field (filters by title/tags), tag filter chips (AND logic), note cards (title + tags + date). Double-click opens in NotesCell. Hover reveals delete button.

---

## Status Bar

Left to right:

| Button | Function |
|---|---|
| Voice pill | Toggle voice input. LED: off/green(ready)/red(recording)/yellow(processing) |
| spalten +/− | Add/remove grid columns |
| zeilen +/− | Add/remove grid rows |
| workspaces | Open Workspace/Persona editor (separate window) |
| orchestrator | Start/stop Orchestrator session. Dot indicator when active |
| mpo | Start/stop Multi-Project Orchestrator. Dot indicator when active |
| bugreport | Open bug report dialog |
| sidebar | Toggle sidebar. LED when content available |
| Theme name | Click to cycle through 10 themes |
| info | Open info/settings/shortcuts dialog |
| Version | App version (right side, not clickable) |

---

## Voice Input

**VoiceControl Pill** — Inline status bar control. Toggle switch + LED + target session name.

**STT Engine** — Whisper.cpp via \\\`@fugood/whisper.node\\\`. Model: \\\`~/.config/cipher-mux/models/whisper/ggml-small.bin\\\`. Runs locally, no network.

**VAD** — Silero ONNX in browser. Detects speech start/end automatically. No push-to-talk button needed (though Ctrl+Shift+Space toggles voice mode).

**Voice Commands** — "abschicken"/"absenden"/"senden" = Enter. "neue zeile" = newline. Text is inserted without auto-submit — you review first, then voice-submit.

**TTS** — Piper, used only in bugreport voice interview mode. Not used for session interaction.

---

## Notes Editor

**NoteManager** — Filesystem CRUD. Global: \\\`~/.config/cipher-mux/notes/\\\`. Workspace-scoped: \\\`~/.config/cipher-mux/notes/workspace-<id>/\\\`.

**Format** — Markdown with YAML frontmatter (gray-matter). Fields: title, tags.

**Editor** — CodeMirror 6 with live markdown rendering. Headings, bold, italic, links, code blocks, blockquotes.

**Auto-Save** — 2-second debounce. Writes file, no tagging.

**Manual Save (Cmd+S)** — Writes file AND triggers Ollama auto-tagging. Model: gemma3:4b. Suggests up to 5 tags from seed repository (27 predefined) + dynamically learned tags.

**Tag Repository** — Persisted in \\\`.tags.json\\\`. Grows as new tags are suggested and accepted.

**Delete** — Via tab bar trash icon or sidebar hover-reveal button. Both show confirmation dialog.

---

## Project Management

**ProjectScanner** — Background scan of configured paths. Detects projects by CLAUDE.md presence. Extracts: name, git branch, dirty status, SDD phase. Configurable scan depth (1-5).

**ProjectPopup** — Modal for project selection. Three sections: scan results (filterable), custom path (text + browse), kickoff (project launcher). Cards show name + git info + phase badge.

**ProjectCard** — Path display, git branch + "uncommitted" badge, SDD phase badge, context usage if active.

**KickoffDialog** — Project launcher modal. Fields: project directory (browse), requirements file (optional, browse), extra context (textarea). Launches /launch skill in dedicated session.

---

## Workspaces & Personas

**WorkspacesWindow** — Separate BrowserWindow (960×720). Two tabs: "workspaces" and "personas". Access: status bar "workspaces" button.

**Personas** — Roles with name, color, default prompt. Builtin: Orchestrator, MPO, Worker, empty (locked, prompt editable). Custom: fully editable. Color from PERSONA_SWATCHES palette.

**Workspaces** — Grid layout templates. Visual editor with merge handles (vertical cell spanning). Cell inspector: assign persona + project + custom prompt per cell.

**Prompt Resolution** — 3 levels: cell.prompt > workspace.promptOverrides[persona] > persona.defaultPrompt.

**Workspace Apply** — Resizes main grid, applies row merges, spawns sessions for non-empty cells with projects. Sets activeWorkspaceId.

**Persona Skill Sync** — Auto-generates .claude/skills/personas/ files from persona prompts.

**Grid Limits** — Max 7 columns × 3 rows. Consistent with MAX_GRID_COLS/MAX_GRID_ROWS.

---

## Orchestrator

**Purpose** — Delegates tasks to worker sessions, monitors progress, handles failures and bug reports.

**Start** — Click "orchestrator" in status bar.

**Template** — Generated CLAUDE.md at \\\`~/.config/cipher-mux/orchestrator/CLAUDE.md\\\`. Configurable: MCP host/port, API key, max retries.

**Worker Management** — Creates sessions via MCP tools. Worker-Startup Protocol: create → wait 8-10s → verify prompt → send instruction via tmux → monitor every 2 min.

**Bug Processing** — Serial queue. Monitors bugreport outbox. Spawns worker per bug, resolves via mux_bugreport_resolve.

**Failure Handling** — Up to maxRetries per task. After exhaustion: escalates to user via sidebar.

---

## MPO (Multi-Project Orchestrator)

**Purpose** — Decomposes large requirements into sub-projects, runs them in parallel, answers 90% of clarification questions autonomously.

**Start** — Click "mpo" in status bar. Manual only, no auto-start.

**10-Phase Lifecycle:**
1. Requirement Validation
2. Ambiguity & Clarification
3. Development Concept (decomposition strategy)
4. Detail Specs per Sub-Project
5. Session Startup (wave-based, respecting dependencies)
6. Monitoring Loop (7-minute cycles)
7. Escalation (5 levels)
8. Answer Distribution
9. Progress Tracking
10. Completion & Summary

**5 Escalation Levels:** L1-L2 autonomous, L3 cross-session, L4 web research, L5 user decision (bubble).

**Input Requests** — Sidebar bubbles: question + options + recommendation. Custom answer via textarea + Cmd+Enter.

**Session Naming** — \\\`cmux-mpo-{subprojekt-id}\\\`.

---

## Project Launcher

**Purpose** — Scaffolds new project directory (CLAUDE.md, SPEC.md, .claude/, .gitignore) and starts requirements interview.

**Two Stages:**
1. Scaffold: /launch skill generates project structure in target directory
2. Interview: auto-starts /interview in the scaffolded project

**Completion Detection** — \\\`.kickoff-complete\\\` marker file or \\\`kickoff_complete\\\` MCP tool call. Fallback: CLAUDE.md existence check on timeout.

**Managed Directory** — \\\`~/.config/cipher-mux/projectlauncher/\\\` (global template project).

---

## Themes

10 CSS custom property-based themes. Applied via \\\`body[data-theme="id"]\\\`. Persisted in ConfigStore.

| ID | Name | Character |
|---|---|---|
| cipher-ivory | Cipher Ivory | Clean light, default light mode |
| cipher-dark | Cipher Dark | Warm dark, default dark mode |
| blueprint | Blueprint | Engineer draft, cyan + indigo |
| warm-paper | Warm Paper | Minimal sepia |
| gruvbox-dark | Gruvbox Dark | Warm retro coder classic |
| nord | Nord | Cool Scandinavian frost |
| synthwave | Synthwave | 80s magenta + violet |
| matrix | Matrix | Phosphor green on black |
| brutalist | Brutalist | Black/white + signal red |
| high-contrast | High Contrast | WCAG AAA accessible |

Each theme defines: colors, geometry (border radius, spacing), fonts, ANSI palette (16 terminal colors), context usage colors, scanline effect intensity.

---

## Dialogs

**KickoffDialog** — Project launcher. Fields: directory, requirements file, extra context. Enter = submit, Escape = cancel.

**SessionDialog** — Raw session creation. Single path field + browse. Enter = submit.

**BugreportDialog** — Multi-mode: manual text, voice interview (Ollama enrichment), screenshot capture. Produces markdown report in bugreport outbox.

**RecoveryDialog** — Auto-appears on startup when orphaned tmux sessions exist. Per-session: adopt or kill.

**GridPlacementPopup** — Visual grid picker for placing session in specific slot.

**WorkspacePopup** — Quick workspace selection and apply. Shows thumbnails, legends, dimensions.

---

## Configuration

**ConfigStore** — JSON file at \\\`~/.config/cipher-mux/cipher-mux-config.json\\\`.

Key sections: personas, workspaces, activeWorkspaceId, app (scan paths, launcher path, timeouts), mcp (port, host, key), orchestrator (retries, intervals), agent (skipPermissions), ui (theme, grid state, sidebar), windows (position, size).

**Grid Persistence** — Saved after 300ms debounce. Auto-loaded on startup.

**Window State** — Position and size restored on startup.

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

const REF_MCP_TOOLS = `# MCP Tools Reference — cipher-mux v0.9.6

All tools available via the cipher-mux MCP server. Used by the Orchestrator, MPO, and any session with MCP access.

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

**Use case:** Orchestrator spawning a worker for a specific task.
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
**Use case:** Verifying the system is healthy before starting orchestration.

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
**Use case (with sessionId):** Sending task instructions directly into a worker's terminal via tmux send-keys. This is how the Orchestrator delivers initial prompts.
**Important:** Without sessionId/sessionName, the message only goes to the bus. Sessions do not auto-read the bus — they must call mux_read explicitly.

### mux_read

Read messages from the bus.

| Parameter | Type | Required | Description |
|---|---|---|---|
| topic | string | no | Filter by topic (status, bug, review, chat, system) |
| limit | number | no | Max messages to return (default: 20) |

**Returns:** Array of messages (id, topic, sender, text, timestamp).
**Use case:** Orchestrator monitoring worker progress, reading bug reports.

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
| source | string | no | Task origin (default: "orchestrator") |
| parent_id | string | no | Parent task ID (for sub-tasks) |
| policy | object | no | Execution policy (stall_timeout, max_retries, hooks) |

**Policy object:**
- \\\`stall_timeout\\\` (number) — seconds before task is considered stalled
- \\\`max_retries\\\` (number) — maximum retry attempts
- \\\`hooks.before_run\\\` (string) — shell command to run before task
- \\\`hooks.after_run\\\` (string) — shell command to run after task
- \\\`hooks.timeout\\\` (number) — hook timeout in seconds

**Returns:** Created task with ID.
**Use case:** Orchestrator creating work items, MPO creating sub-project tasks.

### mux_task_update

Update a task's state or result.

| Parameter | Type | Required | Description |
|---|---|---|---|
| task_id | string | yes | Task ID |
| state | enum | no | New state: dispatched, running, done, failed |
| session_id | string | no | Assigned session (required for dispatched→running) |
| result | object | no | Task result: { summary: string, data: any } |

**State machine:** queued → dispatched → running → done/failed
**Use case:** Worker reporting completion, Orchestrator tracking progress.

### mux_task_list

Query tasks with filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| state | string | no | Filter by state |
| source | string | no | Filter by source |
| parent_id | string | no | Filter by parent task ID |
| session_id | string | no | Filter by assigned session |

**Returns:** Array of matching tasks.

### mux_task_get

Get a single task with its children.

| Parameter | Type | Required | Description |
|---|---|---|---|
| task_id | string | yes | Task ID |

**Returns:** Task object including child tasks (sub-tasks).

---

## Bug Reports

### mux_bugreport_resolve

Mark a bugreport as fixed or failed.

| Parameter | Type | Required | Description |
|---|---|---|---|
| bugId | string | yes | Bug ID (e.g., BUG-2026-04-19-abc123) |
| status | enum | yes | Resolution: "fixed" or "failed" |
| summary | string | yes | What was done — fix description or failure reason |
| branchName | string | no | Git branch containing the fix (fixed only) |
| filesChanged | string[] | no | List of changed files |

**Use case:** Worker completing a bug fix, Orchestrator closing the bug.

---

## MPO Input Requests

### mux_input_request_create

Create a user-facing decision request in the sidebar.

| Parameter | Type | Required | Description |
|---|---|---|---|
| projectId | string | yes | Project or sub-project identifier |
| question | string | yes | The question for the user |
| context | string | no | Additional context (2-3 sentences) |
| options | array | no | Answer options (max 4) |
| recommendation | string | no | Key of the recommended option |

**Option object:** \\\`{ key: string, label: string, description?: string }\\\`

**Use case:** MPO escalating a Level 5 decision to the user. The bubble appears in the sidebar Input Requests tab.

---

## Project Launcher

### kickoff_complete

Signal that project scaffolding is finished.

| Parameter | Type | Required | Description |
|---|---|---|---|
| projectPath | string | yes | Absolute path to the project directory |
| projectName | string | yes | Project name (kebab-case) |
| detectedStack | string | no | Detected tech stack (e.g., "electron-ts", "python") |

**Use case:** The /launch skill calling this after completing scaffold. Triggers the transition from launcher session to interview session.
**Fallback:** If this tool is unavailable, writing an empty \\\`.kickoff-complete\\\` file in the project directory achieves the same effect.

---

## App Control

These tools let sessions control the cipher-mux UI — grid layout, session placement, sidebar visibility. Useful for the Voice Relay ("Zeig mir drei Fenster") and Companion ("Ich raeume das Grid auf").

### mux_grid_resize

Change the grid dimensions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| cols | number | yes | Number of columns (1-7) |
| rows | number | yes | Number of rows (1-3) |

**Use case:** "Mach das Grid 2x2" → \\\`mux_grid_resize(cols: 2, rows: 2)\\\`.
**Note:** Sessions that no longer fit in the resized grid move to background.

### mux_grid_place

Place a session in a specific grid cell.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |
| col | number | yes | Column index (0-based) |
| row | number | yes | Row index (0-based) |

**Use case:** "Pack die Auth-Session nach links oben" → \\\`mux_grid_place(sessionId, col: 0, row: 0)\\\`.

### mux_session_focus

Focus a session in the grid.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |

**Use case:** "Zeig mir die Payment-Session" → brings session into grid if in background, then focuses.

### mux_session_eject

Eject a session to background.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |

**Use case:** "Schieb die Session in den Hintergrund" → session continues running, moves to sidebar.

### mux_sidebar_toggle

Toggle sidebar visibility.

| Parameter | Type | Required | Description |
|---|---|---|---|
| visible | boolean | no | Force visible (true) or hidden (false). Omit to toggle. |

**Use case:** "Sidebar weg" → \\\`mux_sidebar_toggle(visible: false)\\\`.
`;

const REF_SHORTCUTS = `# Keyboard Shortcuts & UI Actions

Quick reference for all input methods in cipher-mux.

---

## Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| Cmd+B | Open bugreport dialog | Global |
| Escape | Close active dialog or overlay | Any dialog |
| Cmd+C | Copy selected text / cancel running process | Terminal |
| Cmd+V | Paste from clipboard | Terminal |
| Ctrl+Shift+Space | Toggle voice input mode | Global (voice enabled) |
| Cmd+S | Save note + trigger auto-tagging | Notes editor |
| Cmd+Enter | Submit input request answer | Sidebar Input Requests |
| Enter | Submit in dialogs | KickoffDialog, SessionDialog |

---

## Status Bar Actions (Click)

| Button | Action |
|---|---|
| Voice pill switch | Toggle voice input on/off |
| spalten + | Add grid column (max 7) |
| spalten − | Remove grid column (min 1) |
| zeilen + | Add grid row (max 3) |
| zeilen − | Remove grid row (min 1) |
| workspaces | Open Workspace/Persona editor window |
| orchestrator | Start or stop Orchestrator session |
| mpo | Start or stop Multi-Project Orchestrator |
| bugreport | Open bugreport dialog |
| sidebar | Show or hide sidebar panel |
| Theme name | Cycle to next visual theme |
| info | Open info/settings/shortcuts dialog |

---

## Cell Header Actions (Click)

| Button | Action |
|---|---|
| ↥ | Expand cell to full grid height (2+ rows only) |
| ↧ | Collapse cell back to normal height |
| ⇄ | Open Project Popup to switch project |
| \\\$ | Open plain shell in session's project directory |
| ✕ | Close session and free the cell |
| Drag header | Swap cell position with another cell |

---

## Sidebar Actions

| Action | How |
|---|---|
| Detach sidebar | Click ⧉ at sidebar top |
| Open note in grid | Double-click note in Notes tab |
| Delete note | Hover note in Notes tab → click 🗑 |
| Filter by tag | Click tag chip in Notes tab |
| Pull background session to grid | Click session card in Background tab |
| Submit input request | Type answer + Cmd+Enter in Input Requests tab |

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
