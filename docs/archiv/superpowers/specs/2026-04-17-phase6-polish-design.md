# Phase 6 — Polish & Split-Layout Design

**Datum:** 2026-04-17
**Branch:** feat/projectlauncher-integration (Merge nach main erst nach Phase 6)
**Kontext:** Phase 5 (Orchestrator, Kickoff, MCP-Injection) abgeschlossen. Phase 6 bringt die UX auf Produktionsniveau.

---

## Übersicht

| Task | Feature | Komplexität |
|------|---------|-------------|
| 6.5 | Shortcut-Registry | Niedrig |
| 6.2 | Split-Layout-System | Hoch |
| 6.1 | Session-Recovery | Mittel |
| 6.3 | Info & Settings View | Niedrig |
| 6.4 | Bugreport (Outbox) | Mittel |
| 6.6 | Smoke-Test | Niedrig (manuell) |

**Implementierungsreihenfolge:** 6.5 → 6.2 → 6.1 → 6.3 → 6.4 → 6.6 (jeder Task baut auf dem vorherigen auf).

---

## 6.5 — Shortcut-Registry

### Architektur

Zentrale Registry als Map von Keyboard-Combos zu Actions. Ein einziger `keydown`-Listener auf `window`-Ebene in `app.tsx`.

```typescript
// shortcut-registry.ts
interface ShortcutEntry {
  combo: string        // z.B. "Cmd+1"
  label: string        // z.B. "Session 1 fokussieren"
  category: string     // "Navigation" | "Layout" | "Aktionen"
  action: () => void
}
```

### Shortcuts

| Combo | Aktion | Kategorie |
|-------|--------|-----------|
| Cmd+0 | Cockpit View | Navigation |
| Cmd+1–9 | Session 1–9 fokussieren | Navigation |
| Cmd+\ | Vertikaler Split | Layout |
| Cmd+- | Horizontaler Split | Layout |
| Cmd+K | Chatroom toggle | Navigation |
| Cmd+N | Kickoff-Dialog | Aktionen |
| Cmd+W | Aktive Pane schließen | Layout |

### Konfliktvermeidung mit xterm.js

Der Handler prüft `e.metaKey` (Cmd) und ruft bei Match `preventDefault()` + `stopPropagation()` auf, bevor xterm.js das Event sieht. xterm.js-eigene Shortcuts (ohne Cmd) bleiben unberührt.

### Komponenten

- **Neue Datei:** `src/renderer/shortcut-registry.ts` — Registry-Klasse mit `register()`, `unregister()`, `getAll()`, `handleKeyDown(e)`
- **Hook:** `useShortcuts()` in `src/renderer/hooks/useShortcuts.ts` — registriert Shortcuts beim Mount, gibt Registry für Info-Seite zurück
- **Refactoring:** Bestehender Cmd+N-Handler in `app.tsx` migriert in die Registry

---

## 6.2 — Split-Layout-System

### Datenmodell

Nutzt die bestehenden Typen aus `src/shared/types.ts`:

```typescript
type LayoutNode = SplitNode | PaneNode

interface SplitNode {
  type: 'split'
  direction: 'horizontal' | 'vertical'
  ratio: number           // 0.0–1.0, default 0.5
  children: [LayoutNode, LayoutNode]
}

interface PaneNode {
  type: 'pane'
  sessionId: string
}
```

### Neue Komponenten

**`SplitContainer.tsx`** — Rekursive Komponente:
- Bekommt `LayoutNode` als Prop
- `PaneNode` → rendert `<TerminalPane sessionId={...}>`
- `SplitNode` → rendert zwei Kinder mit draggbarem Divider
- Divider-Drag updated `ratio` via Callback nach oben
- CSS: `display: flex`, Direction via `flex-direction`, Ratio via `flex-basis`

**`useLayout`-Hook** — Layout-State-Management:
- Hält `LayoutNode | null` als State
- Methoden:
  - `splitPane(paneId, direction, newSessionId)` — ersetzt PaneNode durch SplitNode mit Original + neue Pane für die angegebene Session. Wird ohne `newSessionId` aufgerufen, öffnet sich der Session-Picker (bestehende Session wählen oder neue starten).
  - `closePane(paneId)` — entfernt Pane, kollabiert Parent-Split (Sibling rückt hoch)
  - `updateRatio(nodeRef, ratio)` — Resize-Update
  - `setActivePane(paneId)` — Focus-Tracking für Shortcut-Kontext
- Persistenz: Debounced (500ms) schreibt Tree nach ConfigStore via IPC `layout:persist`
- Startup: Liest `ui.layout` aus ConfigStore via IPC `layout:restore`

### Resize-Constraints

- Min-Pane-Breite/Höhe: 200px
- Unter Minimum: Pane wird geschlossen statt gequetscht
- Divider-Breite: 4px, cursor: `col-resize` / `row-resize`

### Integration in app.tsx

Wenn `activeView === 'terminal'`:
- Ohne Layout-Tree (null oder single PaneNode): einzelnes `<TerminalPane>` wie bisher
- Mit Split-Tree: `<SplitContainer node={layout.root} />`

### Shortcut-Integration

- Cmd+\ → `splitPane(activePane, 'vertical')`
- Cmd+- → `splitPane(activePane, 'horizontal')`
- Cmd+W → `closePane(activePane)`

### xterm.js Resize

Jede `<TerminalPane>` hat bereits einen `ResizeObserver` + `FitAddon`. Beim Split ändert sich die Container-Größe, der Observer feuert, `FitAddon.fit()` passt das Terminal an. Kein zusätzlicher Code nötig.

---

## 6.1 — Session-Recovery

### Startup-Flow

```
App startet → SessionManager.recover()
    ↓
tmux ls → cmux-* Sessions finden
    ↓
Abgleich mit Registry:
  - Bekannt + aktiv       → recovered[]
  - Bekannt + Orchestrator → recovered[]
  - Bekannt + Launcher    → killed[] (automatisch beendet)
  - Unbekannt             → orphaned[] (UI zeigen)
    ↓
RecoveryResult { recovered[], orphaned[], killed[] }
    ↓
Event 'recovery-complete' → IPC → Renderer
```

### Änderungen an SessionManager

- `recover()` prüft `session.type` für Typ-Unterscheidung (Orchestrator vs. Launcher vs. Projekt)
- Orphans werden **nicht** automatisch gekillt (bisheriges Verhalten Zeile 165 entfernen)
- Neues Event `recovery-complete` mit `RecoveryResult`

### Recovery-Dialog (Renderer)

- Modaler Dialog, nur wenn `orphaned.length > 0`
- Liste mit tmux-Name und letzter Aktivität pro Orphan
- Pro Session: "Übernehmen" (registriert als neue Session) oder "Beenden" (killt tmux-Session)
- "Alle beenden"-Button
- Kein Dialog bei nur recovered + killed — läuft still

### Layout-Recovery

Nach Recovery wird persistierter Layout-Tree geladen. Panes deren `sessionId` nicht in `recovered[]` ist, werden aus dem Tree entfernt (graceful collapse via `closePane`).

### Neue Dateien

- `src/renderer/components/RecoveryDialog.tsx`
- Neuer IPC-Channel: `cipher-mux:recovery:result`, `cipher-mux:recovery:action`

---

## 6.3 — Info & Settings View

### Struktur

Ein View mit drei Sections via Scroll-Anchors:

1. **Shortcuts** — Tabelle aus Shortcut-Registry (Single Source of Truth). Spalten: Combo, Aktion, Kategorie.
2. **Features** — Statische Beschreibungen: Terminals & Splits, Message Bus & Chatroom, MCP-Server, Orchestrator, Kickoff/Projektstart.
3. **Einstellungen** — Bestehende Scan-Paths-Funktionalität + About (Version, Build).

### Navigation

Drei Tabs am oberen Rand ("Shortcuts", "Features", "Einstellungen"), Scroll-to-Section bei Klick.

### Refactoring

- `SettingsView.tsx` → `InfoSettingsView.tsx`
- Shortcuts-Section nutzt `useShortcuts()` für Registry-Daten
- Scan-Paths-Logik bleibt, wird in Section 3 verschoben
- Activity Rail: "i"-Icon bleibt, Tooltip → "Info & Einstellungen"

---

## 6.4 — Bugreport (Outbox)

### Scope

Nur der "Melder"-Teil. Phase 7 bringt den Orchestrator-Loop (siehe `docs/superpowers/specs/phase7-bugreport-orchestrator-note.md`).

### BugreportManager (Main Process)

`src/main/bugreport/bugreport-manager.ts` — sammelt automatisch:

- App-Version, Electron-Version, OS-Version
- Aktive Sessions (Anzahl, Typen, Status)
- Letzter Recovery-Status
- Layout-State
- tmux-Version, tmux-Session-Liste
- Letzte 100 Zeilen Electron-Log

### Report-Format

Markdown mit YAML-Frontmatter:

```markdown
---
id: BUG-2026-04-17-001
status: open
project: cipher-mux-electron
created: 2026-04-17T14:30:00Z
---

## Beschreibung
[User-Eingabe]

## Diagnostik
[Auto-gesammelt: Version, Sessions, Layout, Logs]
```

### Outbox-Pfad

`~/.config/cipher-mux/bugreports/outbox/`

Verzeichnisstruktur:
```
~/.config/cipher-mux/bugreports/
├── outbox/    ← neue Reports
├── inbox/     ← Ergebnisse vom Orchestrator (Phase 7)
└── archiv/    ← vom User reviewed
```

### UI

- Erreichbar via Menü (Help → Bugreport) oder zukünftiger Shortcut
- Dialog mit Textfeld für Beschreibung
- "Absenden"-Button schreibt Datei in Outbox
- Bestätigung: "Report BUG-... in Outbox abgelegt"

### Neue Dateien

- `src/main/bugreport/bugreport-manager.ts`
- `src/renderer/components/BugreportDialog.tsx`
- IPC-Channel: `cipher-mux:bugreport:submit`

---

## 6.6 — Smoke-Test

Manuelle Durchführung nach allen Tasks. Erweitert bestehende TESTCASE.md um:

- **Split-Lifecycle:** Split öffnen → Resize → Session in zweiter Pane → Cmd+W → Collapse
- **Recovery:** App killen → Neustart → Dialog → Orphans übernehmen/beenden → Layout restored
- **Bugreport:** Dialog öffnen → Beschreibung → Absenden → Datei in Outbox prüfen
- **Shortcuts:** Alle 7 Combos durchspielen, keine xterm.js-Konflikte

---

## Neue Dateien (Gesamt)

| Datei | Zweck |
|-------|-------|
| `src/renderer/shortcut-registry.ts` | Zentrale Shortcut-Map + Handler |
| `src/renderer/hooks/useShortcuts.ts` | Registry-Hook für Komponenten |
| `src/renderer/hooks/useLayout.ts` | Split-Tree-State + Persistenz |
| `src/renderer/components/SplitContainer.tsx` | Rekursiver Split-Renderer |
| `src/renderer/components/RecoveryDialog.tsx` | Orphan-Recovery-Dialog |
| `src/main/bugreport/bugreport-manager.ts` | Diagnostik-Sammlung + Outbox-Writer |
| `src/renderer/components/BugreportDialog.tsx` | Bugreport-Eingabe-Dialog |

## Umgebaute Dateien

| Datei | Änderung |
|-------|----------|
| `src/renderer/app.tsx` | SplitContainer-Integration, Shortcut-Registry-Mount, Recovery-Dialog |
| `src/main/session/session-manager.ts` | Typ-aware Recovery, Orphan-Handling ohne Auto-Kill |
| `src/renderer/components/SettingsView.tsx` | → `InfoSettingsView.tsx`, Sections-Refactoring |
| `src/renderer/components/ActivityRail.tsx` | Tooltip-Update |
| `src/main/ipc-hub.ts` | Neue Channels (layout, recovery, bugreport) |
| `src/shared/ipc-channels.ts` | Channel-Konstanten |
| `src/renderer/styles/components.css` | Split-Divider, Recovery-Dialog, Bugreport-Dialog Styles |
