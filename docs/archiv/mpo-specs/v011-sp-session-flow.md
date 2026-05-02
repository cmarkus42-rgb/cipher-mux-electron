# SP-Session-Flow: Unified Session-Start-Dialog + Sidebar-Toggle

> v0.11 Wave 2 | Items: A1, A5 | Blocked by: SP-Stability (I2, I3)

---

## A1: Unified Session-Start-Dialog

### Problem
Entity-Buttons in StatusBar starten Sessions unkontrolliert (mehrfach, mit Resume, ohne Optionen). Projekt-Auswahl und Session-Dialog sind getrennt und veraltet.

### Aktueller Stand

**Zu ersetzende Components:**
- `src/renderer/components/SessionDialog.tsx` (1-66) — FolderPicker + Resume-Checkbox
- `src/renderer/components/ProjectPopup.tsx` (1-246) — Projektliste + Kickoff
- Entity-Buttons in `src/renderer/components/StatusBar.tsx:47-124` — 6 separate Toggle-Handler

**Bestehende Bausteine:**
- `src/renderer/components/FolderPickerInput.tsx` (1-56) — wiederverwendbar
- `src/main/session/entity-registry.ts:65-151` — Entity-Configs (Presets)
- `src/main/session/session-manager.ts:486-558` — `startEntity()` Backend
- `src/renderer/app.tsx:442-627` — handleXxxToggle Functions (6 Stueck)

### Aufgabe

#### 1. Neuen Unified Dialog erstellen
Neuer Component `UnifiedSessionDialog.tsx` der ALLES vereint:

**Zwei Modi (Tabs oder Toggle):**
- **Preset-Modus**: Liste unserer Entities als klickbare Karten
  - Companion, Refinement, Orchestrator, MPO, Audit
  - Jede Karte zeigt: Name, Icon (Pixel-Art/CSS-Art, KEINE Emojis), kurze Beschreibung
  - Klick -> startet Entity mit gewaehlten Optionen
- **Pfad-Modus**: FolderPickerInput mit:
  - Favoriten (gespeicherte Pfade)
  - Zuletzt bearbeitet (letzte 5-10 Pfade aus History)
  - Browse-Button (nativer macOS Dialog)

**Startoptionen (fuer beide Modi):**
- [ ] Shell only (kein Claude starten)
- [ ] Claude starten (Default: an)
  - [ ] `--dangerously-skip-permissions` (Checkbox, Default nach Entity-Config)
- [ ] `--resume` (letzte Session fortsetzen)
- [ ] `--fork` (Session forken)

**Entity-Status anzeigen:**
- Wenn Entity bereits laeuft: "Laeuft bereits — fokussieren?" statt nochmal starten
- Grau/disabled wenn bereits aktiv

#### 2. Entity-Buttons aus StatusBar entfernen
- Alle 6 Entity-Buttons (Companion, Refinement, Orchestrator, MPO, Voice, Audit) raus
- Stattdessen: "+" Button in StatusBar der den Unified Dialog oeffnet
- Voice bleibt separat (wird in Wave 3 als Radio-Button redesigned)

#### 3. Dialog-Trigger
- StatusBar "+" Button
- Keyboard-Shortcut (Cmd+N oder konfigurierbar)
- Rechtsklick auf leere Grid-Zelle -> "Session hier starten" (oeffnet Dialog, merkt sich Ziel-Slot)

#### 4. Backend-Anpassungen
- `startEntity()` bekommt erweiterte Options:
  ```typescript
  interface StartEntityOpts {
    skipPermissions?: boolean  // --dangerously-skip-permissions
    resume?: boolean           // --resume
    fork?: boolean             // --fork
    shellOnly?: boolean        // kein Claude starten
  }
  ```
- IPC Handler `ENTITY_START` anpassen fuer neue Options

#### 5. Alte Components entfernen
- `SessionDialog.tsx` -> loeschen (durch UnifiedSessionDialog ersetzt)
- `ProjectPopup.tsx` -> loeschen (Funktionalitaet in Unified Dialog integriert)
- Entity-Button-Handler in `app.tsx:442-627` -> durch einen `handleUnifiedStart()` ersetzen

### Betroffene Dateien
- NEU: `src/renderer/components/UnifiedSessionDialog.tsx`
- LOESCHEN: `src/renderer/components/SessionDialog.tsx`
- LOESCHEN: `src/renderer/components/ProjectPopup.tsx`
- AENDERN: `src/renderer/components/StatusBar.tsx` (Entity-Buttons raus, "+" rein)
- AENDERN: `src/renderer/app.tsx` (handleXxxToggle -> handleUnifiedStart)
- AENDERN: `src/main/session/session-manager.ts` (startEntity Options erweitern)
- AENDERN: `src/main/ipc-hub.ts` (IPC Handler anpassen)

### Verifikation
- "+" Button in StatusBar -> Dialog oeffnet
- Companion-Preset waehlen -> Companion startet
- Pfad eingeben + "Shell only" -> tmux-Session ohne Claude
- `--resume` aktivieren -> letzte Session wird fortgesetzt
- Entity laeuft bereits -> Dialog zeigt "fokussieren" statt "starten"
- Cmd+N -> Dialog oeffnet
- Alte Entity-Buttons sind weg

---

## A5: Sidebar-Verhalten Vereinfachen

### Problem
"Unsichtbar wenn leer" irritiert.

### Aktueller Stand
- `src/renderer/app.tsx:89-103` — `sidebarHasContent` berechnet ob Sidebar Inhalt hat
- `computedPanelWidth` ist 0 wenn `!sidebarHasContent` -> Sidebar verschwindet
- Toggle-Button in StatusBar (`StatusBar.tsx:108-115`) -> `setSidebarVisible()`
- LED-Indicator zeigt `sidebarHasContent`

### Aufgabe
1. **Simple Toggle-Logik**: `computedPanelWidth` haengt NUR von `sidebarVisible` ab, NICHT von `sidebarHasContent`
2. **`sidebarHasContent` behalten** fuer LED-Indicator (zeigt an DASS es Content gibt)
3. **Sidebar zeigt immer ihre Sections** — wenn leer, dann "Keine aktiven Hintergrund-Sessions" o.ae.
4. **Toggle-Button**: Ein/Aus, fertig. Kein automatisches Ein-/Ausblenden.

### Betroffene Dateien
- `src/renderer/app.tsx` (computedPanelWidth Logik)
- `src/renderer/components/SidebarPanel.tsx` (Empty-State anzeigen)

### Verifikation
- Sidebar oeffnen per Button -> bleibt offen auch wenn kein Content
- Sidebar schliessen per Button -> bleibt zu auch wenn Content vorhanden
- LED leuchtet wenn Content da, auch bei geschlossener Sidebar

---

## Qualitaets-Gate

- [ ] Unified Dialog: Presets + Pfadauswahl + alle Startoptionen
- [ ] Entity-Buttons aus StatusBar entfernt
- [ ] "+" Button + Cmd+N funktionieren
- [ ] Sidebar: reiner Toggle, kein Auto-Hide
- [ ] `npm run build` erfolgreich
- [ ] `npm run test` — keine Regression
- [ ] Manueller Test: 3 verschiedene Session-Starts (Preset, Pfad, Shell-only)
