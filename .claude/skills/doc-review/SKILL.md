---
name: doc-review
description: "Prüft Dokumentation auf Konsistenz mit dem tatsächlichen Code-Stand. Aktualisiert CLAUDE.md, SPEC.md und todo.md. Nutze am Ende eines Implementierungszyklus oder bei Phasenübergang."
---

# Dokumentations-Review

Führe ein Dokumentations-Review durch und bringe alle Docs auf den aktuellen Stand.

## Prüfung

1. Lies `CLAUDE.md`, `docs/SPEC.md`, `docs/todo.md`
2. Prüfe die letzten Git-Commits (`git log --oneline -20`)
3. Identifiziere Inkonsistenzen:
   - Neue Dateien/Module die nicht in CLAUDE.md oder SPEC.md dokumentiert sind
   - Tasks in todo.md die erledigt aber nicht als `done` markiert sind
   - Architekturentscheidungen die getroffen aber nicht in `docs/decisions/` dokumentiert sind
   - Bekannte Pitfalls aus der Implementierung die noch nicht in CLAUDE.md stehen
   - Phasen-Status in CLAUDE.md stimmt nicht mit dem tatsächlichen Fortschritt überein

## Aktualisierung

- **CLAUDE.md:** Nur Schlüsseldateien, Pitfalls, Constraints — knapp halten (max 120 Zeilen)
- **SPEC.md:** Architektur, Modulstruktur, API-Kontrakte aktualisieren
- **todo.md:** Status aktualisieren, Datums eintragen
- **Phasen-Status:** In CLAUDE.md auf den tatsächlichen Stand bringen

## Abschluss

Fasse zusammen was du aktualisiert hast.
