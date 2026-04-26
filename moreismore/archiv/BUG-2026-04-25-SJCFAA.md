# BUG-2026-04-25-SJCFAA — MPO-Sessions nicht in Sidebar Background

**Status:** FIXED
**Bereich:** Renderer / Sidebar / useGrid
**Schwere:** Medium — Sessions existieren, sind aber unsichtbar

## Symptom

MPO-gestartete Worker-Sessions (via `mux_create_session` mit `visible: true`) erscheinen nicht als Background-Sessions in der Sidebar, wenn das Grid voll ist.

## Root Cause

Race Condition zwischen zwei IPC-Event-Channels:

1. `SESSION_CHANGED` triggert `useSessions.refresh()` (async IPC-Roundtrip)
2. `SESSION_VISIBLE_ADD` ruft `addSession()` auf — bei vollem Grid No-Op

Der `SESSION_VISIBLE_ADD`-Handler hat die Sessions-Liste nie explizit refresht. Er verlies sich darauf, dass der `SESSION_CHANGED`-Handler seinen async Refresh schon abgeschlossen hat. Bei schneller Session-Erstellung durch MPO war das nicht garantiert.

## Fix

- `refresh` aus `useSessions()` destrukturiert (`refreshSessions`)
- Expliziter `refreshSessions()`-Call im `SESSION_VISIBLE_ADD`-Handler nach `addSession`
- `refreshSessions` in useEffect-Dependencies aufgenommen

**Geaenderte Dateien:**
- `src/renderer/app.tsx` (Zeile 36, 168-191)
