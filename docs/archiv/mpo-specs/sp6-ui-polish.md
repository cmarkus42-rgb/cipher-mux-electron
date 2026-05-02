# SP-6: UI/UX Polish — Detail-Spec

> MPO Sub-Projekt 6 | Wave 2 | Aufwand: ~2.75d
> Plan-Phasen: 5b, 5c, 5d, 5e | Tickets: 2WJ4GT, JZ0J36, B1MKSG, D6HWB7

---

## Ziel

4 unabhaengige UI-Verbesserungen: Save Workspace, Theme Editor, Bug/Feature Toggle, Kill-Button.

## Vorbereitung

**LIES ZUERST:**
1. `CLAUDE.md` im Repo-Root
2. Die 4 betroffenen Komponenten (siehe unten)
3. `src/renderer/i18n.ts` + `src/renderer/locales/en.json` — i18n-Setup aus Wave 1

**WICHTIG:** Alle neuen UI-Strings MUESSEN i18n-konform sein (`useTranslation()` + `t('key')`). Keys zu `en.json` und `de.json` hinzufuegen.

## Funktionale Anforderungen

### 5b: Save Current as Workspace (~0.5d)

#### FR-1: Save-Button im WorkspacePopup
- Neuer Button "Save Current" im `WorkspacePopup.tsx`
- Erfasst aktuelle Grid-Konfiguration: Dimensionen, Sessions (Positionen, Projekte, Adapter), aktive Entity-Sessions
- Oeffnet Workspace-Editor-Dialog zum Tweaken + Namen vergeben

#### FR-2: Workspace-Editor
- Name-Eingabefeld (pre-filled mit Datum/Uhrzeit oder "Workspace N")
- Vorschau der Grid-Konfiguration
- Save/Cancel Buttons
- Gespeicherter Workspace erscheint sofort in der Workspace-Liste

#### FR-3: Workspace-Serialisierung
- Aktuelle Grid-State als Workspace-JSON serialisieren
- In ConfigStore persistieren (wie bestehende Workspaces)
- Format kompatibel mit bestehendem Workspace-Loading

### 5c: Theme Editor mit Live-Preview (~1.5d)

#### FR-4: Theme-Editor Sektion in Settings
- Neue Sektion in InfoSettingsView oder eigene Sub-Page
- Liste aller CSS Custom Properties die das Theme definieren
- Gruppiert: Farben (Background, Foreground, Accent, Border), Schrift, Spacing

#### FR-5: Color-Picker
- Pro CSS Custom Property ein Color-Picker (native `<input type="color">` oder kleine Custom-Komponente)
- Aktueller Wert als Default
- Label mit Property-Name

#### FR-6: Live-Preview
- Aenderungen werden SOFORT auf `document.documentElement.style.setProperty()` angewandt
- Kein Rebuild/Reload noetig
- Echtzeit-Feedback: User sieht Aenderung sofort in der ganzen App

#### FR-7: Save/Reset/Export
- **Save:** Aktuelles Custom-Theme in ConfigStore persistieren, wird beim naechsten Start geladen
- **Reset:** Zurueck zum Default-Theme (bestehende Theme-Presets)
- **Export:** Theme als JSON-Datei exportieren (Copy-to-Clipboard oder File-Save-Dialog)
- Optional: Import (JSON-Datei laden)

### 5d: Bug-Assistant Toggle Bug/Feature (~0.25d)

#### FR-8: Toggle in BugreportDialog
- Toggle/Radio-Button: "Bug" / "Feature Request"
- Default: "Bug" (wie bisher)
- Toggle aendert das Template:
  - **Bug:** Bestehendes Template (STR, Expected, Actual, etc.)
  - **Feature Request:** Anderes Template ("Gewuenschtes Verhalten", "Motivation", "Beispiele")

#### FR-9: Frontmatter-Tag
- Neue Note bekommt Frontmatter-Tag: `type: bug` oder `type: feature-request`
- Tag wird bei Notes-Erstellung mit uebergeben
- Bestehende Bug-Notes bleiben kompatibel (default: bug)

### 5e: Background-Sessions Kill-Button (~0.25d)

#### FR-10: Kill-Button in Sidebar
- Sidebar Sessions-Tab: Background-Sessions bekommen ein "X"-Icon
- Hover-Reveal (Icon erscheint erst bei Mouse-Over, wie Notes-Delete)
- Click → Confirm-Dialog ("Session beenden?")
- Confirm → `sessionManager.kill(sessionId)` aufrufen

#### FR-11: Session-Liste aktualisieren
- Nach Kill: Session aus Sidebar-Liste entfernen
- IPC-Event fuer Session-State-Change (SESSION_CHANGED oder SESSION_KILLED)

## Abgrenzung

- Theme-Editor: Keine Schrift-Aenderung in Phase 1 (nur Farben)
- Kein Theme-Marketplace oder Theme-Sharing
- Kill-Button nur fuer Background-Sessions, nicht fuer Grid-Sessions (die haben schon Close)

## Meta-Requirements

- **i18n:** ALLE Strings via t(). Keys zu en.json + de.json hinzufuegen.
- **Reihenfolge:** Die 4 Items sind unabhaengig. Bei Context-Knappheit: 5d und 5e zuerst (klein), dann 5b, dann 5c (gross).
- **CSS Custom Properties:** Bestehende Theme-Variablen aus dem CSS lesen, nicht hardcoden.

## Quality Gate

### Testcases

| # | Test | Erwartetes Ergebnis |
|---|---|---|
| T1 | "Save Current" klicken | Workspace-Editor oeffnet mit aktuellem Grid |
| T2 | Workspace speichern | Erscheint in Workspace-Liste, ladbar |
| T3 | Color-Picker aendern | Sofortige Live-Aenderung im UI |
| T4 | Theme speichern + App neustarten | Custom-Theme bleibt erhalten |
| T5 | Theme resetten | Zurueck zu Default |
| T6 | Bug/Feature Toggle auf "Feature" | Anderes Template |
| T7 | Feature-Request erstellen | Note mit tag `type: feature-request` |
| T8 | Background-Session Kill-Button | Session beendet, aus Liste entfernt |
| T9 | Kill-Confirm abbrechen | Session laeuft weiter |
| T10 | npm run build | Erfolgreich |

### Code-Qualitaet
- `npm run lint` ohne neue Errors
- `npm run test` gruen
- Alle UI-Strings i18n-konform
- Kein Inline-Styling fuer Theme-Editor (CSS Custom Properties verwenden)

### Dokumentation
- CHANGELOG.md aktualisieren
- docs/todo.md aktualisieren

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- WorkspacePopup: `src/renderer/components/WorkspacePopup.tsx`
- InfoSettingsView: `src/renderer/components/InfoSettingsView.tsx`
- BugreportDialog: `src/renderer/components/BugreportDialog.tsx`
- SidebarPanel: `src/renderer/components/SidebarPanel.tsx`
- Theme/CSS: `src/renderer/` CSS-Dateien
