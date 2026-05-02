# SP-Lifecycle: Session-Recovery Haerten + Background-Sessions Grundgeruest

> v0.11 Wave 2 | Items: A4, B3-Basis | Blocked by: SP-Stability | shares-interface: SP-Grid, SP-Session-Flow

---

## A4: Session-Recovery Haerten

### Problem
Nach App-Neustart werden Sessions als "orphaned" statt "recovered" erkannt. Unzuverlaessig.

### Aktueller Stand
- `src/main/session/session-manager.ts:219-320` — `recover()` Function
- `src/main/session/entity-registry.ts:11-51` — EntityRegistry (in-memory, verloren bei Restart)
- Entity-Rekonstruktion via hardcodiertem `entityNameMap` (Zeile 300-306) — fragil
- `src/main/tmux/tmux-manager.ts:266-301` — `listSessions()` tmux-Enumeration
- `src/main/ipc-hub.ts:171-184` — Recovery beim App-Start
- `src/main/session/session-manager.ts:952-990` — `detectOrphans()` periodisch (5 Min)
- Kein Default-Workspace-Loading, kein persistentes Session-Registry

### Kernproblem
SessionRegistry ist rein in-memory. Bei App-Restart sind alle Zuordnungen (Session -> Entity, Session -> Grid-Slot) weg. `recover()` versucht per Session-Name auf Entity zu schliessen — das funktioniert nur wenn der Name exakt im `entityNameMap` steht.

### Aufgabe

#### 1. Session-State persistieren
- **Neues File**: `sessions.json` im userData-Directory
- Bei jeder Session-Aenderung (start, stop, grid-placement) automatisch speichern:
  ```json
  {
    "sessions": [
      {
        "id": "...",
        "name": "Coding Companion",
        "tmuxSession": "cmux-abc123",
        "entityId": "companion",
        "projectPath": "/path/to/project",
        "gridSlot": 2,
        "status": "active"
      }
    ],
    "gridState": { "config": { "cols": 2, "rows": 2 }, "slots": [...] }
  }
  ```
- Beim App-Start: `sessions.json` lesen, tmux-Sessions abgleichen

#### 2. Recovery-Flow redesignen
```
App-Start
  |
  +-- sessions.json vorhanden?
  |     |
  |     +-- Ja: Fuer jede gespeicherte Session:
  |     |         tmux-Session noch da?
  |     |           Ja -> recovered (Entity-Zuordnung aus File)
  |     |           Nein -> cleaned up (Session entfernen)
  |     |
  |     +-- Nein: Fallback auf altes Verhalten (tmux enumerate + entityNameMap)
  |
  +-- Default-Workspace gesetzt?
  |     Ja -> Workspace laden (Grid-Config + Sessions starten)
  |     Nein -> Nur Companion starten (kein Orchestrator!)
  |
  +-- Orphaned Sessions (tmux da, nicht in sessions.json)?
        -> User fragen: "Diese Sessions ins Grid holen?"
        -> Pro Session: Ja (-> Grid-Placement-Popup) / Nein (-> Background)
```

#### 3. Orphan-Dialog
- Beim Start: wenn orphaned Sessions gefunden -> einfacher Dialog
- Liste der Orphans mit Name + Project-Path
- Pro Session: Checkbox "ins Grid holen" (Default: an)
- "Alle ignorieren" -> Sessions bleiben im Background
- "Alle beenden" -> tmux kill-session

#### 4. Startup-Logik vereinfachen
- **Ohne Default-Workspace**: Nur Companion startet automatisch
- **Mit Default-Workspace**: Workspace-Config wird geladen (Entities + Grid)
- Orchestrator startet NICHT automatisch (nur wenn im Workspace definiert)

### Betroffene Dateien
- `src/main/session/session-manager.ts` (recover, Session-State Persistence)
- `src/main/ipc-hub.ts` (Startup-Flow)
- `src/main/main.ts` (Default-Workspace-Check)
- NEU: `src/main/session/session-store.ts` (Persistence-Layer)
- NEU: `src/renderer/components/OrphanDialog.tsx` (Orphan-Frage)

### Verifikation
- App starten, 3 Sessions oeffnen, App beenden, App starten -> Sessions wiederhergestellt, im richtigen Grid-Slot
- App starten ohne sessions.json -> Companion startet, sonst nichts
- tmux-Session manuell erstellen (cmux-Prefix), App starten -> Orphan-Dialog erscheint
- App crasht (kill -9), App starten -> Recovery funktioniert

---

## B3: Background-Sessions Grundgeruest

### Problem
Sessions sollen "in den Hintergrund" geschickt werden koennen.

### Aktueller Stand
- Background-Konzept existiert TEILWEISE: `SidebarPanel.tsx:105-107` berechnet Background als `active && !inGrid`
- Sidebar zeigt Background-Sessions mit "Add to Grid" und "Kill" Buttons (Zeilen 145-160)
- Kein explizites `inGrid`-Flag — wird aus Grid-Slots berechnet
- `EntityConfig.visible` Flag existiert (`shared/types.ts:44`), wird aber nicht genutzt

### Aufgabe

#### 1. "Send to Background" Action
- Grid-Zelle Rechtsklick (oder kleiner Button in Cell-Header): "In Hintergrund"
- Session wird aus Grid-Slot entfernt (`slot.sessionId = null`)
- Session laeuft weiter (tmux-Session bleibt aktiv)
- Session erscheint in Sidebar unter "Background Sessions" (existiert bereits)

#### 2. "Add to Grid" erweitern
- Bestehender "Add to Grid" Button in Sidebar (Zeile 150-153)
- Soll Grid-Placement-Popup oeffnen (nicht auto-platzieren)
- Integration mit SP-Grid: nutzt das verbesserte Popup

#### 3. Session-State fuer Background
- `sessions.json` (aus A4) speichert auch `gridSlot: null` fuer Background-Sessions
- Recovery stellt Background-Sessions korrekt wieder her (in Sidebar, nicht im Grid)

#### 4. Voice-Relay als Background-Default
- Voice-Relay Entity bekommt `visible: false` in EntityConfig
- Startet immer im Background (kein Grid-Slot)
- Sichtbar nur in Sidebar
- Vorbereitung fuer Wave 3 Voice-Redesign

### Betroffene Dateien
- `src/renderer/components/SessionGrid.tsx` (Cell-Header Button)
- `src/renderer/components/SidebarPanel.tsx` (Add-to-Grid -> Popup)
- `src/renderer/app.tsx` (sendToBackground Handler)
- `src/shared/grid-types.ts` (Slot freigeben ohne Session zu killen)
- `src/main/session/entity-registry.ts` (voice-relay visible: false)

### Verifikation
- Session im Grid -> Rechtsklick -> "In Hintergrund" -> Session verschwindet aus Grid, erscheint in Sidebar
- Sidebar -> "Add to Grid" -> Grid-Popup -> User waehlt Slot
- Voice-Relay starten -> erscheint NICHT im Grid, sondern in Sidebar
- App neustarten -> Background-Sessions sind wieder in Sidebar

---

## Qualitaets-Gate

- [ ] Recovery: App-Neustart stellt Sessions korrekt wieder her (Entity-Zuordnung, Grid-Slot)
- [ ] Recovery: Orphan-Dialog funktioniert
- [ ] Recovery: Ohne Default-Workspace startet nur Companion
- [ ] Background: Send-to-Background + Add-to-Grid funktioniert
- [ ] Background: Voice-Relay startet im Background
- [ ] Persistence: sessions.json wird korrekt geschrieben und gelesen
- [ ] `npm run build` erfolgreich
- [ ] `npm run test` — keine Regression
- [ ] Stress-Test: App 5x hintereinander starten/beenden, Sessions bleiben konsistent
