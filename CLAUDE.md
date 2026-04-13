# cipher-mux-electron

Electron-basierte Kommandozentrale für Claude Code Projekte. Ein Fenster mit eingebetteten Terminals (tmux + xterm.js), Message Bus für Inter-Session-Kommunikation, MCP-Server, Orchestrator-Session und komfortablem Projekt-Kick-off.

## Aktueller Status

**Phase: 4 → 5 — Autonome Implementierung**

Phasen-Übersicht:
1. ~~Anforderungsinterview (Touchpoint) → `docs/requirements.md`~~ ✅ (2026-04-13)
2. ~~Spezifikation erstellen (Autonom) → `docs/SPEC.md`~~ ✅ (2026-04-13)
3. ~~Technische Entscheidungen (Touchpoint) → `docs/decisions/`~~ ✅ (2026-04-13)
4. ~~Task-Dekomposition (Autonom) → `docs/todo.md`~~ ✅ (2026-04-13)
5. **Autonome Implementierung (Autonom) → Code** ← aktuell
6. Review, Test & Iteration (Touchpoint) → Feedback-Loop

**Nächster Schritt:** `/implement` fortsetzen — Phase 1 + 2 (Core) + 3.1 + 4.1 done. Nächste: Terminal-UI (2.5), Chatroom (3.4), Cockpit (4.3).

## Build & Test

```bash
npm install
npm run build          # TypeScript + Electron Builder
npm run dev            # Electron dev mit Hot-Reload
npm run test           # Node.js test runner
npm run lint           # ESLint
```

## Projektstruktur

```
cipher-mux-electron/
├── CLAUDE.md
├── package.json
├── tsconfig.json / tsconfig.main.json / tsconfig.renderer.json
├── electron-builder.yml
├── docs/
│   ├── SPEC.md            ← Technische Spezifikation (Phase 2)
│   ├── requirements.md    ← Anforderungskatalog (Phase 1)
│   ├── todo.md            ← Task-Liste mit Abhängigkeiten (Phase 4)
│   └── decisions/         ← ADRs (Phase 3)
├── .claude/
│   ├── settings.json
│   └── skills/            ← Workflow-Skills für jede Phase
├── src/
│   ├── main/
│   │   ├── main.ts, window-manager.ts, ipc-hub.ts, preload.ts
│   │   ├── tmux/          ← TmuxManager (Control Mode), Parser, Batcher
│   │   ├── message-bus/   ← SQLite CRUD, Schema, Types
│   │   ├── mcp/           ← Streamable HTTP Server, Tools, Auth
│   │   ├── session/       ← SessionManager, Recovery
│   │   ├── project/       ← ProjectScanner, KickoffManager
│   │   ├── config/        ← ConfigStore (electron-store)
│   │   ├── monitoring/    ← StatusLineMonitor
│   │   ├── bugreport/     ← BugreportManager
│   │   └── util/          ← exec-util, dependency-check
│   ├── renderer/
│   │   ├── app.tsx, index.html
│   │   ├── components/    ← ActivityRail, TerminalPane, Chatroom, Cockpit, etc.
│   │   ├── hooks/         ← useTerminal, useMessages, useSessions, useContextUsage
│   │   ├── styles/        ← theme.css, layout.css, components.css
│   │   └── fonts/         ← Rajdhani, Fira Code
│   └── shared/
│       ├── ipc-channels.ts ← Typed Channel Constants
│       ├── types.ts        ← Shared Interfaces
│       └── constants.ts
└── test/
    └── main/              ← Unit-Tests für Business-Logik
```

## Referenz-Projekte

- `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-desktop-electron` — Electron-Patterns, Build-Setup, IPC-Bridge
- `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux` — v1 (Node.js HTTP-Server), Module zur Migration: ProjectScanner, ConfigStore, WorkspaceLoader

## Infrastruktur

- **Session-Backend:** tmux (macOS, Homebrew)
- **Message Bus:** SQLite via better-sqlite3 (WAL-Modus, Single-Writer aus Main Process)
- **MCP-Server:** localhost HTTP im Main Process
- **Persistenz:** ConfigStore (JSON), SQLite (Messages/Sessions)
- **Keine externe API** — nutzt Claude Code CLI für LLM-Interaktion

## Code-Konventionen

- TypeScript strict mode
- Preact mit JSX (`.tsx` für Renderer-Komponenten)
- ESLint + Prettier
- Electron: contextIsolation=true, nodeIntegration=false
- IPC: typed channels via shared types
- CSS: cipher ivory Design System (Rajdhani Headings, Fira Code Mono, dunkles Theme)
- Naming: camelCase für Variablen/Funktionen, PascalCase für Komponenten/Klassen

## Architekturentscheidungen

- **ADR-001:** tmux Control Mode (-C) für Streaming — `docs/decisions/ADR-001-tmux-streaming.md`
- **ADR-002:** Streamable HTTP für MCP Transport — `docs/decisions/ADR-002-mcp-transport.md`
- **ADR-003:** statusLine-Hook für Context-Usage (real-time) — `docs/decisions/ADR-003-statusline-integration.md`
- **ADR-004:** Vite als Renderer-Bundler — `docs/decisions/ADR-004-renderer-bundler.md`
- **ADR-005:** WebGL + Canvas-Fallback für xterm.js — `docs/decisions/ADR-005-xterm-renderer.md`
- **ADR-006:** ulidx für ULID-Generierung — `docs/decisions/ADR-006-ulid-library.md`
- **ADR-007:** 7 Tage zeitbasierte Message-Retention — `docs/decisions/ADR-007-message-retention.md`
- **ADR-008:** Strukturiertes Orchestrator CLAUDE.md Template — `docs/decisions/ADR-008-orchestrator-template.md`

## Bekannte Constraints

- **macOS-only:** tmux als harte Abhängigkeit, osascript-Integration
- **tmux als einziges Session-Backend:** Kein Dual-Stack mit node-pty. Sessions überleben Electron-Crashes
- **Single-Writer SQLite:** Nur Main Process schreibt — kein Concurrent-Write-Problem
- **xterm.js Streaming:** High-frequency tmux-Output erfordert Batching/Throttling der IPC-Bridge
- **Preact statt React:** ~3KB, React-API-kompatibel, aber einige React-Ecosystem-Libs brauchen Aliasing

## Workflow-Regeln

1. **Spec first:** Kein Code ohne Eintrag in SPEC.md oder todo.md
2. **Kleine Batches:** Max 5-10 Dateien pro Commit
3. **Tests bei jeder Änderung:** Unit-Tests für Business-Logik
4. **ADR vor Implementierung:** Jede technische Entscheidung wird in `docs/decisions/` dokumentiert
5. **Phasen einhalten:** Skills folgen dem 6-Phasen-Prozess — keine Phase überspringen

## Skill-Referenz

| Phase | Skill | Zweck |
|-------|-------|-------|
| 1 | `/interview` | Anforderungsinterview durchführen |
| 2 | `/spec` | Technische Spezifikation aus Requirements erstellen |
| 3 | `/decide` | ADRs für offene Entscheidungspunkte erstellen |
| 4 | `/decompose` | SPEC.md in implementierbare Tasks zerlegen |
| 5 | `/implement` | Nächsten offenen Task implementieren |
| — | `/doc-review` | Dokumentation mit Code-Stand abgleichen |
