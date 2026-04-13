# Task-Liste — cipher-mux-electron

_Erstellt in Phase 4 aus SPEC.md, requirements.md und ADRs (2026-04-13)._

## Status-Legende

- `open` — Bereit zur Implementierung
- `in_progress` — Wird aktuell bearbeitet
- `blocked` — Wartet auf Abhängigkeit oder Entscheidung
- `done` — Implementiert und getestet
- `deferred` — Zurückgestellt

---

## Phase 1: Scaffold & Grundstruktur

Ziel: Lauffähige Electron-App mit leerem Fenster, Build-Pipeline, Shared Types.

| # | Task | Status | Depends | Parallel | Dateien | Akzeptanzkriterien |
|---|------|--------|---------|----------|---------|--------------------|
| 1.1 | **Projekt-Scaffold** — package.json, tsconfig (main + renderer), electron-builder.yml, Vite-Config, ESLint, Prettier | done (2026-04-13) | — | — | package.json, tsconfig*.json, electron-builder.yml, vite.config.ts, eslint.config.js, .prettierrc (~8 Dateien) | `npm install` + `npm run build` kompiliert fehlerfrei |
| 1.2 | **Shared Types & IPC Channels** — Typed Channel-Constants, Shared Interfaces (Session, Message, Project, ContextUsage), App-Konstanten | done (2026-04-13) | #1.1 | — | src/shared/ipc-channels.ts, types.ts, constants.ts (~3 Dateien) | TypeScript kompiliert, alle Interfaces exportiert |
| 1.3 | **Electron Shell** — main.ts (App-Lifecycle, Single Instance Lock), window-manager.ts (BrowserWindow), preload.ts (contextBridge), ipc-hub.ts (Stub) | done (2026-04-13) | #1.1 | — | src/main/main.ts, window-manager.ts, preload.ts, ipc-hub.ts, src/renderer/index.html (~5 Dateien) | `npm run start` öffnet Electron-Fenster, schliesst sauber |
| 1.4 | **Renderer Grundgerüst** — Preact App-Root, CSS-Theme (cipher ivory portiert), Fonts, Basis-Layout (Rail + Content + Sidebar Placeholder) | done (2026-04-13) | #1.3 | — | src/renderer/app.tsx, main.tsx, styles/theme.css, layout.css, components.css, fonts/* (~8 Dateien) | Fenster zeigt dunkles Theme mit Rajdhani-Heading und Activity Rail |
| 1.5 | **Utility-Module migrieren** — exec-util.ts, dependency-check.ts, ConfigStore (JSON-File Store) | done (2026-04-13) | #1.1 | #1.3 | src/main/util/exec-util.ts, dependency-check.ts, src/main/config/config-store.ts, test/main/dependency-check.test.ts (~4 Dateien) | Unit-Tests grün, tmux-Check erkennt installiertes tmux |

---

## Phase 2: tmux-Integration & Terminal-UI

Ziel: Funktionierende eingebettete Terminals mit tmux Control Mode Streaming.

| # | Task | Status | Depends | Parallel | Dateien | Akzeptanzkriterien |
|---|------|--------|---------|----------|---------|--------------------|
| 2.1 | **tmux Control Mode Parser** — tmux-parser.ts: `%output`, `%begin`/`%end`/`%error`, `%sessions-changed`, `%pane-changed`, Flow-Control-Events. Octal-Decoding. | done (2026-04-13) | #1.2 | — | src/main/tmux/tmux-parser.ts, test/main/tmux-parser.test.ts (~2 Dateien) | Unit-Tests: parst alle Event-Typen korrekt, dekodiert Octal-Sequences |
| 2.2 | **TmuxManager** — Control Mode Client (Child Process), connect/disconnect, createSession, killSession, listSessions, sendKeys, splitPane, resizePane. OutputBatcher (16ms). | done (2026-04-13) | #2.1, #1.5 | — | src/main/tmux/tmux-manager.ts, output-batcher.ts, test/main/output-batcher.test.ts (~3 Dateien) | Kann tmux-Session erstellen, Output empfangen, Keys senden. Batcher aggregiert Output. |
| 2.3 | **SessionManager** — Session-Registry (ULID-IDs), start/stop, Recovery (bestehende tmux-Sessions erkennen, orphaned markieren), MAX_SESSIONS=10 | done (2026-04-13) | #2.2, #1.5 | — | src/main/session/session-manager.ts (~1 Datei) | Sessions werden registriert, Recovery findet laufende tmux-Sessions, Limit wird enforced |
| 2.4 | **IPC Hub — Terminal-Channels** — cipher-mux:terminal:* und cipher-mux:sessions:* Channels verdrahten, preload.ts hat bereits alle Channels | done (2026-04-13) | #2.3, #1.3 | — | src/main/ipc-hub.ts (komplett verdrahtet) (~1 Datei) | Renderer kann via IPC Sessions starten/stoppen und Terminal-Daten empfangen |
| 2.5 | **Terminal-Pane UI** — TerminalPane.tsx (xterm.js + WebGL/Canvas-Fallback + FitAddon), PaneHeader.tsx, useTerminal.ts Hook, TerminalSplitter.tsx (Split/Resize) | done (2026-04-13) | #2.4, #1.4 | — | src/renderer/components/TerminalPane.tsx, PaneHeader.tsx, TerminalSplitter.tsx, hooks/useTerminal.ts (~4 Dateien) | User kann Terminal öffnen, tippen, Output sehen. Split funktioniert. Header zeigt Projektname. |
| 2.6 | **Activity Rail** — ActivityRail.tsx: Session-Icons (max 10), Cockpit-Icon, Orchestrator-Icon (Blitz), Info-Icon. View-Switching. Keyboard-Shortcuts (Cmd+0-9). | done (2026-04-13) | #2.5, #1.4 | — | src/renderer/components/ActivityRail.tsx, src/renderer/app.tsx (erweitern) (~2 Dateien) | Klick auf Icon wechselt View, Cmd+0 zeigt Cockpit, Cmd+1-9 fokussiert Sessions |

---

## Phase 3: Message Bus, MCP-Server & Chatroom

Ziel: Inter-Session-Kommunikation funktioniert end-to-end, MCP-Server erreichbar.

| # | Task | Status | Depends | Parallel | Dateien | Akzeptanzkriterien |
|---|------|--------|---------|----------|---------|--------------------|
| 3.1 | **MessageBus (SQLite)** — Schema, CRUD (send, getByTopic, markRead, unreadCount), Cleanup (7 Tage), WAL-Setup, Event-Emitter | done (2026-04-13) | #1.5, #1.2 | — | src/main/message-bus/message-bus.ts, schema.ts, test/main/message-bus.test.ts (~3 Dateien) | Unit-Tests: send/read/unread/cleanup funktioniert, WAL aktiv, Cleanup löscht alte Messages |
| 3.2 | **MCP-Server** — Streamable HTTP (via @modelcontextprotocol/sdk), API-Key-Auth, 7 Tools registriert (mux_send, mux_read, mux_status, mux_sessions, mux_create_session, mux_kill_session, mux_context_usage) | done (2026-04-13) | #3.1, #2.3 | — | src/main/mcp/mcp-server.ts, mcp-tools.ts, mcp-auth.ts (~3 Dateien) | curl mit Bearer-Token liefert Tool-Liste, Tools funktionieren, ohne Token: 401 |
| 3.3 | **IPC Hub — Message-Channels** — cipher-mux:messages:* Channels, preload.ts erweitern | done (2026-04-13) | #3.1, #2.4 | — | src/main/ipc-hub.ts (erweitern), src/main/preload.ts (erweitern) (~2 Dateien) | Renderer kann Messages senden/lesen via IPC |
| 3.4 | **Chatroom-Panel** — ChatroomPanel.tsx: Message-Feed (chronologisch, alle Topics), Input-Feld (bidirektional), System-Messages, useMessages.ts Hook. Cmd+K toggle. | done (2026-04-13) | #3.3, #2.6 | — | src/renderer/components/ChatroomPanel.tsx, hooks/useMessages.ts (~2 Dateien) | Cmd+K öffnet Sidebar, Messages erscheinen live, User kann Nachrichten senden |
| 3.5 | **Unread-Badges** — Activity Rail zeigt Unread-Count pro Session, Badge-Updates bei neuen Messages | done (2026-04-13) | #3.4, #2.6 | — | src/renderer/components/ActivityRail.tsx (erweitern) (~1 Datei) | Neue Message → Badge erscheint, Klick auf Session → Badge verschwindet |

---

## Phase 4: Cockpit, ProjectScanner & Context-Budget

Ziel: Projektübersicht, Session-Start per Klick, Context-Usage überall sichtbar.

| # | Task | Status | Depends | Parallel | Dateien | Akzeptanzkriterien |
|---|------|--------|---------|----------|---------|--------------------|
| 4.1 | **ProjectScanner** — Ordner-Scan (CLAUDE.md-Marker), Git-Status, SDD-Phase-Extraktion, fs.watch für Live-Updates. Port von v1 mit TypeScript. | done (2026-04-13) | #1.5 | — | src/main/project/project-scanner.ts, test/main/project-scanner.test.ts (~2 Dateien) | Findet Projekte im Scan-Pfad, erkennt Git-Branch, SDD-Phase, Watch meldet Änderungen |
| 4.2 | **IPC Hub — Project + Config Channels** — cipher-mux:projects:*, cipher-mux:config:*, preload erweitern | done (2026-04-13) | #4.1, #2.4 | — | src/main/ipc-hub.ts (erweitern), src/main/preload.ts (erweitern) (~2 Dateien) | Renderer kann Projekte auflisten und Config lesen/schreiben |
| 4.3 | **Cockpit-View** — CockpitView.tsx (Card-Grid), ProjectCard.tsx (Name, Phase, Branch, Context-%), Session-Start per Klick, useSessions.ts Hook | done (2026-04-13) | #4.2, #2.6 | — | src/renderer/components/CockpitView.tsx, ProjectCard.tsx, hooks/useSessions.ts (~3 Dateien) | Card-Grid zeigt Projekte, Klick startet Session, Cards zeigen Metadaten |
| 4.4 | **StatusLineMonitor** — fs.watch auf /tmp/cipher-mux/context/, JSON-Parsing, ContextUsage-Cache, Events (usage-updated, usage-warning >80%), statusLine-Config-Injection bei Session-Start | done (2026-04-13) | #2.3 | #4.1 | src/main/monitoring/statusline-monitor.ts, test/main/statusline-monitor.test.ts (~2 Dateien) | Empfängt Context-JSON, emitted Events, Warning bei >80% |
| 4.5 | **Context-Budget UI** — PaneHeader.tsx erweitern (Usage-%), CockpitView Cards erweitern, Chatroom Warning-Messages, useContextUsage.ts Hook, IPC Channels cipher-mux:context:* | done (2026-04-13) | #4.4, #4.3, #3.4 | — | src/renderer/hooks/useContextUsage.ts, diverse Komponenten erweitern (~4 Dateien) | Usage-% im Pane-Header, auf Cards, Warnung im Chatroom bei >80% |
| 4.6 | **StatusBar** — StatusBar.tsx: Session-Count, MCP-Port, Orchestrator-Status | done (2026-04-13) | #4.3, #3.2 | — | src/renderer/components/StatusBar.tsx (~1 Datei) | Untere Leiste zeigt aktive Session-Anzahl, MCP-Port, Orchestrator on/off |

---

## Phase 5: Orchestrator & Kick-off

Ziel: Orchestrator delegiert Tasks, Kick-off-Dialog erstellt neue Projekte.

| # | Task | Status | Depends | Parallel | Dateien | Akzeptanzkriterien |
|---|------|--------|---------|----------|---------|--------------------|
| 5.1 | **Orchestrator-Setup** — Verzeichnis erstellen (~/.config/cipher-mux/orchestrator/), CLAUDE.md aus Template generieren (MCP-Config-Injection), Orchestrator als spezielle Session starten | open | #3.2, #2.3 | — | src/main/session/orchestrator-template.ts, session-manager.ts (erweitern) (~2 Dateien) | Orchestrator-Verzeichnis + CLAUDE.md existiert, Session startet mit MCP-Config |
| 5.2 | **Orchestrator-UI** — Blitz-Icon in Activity Rail, Start/Stop Toggle, Orchestrator-Messages im Chatroom hervorheben | open | #5.1, #3.4, #2.6 | — | ActivityRail.tsx (erweitern), ChatroomPanel.tsx (erweitern) (~2 Dateien) | Blitz-Icon sichtbar, Klick startet Orchestrator, Messages visuell unterscheidbar |
| 5.3 | **KickoffManager** — Projektverzeichnis erstellen, Requirements-Datei kopieren, Scaffold vorbereiten (CLAUDE.md, docs/), tmux-Session spawnen, /interview auto-starten | open | #2.3, #4.1 | #5.1 | src/main/project/kickoff-manager.ts (~1 Datei) | Kickoff erstellt Verzeichnis, kopiert Requirements, startet Session mit Interview |
| 5.4 | **Kickoff-Dialog UI** — KickoffDialog.tsx: Dateipfad-Input (mit Electron file picker), Zielverzeichnis-Input, Projektname, Bestätigung. Cmd+N trigger. | open | #5.3, #1.4 | — | src/renderer/components/KickoffDialog.tsx (~1 Datei) | Cmd+N öffnet Dialog, File-Picker funktioniert, Bestätigung triggert Kickoff |
| 5.5 | **MCP Auto-Injection** — Bei jedem Session-Start: MCP-Server-Config (.claude/settings.json oder Env-Vars) automatisch in die Claude Code Session injizieren | open | #3.2, #2.3 | #5.1 | src/main/session/session-manager.ts (erweitern) (~1 Datei) | Neue Sessions haben automatisch MCP-Tools verfügbar |

---

## Phase 6: Polish, Info & Bugreport

Ziel: Info-Seite, Bugreport, Session-Recovery, Layout-Persistenz, finale Integration.

| # | Task | Status | Depends | Parallel | Dateien | Akzeptanzkriterien |
|---|------|--------|---------|----------|---------|--------------------|
| 6.1 | **Session-Recovery** — Bei App-Start: tmux-Sessions erkennen, bekannte Sessions wiederherstellen, unbekannte als orphaned anzeigen, UI zum Beenden von Orphans | open | #2.3, #2.6 | — | session-manager.ts (erweitern), ActivityRail.tsx (erweitern) (~2 Dateien) | Nach Crash+Neustart: Sessions wieder sichtbar, Orphans beendbar |
| 6.2 | **Layout-Persistenz** — Split-Layout bei jeder Änderung speichern (debounced 500ms), bei App-Start wiederherstellen | open | #2.5, #1.5 | #6.1 | app.tsx (erweitern), config-store.ts (erweitern) (~2 Dateien) | Layout überlebt App-Neustart |
| 6.3 | **Info-Seite** — InfoPage.tsx: Shortcuts-Tabelle, Feature-Beschreibungen, Workflow-Hinweise. Activity Rail Icon. | open | #2.6, #1.4 | #6.1 | src/renderer/components/InfoPage.tsx (~1 Datei) | Erreichbar via Activity Rail, zeigt alle Shortcuts und Features |
| 6.4 | **Bugreport-Modus** — BugreportManager (Main): App-Version, OS, Session-States, Logs sammeln. BugreportDialog.tsx (Renderer): Anzeige + Export (JSON/Markdown). | open | #2.3, #1.5 | #6.3 | src/main/bugreport/bugreport-manager.ts, src/renderer/components/BugreportDialog.tsx (~2 Dateien) | Bugreport sammelt Diagnostik, Export erzeugt lesbare Datei |
| 6.5 | **Keyboard-Shortcuts komplett** — Alle Shortcuts (Cmd+0-9, Cmd+Backslash, Cmd+Minus, Cmd+K, Cmd+N, Cmd+W) via Electron globalShortcut oder Renderer-Handler, Konflikt-Vermeidung mit xterm.js | open | #2.6, #5.4, #3.4 | — | src/main/main.ts (erweitern), app.tsx (erweitern) (~2 Dateien) | Alle 7 Shortcuts funktionieren korrekt, kein Konflikt mit Terminal-Input |
| 6.6 | **Integration & Smoke-Test** — End-to-End-Flow: App starten, Projekt scannen, Session starten, Terminal nutzen, Message senden, Chatroom lesen, Orchestrator starten, Kickoff durchführen | open | #5.4, #6.1, #6.5 | — | Kein neuer Code, Test-Durchlauf (~0 Dateien) | Alle Akzeptanzkriterien aus SPEC.md Abschnitt 7 bestanden |

---

## Abhängigkeits-Graph (Übersicht)

```
Phase 1: Scaffold
  1.1 ──> 1.2 ──> (Phase 2+3+4)
  1.1 ──> 1.3 ──> 1.4
  1.1 ──> 1.5 (parallel zu 1.3)

Phase 2: tmux + Terminal
  2.1 ──> 2.2 ──> 2.3 ──> 2.4 ──> 2.5 ──> 2.6

Phase 3: MessageBus + MCP + Chatroom (startet parallel zu Phase 2 ab 2.3)
  3.1 ──> 3.2
  3.1 ──> 3.3 ──> 3.4 ──> 3.5

Phase 4: Cockpit + Context (startet parallel ab Phase 2+3)
  4.1 ──> 4.2 ──> 4.3
  4.4 (parallel zu 4.1)
  4.5 (nach 4.3 + 4.4 + 3.4)
  4.6 (nach 4.3 + 3.2)

Phase 5: Orchestrator + Kickoff (nach Phase 3+4)
  5.1 ──> 5.2
  5.3 ──> 5.4
  5.5 (parallel zu 5.1)

Phase 6: Polish (nach Phase 5)
  6.1, 6.2, 6.3, 6.4 (weitgehend parallel)
  6.5 (nach UI-Komponenten)
  6.6 (nach allem)
```

## Zusammenfassung

| Phase | Tasks | Dateien (ca.) | Beschreibung |
|-------|-------|---------------|-------------|
| 1 | 5 | ~27 | Scaffold, Types, Electron Shell, Theme, Utils |
| 2 | 6 | ~16 | tmux Control Mode, Terminal UI, Activity Rail |
| 3 | 5 | ~12 | MessageBus, MCP-Server, Chatroom, Badges |
| 4 | 6 | ~14 | ProjectScanner, Cockpit, StatusLine, Context-UI |
| 5 | 5 | ~7 | Orchestrator, Kickoff, MCP-Injection |
| 6 | 6 | ~9 | Recovery, Persistenz, Info, Bugreport, Shortcuts |
| **Total** | **33** | **~85** | |
