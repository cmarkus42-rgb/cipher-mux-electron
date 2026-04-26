# SP-Stability: Bugfixes + Message-Bus Clean Start

> v0.11 Wave 1 | Items: I1, I2, I3, G1 | Blocks: Welle 2 (alle)

---

## I1: `t is not defined` Renderer-Error fixen

### Problem
Wiederholter Renderer-Error, moeglicherweise Ursache fuer Window-Closes. `t` aus `useTranslation()` wird in Promise-Callbacks referenziert, die Component-Unmount ueberleben.

### Bekannter Fundort
- `src/renderer/components/BugreportDialog.tsx:88-92` — Promise-Callback in useEffect ohne Cleanup
- `useTranslation()` auf Zeile 73

### Aufgabe
1. **Systematisch suchen**: Alle `useTranslation()`-Nutzungen in Renderer-Components finden, die `t` in async/Promise/setTimeout-Callbacks verwenden
2. **Pattern**: Component unmountet -> Promise resolvet -> `t()` wird aufgerufen -> `t is not defined`
3. **Fix-Pattern**: Entweder Cleanup-Function im useEffect die Promise cancelt, oder Guard-Check ob Component noch gemountet ist (`useRef` mounted-Flag)
4. **Nicht nur BugreportDialog** — alle Renderer-Components systematisch pruefen

### Verifikation
- App starten, Sessions oeffnen/schliessen, Dialoge oeffnen/schliessen — kein `t is not defined` in DevTools Console
- `npm run build` erfolgreich

---

## I2: Single-Instance-Lock + Port-Konflikt

### Problem
Gepackte App und `npm start` teilen Port 3100. Zweite Instanz bekommt `EADDRINUSE`.

### Aktueller Stand
- Single-Instance-Lock existiert in `src/main/main.ts:12-19`, aber NUR fuer Production (`!app.isPackaged`)
- Port hardcoded in `src/shared/constants.ts:21` (`MCP_DEFAULT_PORT = 3100`)
- `src/main/mcp/mcp-server.ts:46-71` — kein EADDRINUSE-Handling
- `src/main/ipc-hub.ts:212-227` — catch-Handler loggt nur

### Aufgabe
1. **Single-Instance-Lock auch fuer Dev**: `app.requestSingleInstanceLock()` immer anwenden (Zeile 13: `isDev`-Check entfernen). Wenn Lock nicht erhalten: Warnung loggen + `app.quit()`
2. **EADDRINUSE abfangen**: In `mcp-server.ts:start()`, den Error-Handler (Zeile 65) spezifisch auf `EADDRINUSE` pruefen
3. **Benutzer informieren**: Bei Port-Konflikt eine Notification/Dialog im Renderer anzeigen ("Port 3100 belegt — laeuft cipher-mux bereits?")
4. **Kein Port-Inkrementieren** — lieber sauber abbrechen und informieren

### Betroffene Dateien
- `src/main/main.ts` (Single-Instance)
- `src/main/mcp/mcp-server.ts` (EADDRINUSE)
- `src/main/ipc-hub.ts` (Error-Handling)

### Verifikation
- Gepackte App starten, dann nochmal starten -> zweite Instanz beendet sich mit Hinweis
- `npm start` wenn App laeuft -> saubere Fehlermeldung statt Crash

---

## I3: Entity-Doppelstart verhindern

### Problem
Entity-Buttons starten mehrere Instanzen derselben Entity bei schnellem Doppelklick.

### Aktueller Stand
- `src/main/session/session-manager.ts:486-501` — Guard existiert, aber Race-Condition: Check passiert bevor erster Start abgeschlossen
- Zwischen Check (Zeile 496) und Tagging (Zeile 548-550) liegt die gesamte Session-Erstellung

### Aufgabe
1. **Mutex/Lock pro Entity**: Set `startingEntities: Set<EntityId>` einfuehren
2. **Vor dem Check**: `if (this.startingEntities.has(entityId)) throw new Error('already starting')`
3. **Beim Start**: `this.startingEntities.add(entityId)` direkt am Anfang von `startEntity()`
4. **Nach Abschluss (success/error)**: `this.startingEntities.delete(entityId)` in finally-Block
5. **Frontend**: Renderer-Buttons disablen waehrend `startEntity()` laeuft (optimistic lock)

### Betroffene Dateien
- `src/main/session/session-manager.ts` (Backend-Lock)
- `src/renderer/app.tsx` (Button-Disable in handleXxxToggle-Functions, Zeilen 442-627)

### Verifikation
- Entity-Button schnell doppelklicken -> nur eine Session entsteht
- Gleichzeitiger Start via IPC -> sauberer Error

---

## I4: Escape (und andere Keys) ans Terminal durchreichen

### Problem
Escape-Taste wird vom globalen Shortcut-Handler in `app.tsx` abgefangen und erreicht nie das Terminal. Das gilt potenziell fuer alle Mux-Shortcuts die auch in Terminal-Sessions Bedeutung haben.

### Aktueller Stand
- `src/renderer/app.tsx:58-68` — globaler `shortcutEntries` Array mit Escape-Handler
- Escape schliesst alle Overlays (Bugreport, Info, Popup, SessionDialog, Workspaces, PlacementPopup)
- Der Handler feuert IMMER, auch wenn kein Overlay offen ist
- Ergebnis: Escape kommt nie beim xterm.js Terminal an (z.B. vim, less, Ctrl-Flows)

### Regel
**Mux-Shortcuts duerfen nur greifen wenn sie eine Bedeutung haben.** Wenn kein Overlay/Dialog offen ist, muss der Keystroke ans fokussierte Terminal durchgereicht werden. Kein Mux-Shortcut darf eine Taste "schlucken" die in der Terminal-Session gebraucht wird.

### Aufgabe
1. **Escape-Handler konditionieren**: Nur feuern wenn mindestens ein Overlay offen ist:
   ```typescript
   action: () => {
     const anyOverlayOpen = bugreportVisible || infoVisible || popupVisible ||
       sessionDialogVisible || workspacesPopupVisible || !!placementPopup
     if (!anyOverlayOpen) return  // <- durchreichen ans Terminal
     setBugreportVisible(false)
     // ... rest
   }
   ```
2. **Allgemein pruefen**: Gibt es weitere Shortcuts in `shortcutEntries` die Terminal-relevante Keys abfangen? Falls ja, gleiche Logik: nur greifen wenn Mux-Kontext aktiv.
3. **Key-Event Propagation**: Sicherstellen dass wenn der Shortcut-Handler `return` macht (nichts tut), der Event ans Terminal weitergeleitet wird (kein `preventDefault`/`stopPropagation` wenn nicht noetig).

### Betroffene Dateien
- `src/renderer/app.tsx` (shortcutEntries, Event-Handler)

### Verifikation
- Terminal fokussiert, kein Overlay offen -> Escape druecken -> Terminal empfaengt Escape (z.B. in vim/less testen)
- Overlay offen -> Escape druecken -> Overlay schliesst
- Alle anderen Mux-Shortcuts: nur aktiv wenn relevant, sonst durchreichen

---

## G1: Message-Bus Clean Start

### Problem
Message-Bus enthaelt Nachrichten aus vorherigen Runs.

### Aktueller Stand
- `src/main/message-bus/message-bus.ts:32-94` — Constructor, kein Startup-DELETE
- `src/main/ipc-hub.ts:191-194` — `this.messageBus.cleanup()` wird aufgerufen, loescht aber nur aeltere als 7 Tage
- Cleanup-Method: `message-bus.ts:161-166`

### Aufgabe
1. **Neue Methode** `clearAll()` in `message-bus.ts`: Fuehrt DELETE FROM messages aus
2. **Beim App-Start aufrufen**: In `ipc-hub.ts` nach Zeile 191 stattdessen `clearAll()` aufrufen
3. **Alternativ**: Prepared Statement mit `app_start_time` als Cutoff

### Verifikation
- App starten -> Message-Bus leer -> Nachrichten senden -> App neustarten -> Bus wieder leer

---

## Qualitaets-Gate

- [ ] Alle 4 Fixes implementiert
- [ ] `npm run build` erfolgreich
- [ ] `npm run test` — keine Regression
- [ ] `npm run lint` — keine neuen Fehler
- [ ] Manueller Test: App starten, Entity doppelklicken, Sessions oeffnen/schliessen, App neustarten
- [ ] Kein `t is not defined` in Console nach 5 Min normalem Gebrauch
