# SP-2: Notes MCP Vollausbau + Session-Handoff — Detail-Spec

> MPO Sub-Projekt 2 | Wave 1 | Aufwand: ~1.5d
> Plan-Phase: 2 + Handoff-Feature | Ticket: D8D39K

---

## Ziel

Notes MCP-Tools vervollstaendigen (read, update, search, delete) und Session-Handoff via Notes implementieren.

## Kontext

### Bestehend
- `NoteManager` (`src/main/notes/note-manager.ts`): Hat bereits `create()`, `list()`, `listAll()`, `read()`, `save()`, `delete()`
- MCP-Tools: `mux_notes_create` (Tool #15) und `mux_notes_list` (Tool #16) in `src/main/mcp/mcp-tools.ts`
- Notes: Markdown + YAML-Frontmatter, ULID-Dateinamen, Scope-basierte Verzeichnisse (`global/`, `workspace-<id>/`)
- Frontmatter: `title`, `tags`, `created`, `modified`

### Was fehlt
- MCP-Tools fuer read, update, search, delete
- Volltextsuche ueber Notes
- Handoff-Note-Mechanismus fuer Session-Uebergaben

## Funktionale Anforderungen

### FR-1: MCP Tool `mux_notes_read`
```
Input:  { id: string, scope?: string }
Output: { info: NoteInfo, body: string }
```
- Liest Note by ID
- Scope default "global"
- Ruft `NoteManager.read()` auf
- Fehler wenn Note nicht existiert

### FR-2: MCP Tool `mux_notes_update`
```
Input:  { id: string, scope?: string, title?: string, body?: string, tags?: string[] }
Output: { ok: true, id: string, title: string }
```
- Partielles Update: nur uebergebene Felder aendern
- Wenn `body` uebergeben: `NoteManager.save(id, scope, body, tags)`
- Wenn nur `tags` uebergeben: bestehenden Body lesen, mit neuen Tags speichern
- Wenn nur `title` uebergeben: Body-Heading aktualisieren (erste `# ` Zeile)
- `modified`-Timestamp automatisch aktualisieren
- IPC-Event `NOTES_CHANGED` an Renderer senden (wie bei create)
- Max 5 Tags

### FR-3: MCP Tool `mux_notes_search`
```
Input:  { query: string, scope?: string, tags?: string[] }
Output: NoteInfo[] (gefiltert, sortiert nach Relevanz)
```
- Volltextsuche ueber Note-Body UND Title
- Optional: Tag-Filter (nur Notes mit mindestens einem der angegebenen Tags)
- Optional: Scope-Filter
- Implementation: Einfacher String-Match (case-insensitive `includes()` ueber Body + Title). Kein FTS5 noetig — Notes sind Dateien, nicht DB.
- Sortierung: Notes mit Query im Title zuerst, dann nach modifiedAt
- Max 50 Ergebnisse

### FR-4: MCP Tool `mux_notes_delete`
```
Input:  { id: string, scope?: string }
Output: { ok: true, id: string }
```
- Ruft `NoteManager.delete()` auf
- IPC-Event `NOTES_CHANGED` an Renderer senden
- Fehler wenn Note nicht existiert

### FR-5: Session-Handoff via Notes

**Neues Frontmatter-Schema fuer Handoff-Notes:**
```yaml
---
title: "Handoff: <Kontext>"
tags: [handoff]
from_session: <session-name>
to_entity: <entity-id|"any">
handoff_status: pending|consumed
created: <ISO-timestamp>
modified: <ISO-timestamp>
---
```

**MCP Tool `mux_notes_handoff_create`:**
```
Input: {
  title: string,
  body: string,
  from_session: string,
  to_entity?: string  // default "any"
}
Output: { ok: true, id: string }
```
- Erstellt Note mit Tag `handoff` und erweiterten Frontmatter-Feldern
- Scope: `global` (Handoffs sind session-uebergreifend)
- `handoff_status: pending` initial

**MCP Tool `mux_notes_handoff_search`:**
```
Input: {
  to_entity?: string,
  status?: "pending"|"consumed"
}
Output: NoteInfo[] (mit Handoff-Frontmatter)
```
- Sucht nach Notes mit Tag `handoff`
- Filtert nach `to_entity` (wenn angegeben)
- Filtert nach `handoff_status` (default: `pending`)
- Sortiert nach `created` (neueste zuerst)

**Handoff-Consume:**
- Kein eigenes Tool — wird via `mux_notes_update` gemacht: `tags: ['handoff', 'consumed']` + `handoff_status: consumed`
- Entity-Sessions (SP-3) werden beim Start automatisch `mux_notes_handoff_search(to_entity: self.entityId, status: 'pending')` ausfuehren

### FR-6: NoteManager erweitern

`NoteManager` braucht eine `search()` Methode:

```typescript
async search(query: string, opts?: {
  scope?: string,
  tags?: string[]
}): Promise<NoteContent[]>
```

- Liest alle Notes (scope-gefiltert oder alle)
- Filtert nach Query (case-insensitive includes auf title + body)
- Filtert nach Tags (Intersection: Note muss mindestens einen der Tags haben)
- Sortierung: Title-Matches first, dann modifiedAt desc
- Max 50 Ergebnisse

**Frontmatter erweitern:** `NoteManager.parseFile()` muss zusaetzliche Frontmatter-Felder durchreichen (from_session, to_entity, handoff_status). Entweder generisch als `metadata: Record<string, unknown>` oder spezifische Felder.

## Abgrenzung

- Kein FTS5/SQLite fuer Notes-Suche (Notes sind Dateien, Memory nutzt SQLite)
- Kein Auto-Read beim Entity-Start (das macht SP-3)
- Keine UI-Aenderungen an der Notes-Ansicht (Handoff-Badge kommt spaeter)

## Meta-Requirements

- **Pattern:** Folge dem bestehenden MCP-Tool-Pattern in `mcp-tools.ts` (zod-Schema, ToolContext, error handling)
- **IPC:** `NOTES_CHANGED` Event bei jeder Mutation senden
- **Validation:** zod-Schemas fuer alle Tool-Inputs
- **Error Handling:** Konsistente Fehler-Responses (`{ error: string }`)

## Quality Gate

### Testcases

| # | Test | Erwartetes Ergebnis |
|---|---|---|
| T1 | `mux_notes_read` mit gueltigem ID | Note-Content zurueck |
| T2 | `mux_notes_read` mit ungueltigem ID | Fehler-Response |
| T3 | `mux_notes_update` nur Tags | Tags geaendert, Body unberuehrt |
| T4 | `mux_notes_update` Body + Tags | Beides aktualisiert, modified neu |
| T5 | `mux_notes_search` mit Query | Matching Notes zurueck |
| T6 | `mux_notes_search` mit Tags-Filter | Nur Notes mit passendem Tag |
| T7 | `mux_notes_search` ohne Treffer | Leeres Array |
| T8 | `mux_notes_delete` | Note geloescht, NOTES_CHANGED Event |
| T9 | `mux_notes_handoff_create` | Handoff-Note mit korrektem Frontmatter |
| T10 | `mux_notes_handoff_search(to_entity: 'companion')` | Nur Companion-Handoffs |
| T11 | `mux_notes_handoff_search(status: 'consumed')` | Nur consumed Handoffs |
| T12 | Handoff-Note via update als consumed markieren | `handoff_status` geaendert |
| T13 | `NoteManager.search()` | Korrekte Volltextsuche + Tag-Filter |

### Code-Qualitaet
- `npm run lint` ohne neue Errors
- `npm run test` gruen
- Konsistente Error-Responses in allen Tools
- Kein Duplizierung von NoteManager-Logik in Tool-Handlern
- zod-Schemas validieren alle Inputs

### Dokumentation
- `CHANGELOG.md` aktualisieren
- `docs/todo.md` aktualisieren
- JSDoc auf `NoteManager.search()` und neue MCP-Tool-Handler

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- NoteManager: `src/main/notes/note-manager.ts`
- MCP-Tools: `src/main/mcp/mcp-tools.ts` (ab Zeile ~606)
- Types: `src/shared/types.ts` (NoteInfo, NoteContent)
- IPC: `src/shared/ipc-channels.ts` (NOTES_CHANGED)
- Projekt-Konventionen: `CLAUDE.md` im Repo-Root
