# SP-4: Companion Memory System — Detail-Spec

> MPO Sub-Projekt 4 | Wave 2 | Aufwand: ~2.5d
> Plan-Phasen: 3b, 3c, 3d | Tickets: KPHBQW, feature-companion-subsystem

---

## Ziel

Persistentes Gedaechtnis fuer Relay — geteilt ueber alle Entity-Sessions. SQLite + FTS5 Memory Store, 4 MCP-Tools, Memory-UI in Sidebar.

## Kontext

- Companion Spec + ADRs liegen unter `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-companion-kickoff/`
- **SPEC.md ist Source of Truth** fuer Schema, API, Architektur. Bei Widerspruch zwischen dieser Detail-Spec und SPEC.md gilt SPEC.md.
- Existierende Patterns: `src/main/message-bus/` fuer SQLite + better-sqlite3 + WAL, `src/main/notes/` fuer FTS5
- User-Profil existiert: `~/.config/cipher-mux/user-profile.json`

## Vorbereitung

**LIES ZUERST:**
1. `CLAUDE.md` im Repo-Root (Projekt-Konventionen)
2. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-companion-kickoff/SPEC.md` (Source of Truth)
3. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-companion-kickoff/KICKOFF.md` (Phase-1-Scope + offene Punkte)
4. ADR-009 bis ADR-012 im selben Folder
5. `src/main/message-bus/` als SQLite-Pattern-Referenz
6. `src/main/mcp/mcp-tools.ts` fuer MCP-Tool-Registrierung (ab Zeile ~606 fuer Notes-Tools als Vorlage)

## Funktionale Anforderungen

### Phase 3b: Companion Memory Store (~1.5d)

#### FR-1: SQLite-Schema
Erstelle `src/main/companion/schema.sql` mit den Tabellen aus SPEC.md §5:
- `memories` (id TEXT PK/ULID, ts, session_id, persona, kind, text, salience, ttl_days, embedding BLOB NULL, source_excerpt)
- `memories_fts` (FTS5 external-content auf memories)
- Trigger fuer FTS5-Sync (INSERT + DELETE)
- `user_profile` (field TEXT PK, value TEXT/JSON, updated_at, evidence)
- `persona_state` (key TEXT PK, value TEXT, updated_at)
- `pending_updates` (id TEXT PK/ULID, ts, source, category, field, old_value, new_value, status, reviewed_at)
- Index auf `memories(ts)` und `memories(kind)`

#### FR-2: Migration System
- PRAGMA `user_version` basierte Migrationen
- `src/main/companion/migrations/` Ordner
- Pattern aus `src/main/message-bus/` uebernehmen falls vorhanden
- Migration 001: initiales Schema

#### FR-3: MemoryStore Klasse
`src/main/companion/memory-store.ts`:
```typescript
class MemoryStore {
  constructor(dbPath: string)  // ~/.config/cipher-mux/companion.db
  write(opts: { text: string, kind: MemoryKind, sessionId?: string, persona?: string, salience?: number, ttlDays?: number, sourceExcerpt?: string }): Memory
  recall(opts?: { limit?: number, entityFilter?: string, since?: number }): Memory[]
  search(query: string, opts?: { limit?: number }): Memory[]
  forget(id: string): boolean
  close(): void
}
```
- WAL-Mode aktivieren
- ULID fuer IDs
- `recall()` sortiert nach ts DESC, default limit 20
- `search()` nutzt FTS5 MATCH, sortiert nach rank
- `write()` fuegt auch in FTS5 ein (via Trigger, nicht manuell)
- `forget()` loescht aus memories + FTS5 (via Trigger)

#### FR-4: Retriever
`src/main/companion/retriever.ts`:
- FTS5-basiertes Retrieval (Phase 1, kein Embedding)
- `retrieve(query: string, limit?: number): Memory[]`
- Wrapper um MemoryStore.search() mit Ranking-Logik

### Phase 3c: MCP Memory Tools (~0.5d)

#### FR-5: 4 MCP-Tools registrieren
In `src/main/mcp/mcp-tools.ts` (nach den Notes-Tools):

**`companion_memory_write`**
```
Input: { text: string, kind: 'fact'|'preference'|'interaction'|'event', session_id?: string, context_tags?: string[], salience?: number }
Output: { ok: true, id: string }
```

**`companion_memory_recall`**
```
Input: { limit?: number, entity_filter?: string, since_hours?: number }
Output: Memory[]
```

**`companion_memory_search`**
```
Input: { query: string, limit?: number }
Output: Memory[]
```

**`companion_memory_forget`**
```
Input: { id: string }
Output: { ok: true }
```

#### FR-6: ToolContext erweitern
- `MemoryStore` zu `ToolContext` hinzufuegen
- Initialisierung in Main-Process (companion.db Pfad aus ConfigStore)

### Phase 3d: Memory UI (~0.5d)

**WICHTIG:** Phase 3d haengt von SP-3 (Entity Framework) ab. Wenn SP-3 noch nicht fertig ist, implementiere 3b+3c zuerst und warte mit 3d. Pruefe ob `SidebarPanel.tsx` bereits einen "Memory"-Tab-Slot hat.

#### FR-7: CompanionMemoryView
`src/renderer/components/CompanionMemoryView.tsx`:
- Timeline der letzten Erinnerungen (chronologisch, neueste oben)
- Suchfeld (FTS5-Suche via IPC)
- Delete-Button pro Memory (mit Confirm)
- Kind-Badge pro Memory (fact/preference/interaction/event)
- Salience-Indikator (optional, subtiler Dot)

#### FR-8: Sidebar-Tab "Memory"
- Neuer Tab in SidebarPanel neben Sessions, Notes, Messages
- IPC-Channels: `cipher-mux:companion:recall`, `cipher-mux:companion:search`, `cipher-mux:companion:forget`
- Preload + IPC-Hub erweitern

#### FR-9: Info-Popup
- How-to-Content aus externer .md-Datei laden: `~/.config/cipher-mux/entities/companion/how-to-info-popup.md`
- Editierbar ohne Rebuild (bei Datei-Aenderung neu laden oder Reload-Button)
- Fallback-Content wenn Datei nicht existiert

## Abgrenzung

- Kein Embedding/Hybrid-Retrieval (Phase 2 — Ollama nomic-embed-text)
- Kein Pending-Queue-UI (Phase 3 des Companion-Plans)
- Kein First-Run-Dialog (Phase 4)
- Kein SQLCipher (Phase 5 — Release-Blocker fuer Public Release)
- pending_updates-Rows werden geschrieben aber es gibt noch kein UI dafuer

## Meta-Requirements

- **SQLite:** better-sqlite3, WAL-Mode, synchrone API
- **IDs:** ULID via `ulidx`
- **i18n:** Alle neuen UI-Strings via `useTranslation()` + t() (i18n-Framework aus SP-1 nutzen)
- **Pattern:** Folge MCP-Tool-Pattern aus mcp-tools.ts, SQLite-Pattern aus message-bus/
- **DB-Pfad:** `~/.config/cipher-mux/companion.db`

## Quality Gate

### Testcases

| # | Test | Erwartetes Ergebnis |
|---|---|---|
| T1 | MemoryStore.write() mit allen Feldern | Memory in DB, FTS5-Index aktualisiert |
| T2 | MemoryStore.recall() default | Letzte 20 Memories, neueste zuerst |
| T3 | MemoryStore.recall() mit limit + since | Gefilterte Ergebnisse |
| T4 | MemoryStore.search("keyword") | FTS5-Treffer, ranked |
| T5 | MemoryStore.search() ohne Treffer | Leeres Array |
| T6 | MemoryStore.forget(id) | Memory + FTS5-Eintrag geloescht |
| T7 | MemoryStore.forget() mit ungueltigem ID | false zurueck |
| T8 | companion_memory_write MCP-Tool | Memory erstellt, ID zurueck |
| T9 | companion_memory_recall MCP-Tool | Memories-Array |
| T10 | companion_memory_search MCP-Tool | FTS5-Ergebnisse |
| T11 | companion_memory_forget MCP-Tool | Memory geloescht |
| T12 | Schema-Migration bei frischer DB | Alle Tabellen + Trigger erstellt |
| T13 | FTS5-Trigger: Insert Memory → FTS5 aktualisiert | search() findet neuen Text |
| T14 | FTS5-Trigger: Delete Memory → FTS5 bereinigt | search() findet geloeschten Text nicht mehr |

### Code-Qualitaet
- `npm run lint` ohne neue Errors
- `npm run test` gruen
- WAL-Mode verifiziert
- Keine raw SQL-Strings ausserhalb von schema.sql / migrations
- JSDoc auf MemoryStore public API

### Dokumentation
- CHANGELOG.md aktualisieren
- docs/todo.md aktualisieren

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- **SPEC.md (Source of Truth):** `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-companion-kickoff/SPEC.md`
- **KICKOFF.md:** `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-companion-kickoff/KICKOFF.md`
- **ADR-009 bis ADR-012:** Selber Folder
- SQLite-Pattern: `src/main/message-bus/`
- MCP-Tools: `src/main/mcp/mcp-tools.ts`
- Types: `src/shared/types.ts`
