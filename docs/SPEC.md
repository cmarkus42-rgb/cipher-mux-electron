# Technische Spezifikation — cipher-mux-electron

_Wird in Phase 2 (`/spec`) erstellt. Iterativ erweitert._

## 1. Systemübersicht

```
┌─ Electron App (cipher-mux v2) ─────────────────────────────┐
│                                                              │
│  ┌─ Renderer (Preact) ───────────────────────────────────┐  │
│  │  Activity Rail │ Terminal Panes (xterm.js)  │ Chatroom │  │
│  │  Session Icons │ tmux output streams         │ Panel    │  │
│  │  + New / ⚡    │ Splittable                 │          │  │
│  └────────────────┴───────────────────────────┴──────────┘  │
│                            │                                 │
│  ┌─ Main Process ──────────┴──────────────────────────────┐ │
│  │  Tmux Manager │ Message Bus │ Project Scanner │ Config  │ │
│  │  MCP Server   │ Workspace Loader                       │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## 2. Module & Verantwortlichkeiten

_TODO: Pro Modul — Name, Zweck, öffentliche API, Abhängigkeiten_

## 3. Datenmodell

_TODO: Entities mit Feldern, Typen und Beziehungen_

## 4. API-Kontrakte / Schnittstellen

_TODO: Interne APIs, externe Anbindungen, Protokolle_

## 5. UI-Architektur

_TODO: Screens, Navigation, State-Management, plattformspezifische Patterns_

## 6. Offene Entscheidungspunkte

_Werden in Phase 3 via `/decide` als ADRs adressiert._

- [ ] tmux-Streaming-Mechanismus: pipe-pane vs capture-pane-Polling vs alternatives? (Performance, Latenz, Batching)
- [ ] IPC-Bridge Throttling-Strategie für high-frequency Terminal-Output
- [ ] Electron-Builder vs electron-forge für Packaging/Distribution
- [ ] Preact-Aliasing-Strategie für React-kompatible Libs (xterm.js Addon-Ecosystem)
- [ ] ULID-Library-Wahl (ulid vs ulidx vs custom)
- [ ] MCP-Server Transport: HTTP vs Streamable HTTP vs stdio-Proxy
- [ ] Layout-Persistenz-Format (welche Daten, wo gespeichert)
- [ ] Migration bestehender v1-Module: vollständig neu oder inkrementell?
- [ ] xterm.js WebGL-Addon: standardmäßig aktivieren oder Canvas-Fallback?

## 7. Akzeptanzkriterien

_TODO: Pro Feature messbare, testbare Kriterien_

## 8. Nicht-funktionale Anforderungen

_TODO: Performance-Ziele (konkrete Zahlen), Sicherheit, Offline, Skalierung_
