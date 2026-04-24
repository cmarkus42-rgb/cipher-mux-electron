# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
