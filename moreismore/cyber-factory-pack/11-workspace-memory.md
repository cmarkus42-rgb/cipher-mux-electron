---
title: "Workspace-skopiertes Memory + Notes-Integration (Ebene 3)"
status: v0.2
date: 2026-04-30
ebene: 3
referenz: konzept-projekt-workspace-struktur.md, EN-2__globale-basisregeln-persona-system.md, 17-projekt-struktur.md
---

# 11 — Workspace-skopiertes Memory + Notes-Integration

## Zweck

Wenn die Cyber Factory parallele Worker-Sessions startet, der Debugger eine Bug-Welle koordiniert, der Testing Assistant Findings produziert — dann brauchen all diese Sessions ein **gemeinsames Gedaechtnis fuer das aktuelle Projekt**. Plus: wenn der User Bug-Reports, Feature-Requests, Handover-Notes oder Lessons Learned erfassen will, brauchen die einen klaren Ablageort, der teilbar ist (Filesystem, Obsidian).

Diese Spec definiert das Zusammenspiel zwischen **Memory** (Companion-DB, intern) und **Notes** (Markdown-Dateien, User-sichtbar) — beide mit Workspace-Tag-Filterung.

## Trennlinie Memory ↔ Notes

User-Sichtbarkeit als Lakmus-Test:

> *Frag dich: "Sollte der User das sehen, teilen, in Obsidian lesen koennen?"*  
> *Wenn ja → Notes (Markdown-Datei).*  
> *Wenn nein → Memory (Companion-DB-Eintrag).*

| Inhalt | Wo | Begruendung |
|--------|----|----|
| Bug-Report | Notes | User soll sehen, in Issue-Tracker uebernehmen koennen |
| Feature-Request | Notes | User-sichtbar, oft in Diskussion eingebunden |
| Handover-Dokument | Notes | Soll geteilt werden, in Obsidian gelesen werden koennen |
| Lessons Learned | Notes | User-sichtbar dokumentiert, auch wenn technisch Session-Erinnerung |
| Detail-Spec mit REQ-IDs | Notes (in `docs/specs/`) | im Repo committbar, geteilt, in Obsidian lesbar |
| ADRs | Notes (in `docs/decisions/`) | committbar, langfristig nachvollziehbar |
| Audit-Report | Notes (in `docs/audit/`) | User-sichtbar, regulatorisch nuetzlich |
| Walkthrough-Zusammenfassung | Notes (auf User-Wunsch) | wird zur Wissensdokumentation |
| Welle-Plan (Cyber Factory) | Memory (kind: `welle-plan`) | intern, Run-Stand |
| Welle-Status / Worker-Status | Memory (kind: `welle`) | intern, Run-Stand |
| Risk-Review pro Worker | Memory (kind: `risk-review`) | intern, Run-Stand |
| Decision (kurz) | Memory (kind: `decision`) | intern, wird in ADR-Note ueberfuehrt wenn substantiell |
| Architecture-Notiz (vorlaeufig) | Memory (kind: `architecture`) | intern, wird in ADR ueberfuehrt wenn final |
| Finding (intern) | Memory (kind: `finding`) | wird zu Note wenn an User eskaliert |
| User-Praeferenzen | Memory (kind: `preference`, scope: `user`) | rein intern, nicht teilbar |

**Faustregel:** Wenn etwas teilbar werden soll, ist es eine Note. Wenn es zur Run-Buchhaltung gehoert, ist es Memory.

**Lessons-Learned-Sonderfall:** Die Tatsache *dass* etwas gelernt wurde, gehoert in Notes (User-sichtbar). Die Konsequenz fuer das System (z.B. ein Pattern, das die Cyber Factory in Zukunft erkennen soll) gehoert ggf. parallel ins Memory mit kind `pattern`. Beide referenzieren sich.

## Memory-Architektur

**Eine** SQLite-DB: die bestehende `~/.config/cipher-mux/companion.db`. Keine separaten DBs pro Workspace (das ist die Korrektur gegenueber v0.1 dieser Spec).

### Schema-Erweiterung der `memories`-Tabelle

```sql
ALTER TABLE memories ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'user';
-- 'user'      | persona-uebergreifend, User-spezifisch
-- 'workspace' | workspace-skopiert
-- 'session'   | ephemerisch fuer einen Run

ALTER TABLE memories ADD COLUMN scope_id TEXT;
-- bei scope_kind='workspace': Workspace-ID
-- bei scope_kind='session': Session-ID
-- bei scope_kind='user': NULL

CREATE INDEX idx_memories_scope ON memories(scope_kind, scope_id);
```

### Memory-Kind-Erweiterung

Bestehende Kinds aus Companion-Memory: `fact`, `preference`, `interaction`, `event`. Pack-Erweiterung um Run-Kinds:

| Kind | Scope-Kind | Beispiel | TTL |
|------|------------|----------|-----|
| `fact` | user/workspace | "User baut Trading-App" | unbegrenzt |
| `preference` | user | "Bevorzugt Vitest gegenueber Jest" | unbegrenzt |
| `interaction` | user | "Aha-Moment bei Workspace-Erklaerung" | 90 Tage |
| `event` | user/workspace | "Projekt-Deadline 15. Mai" | 30 Tage |
| `decision` | workspace | "REST statt GraphQL fuer User-API" | unbegrenzt |
| `architecture` | workspace | "Auth-Flow vorlaeufig: JWT mit Refresh-Token" | bis ADR finalisiert |
| `welle` | workspace | "Welle 2 abgeschlossen — Auth + DB" | bis Welle-Cleanup |
| `welle-plan` | workspace | strukturierter Welle-Plan | bis Welle-Abschluss |
| `finding` | workspace | "F-003 SQL Injection in userSearch — bei Debugger" | bis resolved |
| `risk-review` | workspace | strukturierter Risk-Review pro Worker | unbegrenzt |
| `pattern` | user/workspace | "Worker, der ohne Plan startet, eskaliert" | unbegrenzt |
| `convention` | workspace | "Wir verwenden Vitest, kein Jest" | unbegrenzt |
| `off_limit` | workspace | "src/payments/ unangetastet bis Audit" | bis explizit aufgehoben |

### Beispiel-Eintraege

```typescript
// User-Praeferenz (persona-uebergreifend)
{ scope_kind: 'user', scope_id: null, kind: 'preference',
  text: 'Bevorzugt Sonnet fuer Refactor-Arbeiten' }

// Workspace-spezifische Decision
{ scope_kind: 'workspace', scope_id: 'ws-cipher-mux',
  kind: 'decision', text: 'Rebuild-parallel-mit-Cutover gewaehlt 2026-04-30' }

// Session-ephemerisch (wird beim Session-Ende geloescht)
{ scope_kind: 'session', scope_id: 'cmux-w-auth-1',
  kind: 'welle', text: 'Phase 5 (Verifikation) erreicht' }
```

## Notes-Integration

Das bestehende Notes-System (`~/.config/cipher-mux/notes/`, Markdown-Dateien mit Frontmatter) bekommt **Tag-basierte Workspace-Filterung** statt separater Verzeichnisse.

### Workspace-Default-Tags

Aus `konzept-projekt-workspace-struktur.md` und `17-projekt-struktur.md`: jeder Workspace definiert ein Set von Default-Tags. Beim Aktivieren des Workspaces werden diese Tags:

- als Filter in der Sidebar voreingestellt
- bei jeder neu erstellten Note automatisch hinzugefuegt

Beispiel-Default-Tags fuer Workspace `cipher-mux-development`:

```yaml
defaultTags:
  - project:cipher-mux
  - workspace:hauptprojekt
```

Eine Note kann mehrere Workspace-Tags haben (Cross-Projekt-Notes).

### Filter-Mechanik

Workspace-Wechsel aendert nur den **aktiven Filter**, nicht den Zugriff. Der User sieht im Default die zum aktuellen Workspace passenden Notes; mit einem "alle Notes"-Toggle sieht er alle.

### Notes-Verzeichnis-Struktur (vereinfacht)

```
~/.config/cipher-mux/notes/
├── *.md              — alle Notes flach, Tags sortieren
└── .tags.json        — Tag-Repository
```

Frueher: separate Unterordner pro Workspace. Neu: alles flach, Tags filtern. Kompatibilitaet zu Obsidian-Vaults erhalten.

## MCP-Tools

Bestehende `mux_companion_memory_*`-Tools werden erweitert um Scope-Filter — keine separaten `mux_workspace_memory_*`-Tools (Vereinfachung gegenueber v0.1):

| Tool | Status | Aenderung |
|------|--------|-----------|
| `mux_companion_memory_recall` | Bestehend | Neue Filter-Parameter `scope_kind`, `scope_id` |
| `mux_companion_memory_search` | Bestehend | dito |
| `mux_companion_memory_write` | Bestehend | dito + Pflicht-Felder fuer scope |
| `mux_companion_memory_forget` | Bestehend | unveraendert |
| `mux_notes_create` | Bestehend | Workspace-Default-Tags werden auto-gemerged (Set-Union, Duplikate dedupliziert). Skill-spezifische Tags (z.B. `kind:bugreport`) werden vor Workspace-Default-Tags eingefuegt; bei Konflikten gilt Set-Union, kein Tag wird ueberschrieben. |
| `mux_notes_list` | Bestehend | Filter nach Workspace-Tag-Set |

Beim Session-Start injiziert die Cyber-Factory-Hauptsession ihre Workspace-ID; Tool-Aufrufe von Worker-Sub-Sessions koennen automatisch den Workspace-Scope erben.

## ConfigStore-Keys

```typescript
interface MemoryConfig {
  enabled: boolean;
  ftsEnabled: boolean;            // Default true
  embeddingEnabled: boolean;      // Default false (Phase 2)
  retentionDays: number;          // Default 365
  sessionScopeAutoDelete: boolean; // Default true — session-scope-Eintraege werden bei Session-Ende geloescht
  archiveOnWorkspaceDelete: boolean; // Default true — beim Workspace-Delete archivieren statt direkt loeschen
}
```

ConfigStore-Sektion: `memory` (Erweiterung der bestehenden `companion`-Sektion).

## Sicherheitsregeln

- Memory ist **lokal**. Nie an externe Modelle synchronisieren ohne expliziten User-Trigger (Vendor-Lock-in-Bewusstsein, Whitepaper Kap. 8).
- Credentials und Secrets gehen **niemals** ins Memory. Pre-Write-Filter pruefen Pattern-Matches und blockieren.
- PII (echte E-Mails, Namen Dritter, Adressen) gehen nicht ins Memory ohne explizite User-Bestaetigung.
- Notes werden in `~/.config/cipher-mux/notes/` gespeichert — User hat Filesystem-Zugriff. Sicherheits-Filterung gilt analog: keine Credentials in Notes.

## Konventions-Hierarchie (Pre-Mortem Grund 6)

Bei Konflikt zwischen Quellen:

```
1. globale Basisregeln (02-base-rules.md)
2. Projekt-spezifische CLAUDE.md
3. Memory (kind=`convention` oder `architecture`, scope_kind=`workspace`)
4. Memory (kind=`decision`, scope_kind=`workspace`)
5. Memory (kind=`preference`, scope_kind=`user`)
6. Session-Memory (scope_kind=`session`)
```

Der Companion setzt die Hierarchie aktiv durch — bei Widerspruch fragt er, statt eine Quelle still zu waehlen.

## Lifecycle

### Bei Workspace-Aktivierung

1. Workspace-ID wird global aktiv gesetzt (im laufenden Cockpit)
2. Default-Tags werden in den Notes-Sidebar-Filter geladen
3. Memory-Recall mit `scope_kind='workspace', scope_id=<workspace-id>` zeigt die juengsten 10 Eintraege
4. Sessions, die in diesem Workspace gestartet werden, erben Workspace-ID automatisch

### Bei Workspace-Deletion

1. User-Bestaetigung (siehe `04-presets-funktional.md` irreversible-Aktionen)
2. Memory-Eintraege mit `scope_id=<workspace-id>` werden archiviert (Default) oder geloescht
3. Notes mit Workspace-Default-Tags bleiben — sie sind eigenstaendige Dateien

### Session-Ende

1. Memory-Eintraege mit `scope_kind='session'` und `scope_id=<beendete-session-id>` werden geloescht (`sessionScopeAutoDelete=true`)
2. Workspace- und User-Memory bleiben

## Migration aus v0.1 dieser Spec

Frueher in dieser Spec: separate DB pro Workspace, eigenes `mux_workspace_memory_*`-Tool-Set, drei klar getrennte Memory-Schichten als parallele Datenstrukturen.

Neu in v0.2:
- Eine Companion-DB, Schema-Erweiterung (additive Spalten)
- Bestehende `mux_companion_memory_*`-Tools mit Scope-Filtern
- Notes-System bleibt Markdown-Dateien mit Tag-Filtern
- Klarere Trennung Memory (intern) ↔ Notes (User-sichtbar)

Migrations-Wirkung in der Wellen-Planung (`12-migration-rebuild.md`):
- Welle 4 wird einfacher — keine Schema-Migration fuer mehrere DBs, nur additive Spalten in der bestehenden Tabelle
- Notes-System-Aenderungen sind primaer UI-seitig (Tag-Filter im Notes-Tab)

## Tests

1. *Schema-Migration:* alte `memories`-Tabelle bekommt `scope_kind`/`scope_id`, bestehende Eintraege defaulten auf `scope_kind='user'`, `scope_id=NULL`
2. *Recall-Filter:* `mux_companion_memory_recall({ scope_kind: 'workspace', scope_id: 'ws-x' })` → nur passende Eintraege
3. *Auto-Scope-Erbung:* Session in Workspace `ws-x` ruft `mux_companion_memory_write({ kind: 'finding' })` ohne explizites scope → wird auto auf `scope_kind='workspace', scope_id='ws-x'` gesetzt
4. *Pre-Write-Filter:* Content mit `password=` → Write blockiert mit Warnung
5. *Workspace-Delete:* Workspace geloescht mit `archiveOnWorkspaceDelete=true` → Memory-Eintraege archiviert (z.B. in `companion-archive.db`)
6. *Notes-Workspace-Tag-Auto-Add:* `mux_notes_create({ title: 'Bug X' })` in aktivem Workspace → Note bekommt Workspace-Default-Tags automatisch
7. *Session-Scope-Cleanup:* Session-Ende → Memory-Eintraege mit `scope_kind='session'` geloescht
8. *Trennlinie:* Bug-Report-Skill-Aufruf → Note erstellt (nicht Memory-Eintrag); Welle-Plan-Aufruf → Memory-Eintrag erstellt (nicht Note)

## Persona-Awareness

Beim Session-Start wird automatisch ein Recall mit der korrekten Scope-Kombination injiziert:
- Companion-Sessions: `scope_kind in ('user', 'workspace')`, `scope_id=<active-workspace>`
- Cyber-Factory-Worker: dito plus Auto-Scope-Erbung der Workspace-ID
- Refinement: dito plus Verwendungszweck-Lookup (`tag=verwendungszweck`)

## Offene Punkte

- *Embeddings-Phase-2.* Hybrid-Retrieval (FTS5 + Cosine-Similarity auf lokalem Modell) — Phase 2 nach v1.0.
- *Memory-Browser-UI.* Filter-Maske mit `scope_kind`, `scope_id`, `kind`, Tag-Suche — UI-Detail-Spec.
- *Cross-Workspace-Lookup.* Soll ein Workspace auf Memory eines anderen Workspaces zugreifen koennen? Empfehlung: nein in v1, ja optional spaeter mit Read-Permission-Kontrolle.
- *Pattern-Kind-Auto-Erstellung.* Wenn die Cyber Factory wiederholte Bug-Muster sieht, koennte sie selbst `pattern`-Eintraege im User-Scope anlegen. Phase 2.
