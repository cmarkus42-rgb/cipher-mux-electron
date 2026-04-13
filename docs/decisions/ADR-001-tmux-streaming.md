# ADR-001: tmux-Streaming-Mechanismus

**Status:** Entschieden
**Datum:** 2026-04-13
**Betrifft:** SPEC.md Abschnitt 2 (TmuxManager), Abschnitt 8 (Performance)

## Kontext

cipher-mux-electron muss tmux-Output in Echtzeit an xterm.js im Renderer streamen. Der Mechanismus bestimmt die gesamte Terminal-Architektur: Latenz, Zuverlässigkeit, Event-Handling und Komplexität.

## Optionen

### Option A: tmux Control Mode (-C)

tmux wird als Control-Mode-Client gestartet (`tmux -C attach`). Alle Kommunikation läuft über stdin/stdout mit strukturierten `%`-prefixed Events.

- **Vorteile:**
  - Strukturierte Events: `%output %0 <data>`, `%sessions-changed`, `%window-add`, `%pane-changed`
  - Eingebautes Flow Control via `pause-after` (verhindert Output-Flooding)
  - Ein einziger Prozess für alle Panes (kein pipe-per-pane)
  - Session-State-Notifications automatisch (kein Polling)
  - Offizielles tmux-Feature, aktiv maintained
- **Nachteile:**
  - Output ist octal-escaped (muss dekodiert werden)
  - Komplexerer Parser nötig (`%begin`/`%end`/`%error` Blocks)
  - Ein Control-Client pro tmux-Server (Reconnect-Logik nötig)
- **Risiko:** mittel (Parser-Komplexität, aber gut dokumentiert)

### Option B: pipe-pane

Pro Pane wird ein Pipe-Command registriert (`tmux pipe-pane -t %0 -O 'cat >> /tmp/fifo'`).

- **Vorteile:**
  - Einfach zu implementieren (Raw-Output direkt an Named Pipe/Datei)
  - Kein Parsing nötig — Output ist direkt xterm.js-kompatibel
- **Nachteile:**
  - Ein Pipe pro Pane (max 10 = 10 Named Pipes/Prozesse)
  - Kein Flow Control (Flooding bei High-Output)
  - Kein Session-State-Tracking (separates Polling nötig)
  - Nur Output-Richtung (kein Input-Kanal)
- **Risiko:** mittel (Skalierung bei 10 Sessions, kein Flow Control)

### Option C: capture-pane Polling

Regelmässiges `tmux capture-pane -p` in konfigurierbarem Intervall.

- **Vorteile:**
  - Einfachste Implementierung
  - Snapshot-basiert, kein Streaming-State
- **Nachteile:**
  - Polling = Latenz (100ms+ bei vernünftigem Intervall)
  - CPU-intensiv bei 10 Sessions
  - Duplikat-Erkennung nötig (was hat sich geändert?)
  - Nicht geeignet für echtzeitnahe Terminal-Interaktion
- **Risiko:** hoch (Performance, Latenz, Komplexität der Diff-Logik)

## Empfehlung

**Option A: Control Mode (-C)**

Control Mode ist die einzige Option, die alle Anforderungen gleichzeitig erfüllt:
- Real-time Streaming mit < 50ms Latenz-Ziel
- Flow Control gegen Output-Flooding (Performance-Risiko aus Requirements)
- Automatische Session-State-Events (Recovery-Feature)
- Single-Process-Architektur (skaliert besser als pipe-per-pane)

Der Parser (`tmux-parser.ts`) ist einmalige Komplexität, die sich über die gesamte Laufzeit auszahlt. iTerm2 und andere professionelle Terminals nutzen ebenfalls Control Mode.

## Entscheidung

**Option A: Control Mode (-C)** — Strukturierte Events, Flow Control, Single-Process-Architektur.

## Konsequenzen

- `TmuxManager` wird als Control-Mode-Client implementiert (Child Process: `tmux -C new-session` / `tmux -C attach`)
- `tmux-parser.ts` muss `%output`, `%begin`/`%end`, `%sessions-changed` und Flow-Control-Events parsen
- `output-batcher.ts` batched dekodierte Pane-Outputs auf 16ms-Intervalle für IPC
- Session-Recovery nutzt Control-Mode-Events statt Polling
- Capture-pane wird nur für initialen Scrollback-Import verwendet
