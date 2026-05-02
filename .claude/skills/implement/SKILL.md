---
name: implement
description: "Implementiert das nächste offene Feature aus der Task-Liste (Phase 5). Liest SPEC.md und todo.md, erstellt einen Plan, wartet auf Bestätigung, implementiert dann autonom."
---

# Phase 5: Feature implementieren

Implementiere den nächsten offenen Task aus der Task-Liste.

## Vorbereitung

1. Lies `docs/SPEC.md` — Architektur, Modulstruktur, Akzeptanzkriterien
2. Lies `docs/todo.md` — finde den nächsten Task mit Status `open`
3. Prüfe Abhängigkeiten: Sind alle `Depends`-Tasks auf `done`?
4. Lies relevante ADRs in `docs/decisions/` falls der Task eine Entscheidung betrifft

## Implementierungsplan

1. Erstelle einen konkreten Implementierungsplan — **SCHREIBE NOCH KEINEN CODE**
2. Liste auf: Welche Dateien werden erstellt/geändert, welche Tests geschrieben
3. Zeige den Plan und warte auf Bestätigung

## Implementierung (nach Bestätigung)

1. Implementiere in kleinen Batches (max 5 Dateien pro Commit)
2. Schreibe Unit-Tests für neue Business-Logik
3. Prüfe ob der Build durchläuft und behebe Fehler
4. Nutze Subagenten für unabhängige Teilaufgaben (z.B. Frontend/Backend parallel)

## Abschluss

1. Aktualisiere `docs/todo.md`: Status `open` → `done`, Datum eintragen
2. Erstelle einen Commit mit konventioneller Message (`feat:`, `fix:`, `refactor:`)
3. Fasse zusammen was implementiert wurde
4. Nenne den nächsten offenen Task

## Wenn alle Tasks einer Phase done

Aktualisiere den Status in `CLAUDE.md`:
```
**Phase: 5 → 6 — Review & Test**
**Nächster Schritt:** Auftraggeber testet, gibt Feedback
```
