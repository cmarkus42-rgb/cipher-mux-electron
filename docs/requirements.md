# Anforderungskatalog — cipher-mux-electron

_Vorab-Informationen aus der Design-Spec (cipher-mux v2). Wird in Phase 1 (`/interview`) systematisch verfeinert._

## Vision

cipher-mux wird von einem Browser-basierten Session-Launcher zu einer Electron-basierten Kommandozentrale für Claude Code Projekte. Ein Fenster, alles drin: eingebettete Terminals, Message Bus zwischen Sessions, Orchestrator-Verzeichnis, komfortabler Projekt-Kick-off.

**Zielzustand:** Morgens cipher-mux öffnen, Orchestrator starten. "Bug in X" → Auftrag geben, delegiert automatisch. "Neues Projekt" → Anforderungen rein, ein Klick, Interview läuft. Kein cd, kein Fenster-Wechsel, kein manuelles Koordinieren.

## Zielgruppe

Christian (Single-User) — Power-User mit 5+ parallelen Claude-Code-Sessions, der kognitive Overhead durch manuelles Session-Management reduzieren will.

## Kernfeatures

### 1. Eingebettete Terminals (tmux + xterm.js)
- tmux als einziges Session-Backend (Sessions überleben Crashes)
- xterm.js rendert tmux-Output im Renderer
- Pane-Splitting (horizontal/vertikal, resize per Drag)
- Pane-Header mit Projektname, SDD-Phase, Context-Usage

### 2. Activity Rail + Flexible Layout
- Icon-Leiste (48px links) für Session-Wechsel
- Drei Zustände: Fokussiert, Split-View, Cockpit-View
- Keyboard-Shortcuts (⌘1-9, ⌘\, ⌘-, ⌘K, ⌘N, ⌘W)

### 3. Message Bus (SQLite)
- Inter-Session-Kommunikation
- Topics: status, bug, review, chat, system
- ULID-basierte Message-IDs
- Unread-Badges

### 4. MCP-Server
- localhost HTTP im Main Process
- Tools: mux_send, mux_read, mux_status, mux_sessions
- Auto-Injection der Config in neue Sessions

### 5. Chatroom-Panel
- Rechte Sidebar (⌘K toggle)
- Live-Messages aus dem Message Bus
- System-Messages (Session started/stopped)

### 6. Orchestrator-Session
- Dediziertes Verzeichnis (~/.config/cipher-mux/orchestrator/)
- Eigener CLAUDE.md mit Rollendefinition
- Delegation via MCP-Tools + tmux-Injection
- ⚡-Icon in der Activity Rail

### 7. Cockpit-View
- Projektübersicht als Card-Grid (adaptiert aus v1)
- Status, Phase, Context-Budget pro Projekt
- Session-Start per Klick

### 8. Komfortabler Kick-off (Phase II)
- Dialog: Name, Input (Drag&Drop/Pfad/Freitext), Auto-Interview Toggle
- tmux-Session im Projectlauncher spawnen
- fs.watch auf neues Verzeichnis
- Auto-Interview in neuer Session

## Nicht-funktionale Anforderungen

- **Resilience:** Electron-Crash → tmux-Sessions laufen weiter, Recovery bei Neustart
- **Performance:** Terminal-Streaming mit Batching/Throttling (Referenz: Hyper Terminal)
- **Persistenz:** Layout-State bei jeder Änderung speichern (nicht nur Graceful Shutdown)
- **macOS-only:** tmux, osascript als harte Dependencies

## Scope / MVP-Abgrenzung

### In Scope (v2)

- Electron-Migration des bestehenden cipher-mux
- Eingebettete Terminals via tmux + xterm.js
- Message Bus für Inter-Session-Kommunikation
- MCP-Server für Claude-Session-Integration
- Orchestrator-Verzeichnis mit CLAUDE.md
- Komfortabler Projekt-Kick-off
- Context-Budget-Anzeige im UI

### Out of Scope (später)

- Competing Hypotheses / Auto-Debugging
- Hook-basierte Telemetrie
- Fresh Context Management / Ralph Loop
- URL als Kick-off-Input
- Linux/Windows Support
- Cloud/Remote Agent Execution
- Multi-User / Team Features
- Eigene LLM-API-Integration

## Bekannte Risiken

| Risiko | Auswirkung | Mitigation |
|--------|-----------|------------|
| tmux Output → xterm.js Streaming | Performance-Probleme bei High-Frequency Output | Batching/Throttling, Mechanismus in Phase I-B evaluieren |
| IPC-Bridge Durchsatz | UI-Lag bei vielen parallelen Sessions | WebGL-Rendering in xterm.js, Batch-IPC |
| Projectlauncher-Abhängigkeit (Phase II) | Blockiert Kick-off Feature | Parallel als eigener Workstream |
| [KLÄREN] tmux-Streaming-Mechanismus | Architekturentscheidung nötig | pipe-pane vs capture-pane-Polling evaluieren |

## Implementierungs-Phasen (aus Design-Spec)

### Phase I: Electron-Shell + Terminals + Message Bus + Orchestrator
- I-A: Electron Shell (BrowserWindow, Activity Rail, Core-Module migrieren, IPC, Theme)
- I-B: Eingebettete Terminals (TmuxManager, xterm.js, Streaming, Splitting, Shortcuts)
- I-C: Cockpit-View (Projektübersicht, Session-Start, Workspace-Picker)
- I-D: Message Bus + MCP-Server + Chatroom
- I-E: Orchestrator-Verzeichnis
- I-F: Status Bar

### Phase II: Komfortabler Kick-off
- II-A: Kick-off Dialog
- II-B: Auto-Interview
