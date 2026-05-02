# BUG: Projektlauncher startet keine Session und öffnet kein Fenster

**Datum:** 2026-04-20
**Schwere:** Hoch — Kernfunktion blockiert
**Komponente:** ProjectPopup → KickoffOrchestrator → SessionManager
**Status:** Offen

---

## Symptom

Benutzer öffnet Projekt-Popup, klappt "neues projekt launchen" auf, gibt ein Verzeichnis an und klickt "projekt aufsetzen". Das Popup schließt sich — aber es erscheint keine neue Session im Grid und kein Terminal-Fenster öffnet sich. Es gibt keinen sichtbaren Fehler.

## Erwartetes Verhalten

1. Launcher-Session erscheint im Grid (tmux-Session im `projectlauncher/`-Verzeichnis)
2. Claude startet automatisch (`clear; claude --dangerously-skip-permissions`)
3. Nach 5s wird der Launcher-Prompt gesendet
4. Nach Completion: Follow-up-Session im Zielprojekt erscheint im Grid

---

## Analyse: Der Kickoff-Flow im Detail

### Schritt-für-Schritt-Kette

```
ProjectPopup.handleKickoffSubmit()
  └─ api().projects.kickoff({ projectDir, ... })
       └─ ipcRenderer.invoke(IPC.PROJECTS_KICKOFF, opts)
            └─ ipc-hub.ts: kickoffOrchestrator.start(req)
                 ├─ Validierung (Verzeichnis existiert?)
                 ├─ sessionManager.start({ name: "Launcher: ...", projectPath: projectlauncherPath })
                 │    ├─ tmux.createSession(...)
                 │    ├─ emit('session-changed', session)
                 │    └─ setPendingLaunch(id, autoLaunch)
                 ├─ setTimeout(sendKeys(prompt), 5000ms)
                 ├─ KickoffWatcher.start() — wartet auf .kickoff-complete Marker
                 └─ return KickoffHandle
```

### Kritisches Problem: Launcher-Session wird NICHT ins Grid eingetragen

**Das ist der wahrscheinliche Bug.** Die Kette hat eine Lücke:

1. `kickoffOrchestrator.start()` erstellt eine Session via `sessionManager.start()`
2. Die Session existiert in tmux und im SessionManager
3. `SESSION_CHANGED` wird emitted und an den Renderer gesendet
4. **ABER:** Der Renderer-Code in `app.tsx` reagiert nur auf `SESSION_CHANGED` für den Orchestrator-Session (Zeile 49-58) — er ruft `placeOrchestrator(sid)` auf, was nur greift, wenn die Session als Orchestrator erkannt wird
5. Die Launcher-Session ist kein Orchestrator — sie hat den Namen `"Launcher: <projektname>"`, nicht den Orchestrator-Namen
6. **Ergebnis:** Die Session existiert, aber niemand fügt sie ins Grid ein

Zum Vergleich — wenn ein User ein Projekt aus der Liste auswählt, passiert in `handleProjectSelect()`:
```typescript
const session = await startSession({ name, projectPath, autoLaunch })
addSession(session.id)           // ← EXPLIZIT ins Grid
setFocusedSessionId(session.id)  // ← EXPLIZIT fokussiert
```

Beim Kickoff fehlt beides. Der `kickoff()`-Call gibt nur das `KickoffHandle` zurück (mit der `launcherSessionId`), aber `ProjectPopup.handleKickoffSubmit()` **ignoriert den Return-Value komplett**:

```typescript
// ProjectPopup.tsx:98
await api().projects.kickoff({ projectDir, ... })
// ← handle wird nicht verwendet!
// ← keine addSession(), kein setFocusedSessionId()
```

### Sekundäres Problem: Follow-up-Session wird auch nicht sichtbar

Selbst wenn die Launcher-Session im Hintergrund korrekt läuft und der Kickoff irgendwann completed:

1. `handleCompletion()` erstellt eine Follow-up-Session
2. Emittiert `kickoff-complete` → IPC `PROJECT_KICKOFF_COMPLETED` → Renderer
3. `app.tsx:63-68` reagiert darauf:
   ```typescript
   if (data?.status === 'complete' && data.event?.followupSessionId) {
     addSession(data.event.followupSessionId)
     setFocusedSessionId(data.event.followupSessionId)
   }
   ```
4. **Das funktioniert im Prinzip** — aber nur wenn der Kickoff jemals completed
5. Da der User die Launcher-Session nicht sieht und nicht weiß ob/was passiert, wird er vorher aufgeben

### Drittens: Keine Fehler-/Status-Rückmeldung im UI

- `app.tsx` behandelt nur `status === 'complete'` — timeout und error werden ignoriert
- Das Popup schließt sich sofort nach Submit — kein "Launcher läuft..."-Indikator
- Wenn `projectlauncherPath` nicht existiert oder tmux fehlschlägt, sieht der User nichts

---

## Root Causes (Rangfolge nach Wahrscheinlichkeit)

### RC-1: Launcher-Session wird nicht ins Grid aufgenommen (HIGH)

**Datei:** `src/renderer/components/ProjectPopup.tsx:98-108`
**Problem:** `api().projects.kickoff()` gibt ein `KickoffHandle` mit `launcherSessionId` zurück, aber der Return-Value wird verworfen. Kein `addSession()` wird aufgerufen.

**Fix:** Nach erfolgreichem `kickoff()`-Call die `launcherSessionId` aus dem Handle ins Grid eintragen:
```typescript
const handle = await api().projects.kickoff({ ... })
// Signal an App: Launcher-Session ins Grid aufnehmen
// Option A: onSelect-Callback mit synthetischem ProjectInfo
// Option B: Neues Callback-Prop onKickoffStarted(launcherSessionId)
// Option C: kickoff() selbst triggert addSession über einen Event
```

### RC-2: projectlauncherPath existiert nicht / ist falsch konfiguriert (MEDIUM)

**Datei:** `src/main/ipc-hub.ts:53-54`
**Wert:** `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher`

Der Pfad existiert auf diesem System (verifiziert), aber:
- Auf einem frisch installierten System existiert er nicht
- Die Community Edition hat diesen Pfad nicht
- Der Fehler wird zwar geworfen, aber der User sieht ihn nicht (catch in ProjectPopup zeigt `kickoffError` — Popup ist da aber schon geschlossen? Nein, Popup schließt erst bei Erfolg, also wäre der Fehler sichtbar.)

### RC-3: tmux-Session wird erstellt aber autoLaunch feuert nie (LOW)

**Datei:** `src/main/session/session-manager.ts` — `setPendingLaunch()`
**Problem:** autoLaunch feuert erst bei `TERMINAL_READY` vom Renderer. Wenn kein Terminal im Grid gerendert wird (weil die Session nicht im Grid ist → RC-1), kommt `TERMINAL_READY` nie.

**Kaskade:** RC-1 → kein Terminal gerendert → kein `TERMINAL_READY` → kein autoLaunch → Claude startet nie → Prompt wird nie gesendet → `.kickoff-complete` Marker wird nie erstellt → Follow-up-Session wird nie erstellt → User sieht nichts.

**Aber:** Es gibt ein 4-Sekunden-Fallback in `setPendingLaunch()` — wenn kein `markReady()` kommt, feuert der autoLaunch trotzdem. D.h. Claude startet zwar, aber der User sieht es nicht.

---

## Empfohlene Fixes

### Fix 1: Launcher-Session ins Grid aufnehmen (Pflicht)

In `ProjectPopup.tsx` oder `app.tsx` muss nach erfolgreichem Kickoff-Submit die `launcherSessionId` ins Grid:

**Option A (sauberste):** Neues Prop `onKickoffStarted` an ProjectPopup übergeben:
```typescript
// app.tsx
const handleKickoffStarted = useCallback((launcherSessionId: string) => {
  addSession(launcherSessionId)
  setFocusedSessionId(launcherSessionId)
}, [addSession])
```

```typescript
// ProjectPopup.tsx:98
const handle = await api().projects.kickoff({ ... })
onKickoffStarted(handle.launcherSessionId)
```

**Option B (minimal):** Direkt in ProjectPopup:
```typescript
const handle = await api().projects.kickoff({ ... })
// Trigger session refresh — the session exists, just isn't in grid
```

### Fix 2: Timeout/Error-Feedback im UI (Sollte)

In `app.tsx:63-68` die anderen Status behandeln:
```typescript
if (data?.status === 'timeout') {
  // Warnung anzeigen: "Kickoff-Timeout — prüfe die Launcher-Session"
}
if (data?.status === 'error') {
  // Fehler anzeigen
}
```

### Fix 3: Loading-Indikator statt Popup-Schließen (Nice-to-have)

Statt das Popup sofort zu schließen, könnte ein "Launcher gestartet..."-Status angezeigt werden, bis die Session im Grid sichtbar ist.

---

## Betroffene Dateien

| Datei | Zeilen | Rolle |
|---|---|---|
| `src/renderer/components/ProjectPopup.tsx` | 90-114 | Kickoff-Submit ohne Grid-Eintrag |
| `src/renderer/app.tsx` | 60-71 | Completion-Listener ohne Error-Handling |
| `src/main/project/kickoff-orchestrator.ts` | 86-128 | Session-Erstellung + Handle-Return |
| `src/main/ipc-hub.ts` | 347-350 | IPC-Handler (korrekt) |
| `src/main/session/session-manager.ts` | 53-111 | Session-Erstellung (korrekt) |

---

## Reproduktion

1. DMG installieren, App starten
2. Auf einer LauncherCell "projekt" klicken
3. "neues projekt launchen" aufklappen
4. Gültiges Verzeichnis angeben
5. "projekt aufsetzen" klicken
6. Beobachten: Popup schließt sich, Grid bleibt unverändert
7. `tmux ls` im Terminal: Session `cmux-*` existiert, aber ist nicht im Grid sichtbar
