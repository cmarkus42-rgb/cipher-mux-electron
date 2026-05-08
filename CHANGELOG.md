# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-08

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
- Unified terminology across presets (e.g. "findings" not "Befunde", "handoff" not "Übergabe")

### Feature Welle F1
- **Cipher Adult Voice Bundle:** New TTS voice profile with lower pitch and natural pacing
- **Update Checker:** Automatic check for new releases on startup (configurable, opt-out in Settings)

### Feature Welle F2
- **Tag Management:** Merge tags, exclusive tag groups, tag cycle (rotate through group)
- **Notes File Watching:** External file changes detected and reloaded in editor

### Feature Welle F3
- **Focus Mode Full-Screen:** Focused cell expands to fill entire grid, dimming others
- **Note Editor Font Size:** Configurable font size for CodeMirror editor (10–32px)
- **Preset Sort:** Presets sortable by name, category, or usage frequency in picker

### Feature Welle F4
- **Workspace Notes Cells:** Notes can be assigned to workspace grid cells (alongside sessions and presets)
- **Sorting:** Configurable sort order for sessions, notes, and presets in sidebar
- **Onboarding:** First-launch onboarding flow with interactive setup wizard walkthrough

### Feature Welle F5
- **Session Screenshots:** Capture terminal screenshots (PNG) via Cmd+Shift+S or MCP tool
- **Persona Avatars:** Custom avatar images for personas, displayed in session headers and sidebar
- **Legacy Archive:** Automated archival of sessions older than configurable threshold (default 30 days)

## [0.9.9] — 2026-05-02 (Pre-Cyberfactory Plateau)

### Added
- **Multi-Instance Presets:** Entity presets can now run multiple simultaneous sessions. Companion, Refinement, Voice, Audit, and custom presets are multi-instance by default. Orchestrator, MPO, and Launcher remain singletons (`singleInstance: true`). Each new instance gets a unique tmux session name (ULID suffix) and numbered display name (e.g. "Coding Companion #2"). `ENTITY_STOP` accepts optional `sessionId` for targeted instance shutdown. `ENTITY_STATUS` returns `sessionIds[]` array.
- **Universal Persona Injection (E.1):** Active companion persona (character block) injected into ALL entity CLAUDE.md at session start. Character definitions split into tone/style block and companion-specific tasks.
- **Dynamic Entity Scanner (E.3):** `EntityScanner` scans `~/.config/cipher-mux/entities/` for CLAUDE.md dirs, registers them as launchable presets. Hardcoded `ENTITY_PRESETS` replaced by `useEntityPresets` hook.
- **New Entities: Watchdog + Project Launcher:** Watchdog (adversarial testing assistant) and Project Launcher (autonomous sub-project worker) with full CLAUDE.md.
- **`mux_tts_speak` MCP Tool (F.2):** Entity-driven TTS — any entity session can speak text aloud via MCP. Parameters: `text`, `priority` (`normal`/`interrupt`).
- **STT Pin-to-Session (F.3):** Pin voice dictation to a specific session via StatusBar toggle. Pinned session receives all STT regardless of grid focus.
- **Context Usage Color Bar (G.4):** Color-coded progress bar in session header (green/yellow/red).
- **Settings Tabs (G.1):** Info/Settings restructured into 5 tabs: General, Appearance, Shortcuts, Voice, About.
- **Tag-based Notes Scoping (P.1):** Flat storage with tag-based categorization replacing scope directories.
- **Notes Migration (P.3):** Automatic migration from scope-directory layout to flat storage.
- **Workspace Default Tags (P.2, P.5):** `defaultTags` in workspace config, auto-applied to new notes. UI in workspace save dialog.
- **Hierarchical Tag Tree (C.1):** Sidebar Notes shows collapsible tag tree with tri-state filter (include/exclude/neutral).
- **Testcase Parser + View (D.1):** Markdown checkbox testcases with `noteType: 'testcase'`. TestcaseView UI with screenshot integration.
- **STT Dictation in Notes Editor (C.4):** Voice dictation directly into CodeMirror Notes Editor.
- **Theme Editor Preview (G.8):** Preview/revert button for theme changes.
- **Shortcuts Listing (G.3):** Complete keyboard shortcuts listing with i18n.
- **Sidebar Window Close/Dock (G.5):** X closes, dock button reintegrates.
- **Human-readable tmux session names:** `cmux-orchestrator-a1b2` instead of `cmux-q3r8x7m1`.

### Changed
- **EntityConfig `singleInstance` flag:** New optional boolean on `EntityConfig`. When `true`, only one session per entity allowed. Default `false` enables multi-instance. `entitySessionIds` refactored from `Map<EntityId, string>` to `Map<EntityId, Set<string>>`.
- **Entity CLAUDE.md Template Rewrite (E.4):** All templates follow unified format: Role, Persona, Memory, Capabilities, Working Rules, Scope, TTS instruction.
- **EntityId type extensible:** `BuiltinEntityId | (string & {})` supports dynamically scanned entities.
- **Border-Glow Highlight Redesign (B.7):** `mux_ui_highlight` uses border-glow (box-shadow) instead of outline. Theme-aware colors.
- **`mux_ui_open` Toggle/Close (B.8):** Supports `action: 'open'|'close'|'toggle'` and `tab` context parameter.
- **Settings renamed from Info (G.2):** "Info" → "Settings" throughout UI.
- **Orchestrator Template Learnings (H.1):** Quality gates, session continuity, tmux rules, bugfix phase model.
- **Workspace Project Selector (G.7):** Finder browse replaced with project datalist.
- **`mux_send` plaintext delivery (H.5, H.6):** Push delivery sends plaintext instead of base64.

### Fixed
- **MCP HTTP Timeout (A.4):** Disabled server timeouts preventing MCP connection drops.
- **Drag-and-Drop Race (A.1):** Eliminated stale-closure race in SessionGrid.
- **Stale Grid Slots (A.2):** Reactive cleanup when sessions die.
- **Orphaned Entity Session IDs (A.3):** Clear mappings when sessions terminate.
- **Grid Placement Duplicate (A.5):** Remove from old slot before placing.
- **Double Spaces in STT (F.5):** Prevent double spaces between STT segments.
- **BugReport Popup Z-Index (F.6):** Renders above Settings dialog.
- **Demo Mode Launcher Event (B.3):** Fixed event name mismatch.
- **Demo Mode Backdrop/Sidebar (B.6, B.9, B.5):** Opacity, highlight positioning, scrollTo.
- **Cmd+C/V/X/A in Notes Editor (C.3):** Clipboard operations in CodeMirror.
- **Terminal Restore Fragmentation (H.9):** Two-phase restore prevents line fragmentation.
- **Workspace Window Mount (G.10):** Error handling for mount race + theme fix.
- **Template Tests (E.4):** Test expectations aligned with template rewrite.

### Changed (Workspace & Entity Cleanup, 2026-04-29 Nachmittag)
- **EntityPickerPopup extracted:** LauncherCell popup refactored into reusable `EntityPickerPopup.tsx`. Used in both grid LauncherCell and Workspace Editor cell inspector.
- **Workspace Editor uses Popup:** Cell inspector replaced `<select>` dropdown with the real EntityPickerPopup (same as grid). Presets, Paths, Notes all selectable per cell.
- **Companion button removed from Workspace Popup:** Redundant shortcut — Companion editor is in the Workspaces window.
- **Dynamic entityStatus:** Running indicator computed from active sessions (`session.entityId`) instead of 6 hardcoded state variables. All dynamic entities now show running status.

### Fixed (Bug-Fix-Runde 2026-04-29, nach Watchdog-Testlauf)
- **TestcaseView Rendering (D.1):** Parser moved to main process via IPC — `require('gray-matter')` fails in Vite/ESM renderer.
- **STT Notes Cursor (C.4):** Cursor positioned after inserted text, not before.
- **Ghost Session Recovery:** Sessions removed from sessions.json on stop. Grid slots scrubbed. tmux kill retries.
- **Orchestrator/MPO Entity Migration:** Removed BUILTIN_PERSONAS, both run as entity directories with full CLAUDE.md.
- **Preset Editor UI (E.2):** New PresetEditor component — 4-tab editor (Rolle/Faehigkeiten/Arbeitsregeln/Scope) in Workspaces window.
- **Workspace Editor Presets:** Preset dropdown per cell, default star, tags visible/editable in editor.
- **Workspace Active Status:** Stale activeWorkspaceId cleared on restart when no default set.
- **Sidebar Click/Dblclick:** 250ms delay pattern separates single-click (toggle) from double-click (open in grid).
- **STT Auto-Unpin Background:** Pinned session auto-unpins when moved to background.
- **LauncherCell Running Indicator:** Pulsing dot + colored name + tinted background for active presets.
- **MCP Grid-Place/Resize:** Fixed resize() signature (object not args) + stale closure via gridRef.
- **MCP Permissions for Voice-Relay:** Template-less entities get auto-generated permissions.allow.
- **Resume Button (E.7):** Split-button in LauncherCell popup for --resume.
- **Compact Background Sessions (C.5):** 2-line default, click to expand, double-click to open.
- **Drag & Drop Sidebar→Grid (C.6):** Sessions + notes draggable from sidebar to grid cells.
- **Pin Icon CSS-Art:** Replaced emoji with CSS circle indicator.

### Fixed (RT-Runde Bug-Fixes 2026-04-30, nach Watchdog-Retest)
- **NoteManager.save() Custom Frontmatter (RT-1):** save() preserves custom frontmatter fields (type, from_session etc.) via spread over existing FM data.
- **Grid-Place Doppelte Anzeige (RT-10, REGRESSION):** removeSession() called before setSessionAtSlot() — old cell cleared before placing in new one.
- **Theme-Editor Built-in Immutable (RT-W2):** Built-in themes are read-only. Save redirects to "Save As" for built-ins. customThemeTokens cleared on theme switch.
- **MPO Persona Override (RT-4):** Persona section in MPO CLAUDE.md with explicit override against global persona. Dynamic injection adds override hint.
- **Pin UI Reset on Unpin (RT-8):** pinChanged events forwarded via IPC to renderer. STT deactivation resets pinned/pinnedSessionId.
- **Workspace Active Status Startup (RT-6):** activeWorkspaceId always cleared on startup instead of only when no default set.
- **EntityPickerPopup Stale State (RT-12/13):** Combined handleCellAssign sets presetId + project atomically in single updateWs call.
- **MPO GridSelector Popup (GridSelector):** placeMpo() uses addSession() for free slots. Popup only when grid is actually full.

## [Unreleased] — v0.10 (SP-1 through SP-5)

### Added
- **i18n foundation:** i18next + react-i18next with EN/DE locales. Language switcher in Settings. (SP-1)
- **Notes MCP full CRUD:** `mux_notes_read`, `mux_notes_update`, `mux_notes_search`, `mux_notes_delete`, `mux_notes_handoff_create`, `mux_notes_handoff_search` (SP-2)
- **Session Resume (SP-5):** `--resume` flag support for entity sessions. Manual sessions get checkbox.
- **Session Fork (SP-5):** Fork button in SessionCell for Claude Code sessions.
- **Orphan Detection (SP-5):** Periodic scan for orphaned tmux sessions with Adopt/Terminate UI.
- **30 new tests** covering SP-2 and SP-5 quality gates
- **Workspace-Scoped Notes:** Notes auto-tagged with `workspace:<name>` when workspace is active. Sidebar filter button filters by workspace scope. Toggle button (show all / workspace only) works with name-based tags.
- **Workspace-Scoped Memory:** `companion_memory_write` auto-scopes to `scope_kind=workspace` when workspace is active. `companion_memory_recall` and `companion_memory_search` merge user + active workspace memories (excluding other workspaces). Sidebar memory view respects workspace scoping.
- **Workspace Context Injection:** Workspace prompt + context directories injected into ALL entity sessions (via workspace apply, launcher, or autostart). Cell project path included as context directory for preset-based entities.
- **Persona Resolver:** Per-preset persona dropdown. Resolution hierarchy: global active > preset override > matrix default > fallback.

### Changed
- Persona section text generalized (removed hardcoded Mimir references from assembly code)
- Companion preset: persona-neutral (Relay/Mimir identity references removed)
- Workspace tags use human-readable workspace name instead of internal ID
- `filterByWorkspace()` matches `workspace:<name>` tags (was broken `scope:<id>` format)

## [0.9.9] - 2026-05-02

### Highlights
v0.9.9 is the **"more-as-more" milestone** — the last iteration before public release. CipherMux is now a fully functional multi-session cockpit for Claude Code with voice control, entity presets, workspace management, and multi-instance support.

### Added
- **Multi-Instance Presets:** Entity presets (Companion, Refinement, Voice, Audit, custom) can run multiple simultaneous sessions. Each instance gets a unique tmux session name and numbered display name (e.g. "Coding Companion #2"). Orchestrator, MPO, Launcher remain singletons via `singleInstance: true`. UI shows "+" for startable multi-instance presets vs. "running" for singletons.
- **Voice & TTS:** Global TTS playback, conversation engine voice commands, BT Shutter integration
- **UI Polish:** Highlight overlay border-glow, workspace popup improvements, session cell context bar, testcase view with screenshots, theme editor preview/revert, drag-and-drop sidebar→grid
- **MCP Tools:** `mux_ui_highlight` border-glow, `mux_ui_open` toggle/close, `mux_tts_speak`
- **Preset Editor:** 4-tab CLAUDE.md editor (Rolle/Fähigkeiten/Arbeitsregeln/Scope) in Workspaces window
- **Dynamic Entity Scanner:** Scans `~/.config/cipher-mux/entities/` for custom presets
- **Universal Persona Injection:** Active character injected into all entity CLAUDE.md at start

### Changed
- `EntityConfig` gains `singleInstance` boolean — `entitySessionIds` refactored to `Map<EntityId, Set<string>>`
- Entity templates follow unified format (Role, Persona, Memory, Capabilities, Rules, Scope, TTS)
- Workspace project selector uses datalist instead of Finder

### Fixed
- Multi-instance presets blocked by frontend singleton logic — EntityPickerPopup now respects `singleInstance` flag
- MCP HTTP timeout, drag-and-drop race, stale grid slots, orphaned entity session IDs
- Keep Working restore 3-layer bug (race condition + stale IDs + tmux malformed lines)
- Various voice, BT Shutter, sidebar, workspace, and grid fixes

---

## [0.9.10] - 2026-05-02

### Fixed
- **Keep Working Restore: 3-Layer Bug (critical).** Grid zeigte nach Restart korrekte Dimensionen aber leere Zellen. Drei unabhängige Bug-Layer, die sich gegenseitig maskierten:
  - **Layer 1 (v0.9.9):** Race Condition `useGrid` mount vs. `applyKeepWorkingRestore` — `restoreCalledRef` Guard
  - **Layer 2:** Stale Session-IDs in `ui.grid` Config + einmaliger Pull der `null` bekam weil Init-Chain noch nicht fertig — synchroner Startup-Clear + Poll mit Retry (500ms/10s)
  - **Layer 3 (Root Crash):** `tmux list-panes -a` lieferte gelegentlich malformed Lines → `tmuxSession.name` war `undefined` → `TypeError` in `recover()` crashte die gesamte Init-Chain still. Erst Error-Diagnostik im `.catch()` machte den Crash sichtbar.
  - Defensive Fixes: Malformed-Line Filter in `listSessions()`, undefined-Guard in `recover()`, Error-Logging nach `/tmp/kw-debug.json`

## [0.9.5-beta] - 2026-04-24

### Added
- **Unified Sidebar Panel:** replaces Chatroom + Input Requests with a single auto-visible panel containing Messages, Background Sessions, and Requests sections
- **SIDEBAR button with activity LED** in StatusBar — sections auto-show/hide based on state (orchestrator, background sessions, MPO)
- **Background Session Cards:** rich cards with session name, project path, context/token bar, last 3 lines of output — click to place in grid
- **Grid Placement Popup:** when grid is full, visual grid popup lets user pick which slot to replace
- **Detachable Sidebar:** sidebar can be detached as standalone resizable window, grid reclaims full width, state persisted across restarts
- **Cell split (unmerge) handle:** orange handle on fully-merged cells to split them back apart
- **Skip-permissions toggle:** Settings tab has `--dangerously-skip-permissions` toggle with warning indicator
- **Persona hints:** Orchestrator/MPO editor shows note that persona prompt affects communication style only

### Changed
- Sidebar is purely passive (no chat input field) — Message Bus is an audit log, not a communication channel
- Chat toggle and Input Requests toolbar buttons removed (replaced by single SIDEBAR button)
- Worker built-in persona removed (orchestrator manages subagent prompts directly)
- Config migration auto-removes Worker persona from persisted config on load

### Fixed
- **E2 push delivery:** `mux_send` with `sessionName` now correctly injects via tmux send-keys (removed broken readiness check)
- **E4 visible session:** `mux_create_session` with `visible:true` reliably places session in grid (retry mechanism for IPC race)
- **S1 orchestrator button:** toggle now queries live status before acting (no stale local state)
- **Terminal width with sidebar:** `useGrid` fitGrid calls now account for sidebar panel width via ref
- **Detach persistence:** `sidebarDetached` properly typed in AppConfig, auto-restores on app start
- **Workspace apply end-to-end:** grid resize + merges + session spawning + prompt injection all wired correctly
- **Workspace prompt overrides:** layout fixed, readable colors, "load default" button, pre-fill on new override

## [0.8.9-beta] - 2026-04-24

### Added
- **Workspaces & Personas system:** grid-based workspace editor with cell inspector, 3-level prompt resolution (cell > workspace override > persona default), merge handles for vertical cell spanning
- **Separate Workspaces/Personas window:** dedicated 960x720 editor window (no longer in settings popup)
- **Workspace apply:** load a workspace to resize grid, apply merges as rowSpans, and spawn sessions for assigned projects
- **Persona skill sync:** auto-generates `.claude/skills/personas/` skills from persona prompts
- **Shell session button:** `$` button in session headers spawns plain zsh shell in the same project directory
- **Visible sessions (MCP):** `mux_create_session` with `visible: true` places session directly in the grid
- **Background session cards:** sessions not in grid appear as collapsible cards in the chatroom panel
- **Message push delivery:** `mux_send` with `sessionName` injects message directly into target tmux pane
- README, CONTRIBUTING, ARCHITECTURE, CHANGELOG documentation
- GitHub issue and PR templates
- GitHub Actions CI (macOS + Linux)
- Linux AppImage build support

### Changed
- Workspace/Personas tabs removed from Info/Settings popup (moved to own window)
- Grid dimension limits enforced: max 7 columns x 3 rows (workspace editor + main grid)
- Merge handles now always visible (25% opacity) and clickable (not hover-only)
- Override prompts pre-fill with persona default instead of starting empty

### Fixed
- Theme button now opens settings tab (was opening shortcuts tab)
- Input fields in workspace editor no longer overflow container
- Tab bar in workspaces window padded for macOS window controls

## [0.8.8-beta] - 2026-04-23

### Added
- Theme system: 10 themes (cipher-ivory, cipher-dark, blueprint, warm-paper, gruvbox-dark, nord, synthwave, matrix, brutalist, high-contrast) with CSS custom properties and ANSI terminal colors per theme
- Theme picker in settings with live preview swatches
- MCP session GC (garbage collection after 30min inactivity)
- StatusLine 2.x parser for Claude Code context_window nested format
- Terminal resize debounce (150ms) with min-size guard

### Fixed
- Session recovery reliability
- skip-permissions config via ConfigStore (`agent.skipPermissions`)
- Context usage display for Claude Code 2.x format

## [0.8.3-beta] - 2026-04-22

### Fixed
- Grid: use fixed 380px cell height with programmatic window resize
- StatusLine: migrate hooks.StatusLine to top-level statusLine setting
- Grid: resize BrowserWindow height when rows change

## [0.8.2-beta] - 2026-04-20

### Added
- Input Requests sidebar panel with file watcher and IPC bridge (MPO integration)
- StatusLine hook injection for per-session context usage monitoring
- Keyboard shortcuts wiring and UTF-8 chunk boundary handling

### Fixed
- Window not showing and terminal width issues
- Voice echo cancellation with dual-phase guard and barge-in suppression
- Test determinism for statusline-monitor

### Changed
- Extract terminal theme to shared module with contrast improvements

## [0.8.1-beta] - 2026-04-19

### Added
- VAD-based voice pipeline: always-listen conversation mode with Silero VAD, Whisper STT, Piper TTS
- Project launcher integration into project popup dialog
- Task infrastructure: SQLite state machine, TaskWatcher, TaskHooks, BugreportTaskSource
- 4 MCP tools for task management (`mux_task_create`, `mux_task_update`, `mux_task_list`, `mux_task_get`)
- Orchestrator template with task management instructions

### Fixed
- WCAG AA contrast for Ivory theme and terminal ANSI colors
- Keep tmux sessions alive on app quit
- Voice: piper model path, asar-unpack for DMG builds, VoiceManager reset on init failure
- Kickoff: launcher session grid assignment, timeout/error state handling
- Ollama: use Node http.request instead of fetch for localhost calls
- Terminal: decode multi-byte UTF-8 from tmux octal escapes

### Security
- Voice module: security and code quality audit

## [0.8.0-beta] - 2026-04-17

### Added
- Bugreport system with Ollama enrichment and preview flow
- Git-based version generation at build time
- Session grid layout with configurable columns/rows
- Ivory (light) and dark theme with CSS custom properties
- ProjectPopup modal, redesigned StatusBar
- Grid controls (useGrid, useTheme hooks with config persistence)

### Fixed
- Deep merge saved config with defaults to prevent data loss
- Strip Electron zoom accelerators so Cmd shortcuts reach renderer

## [0.7.0-beta] - 2026-04-16

### Added
- Shortcut registry (Cmd+0, Cmd+K, Cmd+N)
- Split-view terminal system with keyboard shortcuts
- Type-aware session recovery with orphan dialog
- InfoSettingsView (shortcuts, features, settings tabs)
- Outbox-based bugreport system with diagnostics collection

### Fixed
- Terminal session switching and orphan cleanup

## [0.6.0-beta] - 2026-04-14

### Added
- Orchestrator autostart and session UX
- Kickoff dialog with SDD skills integration
- KickoffOrchestrator with MCP and marker-file completion
- StatusLineMonitor for context usage tracking
- MCP Server with Streamable HTTP transport and bearer auth
- Chatroom panel with unread badges

## [0.5.0-beta] - 2026-04-13

### Added
- Initial project scaffold
- Core modules: TmuxManager, MessageBus, SessionManager, ProjectScanner
- UI components: Cockpit, Terminal Panes, Activity Rail
- IPC Hub with typed channels
- ConfigStore with JSON persistence
