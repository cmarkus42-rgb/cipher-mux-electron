# Phase 7 — Bugreport-Orchestrator (Notiz)

**Datum:** 2026-04-17
**Status:** Geplant, nicht designed
**Abhängigkeit:** Phase 6 Task 6.4 (Bugreport-Outbox) muss fertig sein

---

## Konzept

Projektübergreifendes Bugreport-System mit automatischer Bearbeitung durch Claude Code Sessions.

### Flow

```
User meldet Bug (aus beliebigem Projekt)
        ↓
  ~/.config/cipher-mux/bugreports/outbox/BUG-*.md
        ↓
  Orchestrator pollt Outbox (Intervall oder Trigger)
        ↓
  Liest Report, identifiziert Projekt aus Frontmatter
        ↓
  Startet Claude Code Session im richtigen Projektordner
        ↓
  Claude analysiert Bug, schlägt Fix vor oder implementiert
        ↓
  Ergebnis → inbox/BUG-*.md (mit Lösung/Vorschlag)
        ↓
  User reviewed → archiv/BUG-*.md
```

### Offene Design-Fragen (für Brainstorming in Phase 7)

1. **Polling vs. Trigger:** Intervall-basiert (cron/loop) oder Event-basiert (fswatch auf Outbox)?
2. **Autonomie-Level:** Nur Konzeptvorschlag, oder darf der Orchestrator direkt Fixes committen?
3. **Projekt-Erkennung:** Wie wird das Zielprojekt aus dem Report abgeleitet? Frontmatter `project` + Pfad-Registry?
4. **Fehlerbehandlung:** Was passiert wenn der Fix-Versuch scheitert? Retry? Eskalation an User?
5. **Multi-Projekt:** Kann der Orchestrator parallel mehrere Bugs in verschiedenen Projekten bearbeiten?
6. **Review-Flow:** Wie signalisiert der User "reviewed"? Datei nach archiv/ verschieben? Status-Feld im Frontmatter?
7. **Sicherheit:** Darf eine automatische Session Code ändern ohne User-Bestätigung?

### Verzeichnisstruktur (bereits in Phase 6 angelegt)

```
~/.config/cipher-mux/bugreports/
├── outbox/    ← neue Reports (Phase 6 schreibt hier)
├── inbox/     ← Ergebnisse vom Orchestrator
└── archiv/    ← vom User reviewed
```

### Bezug zu cipher-mux

Der Orchestrator in cipher-mux kann Sessions in beliebigen Projektordnern starten und per MCP delegieren — die Infrastruktur existiert bereits. Phase 7 erweitert den Orchestrator um einen Bugreport-Consumption-Loop.
