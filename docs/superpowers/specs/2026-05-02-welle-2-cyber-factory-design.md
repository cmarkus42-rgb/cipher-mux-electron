# Welle 2 — Cyber Factory Design

**Datum:** 2026-05-02
**Status:** approved
**Basis-Specs:** `05-cyber-factory.md`, `12-migration-rebuild.md`, `11-workspace-memory.md`

## Entscheidungen (Abweichungen von Pack-Spec)

### 1. MPO direkt ersetzen (kein Parallel-Betrieb)

Pack-Spec sieht Parallel-Betrieb MPO + Cyber Factory bis Cutover (Welle 5) vor. User-Entscheidung: MPO wird direkt ersetzt. Begruendung: v0.9.9 ist per Git-Tag gesichert, Parallel-Betrieb erzeugt unnoetige Komplexitaet.

**Konsequenzen:**
- `mpo` Entity wird zu `cyber-factory` umregistriert
- `mpo-template.ts` wird durch `cyber-factory-template.ts` ersetzt (nicht importiert)
- MPO-IPC-Channels werden zu CF-Channels
- ConfigStore `mpo` → `cyber_factory`
- Feature-Flag `experimental.cyber_factory` Default: `true`
- InputRequestWatcher bleibt (entity-agnostisch)
- Welle 5 (Cutover) und Welle 6 (Cleanup) entfallen fuer MPO-Teil

### 2. Workspace-Memory-Spalten vorziehen (aus Welle 4)

Pack-Spec sieht Workspace-Memory in Welle 4. CF braucht workspace-skopierte Memories fuer Run-State. Entscheidung: `scope_kind` + `scope_id` Spalten an `memories`-Tabelle jetzt hinzufuegen.

**Scope:**
- Schema-Erweiterung (additive Spalten, `ALTER TABLE IF NOT EXISTS`-Pattern)
- MemoryStore API-Erweiterung (scope-Filter in recall/search/write)
- MCP-Tools Erweiterung (scope-Parameter)
- Bestehende Eintraege defaulten auf `scope_kind='user'`, `scope_id=NULL`

### 3. SQLite fuer Run-State (wie Spec)

Drei neue Tabellen in companion.db: `cyber_factory_runs`, `wellen`, `sub_projekte`. Idempotentes `CREATE TABLE IF NOT EXISTS`-Pattern, konsistent mit bestehendem Schema-Ansatz.

## Modul-Struktur

```
src/main/cyber-factory/
├── cyber-factory-manager.ts    — Lifecycle, ConfigStore, Phase-Sequenz
├── architect.ts                — Subsystem-Zerlegung, Schnittstellen-Design
├── adr-builder.ts              — ADR-Generator
├── scaffolding.ts              — Projekt-Geruest
├── welle-planner.ts            — Subsystem → Wellen
├── worker-launcher.ts          — Worker Spawn + Auftrag
├── worker-monitor.ts           — Status-Loop, Stuck-Detection
├── escalation-classifier.ts    — Level 1-5
├── risk-reviewer.ts            — Risk-Review pro Worker
├── handoff-testing.ts          — Uebergabe Testing Assistant
├── handoff-debugger.ts         — Bug-Routing Debugger
├── diagnose.ts                 — Health-Report
├── cyber-factory-template.ts   — Entity-CLAUDE.md
├── model-resolver.ts           — Modell-String Resolver
└── types.ts                    — Interfaces
```

## DB-Schema (companion.db Erweiterung)

### Workspace-Memory Spalten (memories-Tabelle)

```sql
ALTER TABLE memories ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'user';
ALTER TABLE memories ADD COLUMN scope_id TEXT;
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope_kind, scope_id);
```

### Cyber Factory Tabellen

```sql
CREATE TABLE IF NOT EXISTS cyber_factory_runs (
  id TEXT PRIMARY KEY,
  detail_spec_path TEXT NOT NULL,
  project_path TEXT NOT NULL,
  workspace_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  config TEXT
);

CREATE TABLE IF NOT EXISTS wellen (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES cyber_factory_runs(id),
  reihenfolge INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS sub_projekte (
  id TEXT PRIMARY KEY,
  welle_id TEXT NOT NULL REFERENCES wellen(id),
  name TEXT NOT NULL,
  auftrag_path TEXT,
  model TEXT,
  token_budget INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  tmux_session TEXT,
  session_id TEXT,
  current_phase TEXT,
  last_heartbeat INTEGER
);
```

## MCP-Tools

| Tool | Typ | Beschreibung |
|------|-----|-------------|
| `mux_cyber_factory_diagnose` | Neu | Health-Report fuer aktiven Run |
| `mux_cyber_factory_handoff_testing` | Neu | Welle-Uebergabe an Testing Assistant |
| `mux_cyber_factory_handoff_debugger` | Neu | Bug-Routing an Debugger |
| `companion_memory_*` | Erweitert | scope_kind/scope_id Parameter |

## IPC-Channels

```typescript
CYBER_FACTORY_RUN_START, CYBER_FACTORY_RUN_STATUS, CYBER_FACTORY_RUN_CANCEL,
CYBER_FACTORY_WELLE_LIST, CYBER_FACTORY_WORKER_STATUS, CYBER_FACTORY_WORKER_KILL,
CYBER_FACTORY_HANDOFF_TESTING
```

## ConfigStore

Sektion `cyber_factory` mit: enabled, maxParallelWorkers (5), defaultRetries (2), monitoringIntervalMs, budgetMultiplier, modelRouting, stuckDetection.

## Test-Strategie

7 Pflicht-Tests aus Spec + Mock-Claude-Skript unter `test/fixtures/mock-claude/`.

## Akzeptanzkriterien

1. CF-Run laesst sich starten
2. 3 parallele Worker orchestrierbar
3. Risk-Review pro Worker generiert
4. Mock-Claude-Skript funktional
5. Diagnose-Tool produziert Health-Report
6. Workspace-Memory scope-Filter funktional
