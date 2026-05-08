# Session Topic for Resume Display

**Date:** 2026-05-08
**Status:** Approved
**Approach:** A (save-time only, no live state)

## Problem

Graceful geschlossene Sessions tauchen beim Resume alle mit demselben generischen Hinweis auf. Man kann nicht unterscheiden, welche Session was gemacht hat — besonders bei mehreren Worker-Sessions auf demselben Projekt.

## Anforderung

Der Resume-Hinweis zeigt ein thematisches Topic pro Session an. Preset-Name ist immer dabei.

## Datenmodell

`keepWorkingSnapshot.sessions` bekommt ein neues optionales Feld:

```typescript
{
  name: string
  projectPath: string
  gridSlot: number
  entityId?: string
  topic?: string  // NEU
}
```

In `types.ts` (`CipherMuxConfig.keepWorkingSnapshot.sessions`) wird `topic?: string` ergaenzt.

## Topic-Aufloesungslogik

Neue Funktion `resolveSessionTopic(session, taskManager, tmuxManager): string` in `src/main/ipc-hub.ts` (private Methode oder freie Funktion).

**Prioritaetsreihenfolge:**

1. **Letzter aktiver Task:** `taskManager.list({ sessionId: session.id, state: ['running', 'dispatched'] })` — neuester `task.title`
2. **Letzter abgeschlossener Task:** `taskManager.list({ sessionId: session.id, state: ['completed'] })` — neuester nach `updated_at`, `task.title`
3. **tmux capture-pane:** Letzte 10 Zeilen via `tmux capture-pane -t <pane> -p -S -10`, regex fuer substantiellen Prompt (nicht "ja", "weiter", "ok", leere Zeilen). Erster Treffer von unten.
4. **Fallback:** Projekt-Basename (z.B. "cipher-mux-electron")

**Preset-Name-Prefix:** Wenn `session.entityId` vorhanden, wird der Entity-Name vorangestellt:
- Mit Task: `"Cyber Factory — Bugfix-Welle 2"`
- Ohne Task, mit tmux: `"Worker — refactor useGrid hook"`
- Nur Fallback: `"Cyber Factory · cipher-mux-electron"`

Entity-ID zu Display-Name Mapping: Einfache Map oder die bestehende Entity-Registry nutzen.

## Betroffene Stellen

### 1. Snapshot-Schreiben (2 Stellen)

**`IpcHub.destroy()`** (Zeile ~2721): `topic` Feld in Snapshot-Entry ergaenzen.

**`IpcHub.updateKeepWorkingSnapshot()`** (Zeile ~2700): Gleiches Mapping.

Beide rufen `resolveSessionTopic()` pro Session auf.

### 2. RecoveryDialog (Renderer)

`src/renderer/components/RecoveryDialog.tsx` Zeile ~183-191: Unter dem Session-Namen eine Zeile `topic` anzeigen als `text-xs text-dim`.

### 3. PaneHeader (Renderer)

`src/renderer/components/PaneHeader.tsx`: `title`-Attribut auf dem Session-Namen-Span mit dem Topic als Tooltip. Topic kommt ueber den Snapshot (nur bei Keep-Working-Restore relevant) oder wird nicht angezeigt.

### 4. Sidebar bg-card (Renderer)

`src/renderer/components/SidebarPanel.tsx` Zeile ~451: `title`-Attribut der bg-card mit Topic als nativer Tooltip.

### 5. Types

`src/shared/types.ts`: `topic?: string` in `keepWorkingSnapshot.sessions` Array-Typ.

## Nicht im Scope

- Kein live-updating Topic auf SessionInfo
- Kein neues IPC-Event
- Kein zusaetzlicher State im SessionManager
- Topic wird NUR bei Snapshot-Erstellung berechnet, nicht waehrend der Laufzeit

## tmux capture-pane Parsing

Regex-Ansatz fuer substantiellen Prompt:
- Zeilen von unten nach oben durchgehen
- Leere Zeilen, reine Whitespace, und Kurzantworten ("ja", "ok", "weiter", "y", "n") ueberspringen
- Erste Zeile mit >10 Zeichen und ohne fuehrende Sonderzeichen (Prompt-Marker wie `>`, `$`, `%`) nehmen
- Auf 80 Zeichen kuerzen wenn laenger
- Wenn nichts gefunden: `undefined` (naechste Prioritaet greift)

## Abwaertskompatibilitaet

`topic` ist optional. Bestehende Snapshots ohne `topic` funktionieren weiter — die Anzeige faellt dann auf Name + Pfad zurueck (wie bisher).
