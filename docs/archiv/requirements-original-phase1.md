# Anforderungskatalog — cipher-mux-electron

_Erhoben in Phase 1 via strukturiertem Interview (2026-04-13)._

## Vision

cipher-mux wird von einem Browser-basierten Session-Launcher zu einer Electron-basierten Kommandozentrale für Claude Code Projekte. Ein Fenster, alles drin: eingebettete Terminals, Message Bus zwischen Sessions, Orchestrator-Session, komfortabler Projekt-Kick-off.

**Zielzustand:** Morgens cipher-mux öffnen, Orchestrator starten. "Bug in X" → Auftrag geben, delegiert automatisch. "Neues Projekt" → Anforderungsdokument + Zielverzeichnis angeben, ein Klick, Interview läuft. Kein cd, kein Fenster-Wechsel, kein manuelles Koordinieren.

## Zielgruppe

Christian (Single-User) — Power-User mit 5+ parallelen Claude-Code-Sessions, der kognitive Overhead durch manuelles Session-Management reduzieren will.

## Kernfeatures

### 1. Eingebettete Terminals (tmux + xterm.js)

- tmux als einziges Session-Backend (Sessions überleben Electron-Crashes)
- xterm.js rendert tmux-Output im Renderer Process
- Pane-Splitting (horizontal/vertikal, resize per Drag)
- Pane-Header mit Projektname, SDD-Phase, Context-Usage (%)
- tmux-Streaming-Mechanismus (pipe-pane vs capture-pane) wird in Phase 3 als ADR evaluiert — Kriterien: Robustheit, Funktionalität, Umsetzbarkeit

### 2. Activity Rail + Flexible Layout

- Icon-Leiste (48px links) für Session-Wechsel
- Drei Zustände: Fokussiert, Split-View, Cockpit-View
- Keyboard-Shortcuts (⌘1-9, ⌘\, ⌘-, ⌘K, ⌘N, ⌘W) — fix im MVP, konfigurierbar als späteres QoL-Feature
- Maximal 10 gleichzeitige Sessions (UI-Obergrenze, erweiterbar bei Bedarf)

### 3. Message Bus (SQLite)

- Inter-Session-Kommunikation
- Topics: status, bug, review, chat, system
- ULID-basierte Message-IDs
- Unread-Badges in Activity Rail
- Single-Writer aus Main Process (WAL-Modus)

### 4. MCP-Server

- Standard-MCP-Protokoll (JSON-RPC), HTTP-Transport im Main Process
- **Auth:** API-Key-basiert (Defense in Depth)
- **Netzwerk-Scope:** Konfigurierbare IP/Port, erreichbar aus lokalem Netz und Tailscale
- **Tools:**
  - `mux_send` — Nachricht an Session/Topic senden
  - `mux_read` — Nachrichten aus Topic lesen
  - `mux_status` — Status einer/aller Sessions abfragen
  - `mux_sessions` — Aktive Sessions auflisten
  - `mux_create_session` — Neue Session erstellen (für Orchestrator-Delegation)
  - `mux_kill_session` — Session beenden
  - `mux_context_usage` — Context-Window-Usage pro Session abfragen
- **Externe Clients:** OpenClaw (via MCPorter) als bekannter externer Consumer
- Auto-Injection der MCP-Config in neue Claude-Code-Sessions

### 5. Chatroom-Panel

- Rechte Sidebar (⌘K toggle)
- **Bidirektional:** User kann Nachrichten an Sessions/Orchestrator senden
- Live-Messages aus dem Message Bus (Activity Feed)
- System-Messages (Session started/stopped, Delegation, Errors)
- Context-Usage-Warnungen (>80%) pro Session
- Abgrenzung: Chatroom = koordinierte Kommunikation, Terminal-Pane = roher Output

### 6. Orchestrator-Session

- Dediziertes Verzeichnis (~/.config/cipher-mux/orchestrator/)
- Eigener CLAUDE.md mit Rollendefinition
- Claude-Code-Agent, der selbst denkt und via MCP-Tools delegiert
- Zwei Delegation-Pfade:
  - **Direkt:** Orchestrator erhält Auftrag, zerlegt selbst in Sub-Tasks, delegiert an Sessions
  - **Launcher-basiert:** UI-Kick-off erzeugt todo.md mit passend dimensionierten Tasks
- ⚡-Icon in der Activity Rail
- Erhält Context-Usage aller Sessions als Signal für Task-Dimensionierung
- **Fehlerbehandlung:** Bei Session-Fehler → Analyse + Retry, maximal 2 Extra-Runden, dann User-Rückfrage
- Session-Typ: Gleichwertig wie alle anderen, nur spezieller CLAUDE.md

### 7. Cockpit-View

- Projektübersicht als Card-Grid
- Pro Card: Projektname, Status, SDD-Phase, Context-Budget (%)
- Session-Start per Klick
- Ordner-basierte Projektentdeckung (konfigurierbarer Scan-Pfad, kein Workspace-System)
- Context-Usage-Anzeige pro Projekt

### 8. Komfortabler Kick-off

- **Dialog-UI:** Anforderungsdokument (lokaler Dateipfad) + Zielverzeichnis (auswählbar, Default: Claude-Projektverzeichnis)
- **Flow:**
  1. User gibt Dateipfad zum Anforderungsdokument + Zielverzeichnis an
  2. Launcher liest Dokument, erstellt Projektverzeichnis, bereitet Scaffold vor
  3. Spawnt tmux-Session im neuen Verzeichnis
  4. Startet Auto-Interview (`/interview`) in der neuen Session
- fs.watch auf neues Verzeichnis für Live-Status-Updates im Cockpit

### 9. Context-Budget-Anzeige

- **Datenquelle:** Claude Code `statusLine`-Hook (JSON via stdin, ~300ms Refresh, keine API-Kosten)
- **Verfügbare Daten:** `used_percentage`, `remaining_percentage`, Token-Counts, Context-Window-Size, Model-ID, Session-ID
- **Anzeige-Orte:**
  - Pane-Header (pro Terminal)
  - Cockpit-View Cards
  - Chatroom (Warnung bei >80%)
  - MCP-Tool `mux_context_usage` (für Orchestrator/externe Clients)
- **Zukunft [VORGEMERKT]:** Orchestrator-Lernschleife — Context-Usage-History in SQLite speichern, damit Orchestrator Tasks immer besser dimensioniert ("80% Context vor /new"-Optimierung)

## Nicht-funktionale Anforderungen

### Resilience
- Electron-Crash → tmux-Sessions laufen weiter
- Recovery bei Neustart: Alle bekannten Sessions automatisch wieder einbinden
- Verwaiste Sessions (von früherem Lauf): Sichtbar in UI, aufrufbar, beendbar
- Delegation-Fehler: Max 2 Retry-Runden, dann User-Rückfrage

### Performance
- Terminal-Streaming mit Batching/Throttling (Referenz: Hyper Terminal)
- Max 10 gleichzeitige Sessions
- StatusLine-Polling ~300ms (Claude Code gibt Takt vor)

### Sicherheit
- MCP-Server: API-Key-Authentifizierung
- Netzwerk: Nur lokales Netz / Tailscale
- Electron: contextIsolation=true, nodeIntegration=false
- Keine externe API — nutzt Claude Code CLI für LLM-Interaktion

### Persistenz
- Layout-State bei jeder Änderung speichern (nicht nur Graceful Shutdown)
- ConfigStore (JSON) für App-Einstellungen
- SQLite (WAL) für Messages, Sessions, Context-Usage-History (letzteres: Zukunft)

### Design
- cipher ivory Design System (Rajdhani Headings, Fira Code Mono, dunkles Theme)
- Ruhige Ästhetik: ausreichend Kontraste, keine zu deutlichen hellen Akzente
- Usability-Verbesserungen gegenüber v1 wo sinnvoll
- macOS-only

## Datenmodell (Kern-Entitäten)

### Session
- ID (ULID), Name, Projektpfad, tmux-Session-Name
- Status (active, stopped, orphaned)
- Context-Usage (cached from statusLine)
- Typ: Alle gleichwertig, Orchestrator hat speziellen CLAUDE.md

### Message
- ID (ULID), Topic, Sender (Session-ID / "user"), Payload (JSON)
- Timestamp, Read-Status (für Unread-Badges)

### Project
- Pfad, Name, SDD-Phase, Git-Status
- Entdeckt via Ordner-Scan (CLAUDE.md/.claude/docs als Marker)

### Config
- App-Einstellungen (JSON): Scan-Pfad, MCP-Port, API-Key, Default-Projektverzeichnis, Layout-State

## Migration von v1

Aus `cipher-mux` (v1, Node.js HTTP-Server) werden folgende Module portiert:

| Modul | Zeilen | Übernahme | Anpassung |
|-------|--------|-----------|-----------|
| ProjectScanner | 113 | 1:1 nach `src/main/` | TypeScript-Migration |
| SessionManager | 156 | 1:1 nach `src/main/` | TypeScript-Migration |
| ConfigStore | 46 | Adaptiert | Pfad → `app.getPath()` |
| WorkspaceLoader | 83 | Entfällt | Ordner-Scan ersetzt Workspaces |
| exec-util | 19 | 1:1 nach `src/main/` | TypeScript-Migration |
| dependency-check | 20 | 1:1 nach `src/main/` | TypeScript-Migration |
| theme.css | 500+ | 1:1 nach `src/renderer/` | Usability-Feinschliff |
| Fonts | 3 Dateien | 1:1 nach `src/renderer/` | — |
| api-router | 122 | Refactored | HTTP → IPC-Handler |
| app.js (Frontend) | 377 | Neu in Preact | Patterns als Referenz |

## Scope / MVP-Abgrenzung

### In Scope (v2 MVP)

- Electron-Shell mit Activity Rail und flexiblem Layout
- Eingebettete Terminals via tmux + xterm.js
- Message Bus (SQLite) für Inter-Session-Kommunikation
- MCP-Server mit API-Key-Auth und Netzwerk-Zugang
- Bidirektionaler Chatroom
- Orchestrator-Session mit intelligenter Delegation
- Cockpit-View mit Projektübersicht
- Komfortabler Projekt-Kick-off (Dateipfad + Zielverzeichnis)
- Context-Budget-Anzeige (Pane-Header, Cockpit, Chatroom, MCP)
- Session-Recovery bei Neustart
- Feste Keyboard-Shortcuts
- Info-Seite mit App-Anleitung
- Bugreport-Modus (automatische Diagnostik-Sammlung)

### Out of Scope (später)

- Orchestrator-Lernschleife (Context-Usage-History für bessere Task-Dimensionierung) [VORGEMERKT]
- Konfigurierbare Keybindings [VORGEMERKT als QoL]
- Competing Hypotheses / Auto-Debugging
- Hook-basierte Telemetrie
- Fresh Context Management / Ralph Loop
- URL als Kick-off-Input
- Panes in separate Fenster herausziehen
- Linux/Windows Support
- Cloud/Remote Agent Execution
- Multi-User / Team Features
- Eigene LLM-API-Integration (Multi-Provider)
- Workspace-System (Ordner-Scan reicht)

## Bekannte Risiken

| Risiko | Auswirkung | Mitigation |
|--------|-----------|------------|
| tmux Output → xterm.js Streaming | Performance bei High-Frequency Output | Batching/Throttling, ADR in Phase 3 |
| IPC-Bridge Durchsatz | UI-Lag bei 10 parallelen Sessions | WebGL-Rendering in xterm.js, Batch-IPC |
| StatusLine-Parsing | Abhängigkeit von Claude Code JSON-Format | Defensive Parsing, Versionsprüfung |
| MCP-Netzwerk-Exposure | Sicherheitsrisiko bei falsch konfiguriertem Netz | API-Key + Tailscale-Only als Default |
| Orchestrator-Retry-Loops | Token-Verschwendung bei Endlos-Retries | Hard-Limit: 2 Retry-Runden, dann User |
| Session-Limit 10 | Reicht evtl. nicht für große Projekte | Konfigurierbar machen, UI skaliert |

## Implementierungs-Phasen

### Phase I: Electron-Shell + Terminals + Message Bus + Orchestrator
- I-A: Electron Shell (BrowserWindow, Activity Rail, Core-Module migrieren, IPC, Theme)
- I-B: Eingebettete Terminals (TmuxManager, xterm.js, Streaming, Splitting, Shortcuts)
- I-C: Cockpit-View (Projektübersicht, Session-Start, Ordner-Scan)
- I-D: Message Bus + MCP-Server + Chatroom
- I-E: Orchestrator-Session
- I-F: Context-Budget-Anzeige + Status Bar

### Phase II: Komfortabler Kick-off
- II-A: Kick-off Dialog (Dateipfad + Zielverzeichnis)
- II-B: Auto-Interview in neuer Session

### 10. Info-Seite / Hilfe

- In-App-Anleitung zur Bedienung (Shortcuts, Features, Workflows)
- Erreichbar über Activity Rail oder Menü
- Statischer Content, ggf. mit Suchfunktion

### 11. Bugreport-Modus

- Bewährtes Pattern aus Android-App, BOOX-App etc.
- Sammelt automatisch: App-Version, OS-Version, Session-States, relevante Logs, Screenshot (optional)
- Export als strukturierter Report (JSON/Markdown)
- Erreichbar über Menü oder Shortcut

## Offene Punkte für Phase 3 (ADRs)

- tmux-Streaming-Mechanismus: pipe-pane vs capture-pane-Polling
- MCP-Transport: HTTP SSE vs stdio-Proxy für externe Clients
- StatusLine-Integration: Hook-Konfiguration vs Session-JSONL-Parsing
- SQLite-Schema: Message-Retention, Cleanup-Strategie
