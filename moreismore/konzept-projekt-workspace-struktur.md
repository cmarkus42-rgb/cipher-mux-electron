# Konzept: Projekt-Workspace-Struktur und Tag-basierte Organisation

> Anforderung aus Companion-Session 2026-04-28. Ideation folgt separat.

## Kernideen

### 1. Tags statt Unterordner fuer Notes-Scoping

**Status Quo:** Notes haben zwei Scopes — `global` und `workspace-<id>`. Das erzwingt eine Ordner-Hierarchie.

**Vorschlag:** Scope-Zuordnung komplett ueber Tags abbilden. Ein Workspace definiert ein Set von Default-Tags (z.B. `project:cipher-mux`, `workspace:hauptprojekt`). Wenn der Workspace aktiv ist, werden diese Tags automatisch als Filter vorausgewaehlt. Kein separater `workspace`-Scope mehr noetig — alles ist global, aber gefiltert.

**Vorteile:**
- Notes koennen mehreren Workspaces zugeordnet sein (Multi-Tag)
- Keine starre Ordnerstruktur, alles durchsuchbar
- Workspace-Wechsel aendert nur den aktiven Filter, nicht den Zugriff
- Bug-Reports und Feature-Requests landen automatisch im richtigen Projekt-Kontext

### 2. Workspace = Projekt-Kontext

Ein Workspace selektiert nicht nur Grid-Belegung und Theme, sondern auch:
- **Projektordner** — der Claude-Code-Arbeitsordner fuer alle Sessions in diesem Workspace
- **Tag-Filter** — welche Notes/Bugs/Features standardmaessig sichtbar sind
- **Entity-Presets** — welche Sessions mit welchen Einstellungen gestartet werden

Das bedeutet: wenn ein Workspace aktiv ist, wissen alle Sessions automatisch, an welchem Projekt sie arbeiten. Der Bug-Report-Skill des Companion taggt einen neuen Bug automatisch mit dem Projekt-Tag des aktiven Workspace.

### 3. Standardisierte Projektordner-Struktur

Wenn ein Projekt ueber cipher-mux angelegt oder initialisiert wird (z.B. ueber Refinement), soll eine einheitliche Ordnerstruktur entstehen. Nicht erzwungen — wenn Ordner nicht gebraucht werden, bleiben sie leer oder werden nicht angelegt. Aber wenn Artefakte anfallen, landen sie an vorhersagbaren Stellen.

**Moegliche Struktur:**

```
projekt-name/
├── .claude/              # Claude Code Config (CLAUDE.md, etc.)
├── docs/                 # Spezifikationen, Anforderungen, Architektur
│   ├── specs/            # Refinement-Output: SDD, Anforderungen
│   ├── research/         # Recherche-Ergebnisse
│   └── audit/            # Audit-Berichte, Code-Reviews
├── src/                  # Quellcode
├── tests/                # Tests
├── moreismore/           # Ideen, Feature-Requests, Parkplatz
└── .project-meta.json    # cipher-mux Projekt-Metadaten
```

**Zuordnung Entity → Ordner:**

| Entity | Schreibt nach | Liest aus |
|--------|--------------|-----------|
| Refinement | `docs/specs/` | User-Input, `moreismore/` |
| Orchestrator | koordiniert | alles |
| MPO | koordiniert | alles |
| Worker | `src/`, `tests/` | `docs/specs/` |
| Audit | `docs/audit/` | `src/`, `tests/`, `docs/specs/` |
| Companion | Notes (Tags) | alles |

### 4. Veroeffentlichung vs. Lokal

Klare Trennung zwischen:
- **Veroeffentlichungsumfang:** Was ins Repo gehoert (`src/`, `tests/`, `docs/specs/` teilweise)
- **Lokaler Umfang:** Was nur lokal relevant ist (`moreismore/`, `docs/audit/`, `docs/research/`, Companion-Notes, Testcases)

Diese Trennung kann ueber `.gitignore`-Vorlagen oder Projekt-Meta gesteuert werden.

### 5. Bug-Reports und Feature-Requests im Projektkontext

**Aktuell:** Companion-Bug-Report-Skill erstellt Notes mit Tags `bugreport` / `feature-request` im globalen Scope.

**Kuenftig:** Wenn ein Workspace aktiv ist, wird automatisch der Projekt-Tag hinzugefuegt. Der Workspace filtert die Sidebar so, dass nur projektrelevante Notes sichtbar sind. Ergebnis: Bug-Reports gehoeren zum Projekt, nicht zur App.

### 6. Bug-Report-Skill → Notes

**Ausgangspunkt dieses Konzepts:** Der Companion hat einen Bug-Report-Skill. User sagt "Bug gefunden", Companion fuehrt ein Mini-Interview und erstellt eine Note. Diese Notes landen im Notes-System — und durch die Tag-basierte Organisation (siehe Punkt 1) automatisch im richtigen Projektkontext, wenn ein Workspace aktiv ist. Kein separates Bug-Tracking noetig, alles laeuft ueber Notes + Tags.

### 7. BugReport-Popup im Info-Bereich: User-to-Developer-Kanal (Zukunft)

Im Info-Bereich der App gibt es bereits ein BugReport-Popup mit lokalem LLM. Langfristige Idee: dieses Popup dient dazu, dass **Endbenutzer von cipher-mux** Bug-Reports an den Entwickler (Christian) schicken koennen. Das lokale LLM hilft beim Formulieren, der Report wird dann uebermittelt (z.B. per API, Mail oder GitHub Issue).

Zwei verschiedene Bug-Report-Wege:
1. **Companion-Skill** — fuer den Entwickler selbst: Bugs in seinen eigenen Projekten erfassen → Notes
2. **BugReport-Popup** — fuer Endbenutzer: Bugs in cipher-mux melden → an den Entwickler

Noch nicht spruchreif, aber als Idee auf dem Parkplatz.

## Offene Fragen (fuer Ideation)

1. **Tag-Namenskonvention:** `project:name` als Praefix? Oder freie Tags mit Workspace-Default?
2. **Projekt-Initialisierung:** Wer legt die Struktur an — Refinement automatisch? Companion auf Wunsch? Workspace-Setup?
3. **Bestehende Projekte:** Wie integriert man einen existierenden Ordner ohne die bestehende Struktur zu zerstoeren?
4. **Meta-Datei:** `.project-meta.json` mit Workspace-ID, Projekt-Tags, Entity-Zuordnungen — oder alles im Workspace-Config?
5. **Cross-Projekt-Notes:** Bug betrifft zwei Projekte — Multi-Tag loest das, aber wie sieht die UX aus?

## Zusammenfassung

Zwei tragende Saeulen:
1. **Tags ersetzen Ordner-Scoping** — alles ist Text, alles ist durchsuchbar, Workspace setzt nur den Default-Filter
2. **Workspace = Projekt** — ein Workspace bindet nicht nur Grid-Layout, sondern auch Projektordner, Tag-Filter und Entity-Konfiguration

Daraus folgt eine konsistente, wiederholbare Struktur fuer alle Projekte die in cipher-mux bearbeitet werden — ohne sie zu erzwingen.
