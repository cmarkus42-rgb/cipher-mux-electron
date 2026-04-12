---
name: decompose
description: "Zerlegt die Spezifikation in implementierbare Tasks mit Abhängigkeiten (Phase 4). Erstellt die vollständige Task-Liste in docs/todo.md."
---

# Phase 4: Task-Dekomposition

Du zerlegst die technische Spezifikation in konkrete, implementierbare Tasks.

## Eingabe lesen

1. Lies `docs/SPEC.md` — Architektur, Module, Datenmodell, Akzeptanzkriterien
2. Lies `docs/requirements.md` — Scope/MVP-Abgrenzung
3. Lies `docs/decisions/` — alle getroffenen ADRs (beeinflussen die Implementierungsreihenfolge)
4. Lies `CLAUDE.md` — Constraints, Tech-Stack

## Dekompositions-Regeln

- **Maximale Batchgröße:** 5–20 Dateien pro Task
- **Jeder Task muss eigenständig kompilierbar und testbar sein**
- **Maximal 10 Tasks pro Epic/Phase** — feinere Granularität erhöht die Fehlerquote
- **Abhängigkeiten explizit:** Welcher Task muss vor welchem fertig sein?
- **Parallelisierbarkeit markieren:** Welche Tasks können gleichzeitig laufen?

## Task-Format

Jeder Task in `docs/todo.md` folgt diesem Format:

```markdown
### Phase N: [Phasen-Titel]

| # | Task | Status | Depends | Parallel | Akzeptanzkriterien |
|---|------|--------|---------|----------|--------------------|
| 1 | [Kurztitel] | open | — | — | [Was muss funktionieren] |
| 2 | [Kurztitel] | open | #1 | — | [Was muss funktionieren] |
| 3 | [Kurztitel] | open | #1 | #2 | [Was muss funktionieren] |
```

## Phasen-Struktur

Organisiere Tasks in Implementierungsphasen:

1. **Scaffold & Grundstruktur** — Projektsetup, Module, Build-Konfiguration
2. **Core/Datenmodell** — Entities, DB, Repository-Layer
3. **Business-Logik** — Use Cases, Services
4. **UI/Screens** — Screens, Navigation, State-Management
5. **Integration** — API-Anbindung, externe Services
6. **Polish & Edge Cases** — Fehlerbehandlung, Offline, Performance

Passe die Phasen an das konkrete Projekt an — nicht jedes Projekt braucht alle.

## Abschluss

1. Schreibe `docs/todo.md` mit der vollständigen Task-Liste
2. Prüfe: Decken alle Tasks zusammen die SPEC.md vollständig ab?
3. Prüfe: Gibt es zirkuläre Abhängigkeiten? (darf nicht sein)
4. Aktualisiere den Status in `CLAUDE.md`:
   ```
   **Phase: 4 → 5 — Autonome Implementierung**
   **Nächster Schritt:** `/implement` starten — beginnt mit dem ersten unblockierten Task
   ```
5. Zeige die Task-Übersicht und den empfohlenen Startpunkt
