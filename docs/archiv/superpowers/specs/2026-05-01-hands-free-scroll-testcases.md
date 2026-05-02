# Hands-Free Scroll Control — Testcases

**Feature:** Hands-Free Scroll Control
**Date:** 2026-05-01
**Status:** Implemented on `feat/hands-free-scroll`

---

## Automatisierte Tests (node --test)

### terminal-registry.test.ts (7 Tests)

| # | Test | Erwartet |
|---|------|----------|
| 1 | registers and retrieves a terminal | `getTerminal('s1')` liefert registriertes Terminal-Objekt |
| 2 | returns undefined for unregistered session | `getTerminal('unknown')` === undefined |
| 3 | unregisters a terminal | Nach `unregisterTerminal` ist Terminal weg |
| 4 | stores and retrieves a marker | `setMarker('s1', 42)` → `getMarker('s1')` === 42 |
| 5 | returns undefined for missing marker | Kein Marker gesetzt → undefined |
| 6 | clears a marker | Nach `clearMarker` ist Marker weg |
| 7 | overwrites marker on repeated set | Zweites `setMarker` ueberschreibt erstes |

### voice-input-router.test.ts — Scroll Commands (5 Tests)

| # | Test | Erwartet |
|---|------|----------|
| 1 | emits scroll event for "hoch" command | `scroll` Event mit `action: 'up'`, keine Keys an tmux |
| 2 | emits scroll event for "ganz runter" command | `scroll` Event mit `action: 'bottom'`, Interpunktion wird stripped |
| 3 | emits scroll event for "zum marker" command | `scroll` Event mit `action: 'to-marker'` |
| 4 | emits dispatched event with scroll label | `dispatched` Event mit `text: '[scroll-down]'` |
| 5 | does not match scroll command in longer text | "scroll mal hoch bitte" → kein Scroll-Match, normaler Text-Dispatch |

---

## Manuelle Tests (im laufenden cipher-mux)

### VAD-Tuning

| # | Szenario | Schritte | Erwartet |
|---|----------|----------|----------|
| M1 | Kurze Befehle bei normaler Lautstaerke | STT aktivieren, "hoch" in normaler Sprechlautstaerke sagen | VAD erkennt Speech, Whisper transkribiert "hoch" |
| M2 | Kein False-Positive bei Stille | STT aktivieren, 10s still bleiben | Keine Phantom-Transkriptionen |
| M3 | Laengere Saetze weiterhin erkannt | STT aktivieren, normalen Satz diktieren | Text erscheint wie bisher im Terminal |

### Voice-Scroll-Befehle

| # | Szenario | Schritte | Erwartet |
|---|----------|----------|----------|
| M4 | "hoch" scrollt Terminal hoch | STT aktiv, lange Claude-Antwort abwarten, "hoch" sagen | Terminal scrollt ~1 Seite nach oben, kein Text im Terminal |
| M5 | "weiter" scrollt Terminal runter | Nach M4: "weiter" sagen | Terminal scrollt zurueck nach unten |
| M6 | "ganz runter" springt ans Ende | Irgendwo im Scrollback, "ganz runter" sagen | Terminal springt ganz nach unten (Cursor sichtbar) |
| M7 | "ganz hoch" springt an den Anfang | "ganz hoch" sagen | Terminal springt zum Anfang des Scrollback |
| M8 | "zum marker" springt zur letzten Eingabe | Eingabe abschicken, Claude antwortet lang, "zum marker" sagen | Terminal scrollt zum Beginn der letzten Antwort |
| M9 | Scroll bei doppelter Zellhoehe | Zelle auf doppelte Hoehe expandieren, "hoch" sagen | Scrollt 2/3 der sichtbaren Hoehe (1/3 bleibt stehen) |
| M10 | Kein Scroll bei normalem Text | STT aktiv, "schreibe eine Funktion" sagen | Text wird normal ins Terminal getippt, kein Scroll |
| M11 | Scroll bei gepinnter Session | STT auf Session B pinnen, Session A fokussiert, "hoch" sagen | Session B scrollt, nicht Session A |

### MCP-Tool (mux_cell_scroll)

| # | Szenario | Schritte | Erwartet |
|---|----------|----------|----------|
| M12 | Claude scrollt via MCP | Claude ruft `mux_cell_scroll({ action: 'top' })` auf | Terminal der aufrufenden Session scrollt nach oben |
| M13 | Cell-Targeting | `mux_cell_scroll({ cell: 'cell-0-0', action: 'up' })` | Zelle oben-links scrollt |
| M14 | to-marker via MCP | User schickt Input, Claude antwortet, dann `mux_cell_scroll({ action: 'to-marker' })` | Scrollt zum Beginn der Antwort |
| M15 | Benutzerdefinierte Zeilenanzahl | `mux_cell_scroll({ action: 'up', lines: 5 })` | Genau 5 Zeilen nach oben |

### Marker-Tracking

| # | Szenario | Schritte | Erwartet |
|---|----------|----------|----------|
| M16 | Marker wird bei Enter gesetzt | Input eintippen, Enter druecken | Marker-Position = aktuelle Cursor-Zeile im Scrollback |
| M17 | Marker wird bei jedem Enter ueberschrieben | Zweimal Enter druecken | Marker zeigt auf die zweite Position, nicht die erste |
| M18 | Kein Marker → Fallback auf top | Frische Session ohne Enter, "zum marker" sagen | Scrollt nach ganz oben (Fallback) |
