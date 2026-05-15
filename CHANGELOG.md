# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.103] — 2026-05-15

### Added
- **Hub-First Setup:** New users are prompted to choose a Hub directory on first launch — the organizational home for all cipher-mux projects. Folder picker defaults to `hubPath/projects/`.
- **Model Routing Pipeline:** `mux_create_session` accepts `model` parameter (haiku/sonnet/opus). SubProjekt.model is read at session spawn and passed as `--model` CLI flag to Claude Code.

### Removed
- **ProjectScanner:** The legacy project scanning system (`scanPaths`, `scanDepth`, `defaultProjectDir`, `ProjectCard`, `useProjects` hook) has been completely removed. Projects are now selected via folder picker, not automatic directory scanning.

### Fixed
- **HubSetupDialog default path:** Dialog pre-fills with resolved home path (`~/cipher-mux/`) instead of showing it only as placeholder.
- **README broken link:** `ref/mcp-tools.md` → `docs/mcp-tools.md`.
- **Security:** `.mcp.json` and `*-mcp-connection.md` added to `.gitignore` to prevent token leaks.

## [0.9.102] — 2026-05-13

### Changed
- Development cruft removed from repository

## [0.9.101] — 2026-05-12

### Added
- **Detachable Windows:** Pop-out sessions and notes as standalone desktop windows
- **Focus Mode 2x2:** Focused cell fills grid, Notes Focus, WASD navigation skips notes
- **Voice Relay Architecture:** Hot-swap voices without restart, sentence pipelining with pause injection, amplitude-based barge-in detector
- **Voice Catalog:** Multi-voice support with catalog browser and download UI
- **Bugreport Triage Mode:** Entity-routing for Workshop with Debugger/Ideation/CF dispatch
- **Tag Management v2:** Class-grouped UI, merge flow, synonym system, class CRUD
- **Theme Editor Expansion:** Session token group (--session-bg, --session-text, --session-border, --session-font-size), terminal colors
- **TTS Verbosity:** Two-level system with focus gate and speech interrupt
- **Global Notes:** Cross-workspace visibility option
- **Testcase Collaboration:** Resolution status for failed testcases, testing-assistant preset rules
- **Enhanced Preset Display:** Preset info rendered in workspace editor grid cells
- **Workspace Editor Icons:** Lucide icons replace unicode in session headers
- **i18n Foundation:** i18next + react-i18next with EN/DE locales, language switcher in Settings
- **Notes MCP Full CRUD:** `mux_notes_read`, `mux_notes_update`, `mux_notes_search`, `mux_notes_delete`, `mux_notes_handoff_create`, `mux_notes_handoff_search`
- **Session Resume:** `--resume` flag support for entity sessions, manual sessions get checkbox
- **Session Fork:** Fork button in SessionCell for Claude Code sessions
- **Orphan Detection:** Periodic scan for orphaned tmux sessions with Adopt/Terminate UI
- **Workspace-Scoped Notes:** Notes auto-tagged with `workspace:<name>`, sidebar filter toggle (show all / workspace only)
- **Workspace-Scoped Memory:** `companion_memory_write` auto-scopes to workspace, recall/search merge user + active workspace memories
- **Workspace Context Injection:** Workspace prompt + context directories injected into all entity sessions
- **Persona Resolver:** Per-preset persona dropdown with resolution hierarchy (global active > preset override > matrix default > fallback)

### Changed
- Persona section text generalized (removed hardcoded Mimir references)
- Companion preset is persona-neutral (Relay/Mimir identity references removed)
- Workspace tags use human-readable workspace name instead of internal ID
- Orchestrator entity renamed to Workshop
- Architecture docs updated to v0.9.995
- Entity dispatch conditionals replaced with map pattern in app.tsx
- `getActiveWorkspace` extracted as helper

### Fixed
- **Security:** Timing attack fix in auth path, path traversal protection, body size limits enforced
- **Audit v0.9.996:** 3 HIGH + 2 MEDIUM findings resolved
- Grid overflow, screenshot clipboard, workspace labels, STT filter
- Notes editor state loss on move, keep-working restore
- Companion info popup synced with current feature state
- Terminal CSS vars read from body (not documentElement)
- Strict tag validation in `mux_notes_create`
- Entity session tracking for orphan detection (`autoLaunchedSessions`)
- Stale orchestrator preset remnant removed from preset list
- `mux_create_session` auto-launches Claude CLI, `mux_send` splits paste+Enter
- Sidebar dock-button, theme-name nav, focus-mode font, OS shortcuts
- GitHub delivery opens browser after gh CLI
- STT restore after bugreport voice, STT detach routing
- Voice preview audio format, clipboard paste/copy
- Gapless TTS, symlinks, STT hallucination filter
- Tag-delete handler rebuild, per-class tag creation
- Detach-restore consistency, STT in detached windows
- i18n: translate hardcoded English strings in Workspace Editor to German
- Scanlines removed from cipher-ivory theme
- Save error-handling in DetachedNoteView + mcp-auth unit tests
- `cachedRecoveryResult` moved out of keepWorking path, delay to prevent race

### Removed
- InputRequest system removed (replaced by entity-native flows)
- Models tab removed from Settings
- Legacy Sokrates character replaced with Theaitetos

## [0.9.100] — 2026-05-08

### Bugfix Welle 1 (16 Bugs)
- **Preset Editor Source Split:** CLAUDE.md editor split into structured 4-tab view with live preview
- **Sidebar Notes double-click:** Opens note in grid cell instead of toggling sidebar
- **Grid drag ghost image:** Eliminated stale drag preview on fast moves
- **Workspace apply race:** Grid resize completes before session spawning begins
- **Entity stop cleanup:** Session removal from grid slots on entity stop
- **Preset dropdown z-index:** Renders above grid cells in workspace editor
- **Notes frontmatter merge:** Custom fields preserved on save (regression from RT-1)
- **Theme editor save-as:** Clone flow copies all tokens correctly
- **Voice command fuzzy match:** Reduced false positives for grid-nav commands
- **TTS queue priority:** Interrupt priority correctly preempts queued speech
- **Context bar color thresholds:** Yellow at 60%, red at 80% (was 50/70)
- **Sidebar activity LED:** Blinks on new messages, solid when panel open
- **Workspace prompt injection:** Handles missing projectPath gracefully
- **Cell inspector preset sync:** Dropdown reflects current cell assignment after apply
- **MCP session GC timing:** Inactivity timer resets on tool calls (not just HTTP)
- **StatusLine parser edge case:** Handles missing `context_window` field without crash

### Bugfix Welle 2 — Pre-existing Test Fixes
- Fixed 12 test regressions from Cyber Factory Wave 5 feature-flag cutover
- Stabilized flaky timing-dependent tests (voice pipeline, session recovery)
- Test count: 858 (0 failures)

### Bugfix Welle 3 — Preset-Lektorat
- **EN Homogenization:** All 8 preset CLAUDE.md templates rewritten in consistent English
- Removed mixed DE/EN fragments from entity templates
- Unified terminology across presets (e.g. "findings" not "Befunde", "handoff" not "Uebergabe")

### Feature Welle F1
- **Cipher Adult Voice Bundle:** New TTS voice profile with lower pitch and natural pacing
- **Update Checker:** Automatic check for new releases on startup (configurable, opt-out in Settings)

### Feature Welle F2
- **Tag Management:** Merge tags, exclusive tag groups, tag cycle (rotate through group)
- **Notes File Watching:** External file changes detected and reloaded in editor

### Feature Welle F3
- **Focus Mode Full-Screen:** Focused cell expands to fill entire grid, dimming others
- **Note Editor Font Size:** Configurable font size for CodeMirror editor (10-32px)
- **Preset Sort:** Presets sortable by name, category, or usage frequency in picker

### Feature Welle F4
- **Workspace Notes Cells:** Notes can be assigned to workspace grid cells (alongside sessions and presets)
- **Sorting:** Configurable sort order for sessions, notes, and presets in sidebar
- **Onboarding:** First-launch onboarding flow with interactive setup wizard walkthrough

### Feature Welle F5
- **Session Screenshots:** Capture terminal screenshots (PNG) via Cmd+Shift+S or MCP tool
- **Persona Avatars:** Custom avatar images for personas, displayed in session headers and sidebar
- **Legacy Archive:** Automated archival of sessions older than configurable threshold (default 30 days)

## [0.9.10] — 2026-05-02

### Fixed
- **Keep Working Restore: 3-Layer Bug (critical).** Grid showed correct dimensions after restart but empty cells. Three independent bug layers masking each other:
  - **Layer 1 (v0.9.9):** Race condition `useGrid` mount vs. `applyKeepWorkingRestore` — `restoreCalledRef` guard
  - **Layer 2:** Stale session IDs in `ui.grid` config + one-time pull got `null` because init chain wasn't ready — synchronous startup clear + poll with retry (500ms/10s)
  - **Layer 3 (Root Crash):** `tmux list-panes -a` occasionally returned malformed lines — `tmuxSession.name` was `undefined` — `TypeError` in `recover()` silently crashed the entire init chain. Only error diagnostics in `.catch()` made the crash visible.
  - Defensive fixes: malformed-line filter in `listSessions()`, undefined guard in `recover()`, error logging to `/tmp/kw-debug.json`

## [0.9.9] — 2026-05-02 (Open Beta)

### Highlights
v0.9.9 is the "more-is-more" milestone — the last iteration before the Cyber Factory pipeline. cipher-mux is now a fully functional multi-session cockpit for Claude Code with voice control, entity presets, workspace management, and multi-instance support.

### Added
- **Multi-Instance Presets:** Entity presets can now run multiple simultaneous sessions. Companion, Refinement, Voice, Audit, and custom presets are multi-instance by default. Orchestrator, MPO, and Launcher remain singletons (`singleInstance: true`). Each new instance gets a unique tmux session name and numbered display name (e.g. "Coding Companion #2").
- **Universal Persona Injection (E.1):** Active companion persona injected into ALL entity CLAUDE.md at session start.
- **Dynamic Entity Scanner (E.3):** Scans `~/.config/cipher-mux/entities/` for CLAUDE.md dirs, registers them as launchable presets. Replaces hardcoded `ENTITY_PRESETS`.
- **New Entities: Watchdog + Project Launcher:** Watchdog (adversarial testing) and Project Launcher (autonomous sub-project worker).
- **`mux_tts_speak` MCP Tool (F.2):** Entity-driven TTS — any entity session can speak text aloud via MCP.
- **STT Pin-to-Session (F.3):** Pin voice dictation to a specific session via StatusBar toggle.
- **Context Usage Color Bar (G.4):** Color-coded progress bar in session header (green/yellow/red).
- **Settings Tabs (G.1):** Info/Settings restructured into 5 tabs: General, Appearance, Shortcuts, Voice, About.
- **Tag-based Notes Scoping (P.1):** Flat storage with tag-based categorization replacing scope directories.
- **Notes Migration (P.3):** Automatic migration from scope-directory layout to flat storage.
- **Workspace Default Tags (P.2, P.5):** `defaultTags` in workspace config, auto-applied to new notes.
- **Hierarchical Tag Tree (C.1):** Sidebar Notes shows collapsible tag tree with tri-state filter.
- **Testcase Parser + View (D.1):** Markdown checkbox testcases with `noteType: 'testcase'`. TestcaseView UI with screenshot integration.
- **STT Dictation in Notes Editor (C.4):** Voice dictation directly into CodeMirror Notes Editor.
- **Theme Editor Preview (G.8):** Preview/revert button for theme changes.
- **Shortcuts Listing (G.3):** Complete keyboard shortcuts listing with i18n.
- **Sidebar Window Close/Dock (G.5):** X closes, dock button reintegrates.
- **Human-readable tmux session names:** `cmux-orchestrator-a1b2` instead of `cmux-q3r8x7m1`.
- **Voice & TTS:** Global TTS playback, conversation engine voice commands, BT Shutter integration.
- **Drag-and-Drop Sidebar-to-Grid:** Sessions + notes draggable from sidebar to grid cells.
- **Background Session Cards:** Rich cards with session name, project path, context/token bar, last 3 lines of output.

### Changed
- **EntityConfig `singleInstance` flag:** New optional boolean. When `true`, only one session per entity allowed.
- **Entity CLAUDE.md Template Rewrite (E.4):** All templates follow unified format: Role, Persona, Memory, Capabilities, Working Rules, Scope, TTS instruction.
- **Border-Glow Highlight Redesign (B.7):** `mux_ui_highlight` uses border-glow (box-shadow) instead of outline.
- **`mux_ui_open` Toggle/Close (B.8):** Supports `action: 'open'|'close'|'toggle'` and `tab` context parameter.
- **Settings renamed from Info (G.2):** "Info" -> "Settings" throughout UI.
- **`mux_send` plaintext delivery (H.5, H.6):** Push delivery sends plaintext instead of base64.

### Fixed
- **MCP HTTP Timeout (A.4):** Disabled server timeouts preventing MCP connection drops.
- **Drag-and-Drop Race (A.1):** Eliminated stale-closure race in SessionGrid.
- **Stale Grid Slots (A.2):** Reactive cleanup when sessions die.
- **Orphaned Entity Session IDs (A.3):** Clear mappings when sessions terminate.
- **Grid Placement Duplicate (A.5):** Remove from old slot before placing.
- **TestcaseView Rendering (D.1):** Parser moved to main process via IPC.
- **Ghost Session Recovery:** Sessions removed from sessions.json on stop. Grid slots scrubbed.
- **Notes Frontmatter Merge (RT-1):** save() preserves custom frontmatter fields.
- **Grid-Place Double Display (RT-10):** removeSession() called before setSessionAtSlot().
- **Theme-Editor Built-in Immutable (RT-W2):** Built-in themes are read-only.
- Various voice, sidebar, workspace, preset editor, and grid fixes.

## [0.9.5-beta] — 2026-04-24

### Added
- **Unified Sidebar Panel:** replaces Chatroom + Input Requests with a single auto-visible panel
- **SIDEBAR button with activity LED** in StatusBar
- **Background Session Cards:** rich cards with context/token bar — click to place in grid
- **Grid Placement Popup:** visual grid popup to pick which slot to replace when grid is full
- **Detachable Sidebar:** sidebar can be detached as standalone resizable window
- **Cell split (unmerge) handle:** orange handle on fully-merged cells
- **Skip-permissions toggle:** `--dangerously-skip-permissions` toggle in Settings with warning

### Changed
- Sidebar is purely passive (no chat input field)
- Worker built-in persona removed

### Fixed
- `mux_send` push delivery, `mux_create_session` visible placement
- Terminal width with sidebar, detach persistence, workspace apply end-to-end

## [0.8.9-beta] — 2026-04-24

### Added
- **Workspaces & Personas system:** grid-based workspace editor with cell inspector, 3-level prompt resolution
- **Separate Workspaces/Personas window:** dedicated 960x720 editor window
- **Workspace apply:** resize grid, apply merges, spawn sessions for assigned projects
- **Persona skill sync:** auto-generates `.claude/skills/personas/` skills from persona prompts
- **Shell session button:** `$` button spawns plain zsh shell in same project directory
- **Visible sessions (MCP):** `mux_create_session` with `visible: true`
- **Message push delivery:** `mux_send` with `sessionName` injects directly into target tmux pane
- README, CONTRIBUTING, ARCHITECTURE, CHANGELOG documentation
- GitHub issue/PR templates, GitHub Actions CI, Linux AppImage build support

### Changed
- Grid dimension limits enforced: max 7 columns x 3 rows
- Merge handles always visible (25% opacity) and clickable

### Fixed
- Theme button opens correct settings tab
- Input fields in workspace editor no longer overflow
- Tab bar padded for macOS window controls

## [0.8.8-beta] — 2026-04-23

### Added
- Theme system: 10 themes with CSS custom properties and ANSI terminal colors
- Theme picker with live preview swatches
- MCP session GC (30min inactivity)
- StatusLine 2.x parser for Claude Code context_window format
- Terminal resize debounce (150ms) with min-size guard

### Fixed
- Session recovery reliability
- skip-permissions config via ConfigStore
- Context usage display for Claude Code 2.x format

## [0.8.3-beta] — 2026-04-22

### Fixed
- Grid: fixed 380px cell height with programmatic window resize
- StatusLine: migrate hooks.StatusLine to top-level setting
- Grid: resize BrowserWindow height when rows change

## [0.8.2-beta] — 2026-04-20

### Added
- Input Requests sidebar panel with file watcher and IPC bridge
- StatusLine hook injection for per-session context usage monitoring
- Keyboard shortcuts wiring and UTF-8 chunk boundary handling

### Fixed
- Window not showing and terminal width issues
- Voice echo cancellation with dual-phase guard and barge-in suppression
- Test determinism for statusline-monitor

### Changed
- Extract terminal theme to shared module with contrast improvements

## [0.8.1-beta] — 2026-04-19

### Added
- VAD-based voice pipeline: always-listen conversation mode with Silero VAD, Whisper STT, Piper TTS
- Project launcher integration into project popup dialog
- Task infrastructure: SQLite state machine, TaskWatcher, TaskHooks, BugreportTaskSource
- 4 MCP tools for task management
- Orchestrator template with task management instructions

### Fixed
- WCAG AA contrast for Ivory theme and terminal ANSI colors
- Keep tmux sessions alive on app quit
- Voice: piper model path, asar-unpack for DMG builds
- Terminal: decode multi-byte UTF-8 from tmux octal escapes

### Security
- Voice module: security and code quality audit

## [0.8.0-beta] — 2026-04-17

### Added
- Bugreport system with Ollama enrichment and preview flow
- Git-based version generation at build time
- Session grid layout with configurable columns/rows
- Ivory (light) and dark theme with CSS custom properties
- ProjectPopup modal, redesigned StatusBar

### Fixed
- Deep merge saved config with defaults to prevent data loss
- Strip Electron zoom accelerators so Cmd shortcuts reach renderer

## [0.7.0-beta] — 2026-04-16

### Added
- Shortcut registry (Cmd+0, Cmd+K, Cmd+N)
- Split-view terminal system with keyboard shortcuts
- Type-aware session recovery with orphan dialog
- InfoSettingsView (shortcuts, features, settings tabs)
- Outbox-based bugreport system with diagnostics collection

### Fixed
- Terminal session switching and orphan cleanup

## [0.6.0-beta] — 2026-04-14

### Added
- Orchestrator autostart and session UX
- Kickoff dialog with SDD skills integration
- KickoffOrchestrator with MCP and marker-file completion
- StatusLineMonitor for context usage tracking
- MCP Server with Streamable HTTP transport and bearer auth
- Chatroom panel with unread badges

## [0.5.0-beta] — 2026-04-13

### Added
- Initial project scaffold
- Core modules: TmuxManager, MessageBus, SessionManager, ProjectScanner
- UI components: Cockpit, Terminal Panes, Activity Rail
- IPC Hub with typed channels
- ConfigStore with JSON persistence
