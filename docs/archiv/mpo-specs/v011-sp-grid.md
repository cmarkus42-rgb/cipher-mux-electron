# SP-Grid: Grid-Placement-Popup Fix + Grid-Rendering Stabilisieren

> v0.11 Wave 2 | Items: A2, A3 | Blocked by: SP-Stability (I3)

---

## A2: Grid-Placement-Popup Fix

### Problem
Popup zeigt falsche Sessions, passt nicht zum tatsaechlichen Grid, hat keinen sichtbaren Cancel-Button, man kommt nicht raus, geht zu oft auf.

### Aktueller Stand
- `src/renderer/components/GridPlacementPopup.tsx` — Component, bekommt `gridSlots` als Props
- `src/shared/grid-types.ts:53-56` — `findFirstEmptySlot()` Auto-Placement (vlnr)
- `src/renderer/app.tsx:112-124, 326-340, 342-351, 492-499` — Popup-Trigger-Logik
- Escape-Handler existiert in `app.tsx:58-68` (schliesst Popup), aber kein sichtbarer Button
- Notes-Zellen: `findFirstEmptySlot` filtert sie korrekt (`type !== 'notes'`), aber Popup-Display zeigt sie als "empty" weil `getSessionName()` nur `sessionId` prueft

### Aufgabe

#### 1. Cancel-Button (sichtbar)
- Sichtbaren "Abbrechen"-Button ins Popup einfuegen (unten oder oben-rechts)
- `onCancel` Callback aufrufen
- Escape-Handler besteht bereits, aber Cancel-Button muss IMMER sichtbar sein

#### 2. Grid-Inhalt 1:1 korrekt anzeigen
- `getSessionName()` in GridPlacementPopup.tsx: Notes-Zellen erkennen (wenn `slot.type === 'notes'` -> "Notes" anzeigen, nicht "empty")
- Session-Namen muessen den tatsaechlichen Grid-Inhalt widerspiegeln
- Leere Zellen als "Frei" markieren (klickbar zum Platzieren)
- Belegte Zellen als belegt anzeigen (Session-Name, nicht klickbar oder "ersetzen?")

#### 3. Auto-Placement-Logik aendern
- `findFirstEmptySlot()` in `grid-types.ts` NICHT mehr fuer automatische Platzierung nutzen
- **Neue Regel**: Wenn genau 1 leere Zelle -> automatisch dort platzieren (kein Popup)
- Wenn 0 leere Zellen -> Popup zeigen (User muss entscheiden: ersetzen oder Grid vergroessern)
- Wenn >1 leere Zellen -> Popup zeigen (User waehlt)
- **Ausnahme**: Workspace-Start (Zellen sind vordefiniert) -> kein Popup
- Alle Stellen in `app.tsx` anpassen wo `addSession()` / `placeEntity()` aufgerufen wird

#### 4. Grid-Groesse im Popup anpassbar
- Kleine Pfeil-Buttons (Pixel-Art / CSS-Art, KEINE Emojis) zum Vergroessern/Verkleinern
- Aenderung sofort sichtbar im Popup-Grid
- Grid-Resize ueber bestehende `resize()` Funktion aus `useGrid.ts:82-90`

### Betroffene Dateien
- `src/renderer/components/GridPlacementPopup.tsx` (UI-Ueberarbeitung)
- `src/shared/grid-types.ts` (findFirstEmptySlot Logik)
- `src/renderer/app.tsx` (Popup-Trigger-Logik, alle addSession/placeEntity Stellen)
- `src/renderer/hooks/useGrid.ts` (resize Integration)

### Verifikation
- Grid 2x2, 3 Sessions belegt, 1 frei -> neue Session landet automatisch in freier Zelle
- Grid 2x2, 2 Sessions belegt, 2 frei -> Popup erscheint, User waehlt
- Grid voll -> Popup erscheint, Pfeil-Buttons zum Vergroessern sichtbar
- Notes-Zelle im Grid -> Popup zeigt "Notes" (nicht "empty")
- Cancel-Button klicken -> Popup schliesst, keine Session platziert
- Escape -> Popup schliesst

---

## A3: Grid-Rendering Stabilisieren

### Problem
Sessions werden schwarz, reagieren nicht, erst bei Resize wieder da.

### Aktueller Stand
- `src/renderer/hooks/useTerminal.ts` — Terminal-Lifecycle mit xterm.js
- `fit()` debounced (150ms), mit MIN_FIT_DIMENSION Guard (50px)
- WebGL-Addon mit Canvas-Fallback bei Context-Loss (`useTerminal.ts:96-108`)
- ResizeObserver triggert `fit()` (`useTerminal.ts:156-167`)
- Grid-CSS: `overflow: hidden` + `clip-path` auf `.session-cell` (`grid.css:21-33`)

### Vermutete Ursachen
1. **WebGL Context Loss**: Wenn zu viele Terminals gleichzeitig rendern, geht der WebGL-Context verloren -> schwarzer Screen. Fallback auf Canvas wird getriggert, aber Terminal-Content ist weg.
2. **fit() vor Sichtbarkeit**: Container hat `clientWidth/Height < 50` -> fit wird uebersprungen -> Terminal bleibt unsized
3. **Grid-Reflow Timing**: Bei Grid-Resize werden ResizeObserver-Events gefeuert bevor der neue Layout stabil ist

### Aufgabe

#### 1. WebGL Context Loss robust handhaben
- Nach Canvas-Fallback: `term.refresh(0, term.rows - 1)` aufrufen um Content neu zu rendern
- Alternativ: WebGL komplett deaktivieren wenn >4 Terminals gleichzeitig (Canvas-only Modus)

#### 2. Visibility-basiertes fit()
- `IntersectionObserver` zusaetzlich zum `ResizeObserver` nutzen
- Wenn Terminal sichtbar wird (intersection > 0): sofort `fit()` aufrufen
- Das loest das "schwarzer Screen nach Grid-Wechsel" Problem

#### 3. Grid-Verkleinerung: Sessions -> Background
- Bei `resizeGrid()` (`grid-types.ts:101-117`): Ueberzaehlige Sessions NICHT versuchen in leere Slots zu stopfen
- Stattdessen: Sessions die aus dem Grid fallen -> Background-Sessions (Sidebar)
- Kein automatisches Verschieben — User entscheidet ueber Grid-Popup wo sie hin sollen
- Bestehende Logik in `resizeGrid()` anpassen: overflow-Sessions als Background-Event emittieren

#### 4. Robuster Terminal-Lifecycle
- Terminal-Cleanup bei Grid-Slot-Wechsel: alten Terminal sauber disposen bevor neuer erstellt wird
- `useTerminal` Cleanup-Function (useEffect return) muss zuverlaessig `term.dispose()`, `fitAddon.dispose()`, `resizeObserver.disconnect()` aufrufen

### Betroffene Dateien
- `src/renderer/hooks/useTerminal.ts` (Rendering-Fixes)
- `src/shared/grid-types.ts` (resizeGrid Overflow-Handling)
- `src/renderer/components/SessionGrid.tsx` (IntersectionObserver Integration)

### Verifikation
- 4+ Sessions im Grid -> kein schwarzer Inhalt nach 1 Min
- Grid von 3x3 auf 2x2 verkleinern -> ueberzaehlige Sessions in Sidebar sichtbar
- Grid vergroessern -> leere Zellen, Sessions bleiben wo sie sind
- Tab-Wechsel (falls vorhanden) -> Terminal-Content sofort sichtbar bei Rueckkehr

---

## Qualitaets-Gate

- [ ] Grid-Popup: Cancel-Button, Notes-Erkennung, korrekte Session-Anzeige
- [ ] Auto-Placement: nur bei genau 1 freier Zelle
- [ ] Grid-Rendering: kein schwarzer Inhalt bei normalem Gebrauch
- [ ] Grid-Resize: Sessions -> Background statt Shuffle
- [ ] `npm run build` erfolgreich
- [ ] `npm run test` — keine Regression
- [ ] Manueller Test: 5 Min normales Arbeiten mit 4 Sessions, kein schwarzer Screen
