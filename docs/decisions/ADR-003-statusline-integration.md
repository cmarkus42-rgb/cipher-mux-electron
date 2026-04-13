# ADR-003: StatusLine-Integration

**Status:** Entschieden
**Datum:** 2026-04-13
**Betrifft:** SPEC.md Abschnitt 2 (StatusLineMonitor), Abschnitt 7 (Context-Budget)

## Kontext

Context-Usage-Daten müssen pro Claude Code Session erfasst werden (used_percentage, Tokens, Model). Claude Code bietet zwei Mechanismen: den `statusLine`-Hook (real-time JSON) und Session-JSONL-Dateien (offline-parsebar).

## Optionen

### Option A: statusLine-Hook (Datei/Socket-basiert)

Jede Claude Code Session wird mit einem `statusLine`-Command konfiguriert, das den JSON-Payload in eine session-spezifische Datei oder Named Pipe schreibt. Der Main Process watched diese Dateien.

- **Vorteile:**
  - Real-time (~300ms Refresh, von Claude Code getaktet)
  - Strukturiertes JSON mit allen relevanten Feldern
  - Kein API-Cost, keine externen Aufrufe
  - Pro-Session isoliert
- **Nachteile:**
  - Muss bei Session-Start konfiguriert werden (statusLine in Settings oder per-project)
  - Datei-Watching für bis zu 10 Dateien
  - statusLine-Format kann sich mit Claude Code Updates ändern
- **Risiko:** niedrig (defensive Parsing, Format ist stabil)

### Option B: Session-JSONL-Parsing

Main Process liest die JSONL-Transcripts in `~/.claude/projects/*/` und extrahiert Token-Usage aus den Conversation-Entries.

- **Vorteile:**
  - Keine Konfiguration der Claude Code Sessions nötig
  - Historische Daten verfügbar (für zukünftige Lernschleife)
  - Funktioniert auch für Sessions, die nicht via cipher-mux gestartet wurden
- **Nachteile:**
  - Nicht real-time (Datei wird nur bei Conversation-Events geschrieben)
  - Parsing der JSONL-Struktur aufwendiger
  - Pfad-Discovery komplex (~/.claude/projects/ Struktur)
  - Höhere I/O-Last (grosse JSONL-Dateien)
- **Risiko:** mittel (Format-Abhängigkeit, Performance bei grossen Dateien)

### Option C: Hybrid (Hook + JSONL)

statusLine-Hook als Primärquelle. JSONL-Parsing als Fallback für Sessions ohne Hook-Konfiguration und für historische Daten (zukünftige Lernschleife).

- **Vorteile:** Kombination aus Real-time + Historien-Zugriff
- **Nachteile:** Zwei Implementierungen zu pflegen
- **Risiko:** niedrig (JSONL-Fallback ist optional, kann schrittweise implementiert werden)

## Empfehlung

**Option A: statusLine-Hook** für den MVP.

Der Hook liefert exakt die benötigten Daten in Echtzeit. cipher-mux kontrolliert den Session-Start und kann die statusLine-Konfiguration automatisch injizieren. JSONL-Parsing kann später für die Orchestrator-Lernschleife nachgerüstet werden (out of scope für MVP).

Konkrete Implementierung: statusLine-Command schreibt JSON in `/tmp/cipher-mux/context/<session-id>.json`. StatusLineMonitor watched dieses Verzeichnis via `fs.watch`.

## Entscheidung

**Option A: statusLine-Hook** — Real-time JSON via Datei-Watch, JSONL-Parsing als späteres Feature.

## Konsequenzen

- StatusLineMonitor watched `/tmp/cipher-mux/context/` Verzeichnis
- Session-Start injiziert statusLine-Config in die Claude Code Session
- Context-Usage wird im In-Memory-Cache gehalten (pro Session)
- Events `usage-updated` und `usage-warning` (>80%) an IPC Hub
- JSONL-Parsing wird als separates Feature in der Zukunft implementiert
