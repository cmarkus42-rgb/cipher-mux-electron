# Feature Reference — cipher-mux v0.9.6

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

**STT Engine** — Whisper.cpp via `@fugood/whisper.node`. Model: `~/.config/cipher-mux/models/whisper/ggml-small.bin`. Runs locally, no network.

**VAD** — Silero ONNX in browser. Detects speech start/end automatically. No push-to-talk button needed (though Ctrl+Shift+Space toggles voice mode).

**Voice Commands** — "abschicken"/"absenden"/"senden" = Enter. "neue zeile" = newline. Text is inserted without auto-submit — you review first, then voice-submit.

**TTS** — Piper, used only in bugreport voice interview mode. Not used for session interaction.

---

## Notes Editor

**NoteManager** — Filesystem CRUD. Global: `~/.config/cipher-mux/notes/`. Workspace-scoped: `~/.config/cipher-mux/notes/workspace-<id>/`.

**Format** — Markdown with YAML frontmatter (gray-matter). Fields: title, tags.

**Editor** — CodeMirror 6 with live markdown rendering. Headings, bold, italic, links, code blocks, blockquotes.

**Auto-Save** — 2-second debounce. Writes file, no tagging.

**Manual Save (Cmd+S)** — Writes file AND triggers Ollama auto-tagging. Model: gemma3:4b. Suggests up to 5 tags from seed repository (27 predefined) + dynamically learned tags.

**Tag Repository** — Persisted in `.tags.json`. Grows as new tags are suggested and accepted.

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

**Template** — Generated CLAUDE.md at `~/.config/cipher-mux/orchestrator/CLAUDE.md`. Configurable: MCP host/port, API key, max retries.

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

**Session Naming** — `cmux-mpo-{subprojekt-id}`.

---

## Project Launcher

**Purpose** — Scaffolds new project directory (CLAUDE.md, SPEC.md, .claude/, .gitignore) and starts requirements interview.

**Two Stages:**
1. Scaffold: /launch skill generates project structure in target directory
2. Interview: auto-starts /interview in the scaffolded project

**Completion Detection** — `.kickoff-complete` marker file or `kickoff_complete` MCP tool call. Fallback: CLAUDE.md existence check on timeout.

**Managed Directory** — `~/.config/cipher-mux/projectlauncher/` (global template project).

---

## Themes

10 CSS custom property-based themes. Applied via `body[data-theme="id"]`. Persisted in ConfigStore.

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

**ConfigStore** — JSON file at `~/.config/cipher-mux/cipher-mux-config.json`.

Key sections: personas, workspaces, activeWorkspaceId, app (scan paths, launcher path, timeouts), mcp (port, host, key), orchestrator (retries, intervals), agent (skipPermissions), ui (theme, grid state, sidebar), windows (position, size).

**Grid Persistence** — Saved after 300ms debounce. Auto-loaded on startup.

**Window State** — Position and size restored on startup.

---

## Limitations

- **macOS only** — tmux dependency (Homebrew)
- **Max 21 sessions** — 7×3 grid limit
- **Context warning** — orange at 80%+ usage, red at 90%+
- **Message retention** — 7 days, auto-cleanup every 6 hours
- **Whisper model** — must be at `~/.config/cipher-mux/models/whisper/ggml-small.bin`
- **better-sqlite3 ABI** — separate rebuilds for test (Node.js) vs app (Electron)
- **Preact, not React** — ~3KB, React-compatible API, some ecosystem libs need aliasing
