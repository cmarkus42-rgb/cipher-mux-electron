# Feature Request: Tag Management UI

**Status:** open
**Priority:** normal
**Date:** 2026-04-25

## Beschreibung

Tag-Verwaltungs-UI als neue Unterseite im Workspaces/Personas-Fenster (neben "Workspaces" und "Personas" Tabs).

## Motivation

Notes-Editor hat Auto-Tagging via Ollama und ein Seed-Tag-Repository. Aktuell gibt es keine Moeglichkeit, Tags manuell zu verwalten — umbenennen, loeschen, beschreiben, mergen, oder neue Tags anlegen. Die Tag-Liste waechst organisch und braucht Pflege.

## Anforderungen

### Must Have

- Dritter Tab "Tags" im Workspaces/Personas-Fenster
- Liste aller Tags mit Count und Description
- Tags umbenennen (propagiert in alle Notizen)
- Tags loeschen (entfernt aus allen Notizen)
- Tag-Description editieren
- Neue Tags manuell anlegen

### Nice to Have

- Tags mergen (zwei Tags zu einem zusammenfuehren)
- Tag-Gruppen / Kategorien (analog zu den Seed-Tag-Kategorien: Trading, Infra, Dev, etc.)
- Sortierung nach Name / Count / zuletzt verwendet
- Bulk-Operationen (mehrere Tags gleichzeitig loeschen/mergen)

## Technische Notizen

- Tag-Repository liegt in `~/.config/cipher-mux/notes/.tags.json`
- `NoteTagging` Klasse in `src/main/notes/note-tagging.ts` verwaltet das Repo
- Seed-Tags sind hardcoded als `SEED_TAGS` — UI sollte zwischen Seed und Custom unterscheiden koennen
- Umbenennen/Loeschen muss Frontmatter aller betroffenen Notizen aktualisieren (gray-matter round-trip)
- Neuer IPC-Channel noetig: `NOTES_TAG_UPDATE`, `NOTES_TAG_DELETE`, `NOTES_TAG_RENAME`, etc.
- WorkspacesWindow URL-Routing erweitern: `index.html?view=workspaces#tags`

## Integration

Gehoert ins Workspaces/Personas-Fenster als dritter Tab, weil Tags workspace-uebergreifend sind und konzeptionell zur Organisation gehoeren — nicht zur einzelnen Notiz.
