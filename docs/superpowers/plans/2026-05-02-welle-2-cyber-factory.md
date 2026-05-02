# Welle 2 — Cyber Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MPO with Cyber Factory — a new multi-session orchestrator with 11-phase lifecycle, model routing, token budgets, stuck detection, and workspace-scoped memory.

**Architecture:** Cyber Factory lives in `src/main/cyber-factory/` as a self-contained module. It replaces the MPO entity in entity-registry, reuses InputRequestWatcher (entity-agnostic), extends companion.db with CF tables + workspace-memory scope columns, and adds 3 new MCP tools + 7 IPC channels.

**Tech Stack:** TypeScript strict, better-sqlite3 (companion.db), ulidx (IDs), Node test runner, existing cipher-mux patterns.

**Hub-Repo:** `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron/`
**Branch:** `feat/cyber-factory-pack`
**Test Baseline:** 861 pass / 24 fail (known)

---

## File Structure

### New Files (src/main/cyber-factory/)

| File | Responsibility |
|------|---------------|
| `types.ts` | All CF interfaces: CyberFactoryRun, Welle, SubProjekt, CyberFactoryConfig, ModelRoutingConfig, StuckDetectionConfig, EscalationLevel |
| `cyber-factory-manager.ts` | Lifecycle orchestrator: run/welle/sub-projekt CRUD via companion.db |
| `escalation-classifier.ts` | Classify escalation level 1-5 from worker state |
| `worker-monitor.ts` | Stuck detection based on heartbeat + output plateau |
| `risk-reviewer.ts` | Generate structured risk-review markdown per worker |
| `diagnose.ts` | Health report for active runs (Pre-Mortem requirement) |
| `cyber-factory-template.ts` | Generate Entity-CLAUDE.md for CF session |
| `model-resolver.ts` | Map symbolic model names to versioned strings |

### New Files (test/)

| File | Responsibility |
|------|---------------|
| `test/main/cyber-factory/types.test.ts` | Type validation, config defaults |
| `test/main/cyber-factory/model-resolver.test.ts` | Model string resolution |
| `test/main/cyber-factory/cyber-factory-manager.test.ts` | Run/welle/sub-projekt CRUD |
| `test/main/cyber-factory/escalation-classifier.test.ts` | Level 1-5 classification |
| `test/main/cyber-factory/worker-monitor.test.ts` | Stuck detection |
| `test/main/cyber-factory/risk-reviewer.test.ts` | Risk review generation |
| `test/main/cyber-factory/diagnose.test.ts` | Health report |
| `test/main/cyber-factory/integration.test.ts` | Full lifecycle integration |
| `test/main/companion/workspace-memory.test.ts` | Scope columns, filtered recall/write |
| `test/fixtures/mock-claude/mock-claude.sh` | Mock Claude CLI for worker tests |

### Modified Files

| File | Change |
|------|--------|
| `src/shared/types.ts` | Extend MemoryKind, add scope to Memory, update BuiltinEntityId, add CyberFactoryConfig to AppConfig |
| `src/shared/ipc-channels.ts` | Replace MPO channels with CF channels |
| `src/main/session/entity-registry.ts` | Replace 'mpo' with 'cyber-factory' entity |
| `src/main/session/session-manager.ts` | Replace 'mpo' refs with 'cyber-factory' |
| `src/main/companion/schema.ts` | Add scope columns + CF tables |
| `src/main/companion/memory-store.ts` | Add scope-aware write/recall/search |
| `src/main/mcp/mcp-tools.ts` | Add CF tools, extend memory tools with scope |
| `src/main/ipc-hub.ts` | Wire CF IPC handlers, rename MPO handlers |
| `src/main/config/config-store.ts` | Add cyber_factory defaults |

---

## Task 1: Types + Model Resolver (Foundation)

**Files:**
- Create: `src/main/cyber-factory/types.ts`
- Create: `src/main/cyber-factory/model-resolver.ts`
- Modify: `src/shared/types.ts`
- Test: `test/main/cyber-factory/types.test.ts`
- Test: `test/main/cyber-factory/model-resolver.test.ts`

- [ ] **Step 1: Create `src/main/cyber-factory/types.ts`**

Define all CF interfaces: CyberFactoryRunStatus, WelleStatus, SubProjektStatus, EscalationLevel, ModelChoice, CyberFactoryRun, Welle, SubProjekt, ModelRoutingConfig, StuckDetectionConfig, CyberFactoryConfig with CYBER_FACTORY_DEFAULTS, RiskReview, DiagnoseReport.

Key defaults: enabled=true, maxParallelWorkers=5, defaultRetries=2, monitoringIntervalMs=300000, budgetMultiplier=1.0, model routing (haiku for trivial/boilerplate/tests/docs, sonnet for refactor/business_logic/bug_fix, opus for architecture/high_risk_domain/audit_full), stuck detection (heartbeat 7min, plateau 3min, minChars 100).

- [ ] **Step 2: Create `src/main/cyber-factory/model-resolver.ts`**

Map 'haiku' to 'claude-haiku-4-5-20251001', 'sonnet' to 'claude-sonnet-4-6', 'opus' to 'claude-opus-4-6'. Export resolveModel() and isValidModelChoice().

- [ ] **Step 3: Extend `src/shared/types.ts`**

1. Extend MemoryKind union with: 'decision', 'architecture', 'welle', 'welle-plan', 'finding', 'risk-review', 'pattern', 'convention', 'off_limit'
2. Add `scopeKind` and `scopeId` fields to Memory interface
3. Update BuiltinEntityId: replace 'mpo' with 'cyber-factory', add 'ideation-partner'
4. Add optional `cyber_factory` field to AppConfig
5. Add `experimental.cyber_factory?: boolean` to experimental interface

- [ ] **Step 4: Write `test/main/cyber-factory/types.test.ts`**

Test CYBER_FACTORY_DEFAULTS: enabled=true, maxParallelWorkers=5, model routing covers all types, stuck detection thresholds.

- [ ] **Step 5: Write `test/main/cyber-factory/model-resolver.test.ts`**

Test resolveModel for all three choices, isValidModelChoice for valid and invalid inputs.

- [ ] **Step 6: Run tests**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron
npx tsx --test test/main/cyber-factory/types.test.ts test/main/cyber-factory/model-resolver.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/main/cyber-factory/types.ts src/main/cyber-factory/model-resolver.ts src/shared/types.ts test/main/cyber-factory/
git commit -m "feat(welle-2): cyber factory types, model resolver, extended MemoryKind + scope"
```

---

## Task 2: DB Schema + Workspace Memory Scope

**Files:**
- Modify: `src/main/companion/schema.ts`
- Modify: `src/main/companion/memory-store.ts`
- Test: `test/main/companion/workspace-memory.test.ts`

- [ ] **Step 1: Add CF tables to `schema.ts`**

Append to COMPANION_SCHEMA_SQL: `CREATE TABLE IF NOT EXISTS cyber_factory_runs`, `wellen`, `sub_projekte` with proper columns, FKs, and indexes.

- [ ] **Step 2: Add scope column migration in MemoryStore constructor**

After FTS5 setup, check if `scope_kind` column exists via `pragma_table_info`. If not, run `ALTER TABLE memories ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'user'` and `ALTER TABLE memories ADD COLUMN scope_id TEXT`, then create index.

- [ ] **Step 3: Extend WriteMemoryOpts with scopeKind/scopeId**

Add optional `scopeKind` and `scopeId` to WriteMemoryOpts. Update stmtInsert to include these columns. Update write() to pass them through.

- [ ] **Step 4: Replace 4 fixed recall statements with dynamic query builder**

Remove stmtRecall/stmtRecallSince/stmtRecallKind/stmtRecallKindSince. Replace recall() with dynamic SQL that builds WHERE clause from RecallOpts (now including scopeKind/scopeId).

- [ ] **Step 5: Update RawMemoryRow and rowToMemory for scope fields**

Add scope_kind and scope_id to RawMemoryRow. Update rowToMemory to map them to scopeKind/scopeId with defaults.

- [ ] **Step 6: Update stmtSearch SELECT to include scope columns**

- [ ] **Step 7: Write `test/main/companion/workspace-memory.test.ts`**

Tests: write with default user scope, write with workspace scope, recall filtered by scope, recall without filter returns all, existing memories default to user, CF tables exist in DB.

- [ ] **Step 8: Run workspace memory tests + existing memory-store tests**

```bash
npx tsx --test test/main/companion/workspace-memory.test.ts
npx tsx --test test/main/companion/memory-store.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add src/main/companion/schema.ts src/main/companion/memory-store.ts test/main/companion/workspace-memory.test.ts
git commit -m "feat(welle-2): workspace memory scope + cyber factory DB tables"
```

---

## Task 3: Entity Registry + IPC Channels (MPO to Cyber Factory)

**Files:**
- Modify: `src/main/session/entity-registry.ts`
- Modify: `src/main/session/session-manager.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc-hub.ts`

- [ ] **Step 1: Replace MPO entity in entity-registry.ts**

Change id='mpo' to id='cyber-factory', displayName='Cyber Factory', icon='🏭', keep color '#ab47bc', projectPath to entities/cyber-factory.

- [ ] **Step 2: Update session-manager.ts**

Replace all ~12 occurrences of 'mpo' with 'cyber-factory':
- `mpoSessionId` -> `cyberFactorySessionId`
- `case 'mpo'` -> `case 'cyber-factory'`
- `entityId === 'mpo'` -> `entityId === 'cyber-factory'`
- `'MPO': 'mpo'` -> `'Cyber Factory': 'cyber-factory'`
- `isMpo` -> `isCyberFactory`

- [ ] **Step 3: Replace MPO IPC channels**

In ipc-channels.ts: rename MPO_START/STOP/STATUS/STARTED to CYBER_FACTORY_START/STOP/STATUS/STARTED. Add new: CYBER_FACTORY_RUN_STATUS, CYBER_FACTORY_WELLE_LIST, CYBER_FACTORY_WORKER_STATUS. Rename MPO_INPUT_REQUESTS to CF_INPUT_REQUESTS etc.

- [ ] **Step 4: Update IPC handler references in ipc-hub.ts**

Update all MPO IPC handler registrations to use new channel names. Update any renderer-facing references.

- [ ] **Step 5: Search for remaining 'mpo' references across codebase**

```bash
grep -rn "'mpo'" src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.test.'
```

Fix any remaining references.

- [ ] **Step 6: Run full test suite**

```bash
npm run test 2>&1 | grep -oE "✔|✖" | sort | uniq -c
```

Expected: >= 861 pass, <= 24 fail.

- [ ] **Step 7: Commit**

```bash
git add src/main/session/ src/shared/ipc-channels.ts src/main/ipc-hub.ts
git commit -m "feat(welle-2): replace MPO with cyber-factory entity + IPC channels"
```

---

## Task 4: Escalation Classifier

**Files:**
- Create: `src/main/cyber-factory/escalation-classifier.ts`
- Test: `test/main/cyber-factory/escalation-classifier.test.ts`

- [ ] **Step 1: Write tests for all 5 escalation levels**

Level 1: answer in spec (keyword match). Level 2: derivable from stack. Level 3: cross-session decision exists. Level 4: web search available. Level 5: user input required (fallback).

- [ ] **Step 2: Implement classifyEscalation()**

Input: question, detailSpecContent, crossSessionDecisions[], hasWebSearchCapability. Output: { level, reasoning, autonomous }.

- [ ] **Step 3: Run tests, commit**

---

## Task 5: Worker Monitor + Stuck Detection

**Files:**
- Create: `src/main/cyber-factory/worker-monitor.ts`
- Test: `test/main/cyber-factory/worker-monitor.test.ts`

- [ ] **Step 1: Write tests for stuck detection**

Cases: not stuck (recent heartbeat), stuck (no heartbeat > 7min), stuck (output plateau < 100 chars in 3min), not stuck (output growing).

- [ ] **Step 2: Implement detectStuck()**

Input: WorkerSnapshot (lastHeartbeat, outputLengths, checkTimestamp), StuckDetectionConfig. Output: boolean.

- [ ] **Step 3: Run tests, commit**

---

## Task 6: Risk Reviewer

**Files:**
- Create: `src/main/cyber-factory/risk-reviewer.ts`
- Test: `test/main/cyber-factory/risk-reviewer.test.ts`

- [ ] **Step 1: Write tests for risk review generation**

Test structured output includes all sections: changed files, deleted files, new dependencies, schema/API changes, dependency validation, off-limits, tests. Test unverified dependencies flagged.

- [ ] **Step 2: Implement generateRiskReview()**

Input: RiskReviewInput (runId, workerId, files, deps, status). Output: Markdown string with all required sections per spec.

- [ ] **Step 3: Run tests, commit**

---

## Task 7: Diagnose Tool

**Files:**
- Create: `src/main/cyber-factory/diagnose.ts`
- Test: `test/main/cyber-factory/diagnose.test.ts`

- [ ] **Step 1: Write tests**

Test: produces report with correct fields, formats as readable markdown.

- [ ] **Step 2: Implement generateDiagnoseReport() and formatDiagnoseMarkdown()**

- [ ] **Step 3: Run tests, commit**

---

## Task 8: Cyber Factory Manager (Core CRUD)

**Files:**
- Create: `src/main/cyber-factory/cyber-factory-manager.ts`
- Test: `test/main/cyber-factory/cyber-factory-manager.test.ts`

- [ ] **Step 1: Write tests for run/welle/sub-projekt CRUD**

Tests: create run, get run, update status, create wellen, create sub-projekte, list wellen, list sub-projekte, update sub-projekt status/heartbeat.

- [ ] **Step 2: Implement CyberFactoryManager class**

Constructor takes MemoryStore, gets DB reference. Prepared statements for all CRUD operations. Row mappers for snake_case DB -> camelCase TS.

- [ ] **Step 3: Run tests, commit**

---

## Task 9: Cyber Factory Template (Entity CLAUDE.md)

**Files:**
- Create: `src/main/cyber-factory/cyber-factory-template.ts`

- [ ] **Step 1: Implement generateCyberFactoryClaudeMd()**

Template includes: role description, 11-phase lifecycle, worker startup protocol, escalation levels, MCP connection info, available tools list, discipline rules (plan-first, test-first, max workers, max retries).

- [ ] **Step 2: Commit**

---

## Task 10: MCP Tools + ConfigStore + IPC Wiring

**Files:**
- Modify: `src/main/mcp/mcp-tools.ts`
- Modify: `src/main/config/config-store.ts`
- Modify: `src/main/ipc-hub.ts`

- [ ] **Step 1: Add cyber_factory defaults to ConfigStore**

- [ ] **Step 2: Add 3 new MCP tools**

`mux_cyber_factory_diagnose`: health report for active run.
`mux_cyber_factory_handoff_testing`: welle handoff note.
`mux_cyber_factory_handoff_debugger`: bug routing note.

- [ ] **Step 3: Extend companion_memory tools with scope params**

- [ ] **Step 4: Wire CF IPC handlers**

- [ ] **Step 5: Run full test suite, commit**

---

## Task 11: Mock Claude Script + Integration Tests

**Files:**
- Create: `test/fixtures/mock-claude/mock-claude.sh`
- Create: `test/main/cyber-factory/integration.test.ts`

- [ ] **Step 1: Create mock-claude.sh**

Shell script simulating Claude CLI: accepts --model, reads input, outputs plan/implementation/tests, respects MOCK_DELAY and MOCK_EXIT_CODE env vars.

- [ ] **Step 2: Write integration tests**

Full lifecycle test: create run -> wellen -> sub-projekte -> monitor -> risk review -> diagnose -> complete. Workspace memory integration: CF writes workspace-scoped memories. Escalation coverage: all 5 levels.

- [ ] **Step 3: Run all CF tests + full suite, commit**

---

## Task 12: Final Verification + Handover Note

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Verify: no new failures beyond known 24.

- [ ] **Step 2: Run build**

```bash
npm run build
```

- [ ] **Step 3: Update handover note for Welle 3-6**

- [ ] **Step 4: Final commit**
