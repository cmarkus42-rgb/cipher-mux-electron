---
id: BUG-2026-04-22-HEIGHT-REGRESSION
status: open
project: cipher-mux-electron
projectPath: /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
created: 2026-04-22T14:30:00.000Z
---

# Fensterhoehe passt sich nicht an Row-Anzahl an — Fix BUG-2026-04-22-70M0UT greift nicht

**Severity:** high
**Tags:** ui, layout, height, regression, electron, BrowserWindow

## Summary

Der vorherige Fix (Commit `4656b79`, Branch `fix/BUG-2026-04-22-70M0UT`) hat zwar die `fitGrid()`-Logik um Height-Berechnung erweitert, aber das Fenster passt seine Hoehe trotzdem nicht an. Bei 3 Rows uebereinander (1 Spalte, 3 Zeilen) zeigt das Fenster nur ~1 Row und der Rest ist abgeschnitten oder gar nicht sichtbar. Das Fenster muesste bei 3 Rows nahezu bildschirmfuellend sein.

## Root-Cause-Analyse (Code-Review)

### Problem 1: `resizable: false` in window-manager.ts (Zeile 30)

```typescript
// src/main/window-manager.ts:25-30
this.mainWindow = new BrowserWindow({
  width,
  height,
  minWidth: gridWidth,
  minHeight: 600,
  resizable: false,  // <-- BLOCKER: Fenster kann sich nicht resizen!
  ...
})
```

Das BrowserWindow wird mit `resizable: false` erstellt. Wenn `fitGrid()` dann `win.setSize(newWidth, newHeight)` aufruft, wird die Groessenaenderung moeglicherweise von Electron blockiert oder ignoriert, weil das Fenster als nicht-resizeable markiert ist. **Das ist der primaere Blocker.**

### Problem 2: Initiale Hoehe ignoriert Row-Anzahl

```typescript
// src/main/window-manager.ts:23
const height = Math.min(DEFAULT_WINDOW_HEIGHT, screenHeight)
```

`DEFAULT_WINDOW_HEIGHT = 900` ist ein fixer Wert. Die initiale Fensterhoehe wird NICHT aus der gespeicherten Grid-Config (rows) berechnet. Beim App-Start wird das Fenster immer 900px hoch erstellt, unabhaengig davon wie viele Rows konfiguriert sind.

### Problem 3: Hartkodiertes `minHeight: 600`

```typescript
// src/main/window-manager.ts:29
minHeight: 600,
```

Das Minimum von 600px wird beim Window-Create gesetzt, aber nie aktualisiert wenn sich die Grid-Konfiguration aendert. Der `fitGrid()`-Handler setzt zwar `setMinimumSize()`, aber das steht im Konflikt mit der initialen Konfiguration.

### Problem 4: CSS overflow erlaubt Scrolling statt Resize

```css
/* src/renderer/styles/grid.css:11-12 */
.session-grid-area {
  overflow-x: auto;
  overflow-y: auto;  /* Erlaubt Scrollen statt Fehler zu zeigen */
}
```

`overflow: auto` auf `.session-grid-area` sorgt dafuer, dass ueberlaufende Rows einfach scrollbar werden, anstatt dass ein sichtbarer Layout-Fehler entsteht. Das maskiert das Problem.

### Problem 5: Die `targetCellHeight = 200` Berechnung ist zu klein

```typescript
// src/main/ipc-hub.ts:485
const targetCellHeight = 200 // MIN_ROW_HEIGHT_PX
```

200px pro Row ist das MINIMUM. Bei einem Bildschirm mit normaler Aufloesung sollte eine Terminal-Session deutlich hoeher sein (~300-400px), damit der Terminal-Inhalt lesbar ist. Die Berechnung `3 * 200 + 78 = 678px` ergibt ein Fenster, das bei 3 Rows trotzdem nur ~678px hoch ist — viel kleiner als der verfuegbare Bildschirmplatz.

## Was der Fix haette tun muessen

Der `fitGrid()`-Ansatz ist prinzipiell richtig, aber unvollstaendig:

1. **`resizable` muss entweder `true` sein, oder programmatisches Resizing muss explizit erlaubt werden** — Electron's `setSize()` funktioniert auch bei `resizable: false`, ABER nur wenn die neue Groesse >= minSize ist. Das Zusammenspiel mit `minHeight: 600` und dem initialen Setup ist fragil.

2. **Die initiale Fensterhoehe muss aus der gespeicherten Grid-Config berechnet werden** — nicht aus `DEFAULT_WINDOW_HEIGHT = 900`.

3. **Die Cell-Hoehe sollte den verfuegbaren Bildschirmplatz nutzen** — bei 3 Rows und einem 1080px-Bildschirm sollte jede Row ~340px bekommen (`(1080 - chrome) / 3`), nicht 200px.

## Steps to Reproduce

1. App starten
2. Grid auf 1 Spalte, 3 Zeilen konfigurieren (ueber +/- Steuerung)
3. Beobachten: Fenster bleibt klein, 3. Row ist nicht sichtbar

## Expected Behavior

Das Fenster soll bei 3 Rows nahezu den gesamten Bildschirm in der Hoehe ausfuellen. Jede Row soll genuegend Platz fuer ein lesbares Terminal haben. Die Hoehe soll sich dynamisch anpassen wenn Rows hinzugefuegt/entfernt werden.

## Actual Behavior

Fenster bleibt zu klein, zeigt nur ~1 Row. Screenshot vom User zeigt das Problem deutlich — bei konfiguriertem 1x3-Grid ist nur 1 Session sichtbar.

## Relevante Dateien

| Datei | Problem |
|-------|---------|
| `src/main/window-manager.ts:30` | `resizable: false` blockiert Resize |
| `src/main/window-manager.ts:23` | Initiale Hoehe ignoriert Grid-Config |
| `src/main/window-manager.ts:29` | `minHeight: 600` hartkodiert |
| `src/main/ipc-hub.ts:477-493` | `fitGrid()` Handler — `targetCellHeight = 200` zu klein |
| `src/renderer/styles/grid.css:11-12` | `overflow: auto` maskiert das Problem |
| `src/shared/constants.ts:46` | `DEFAULT_WINDOW_HEIGHT = 900` fix statt dynamisch |
| `src/shared/grid-types.ts:73` | `MIN_ROW_HEIGHT_PX = 200` — Minimum, nicht Zielhoehe |

## Loesungsvorschlag

1. **`resizable: false` beibehalten** (User will keine manuelle Resize-Moeglichkeit), aber sicherstellen dass `setSize()` bei `resizable: false` zuverlaessig funktioniert
2. **Initiale Hoehe aus Config berechnen**: Grid-Config laden → `rows * targetHeight + chrome` → als initiale Window-Hoehe verwenden
3. **Cell-Hoehe an Screen anpassen**: `targetCellHeight = Math.max(MIN_ROW_HEIGHT_PX, Math.floor((screenHeight - chromeHeight) / rows))` — der verfuegbare Platz wird gleichmaessig aufgeteilt
4. **`overflow-y: auto` durch `overflow-y: hidden` ersetzen** auf `.session-grid-area` — Scrolling soll nicht moeglich sein, das Fenster muss passen
5. **`minHeight` dynamisch setzen** analog zu `setMinimumSize()` im `fitGrid()`-Handler

## Diagnostik

- **App-Version:** v0.8.2-beta-dev
- **OS:** Darwin 25.4.0
- **Electron:** 34.5.8
- **Vorheriger Fix-Commit:** `4656b79` (fix(grid): resize BrowserWindow height when rows change)
- **Screenshot:** ~/Desktop/Bildschirmfoto 2026-04-22 um 15.58.56.png
