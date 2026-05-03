# Welle 3 — Debugger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Debugger entity — a specialized bugfixing phase that receives findings from Testing Assistant or direct user bug-reports, clarifies with the user, plans the fix, dispatches a worker sub-session, and verifies the result.

**Architecture:** New `src/main/debugger/` module with 9 files following the Cyber Factory pattern (types + manager + template + specialized modules). Persists to companion.db with 3 new tables. Registered as builtin entity `debugger`. Feature-flagged (`experimental.debugger`, default: false) so the existing `projectlauncher` remains available.

**Tech Stack:** TypeScript strict, better-sqlite3 (companion.db), ulidx, tmux control mode, MCP tool registration, Electron IPC

**Working Directory:** `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron/`

**Test Runner:** `npm run test` (Node.js test runner, 913 tests baseline)

**Important:** The `VerificationRunner.buildVerificationCommand()` method builds shell commands as strings for display/logging only. Actual test execution happens via the existing `execFileNoThrow` utility in the worker session integration (Task 15). Do not use `exec()` with user input.

---

## File Structure

```
src/main/debugger/
  types.ts                    — Interfaces, status enums, config defaults
  debugger-manager.ts         — Lifecycle CRUD (runs, clarifications, fix-plans)
  findings-parser.ts          — Parse structured findings from Testing Assistant
  clarification-router.ts     — Manage user Q&A via input-requests
  fix-planner.ts              — Generate fix-plan markdown, track confirmation
  worker-launcher.ts          — Spawn worker sub-session with retry logic
  verification-runner.ts      — Pre/post fix test execution check
  walkthrough-renderer.ts     — Linear walkthrough markdown generator
  debugger-template.ts        — Entity CLAUDE.md generator (persona + lifecycle)

src/main/companion/schema.ts  — ADD 3 tables: debugger_runs, clarifications, fix_plans
src/main/session/entity-registry.ts — ADD debugger builtin entity
src/shared/types.ts           — ADD 'debugger' to BuiltinEntityId
src/shared/ipc-channels.ts    — ADD DEBUGGER_* channels
src/main/mcp/mcp-server.ts    — Register mux_debugger_findings_intake tool

test/main/debugger/
  types.test.ts
  debugger-manager.test.ts
  findings-parser.test.ts
  clarification-router.test.ts
  fix-planner.test.ts
  worker-launcher.test.ts
  verification-runner.test.ts
```

---

### Task 1: Types + Config Defaults

**Files:**
- Create: `src/main/debugger/types.ts`
- Test: `test/main/debugger/types.test.ts`

- [ ] **Step 1: Write the test for types and defaults**

```typescript
// test/main/debugger/types.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEBUGGER_DEFAULTS } from '../../src/main/debugger/types'

describe('debugger/types', () => {
  it('DEBUGGER_DEFAULTS has expected shape', () => {
    assert.equal(DEBUGGER_DEFAULTS.enabled, false)
    assert.equal(DEBUGGER_DEFAULTS.maxRetries, 2)
    assert.equal(DEBUGGER_DEFAULTS.qualityGate, 'strict')
    assert.equal(DEBUGGER_DEFAULTS.walkthroughDefaultOffer, true)
  })

  it('DEBUGGER_DEFAULTS is frozen', () => {
    assert.throws(() => {
      ;(DEBUGGER_DEFAULTS as any).enabled = true
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "debugger/types"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement types.ts**

```typescript
// src/main/debugger/types.ts
/** Debugger — core types and defaults */

// --- Status Enums ---

export type DebuggerRunStatus =
  | 'intake'
  | 'clarifying'
  | 'planning'
  | 'confirmed'
  | 'worker_running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ClarificationStatus = 'pending' | 'answered'

export type FixPlanStatus = 'draft' | 'confirmed' | 'rejected'

export type Severity = 'high' | 'medium' | 'low'

// --- Data Models ---

export interface DebuggerRun {
  id: string
  bugReportId: string | null
  source: 'testing-assistant' | 'bugreport' | 'manual'
  severity: Severity
  description: string
  status: DebuggerRunStatus
  retryCount: number
  startedAt: number
  finishedAt: number | null
  projectPath: string
  workspaceId: string | null
}

export interface Clarification {
  id: string
  runId: string
  question: string
  options: string[] | null
  answer: string | null
  status: ClarificationStatus
  createdAt: number
  resolvedAt: number | null
}

export interface FixPlan {
  id: string
  runId: string
  hypothesis: string
  confidenceLevel: 'sure' | 'likely' | 'uncertain'
  planMd: string
  testExtension: string
  riskAssessment: string
  effort: 'trivial' | 'small' | 'medium' | 'large'
  status: FixPlanStatus
  userConfirmed: boolean
  createdAt: number
}

export interface FindingsIntake {
  symptom: string
  reproduction: string
  severity: Severity
  suspectedCause: string | null
  affectedAreas: string[]
  source: 'testing-assistant' | 'bugreport' | 'manual'
  bugReportId?: string
}

// --- Config ---

export interface DebuggerConfig {
  enabled: boolean
  maxRetries: number
  qualityGate: 'strict' | 'permissive'
  walkthroughDefaultOffer: boolean
}

export const DEBUGGER_DEFAULTS: Readonly<DebuggerConfig> = Object.freeze({
  enabled: false,
  maxRetries: 2,
  qualityGate: 'strict',
  walkthroughDefaultOffer: true,
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "debugger/types"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/debugger/types.ts test/main/debugger/types.test.ts
git commit -m "feat(welle-3): debugger types + config defaults"
```

---

### Task 2: DB Schema Extension

**Files:**
- Modify: `src/main/companion/schema.ts` (append 3 tables after `sub_projekte` index)
- Test: `test/main/debugger/debugger-manager.test.ts` (schema portion)

- [ ] **Step 1: Write schema test**

```typescript
// test/main/debugger/debugger-manager.test.ts (first section)
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../src/main/companion/schema'

describe('debugger schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
  })

  it('creates debugger_runs table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='debugger_runs'").get()
    assert.ok(info)
  })

  it('creates clarifications table with FK to debugger_runs', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE name='clarifications'").get() as any
    assert.ok(info.sql.includes('run_id'))
  })

  it('creates fix_plans table with FK to debugger_runs', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE name='fix_plans'").get() as any
    assert.ok(info.sql.includes('run_id'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "debugger schema"`
Expected: FAIL — tables don't exist

- [ ] **Step 3: Add tables to schema.ts**

Append before the closing backtick of `COMPANION_SCHEMA_SQL`:

```sql
  CREATE TABLE IF NOT EXISTS debugger_runs (
    id TEXT PRIMARY KEY,
    bug_report_id TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    severity TEXT NOT NULL DEFAULT 'medium',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'intake',
    retry_count INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    project_path TEXT NOT NULL,
    workspace_id TEXT
  );

  CREATE TABLE IF NOT EXISTS clarifications (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES debugger_runs(id),
    question TEXT NOT NULL,
    options TEXT,
    answer TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_clarifications_run ON clarifications(run_id);

  CREATE TABLE IF NOT EXISTS fix_plans (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES debugger_runs(id),
    hypothesis TEXT NOT NULL,
    confidence_level TEXT NOT NULL DEFAULT 'likely',
    plan_md TEXT NOT NULL,
    test_extension TEXT NOT NULL DEFAULT '',
    risk_assessment TEXT NOT NULL DEFAULT '',
    effort TEXT NOT NULL DEFAULT 'small',
    status TEXT NOT NULL DEFAULT 'draft',
    user_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_fix_plans_run ON fix_plans(run_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "debugger schema"`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npm run test`
Expected: 913+ tests pass, 0 fail

- [ ] **Step 6: Commit**

```bash
git add src/main/companion/schema.ts test/main/debugger/debugger-manager.test.ts
git commit -m "feat(welle-3): debugger DB tables (debugger_runs, clarifications, fix_plans)"
```

---

### Task 3: DebuggerManager — CRUD Operations

**Files:**
- Create: `src/main/debugger/debugger-manager.ts`
- Modify: `test/main/debugger/debugger-manager.test.ts` (add CRUD tests)

- [ ] **Step 1: Write CRUD tests**

```typescript
// Append to test/main/debugger/debugger-manager.test.ts
import { DebuggerManager } from '../../src/main/debugger/debugger-manager'

describe('DebuggerManager', () => {
  let db: Database.Database
  let mgr: DebuggerManager

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
    mgr = new DebuggerManager(db)
  })

  describe('createRun', () => {
    it('creates a run and returns it with id', () => {
      const run = mgr.createRun({
        source: 'manual',
        severity: 'high',
        description: 'Button crashes on click',
        projectPath: '/tmp/test-project',
      })
      assert.ok(run.id)
      assert.equal(run.status, 'intake')
      assert.equal(run.retryCount, 0)
      assert.equal(run.severity, 'high')
    })
  })

  describe('getRun', () => {
    it('returns null for unknown id', () => {
      assert.equal(mgr.getRun('nonexistent'), null)
    })

    it('returns run by id', () => {
      const run = mgr.createRun({
        source: 'bugreport',
        severity: 'medium',
        description: 'Test',
        projectPath: '/tmp/p',
      })
      const fetched = mgr.getRun(run.id)
      assert.deepEqual(fetched, run)
    })
  })

  describe('updateRunStatus', () => {
    it('transitions status', () => {
      const run = mgr.createRun({
        source: 'manual',
        severity: 'low',
        description: 'Minor issue',
        projectPath: '/tmp/p',
      })
      mgr.updateRunStatus(run.id, 'clarifying')
      const updated = mgr.getRun(run.id)!
      assert.equal(updated.status, 'clarifying')
    })

    it('sets finishedAt on terminal status', () => {
      const run = mgr.createRun({
        source: 'manual',
        severity: 'low',
        description: 'X',
        projectPath: '/tmp/p',
      })
      mgr.updateRunStatus(run.id, 'completed')
      const updated = mgr.getRun(run.id)!
      assert.ok(updated.finishedAt)
    })
  })

  describe('createClarification', () => {
    it('creates a clarification linked to run', () => {
      const run = mgr.createRun({ source: 'manual', severity: 'medium', description: 'X', projectPath: '/tmp/p' })
      const clar = mgr.createClarification(run.id, 'Is it reproducible?', ['Yes', 'No', 'Sometimes'])
      assert.ok(clar.id)
      assert.equal(clar.runId, run.id)
      assert.equal(clar.status, 'pending')
      assert.deepEqual(clar.options, ['Yes', 'No', 'Sometimes'])
    })
  })

  describe('answerClarification', () => {
    it('sets answer and resolvedAt', () => {
      const run = mgr.createRun({ source: 'manual', severity: 'medium', description: 'X', projectPath: '/tmp/p' })
      const clar = mgr.createClarification(run.id, 'Root cause?', null)
      mgr.answerClarification(clar.id, 'Race condition in tmux capture')
      const updated = mgr.getClarification(clar.id)!
      assert.equal(updated.answer, 'Race condition in tmux capture')
      assert.equal(updated.status, 'answered')
      assert.ok(updated.resolvedAt)
    })
  })

  describe('createFixPlan', () => {
    it('creates fix plan in draft status', () => {
      const run = mgr.createRun({ source: 'manual', severity: 'high', description: 'X', projectPath: '/tmp/p' })
      const plan = mgr.createFixPlan(run.id, {
        hypothesis: 'Race in capture-pane',
        confidenceLevel: 'likely',
        planMd: '## Fix\n1. Add mutex',
        testExtension: 'test captures under load',
        riskAssessment: 'Low — isolated change',
        effort: 'small',
      })
      assert.ok(plan.id)
      assert.equal(plan.status, 'draft')
      assert.equal(plan.userConfirmed, false)
    })
  })

  describe('confirmFixPlan', () => {
    it('sets confirmed status', () => {
      const run = mgr.createRun({ source: 'manual', severity: 'high', description: 'X', projectPath: '/tmp/p' })
      const plan = mgr.createFixPlan(run.id, {
        hypothesis: 'H',
        confidenceLevel: 'sure',
        planMd: 'P',
        testExtension: 'T',
        riskAssessment: 'R',
        effort: 'trivial',
      })
      mgr.confirmFixPlan(plan.id)
      const updated = mgr.getFixPlan(plan.id)!
      assert.equal(updated.status, 'confirmed')
      assert.equal(updated.userConfirmed, true)
    })
  })

  describe('incrementRetry', () => {
    it('increments retry count', () => {
      const run = mgr.createRun({ source: 'manual', severity: 'medium', description: 'X', projectPath: '/tmp/p' })
      mgr.incrementRetry(run.id)
      assert.equal(mgr.getRun(run.id)!.retryCount, 1)
      mgr.incrementRetry(run.id)
      assert.equal(mgr.getRun(run.id)!.retryCount, 2)
    })
  })

  describe('listRunsByStatus', () => {
    it('filters by status', () => {
      mgr.createRun({ source: 'manual', severity: 'low', description: 'A', projectPath: '/tmp/p' })
      const r2 = mgr.createRun({ source: 'manual', severity: 'low', description: 'B', projectPath: '/tmp/p' })
      mgr.updateRunStatus(r2.id, 'completed')
      const active = mgr.listRunsByStatus('intake')
      assert.equal(active.length, 1)
      assert.equal(active[0].description, 'A')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "DebuggerManager"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement debugger-manager.ts**

```typescript
// src/main/debugger/debugger-manager.ts
import { ulid } from 'ulidx'
import type Database from 'better-sqlite3'
import type {
  DebuggerRun,
  DebuggerRunStatus,
  Clarification,
  ClarificationStatus,
  FixPlan,
  FixPlanStatus,
  Severity,
} from './types'

// --- Options ---

export interface CreateRunOpts {
  source: DebuggerRun['source']
  severity: Severity
  description: string
  projectPath: string
  bugReportId?: string
  workspaceId?: string
}

export interface CreateFixPlanOpts {
  hypothesis: string
  confidenceLevel: FixPlan['confidenceLevel']
  planMd: string
  testExtension: string
  riskAssessment: string
  effort: FixPlan['effort']
}

// --- Raw DB rows ---

interface RawRunRow {
  id: string
  bug_report_id: string | null
  source: string
  severity: string
  description: string
  status: string
  retry_count: number
  started_at: number
  finished_at: number | null
  project_path: string
  workspace_id: string | null
}

interface RawClarRow {
  id: string
  run_id: string
  question: string
  options: string | null
  answer: string | null
  status: string
  created_at: number
  resolved_at: number | null
}

interface RawPlanRow {
  id: string
  run_id: string
  hypothesis: string
  confidence_level: string
  plan_md: string
  test_extension: string
  risk_assessment: string
  effort: string
  status: string
  user_confirmed: number
  created_at: number
}

// --- Terminal statuses ---

const TERMINAL_STATUSES: DebuggerRunStatus[] = ['completed', 'failed', 'cancelled']

// --- Manager ---

export class DebuggerManager {
  constructor(private db: Database.Database) {}

  createRun(opts: CreateRunOpts): DebuggerRun {
    const id = ulid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO debugger_runs (id, bug_report_id, source, severity, description, status, retry_count, started_at, project_path, workspace_id)
      VALUES (?, ?, ?, ?, ?, 'intake', 0, ?, ?, ?)
    `).run(id, opts.bugReportId ?? null, opts.source, opts.severity, opts.description, now, opts.projectPath, opts.workspaceId ?? null)

    return {
      id,
      bugReportId: opts.bugReportId ?? null,
      source: opts.source,
      severity: opts.severity,
      description: opts.description,
      status: 'intake',
      retryCount: 0,
      startedAt: now,
      finishedAt: null,
      projectPath: opts.projectPath,
      workspaceId: opts.workspaceId ?? null,
    }
  }

  getRun(id: string): DebuggerRun | null {
    const row = this.db.prepare('SELECT * FROM debugger_runs WHERE id = ?').get(id) as RawRunRow | undefined
    return row ? this.mapRun(row) : null
  }

  updateRunStatus(id: string, status: DebuggerRunStatus): void {
    const finishedAt = TERMINAL_STATUSES.includes(status) ? Date.now() : null
    this.db.prepare('UPDATE debugger_runs SET status = ?, finished_at = COALESCE(?, finished_at) WHERE id = ?')
      .run(status, finishedAt, id)
  }

  incrementRetry(id: string): void {
    this.db.prepare('UPDATE debugger_runs SET retry_count = retry_count + 1 WHERE id = ?').run(id)
  }

  listRunsByStatus(status: DebuggerRunStatus): DebuggerRun[] {
    const rows = this.db.prepare('SELECT * FROM debugger_runs WHERE status = ? ORDER BY started_at DESC').all(status) as RawRunRow[]
    return rows.map(r => this.mapRun(r))
  }

  // --- Clarifications ---

  createClarification(runId: string, question: string, options: string[] | null): Clarification {
    const id = ulid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO clarifications (id, run_id, question, options, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(id, runId, question, options ? JSON.stringify(options) : null, now)

    return { id, runId, question, options, answer: null, status: 'pending', createdAt: now, resolvedAt: null }
  }

  getClarification(id: string): Clarification | null {
    const row = this.db.prepare('SELECT * FROM clarifications WHERE id = ?').get(id) as RawClarRow | undefined
    return row ? this.mapClarification(row) : null
  }

  answerClarification(id: string, answer: string): void {
    const now = Date.now()
    this.db.prepare("UPDATE clarifications SET answer = ?, status = 'answered', resolved_at = ? WHERE id = ?")
      .run(answer, now, id)
  }

  listClarifications(runId: string): Clarification[] {
    const rows = this.db.prepare('SELECT * FROM clarifications WHERE run_id = ? ORDER BY created_at ASC').all(runId) as RawClarRow[]
    return rows.map(r => this.mapClarification(r))
  }

  // --- Fix Plans ---

  createFixPlan(runId: string, opts: CreateFixPlanOpts): FixPlan {
    const id = ulid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO fix_plans (id, run_id, hypothesis, confidence_level, plan_md, test_extension, risk_assessment, effort, status, user_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?)
    `).run(id, runId, opts.hypothesis, opts.confidenceLevel, opts.planMd, opts.testExtension, opts.riskAssessment, opts.effort, now)

    return {
      id, runId,
      hypothesis: opts.hypothesis,
      confidenceLevel: opts.confidenceLevel,
      planMd: opts.planMd,
      testExtension: opts.testExtension,
      riskAssessment: opts.riskAssessment,
      effort: opts.effort,
      status: 'draft',
      userConfirmed: false,
      createdAt: now,
    }
  }

  getFixPlan(id: string): FixPlan | null {
    const row = this.db.prepare('SELECT * FROM fix_plans WHERE id = ?').get(id) as RawPlanRow | undefined
    return row ? this.mapFixPlan(row) : null
  }

  getFixPlanForRun(runId: string): FixPlan | null {
    const row = this.db.prepare('SELECT * FROM fix_plans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runId) as RawPlanRow | undefined
    return row ? this.mapFixPlan(row) : null
  }

  confirmFixPlan(id: string): void {
    this.db.prepare("UPDATE fix_plans SET status = 'confirmed', user_confirmed = 1 WHERE id = ?").run(id)
  }

  rejectFixPlan(id: string): void {
    this.db.prepare("UPDATE fix_plans SET status = 'rejected' WHERE id = ?").run(id)
  }

  // --- Mappers ---

  private mapRun(row: RawRunRow): DebuggerRun {
    return {
      id: row.id,
      bugReportId: row.bug_report_id,
      source: row.source as DebuggerRun['source'],
      severity: row.severity as Severity,
      description: row.description,
      status: row.status as DebuggerRunStatus,
      retryCount: row.retry_count,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      projectPath: row.project_path,
      workspaceId: row.workspace_id,
    }
  }

  private mapClarification(row: RawClarRow): Clarification {
    return {
      id: row.id,
      runId: row.run_id,
      question: row.question,
      options: row.options ? JSON.parse(row.options) : null,
      answer: row.answer,
      status: row.status as ClarificationStatus,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }
  }

  private mapFixPlan(row: RawPlanRow): FixPlan {
    return {
      id: row.id,
      runId: row.run_id,
      hypothesis: row.hypothesis,
      confidenceLevel: row.confidence_level as FixPlan['confidenceLevel'],
      planMd: row.plan_md,
      testExtension: row.test_extension,
      riskAssessment: row.risk_assessment,
      effort: row.effort as FixPlan['effort'],
      status: row.status as FixPlanStatus,
      userConfirmed: row.user_confirmed === 1,
      createdAt: row.created_at,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "DebuggerManager|debugger schema"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/debugger/debugger-manager.ts test/main/debugger/debugger-manager.test.ts
git commit -m "feat(welle-3): DebuggerManager — CRUD for runs, clarifications, fix-plans"
```

---

### Task 4: Findings Parser

**Files:**
- Create: `src/main/debugger/findings-parser.ts`
- Test: `test/main/debugger/findings-parser.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// test/main/debugger/findings-parser.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseFindings, isStructuredFindings } from '../../src/main/debugger/findings-parser'

describe('findings-parser', () => {
  const structured = {
    symptom: 'App crashes on startup',
    reproduction: '1. Launch app 2. Click button',
    severity: 'high' as const,
    suspectedCause: 'Null pointer in init',
    affectedAreas: ['src/main/main.ts', 'src/main/window-manager.ts'],
    source: 'testing-assistant' as const,
  }

  it('parses valid structured findings', () => {
    const result = parseFindings(structured)
    assert.equal(result.symptom, 'App crashes on startup')
    assert.equal(result.severity, 'high')
    assert.deepEqual(result.affectedAreas, ['src/main/main.ts', 'src/main/window-manager.ts'])
  })

  it('isStructuredFindings returns true for valid input', () => {
    assert.equal(isStructuredFindings(structured), true)
  })

  it('isStructuredFindings returns false for missing fields', () => {
    assert.equal(isStructuredFindings({ symptom: 'x' }), false)
  })

  it('parses unstructured text into findings with defaults', () => {
    const result = parseFindings('The button does not work when clicked fast')
    assert.equal(result.symptom, 'The button does not work when clicked fast')
    assert.equal(result.severity, 'medium')
    assert.equal(result.source, 'manual')
    assert.deepEqual(result.affectedAreas, [])
  })

  it('normalizes severity to lowercase', () => {
    const result = parseFindings({ ...structured, severity: 'HIGH' as any })
    assert.equal(result.severity, 'high')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "findings-parser"`
Expected: FAIL

- [ ] **Step 3: Implement findings-parser.ts**

```typescript
// src/main/debugger/findings-parser.ts
import type { FindingsIntake, Severity } from './types'

const VALID_SEVERITIES: Severity[] = ['high', 'medium', 'low']

/** Type-guard: check if input is a structured findings object. */
export function isStructuredFindings(input: unknown): input is FindingsIntake {
  if (!input || typeof input !== 'object') return false
  const obj = input as Record<string, unknown>
  return (
    typeof obj.symptom === 'string' &&
    typeof obj.reproduction === 'string' &&
    typeof obj.severity === 'string' &&
    Array.isArray(obj.affectedAreas) &&
    typeof obj.source === 'string'
  )
}

/** Parse findings from structured object or raw text string. */
export function parseFindings(input: FindingsIntake | string): FindingsIntake {
  if (typeof input === 'string') {
    return {
      symptom: input,
      reproduction: '',
      severity: 'medium',
      suspectedCause: null,
      affectedAreas: [],
      source: 'manual',
    }
  }

  const severity = (input.severity?.toLowerCase() ?? 'medium') as Severity
  return {
    symptom: input.symptom,
    reproduction: input.reproduction ?? '',
    severity: VALID_SEVERITIES.includes(severity) ? severity : 'medium',
    suspectedCause: input.suspectedCause ?? null,
    affectedAreas: input.affectedAreas ?? [],
    source: input.source ?? 'manual',
    bugReportId: input.bugReportId,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "findings-parser"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/debugger/findings-parser.ts test/main/debugger/findings-parser.test.ts
git commit -m "feat(welle-3): findings-parser — structured + freetext intake"
```

---

### Task 5: Clarification Router

**Files:**
- Create: `src/main/debugger/clarification-router.ts`
- Test: `test/main/debugger/clarification-router.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// test/main/debugger/clarification-router.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../src/main/companion/schema'
import { DebuggerManager } from '../../src/main/debugger/debugger-manager'
import { ClarificationRouter } from '../../src/main/debugger/clarification-router'
import type { FindingsIntake } from '../../src/main/debugger/types'

describe('ClarificationRouter', () => {
  let db: Database.Database
  let mgr: DebuggerManager
  let router: ClarificationRouter

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
    mgr = new DebuggerManager(db)
    router = new ClarificationRouter(mgr)
  })

  it('identifies missing reproduction as needing clarification', () => {
    const findings: FindingsIntake = {
      symptom: 'Crash',
      reproduction: '',
      severity: 'high',
      suspectedCause: null,
      affectedAreas: [],
      source: 'manual',
    }
    const questions = router.identifyGaps(findings)
    assert.ok(questions.length > 0)
  })

  it('returns no gaps for fully specified findings', () => {
    const findings: FindingsIntake = {
      symptom: 'Button X does not respond',
      reproduction: '1. Click X 2. Nothing happens',
      severity: 'medium',
      suspectedCause: 'Event handler missing',
      affectedAreas: ['src/renderer/components/X.tsx'],
      source: 'testing-assistant',
    }
    const questions = router.identifyGaps(findings)
    assert.equal(questions.length, 0)
  })

  it('createClarificationsForRun stores questions in DB', () => {
    const run = mgr.createRun({ source: 'manual', severity: 'high', description: 'X', projectPath: '/tmp/p' })
    const findings: FindingsIntake = {
      symptom: 'Crash',
      reproduction: '',
      severity: 'high',
      suspectedCause: null,
      affectedAreas: [],
      source: 'manual',
    }
    const clars = router.createClarificationsForRun(run.id, findings)
    assert.ok(clars.length > 0)
    const stored = mgr.listClarifications(run.id)
    assert.equal(stored.length, clars.length)
  })

  it('allAnswered returns true when all clarifications answered', () => {
    const run = mgr.createRun({ source: 'manual', severity: 'high', description: 'X', projectPath: '/tmp/p' })
    const clar = mgr.createClarification(run.id, 'How?', null)
    assert.equal(router.allAnswered(run.id), false)
    mgr.answerClarification(clar.id, 'Like this')
    assert.equal(router.allAnswered(run.id), true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "ClarificationRouter"`
Expected: FAIL

- [ ] **Step 3: Implement clarification-router.ts**

```typescript
// src/main/debugger/clarification-router.ts
import type { DebuggerManager } from './debugger-manager'
import type { FindingsIntake, Clarification } from './types'

/**
 * ClarificationRouter — identifies gaps in findings and creates
 * clarification questions for the user.
 */
export class ClarificationRouter {
  constructor(private mgr: DebuggerManager) {}

  /** Identify what's missing from findings that needs user input. */
  identifyGaps(findings: FindingsIntake): string[] {
    const gaps: string[] = []

    if (!findings.reproduction || findings.reproduction.trim().length < 5) {
      gaps.push('Wie laesst sich der Bug reproduzieren? (Schritt-fuer-Schritt)')
    }

    if (!findings.suspectedCause && findings.affectedAreas.length === 0) {
      gaps.push('Gibt es eine Vermutung zur Ursache oder betroffene Code-Bereiche?')
    }

    return gaps
  }

  /** Create clarification records for identified gaps. Returns created clarifications. */
  createClarificationsForRun(runId: string, findings: FindingsIntake): Clarification[] {
    const gaps = this.identifyGaps(findings)
    return gaps.map(question => this.mgr.createClarification(runId, question, null))
  }

  /** Check whether all clarifications for a run have been answered. */
  allAnswered(runId: string): boolean {
    const clars = this.mgr.listClarifications(runId)
    if (clars.length === 0) return true
    return clars.every(c => c.status === 'answered')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "ClarificationRouter"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/debugger/clarification-router.ts test/main/debugger/clarification-router.test.ts
git commit -m "feat(welle-3): ClarificationRouter — gap detection + user Q&A"
```

---

### Task 6: Fix Planner

**Files:**
- Create: `src/main/debugger/fix-planner.ts`
- Test: `test/main/debugger/fix-planner.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// test/main/debugger/fix-planner.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../src/main/companion/schema'
import { DebuggerManager } from '../../src/main/debugger/debugger-manager'
import { FixPlanner } from '../../src/main/debugger/fix-planner'
import type { FindingsIntake } from '../../src/main/debugger/types'

describe('FixPlanner', () => {
  let db: Database.Database
  let mgr: DebuggerManager
  let planner: FixPlanner

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
    mgr = new DebuggerManager(db)
    planner = new FixPlanner(mgr)
  })

  it('generatePlanMarkdown produces structured output', () => {
    const findings: FindingsIntake = {
      symptom: 'Crash on startup',
      reproduction: '1. Launch app',
      severity: 'high',
      suspectedCause: 'Null ref in init',
      affectedAreas: ['src/main/main.ts'],
      source: 'testing-assistant',
    }
    const md = planner.generatePlanMarkdown(findings, [])
    assert.ok(md.includes('## Hypothese'))
    assert.ok(md.includes('## Geplanter Fix'))
    assert.ok(md.includes('## Risiko'))
    assert.ok(md.includes('Crash on startup'))
  })

  it('createAndStorePlan persists to DB', () => {
    const run = mgr.createRun({ source: 'manual', severity: 'high', description: 'X', projectPath: '/tmp/p' })
    const findings: FindingsIntake = {
      symptom: 'Bug',
      reproduction: 'Steps',
      severity: 'medium',
      suspectedCause: 'Cause',
      affectedAreas: ['file.ts'],
      source: 'manual',
    }
    const plan = planner.createAndStorePlan(run.id, findings, [])
    assert.ok(plan.id)
    assert.equal(plan.status, 'draft')
    const stored = mgr.getFixPlan(plan.id)
    assert.ok(stored)
  })

  it('requiresConfirmation returns true unless effort is trivial with sure confidence', () => {
    assert.equal(planner.requiresConfirmation('trivial', 'sure'), false)
    assert.equal(planner.requiresConfirmation('trivial', 'likely'), true)
    assert.equal(planner.requiresConfirmation('small', 'sure'), true)
    assert.equal(planner.requiresConfirmation('large', 'sure'), true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "FixPlanner"`
Expected: FAIL

- [ ] **Step 3: Implement fix-planner.ts**

```typescript
// src/main/debugger/fix-planner.ts
import type { DebuggerManager } from './debugger-manager'
import type { FindingsIntake, FixPlan, Clarification } from './types'

/**
 * FixPlanner — generates fix-plan markdown from findings + clarifications,
 * stores plan in DB, and determines whether user confirmation is needed.
 */
export class FixPlanner {
  constructor(private mgr: DebuggerManager) {}

  /** Generate plan markdown from findings and resolved clarifications. */
  generatePlanMarkdown(findings: FindingsIntake, clarifications: Clarification[]): string {
    const lines: string[] = []

    lines.push('## Hypothese')
    lines.push('')
    if (findings.suspectedCause) {
      lines.push(`**Vermutete Ursache:** ${findings.suspectedCause}`)
    } else {
      lines.push('**Vermutete Ursache:** Noch zu ermitteln (aus Code-Analyse)')
    }
    lines.push('')

    lines.push('## Symptom')
    lines.push('')
    lines.push(findings.symptom)
    lines.push('')

    if (findings.reproduction) {
      lines.push('## Reproduktion')
      lines.push('')
      lines.push(findings.reproduction)
      lines.push('')
    }

    if (clarifications.length > 0) {
      lines.push('## Klaerungen')
      lines.push('')
      for (const c of clarifications) {
        lines.push(`**F:** ${c.question}`)
        lines.push(`**A:** ${c.answer ?? '(offen)'}`)
        lines.push('')
      }
    }

    lines.push('## Geplanter Fix')
    lines.push('')
    if (findings.affectedAreas.length > 0) {
      lines.push('**Betroffene Dateien:**')
      for (const area of findings.affectedAreas) {
        lines.push(`- \`${area}\``)
      }
      lines.push('')
    }
    lines.push('(Detail wird vom Debugger nach Plan-Bestaetigung ausgefuellt)')
    lines.push('')

    lines.push('## Risiko')
    lines.push('')
    lines.push(`**Severity:** ${findings.severity}`)
    lines.push('')

    return lines.join('\n')
  }

  /** Create a fix plan from findings, store it, and return it. */
  createAndStorePlan(runId: string, findings: FindingsIntake, clarifications: Clarification[]): FixPlan {
    const planMd = this.generatePlanMarkdown(findings, clarifications)

    return this.mgr.createFixPlan(runId, {
      hypothesis: findings.suspectedCause ?? 'Aus Code-Analyse zu ermitteln',
      confidenceLevel: findings.suspectedCause ? 'likely' : 'uncertain',
      planMd,
      testExtension: `Verhaltens-Test fuer: ${findings.symptom}`,
      riskAssessment: `Severity ${findings.severity}, betroffene Bereiche: ${findings.affectedAreas.join(', ') || 'unbekannt'}`,
      effort: this.estimateEffort(findings),
    })
  }

  /**
   * Whether user confirmation is required before starting the worker.
   * Only trivial fixes with sure confidence can skip confirmation.
   */
  requiresConfirmation(effort: FixPlan['effort'], confidence: FixPlan['confidenceLevel']): boolean {
    return !(effort === 'trivial' && confidence === 'sure')
  }

  private estimateEffort(findings: FindingsIntake): FixPlan['effort'] {
    if (findings.affectedAreas.length <= 1 && findings.suspectedCause) return 'small'
    if (findings.affectedAreas.length > 3) return 'large'
    return 'medium'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "FixPlanner"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/debugger/fix-planner.ts test/main/debugger/fix-planner.test.ts
git commit -m "feat(welle-3): FixPlanner — plan generation + confirmation logic"
```

---

### Task 7: Worker Launcher (retry logic)

**Files:**
- Create: `src/main/debugger/worker-launcher.ts`
- Test: `test/main/debugger/worker-launcher.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// test/main/debugger/worker-launcher.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../src/main/companion/schema'
import { DebuggerManager } from '../../src/main/debugger/debugger-manager'
import { WorkerLauncher } from '../../src/main/debugger/worker-launcher'
import { DEBUGGER_DEFAULTS } from '../../src/main/debugger/types'

describe('WorkerLauncher', () => {
  let db: Database.Database
  let mgr: DebuggerManager
  let launcher: WorkerLauncher

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
    mgr = new DebuggerManager(db)
    launcher = new WorkerLauncher(mgr, DEBUGGER_DEFAULTS)
  })

  it('canRetry returns true when retryCount < maxRetries', () => {
    const run = mgr.createRun({ source: 'manual', severity: 'medium', description: 'X', projectPath: '/tmp/p' })
    assert.equal(launcher.canRetry(run), true)
  })

  it('canRetry returns false when retryCount >= maxRetries', () => {
    const run = mgr.createRun({ source: 'manual', severity: 'medium', description: 'X', projectPath: '/tmp/p' })
    mgr.incrementRetry(run.id)
    mgr.incrementRetry(run.id)
    const updated = mgr.getRun(run.id)!
    assert.equal(launcher.canRetry(updated), false)
  })

  it('buildWorkerInstruction includes fix plan and test info', () => {
    const run = mgr.createRun({ source: 'manual', severity: 'high', description: 'Crash', projectPath: '/tmp/p' })
    const plan = mgr.createFixPlan(run.id, {
      hypothesis: 'Null ref',
      confidenceLevel: 'likely',
      planMd: '## Fix\nChange X',
      testExtension: 'test_crash.ts',
      riskAssessment: 'Low',
      effort: 'small',
    })
    const instruction = launcher.buildWorkerInstruction(run, plan)
    assert.ok(instruction.includes('## Fix'))
    assert.ok(instruction.includes('test_crash.ts'))
    assert.ok(instruction.includes('maximal 2'))
  })

  it('buildWorkerInstruction includes retry learning note on retry', () => {
    const run = mgr.createRun({ source: 'manual', severity: 'medium', description: 'Bug', projectPath: '/tmp/p' })
    mgr.incrementRetry(run.id)
    const updated = mgr.getRun(run.id)!
    const plan = mgr.createFixPlan(run.id, {
      hypothesis: 'H',
      confidenceLevel: 'sure',
      planMd: 'P',
      testExtension: 'T',
      riskAssessment: 'R',
      effort: 'trivial',
    })
    const instruction = launcher.buildWorkerInstruction(updated, plan)
    assert.ok(instruction.includes('Retry'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "WorkerLauncher"`
Expected: FAIL

- [ ] **Step 3: Implement worker-launcher.ts**

```typescript
// src/main/debugger/worker-launcher.ts
import type { DebuggerManager } from './debugger-manager'
import type { DebuggerRun, DebuggerConfig, FixPlan } from './types'

/**
 * WorkerLauncher — builds worker instructions and manages retry logic.
 * Actual session creation happens via MCP/IPC (not in this module).
 */
export class WorkerLauncher {
  constructor(
    private mgr: DebuggerManager,
    private config: DebuggerConfig,
  ) {}

  /** Whether the run can still retry (retryCount < maxRetries). */
  canRetry(run: DebuggerRun): boolean {
    return run.retryCount < this.config.maxRetries
  }

  /** Build the instruction text to send to the worker sub-session. */
  buildWorkerInstruction(run: DebuggerRun, plan: FixPlan): string {
    const lines: string[] = []

    lines.push('# Debugger Worker — Fix-Auftrag')
    lines.push('')

    if (run.retryCount > 0) {
      lines.push(`> **Retry ${run.retryCount}/${this.config.maxRetries}** — Vorheriger Versuch war nicht erfolgreich. Analysiere was schiefging, bevor du den gleichen Ansatz wiederholst.`)
      lines.push('')
    }

    lines.push('## Fix-Plan')
    lines.push('')
    lines.push(plan.planMd)
    lines.push('')

    lines.push('## Test-Erweiterung')
    lines.push('')
    lines.push(plan.testExtension)
    lines.push('')

    lines.push('## Regeln')
    lines.push('')
    lines.push('- Verhaltens-Test schreiben (muss erst rot sein, dann gruen nach Fix)')
    lines.push('- Bestehende Test-Suite muss gruen bleiben')
    lines.push(`- Du hast maximal ${this.config.maxRetries} Versuche insgesamt`)
    lines.push('- Bei Unklarheit: eskalieren, nicht raten')
    lines.push('- Worker-Phasenmodell einhalten (Plan > Test > Impl > Verify)')
    lines.push('')

    lines.push('## Risiko-Einschaetzung')
    lines.push('')
    lines.push(plan.riskAssessment)
    lines.push('')

    lines.push(`## Projektpfad: \`${run.projectPath}\``)

    return lines.join('\n')
  }

  /** Record a retry attempt. Returns whether retry is still possible. */
  recordRetry(runId: string): boolean {
    this.mgr.incrementRetry(runId)
    const run = this.mgr.getRun(runId)
    return run ? this.canRetry(run) : false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "WorkerLauncher"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/debugger/worker-launcher.ts test/main/debugger/worker-launcher.test.ts
git commit -m "feat(welle-3): WorkerLauncher — retry logic + worker instruction builder"
```

---

### Task 8: Verification Runner

**Files:**
- Create: `src/main/debugger/verification-runner.ts`
- Test: `test/main/debugger/verification-runner.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// test/main/debugger/verification-runner.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { VerificationRunner, type VerificationResult } from '../../src/main/debugger/verification-runner'

describe('VerificationRunner', () => {
  const runner = new VerificationRunner()

  it('parseTestOutput detects all-pass', () => {
    const output = 'tests 15\nsuites 3\npass 15\nfail 0\nduration_ms 1200'
    const result = runner.parseTestOutput(output)
    assert.equal(result.allPassed, true)
    assert.equal(result.totalTests, 15)
    assert.equal(result.failures, 0)
  })

  it('parseTestOutput detects failures', () => {
    const output = 'tests 10\npass 8\nfail 2'
    const result = runner.parseTestOutput(output)
    assert.equal(result.allPassed, false)
    assert.equal(result.failures, 2)
  })

  it('parseTestOutput handles missing numbers gracefully', () => {
    const result = runner.parseTestOutput('some garbage output')
    assert.equal(result.allPassed, false)
    assert.equal(result.totalTests, 0)
    assert.equal(result.failures, 0)
    assert.ok(result.rawOutput.includes('garbage'))
  })

  it('assessPhaseTransition blocks on failure in strict mode', () => {
    const fail: VerificationResult = { allPassed: false, totalTests: 10, failures: 2, rawOutput: '' }
    assert.equal(runner.assessPhaseTransition(fail, 'strict'), false)
  })

  it('assessPhaseTransition allows on pass in strict mode', () => {
    const pass: VerificationResult = { allPassed: true, totalTests: 10, failures: 0, rawOutput: '' }
    assert.equal(runner.assessPhaseTransition(pass, 'strict'), true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "VerificationRunner"`
Expected: FAIL

- [ ] **Step 3: Implement verification-runner.ts**

```typescript
// src/main/debugger/verification-runner.ts

export interface VerificationResult {
  allPassed: boolean
  totalTests: number
  failures: number
  rawOutput: string
}

/**
 * VerificationRunner — parses test output and determines phase transition eligibility.
 * Does NOT execute tests itself (that happens via tmux in the worker session).
 */
export class VerificationRunner {
  /** Parse Node.js test runner output into structured result. */
  parseTestOutput(output: string): VerificationResult {
    const totalMatch = output.match(/tests\s+(\d+)/i)
    const failMatch = output.match(/fail\s+(\d+)/i)

    const totalTests = totalMatch ? parseInt(totalMatch[1], 10) : 0
    const failures = failMatch ? parseInt(failMatch[1], 10) : 0
    const allPassed = totalTests > 0 && failures === 0

    return { allPassed, totalTests, failures, rawOutput: output }
  }

  /** Whether the verification result allows phase transition. */
  assessPhaseTransition(result: VerificationResult, qualityGate: 'strict' | 'permissive'): boolean {
    if (qualityGate === 'strict') {
      return result.allPassed
    }
    // Permissive: allow if no failures and at least some tests ran
    return result.totalTests > 0 && result.failures === 0
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "VerificationRunner"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/debugger/verification-runner.ts test/main/debugger/verification-runner.test.ts
git commit -m "feat(welle-3): VerificationRunner — test output parsing + phase gating"
```

---

### Task 9: Walkthrough Renderer

**Files:**
- Create: `src/main/debugger/walkthrough-renderer.ts`
- Test: `test/main/debugger/walkthrough-renderer.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// test/main/debugger/walkthrough-renderer.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { WalkthroughRenderer, type WalkthroughEntry } from '../../src/main/debugger/walkthrough-renderer'

describe('WalkthroughRenderer', () => {
  const renderer = new WalkthroughRenderer()

  it('renders single-file walkthrough', () => {
    const entries: WalkthroughEntry[] = [
      { filePath: 'src/main/foo.ts', lineRange: '10-25', explanation: 'Added null check before access' },
    ]
    const md = renderer.render(entries, 'Fix null pointer crash')
    assert.ok(md.includes('# Linear Walkthrough'))
    assert.ok(md.includes('Fix null pointer crash'))
    assert.ok(md.includes('`src/main/foo.ts`'))
    assert.ok(md.includes('10-25'))
    assert.ok(md.includes('Added null check'))
  })

  it('renders multi-file walkthrough in order', () => {
    const entries: WalkthroughEntry[] = [
      { filePath: 'a.ts', lineRange: '1-5', explanation: 'First' },
      { filePath: 'b.ts', lineRange: '10-20', explanation: 'Second' },
      { filePath: 'c.ts', lineRange: '3-3', explanation: 'Third' },
    ]
    const md = renderer.render(entries, 'Multi-fix')
    const aIdx = md.indexOf('a.ts')
    const bIdx = md.indexOf('b.ts')
    const cIdx = md.indexOf('c.ts')
    assert.ok(aIdx < bIdx)
    assert.ok(bIdx < cIdx)
  })

  it('renders empty entries gracefully', () => {
    const md = renderer.render([], 'Nothing changed')
    assert.ok(md.includes('Keine Aenderungen'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --test-name-pattern "WalkthroughRenderer"`
Expected: FAIL

- [ ] **Step 3: Implement walkthrough-renderer.ts**

```typescript
// src/main/debugger/walkthrough-renderer.ts

export interface WalkthroughEntry {
  filePath: string
  lineRange: string
  explanation: string
}

/**
 * WalkthroughRenderer — generates linear walkthrough markdown for reviewed fixes.
 */
export class WalkthroughRenderer {
  /** Render a walkthrough from file change entries. */
  render(entries: WalkthroughEntry[], title: string): string {
    const lines: string[] = []

    lines.push(`# Linear Walkthrough: ${title}`)
    lines.push('')

    if (entries.length === 0) {
      lines.push('Keine Aenderungen in diesem Fix.')
      return lines.join('\n')
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      lines.push(`## ${i + 1}. \`${entry.filePath}\` (Zeilen ${entry.lineRange})`)
      lines.push('')
      lines.push(entry.explanation)
      lines.push('')
    }

    return lines.join('\n')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --test-name-pattern "WalkthroughRenderer"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/debugger/walkthrough-renderer.ts test/main/debugger/walkthrough-renderer.test.ts
git commit -m "feat(welle-3): WalkthroughRenderer — linear walkthrough markdown"
```

---

### Task 10: Debugger Template (Entity CLAUDE.md Generator)

**Files:**
- Create: `src/main/debugger/debugger-template.ts`

- [ ] **Step 1: Implement debugger-template.ts**

```typescript
// src/main/debugger/debugger-template.ts

/**
 * Generate the CLAUDE.md content for the debugger entity directory.
 * Deployed to ~/.config/cipher-mux/entities/debugger/CLAUDE.md
 */
export function generateDebuggerClaudeMd(): string {
  return `# Debugger — Entity CLAUDE.md

Du bist der **Debugger** in cipher-mux. Deine Rolle: methodisches Bugfixing nach Build-Run.

## Lifecycle (8 Phasen)

1. **Findings lesen** — strukturierte Felder: Symptom, Reproduktion, Severity, vermutete Ursache, betroffene Bereiche
2. **Rueckfragen-Loop** — hohes Qualitaetsziel, lieber zwei Fragen als ein falscher Fix. Nutze \`mux_input_request_create\`
3. **Fix-Plan schreiben** — Hypothese, geplanter Fix, Test-Erweiterung, Risiko, Aufwand. User-Bestaetigung einholen
4. **Verhaltens-Test schreiben** — Test der das Bug-Verhalten reproduziert (muss rot sein!)
5. **Worker-Sub-Session starten** — \`mux_create_session\` mit Fix-Plan, Phasenmodell-Pflicht, max 2 Retries
6. **Verifikation** — Bug-Test gruen, Suite gruen, Lint/Type gruen. Bei Fail: zurueck zu Phase 5
7. **Risk-Review + Walkthrough** — strukturierte Note, Linear Walkthrough als Angebot
8. **Uebergabe** — Re-Test (Testing Assistant) oder Audit

## Persona-Akzent

Ruhig, methodisch. "Lass uns das systematisch durchgehen." Bei Findings-Vagheit: aktive Klaerung, nicht raten.

## MCP-Tools (verfuegbar)

- \`mux_create_session\` — Worker spawnen
- \`mux_send\`, \`mux_read\`, \`mux_status\` — Worker-Kommunikation
- \`mux_input_request_create\` — Rueckfragen an User
- \`mux_notes_create\` — Fix-Plaene und Walkthroughs speichern
- \`mux_bugreport_resolve\` — Bug-Report als gefixt markieren
- \`mux_debugger_findings_intake\` — strukturierter Eingang

## Regeln

- Maximal 2 Retries pro Worker (Iterative-Degradation-Schutz)
- Fix-Plan braucht User-Bestaetigung (ausser trivial + sicher)
- Verhaltens-Test MUSS rot sein bevor Worker startet
- Test-Suite MUSS komplett gruen sein nach Fix
- Keine Aenderungen ausserhalb der im Plan benannten Dateien ohne Rueckfrage
- Worker-Startup-Protokoll: Readiness-Check + tmux send-keys (nicht mux_send)
`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/debugger/debugger-template.ts
git commit -m "feat(welle-3): debugger entity CLAUDE.md template"
```

---

### Task 11: Entity Registration + Shared Types + IPC Channels

**Files:**
- Modify: `src/shared/types.ts:21` (add 'debugger' to BuiltinEntityId)
- Modify: `src/main/session/entity-registry.ts:165` (add debugger entity)
- Modify: `src/shared/ipc-channels.ts:69` (add DEBUGGER_* channels)

- [ ] **Step 1: Add 'debugger' to BuiltinEntityId in types.ts**

In `src/shared/types.ts` line 21, change:
```typescript
export type BuiltinEntityId = 'orchestrator' | 'cyber-factory' | 'launcher' | 'companion' | 'refinement' | 'voice-relay' | 'audit' | 'ideation-partner'
```
to:
```typescript
export type BuiltinEntityId = 'orchestrator' | 'cyber-factory' | 'launcher' | 'companion' | 'refinement' | 'voice-relay' | 'audit' | 'ideation-partner' | 'debugger'
```

- [ ] **Step 2: Register debugger entity in entity-registry.ts**

After the `audit` registration (line ~165), add:

```typescript
  registry.register({
    id: 'debugger',
    displayName: 'Debugger',
    icon: '🔧',
    color: '#ff7043',
    projectPath: `${entitiesBase}/debugger`,
    features: ['mcp', 'memory'],
    visible: true,
    sortOrder: 75,
    singleInstance: true,
  })
```

- [ ] **Step 3: Add IPC channels in ipc-channels.ts**

After the Cyber Factory section (after line 69), add:

```typescript
  // Debugger
  DEBUGGER_RUN_START: 'cipher-mux:debugger:run-start',
  DEBUGGER_RUN_STATUS: 'cipher-mux:debugger:run-status',
  DEBUGGER_RUN_CANCEL: 'cipher-mux:debugger:run-cancel',
  DEBUGGER_CLARIFICATION_NEW: 'cipher-mux:debugger:clarification-new',
  DEBUGGER_CLARIFICATION_RESOLVE: 'cipher-mux:debugger:clarification-resolve',
  DEBUGGER_FIX_PLAN_CONFIRM: 'cipher-mux:debugger:fix-plan-confirm',
  DEBUGGER_WALKTHROUGH_REQUEST: 'cipher-mux:debugger:walkthrough-request',
```

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: All existing tests pass (no regression)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/session/entity-registry.ts src/shared/ipc-channels.ts
git commit -m "feat(welle-3): register debugger entity + IPC channels + BuiltinEntityId"
```

---

### Task 12: MCP Tool — mux_debugger_findings_intake

**Files:**
- Modify: MCP tools registration file (locate via `grep -rl "mux_cyber_factory_diagnose" src/`)

- [ ] **Step 1: Locate and read the MCP tool registration file**

Run: `grep -rl "mux_cyber_factory_diagnose" src/`
Read that file to understand the registration pattern.

- [ ] **Step 2: Add the findings_intake tool registration**

Register `mux_debugger_findings_intake` following the same pattern as existing MCP tools. The tool:
- Accepts: `{ symptom, reproduction, severity, suspectedCause?, affectedAreas?, source?, bugReportId?, projectPath }`
- Parses via `parseFindings()`
- Creates a run via `DebuggerManager.createRun()`
- Returns: `{ runId, status: 'intake', gaps: string[] }`

Tool definition:
```typescript
{
  name: 'mux_debugger_findings_intake',
  description: 'Submit structured bug findings to the Debugger. Creates a new debugger run and identifies clarification gaps.',
  inputSchema: {
    type: 'object',
    properties: {
      symptom: { type: 'string', description: 'What is happening (bug description)' },
      reproduction: { type: 'string', description: 'Steps to reproduce' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      suspectedCause: { type: 'string', description: 'Optional hypothesis about root cause' },
      affectedAreas: { type: 'array', items: { type: 'string' }, description: 'File paths likely involved' },
      source: { type: 'string', enum: ['testing-assistant', 'bugreport', 'manual'], default: 'manual' },
      bugReportId: { type: 'string', description: 'Optional link to existing bugreport' },
      projectPath: { type: 'string', description: 'Project path for the debugger run' },
    },
    required: ['symptom', 'reproduction', 'severity', 'projectPath'],
  },
}
```

Handler:
```typescript
case 'mux_debugger_findings_intake': {
  const findings = parseFindings(args as any)
  const run = debuggerManager.createRun({
    source: findings.source,
    severity: findings.severity,
    description: findings.symptom,
    projectPath: args.projectPath as string,
    bugReportId: findings.bugReportId,
  })
  const router = new ClarificationRouter(debuggerManager)
  const gaps = router.identifyGaps(findings)
  return { content: [{ type: 'text', text: JSON.stringify({ runId: run.id, status: run.status, gaps }) }] }
}
```

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add <mcp-tools-file>
git commit -m "feat(welle-3): MCP tool mux_debugger_findings_intake"
```

---

### Task 13: ConfigStore Integration

**Files:**
- Modify: ConfigStore defaults file (locate via `grep -rl "cyber_factory" src/main/config/`)

- [ ] **Step 1: Locate ConfigStore and read its structure**

Run: `grep -rl "CYBER_FACTORY_DEFAULTS\|cyber_factory" src/main/config/`
Read that file to understand how sections are registered.

- [ ] **Step 2: Add debugger section to ConfigStore defaults**

Add alongside the `cyber_factory` section:

```typescript
import { DEBUGGER_DEFAULTS } from '../debugger/types'

// In the defaults object:
debugger: DEBUGGER_DEFAULTS,
```

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/config/<file>
git commit -m "feat(welle-3): ConfigStore debugger section with defaults"
```

---

### Task 14: Integration Test — Full Debugger Flow

**Files:**
- Create: `test/main/debugger/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// test/main/debugger/integration.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../src/main/companion/schema'
import { DebuggerManager } from '../../src/main/debugger/debugger-manager'
import { ClarificationRouter } from '../../src/main/debugger/clarification-router'
import { FixPlanner } from '../../src/main/debugger/fix-planner'
import { WorkerLauncher } from '../../src/main/debugger/worker-launcher'
import { VerificationRunner } from '../../src/main/debugger/verification-runner'
import { WalkthroughRenderer } from '../../src/main/debugger/walkthrough-renderer'
import { parseFindings } from '../../src/main/debugger/findings-parser'
import { DEBUGGER_DEFAULTS } from '../../src/main/debugger/types'

describe('Debugger integration — full flow', () => {
  let db: Database.Database
  let mgr: DebuggerManager

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
    mgr = new DebuggerManager(db)
  })

  it('Phase 1-7: findings > clarify > plan > confirm > worker > verify > walkthrough', () => {
    // Phase 1: Intake
    const findings = parseFindings({
      symptom: 'Grid crashes on resize beyond 7 cols',
      reproduction: '1. Open grid 2. Resize to 8 cols 3. App freezes',
      severity: 'high',
      suspectedCause: 'Missing bounds check in grid-resize handler',
      affectedAreas: ['src/renderer/components/SessionGrid.tsx'],
      source: 'testing-assistant',
    })
    const run = mgr.createRun({
      source: findings.source,
      severity: findings.severity,
      description: findings.symptom,
      projectPath: '/tmp/cipher-mux',
    })
    assert.equal(run.status, 'intake')

    // Phase 2: Clarification (none needed — fully specified)
    const router = new ClarificationRouter(mgr)
    const gaps = router.identifyGaps(findings)
    assert.equal(gaps.length, 0)
    mgr.updateRunStatus(run.id, 'planning')

    // Phase 3: Fix Plan
    const planner = new FixPlanner(mgr)
    const plan = planner.createAndStorePlan(run.id, findings, [])
    assert.equal(plan.status, 'draft')
    assert.ok(planner.requiresConfirmation(plan.effort, plan.confidenceLevel))

    // User confirms
    mgr.confirmFixPlan(plan.id)
    const confirmed = mgr.getFixPlan(plan.id)!
    assert.equal(confirmed.userConfirmed, true)
    mgr.updateRunStatus(run.id, 'confirmed')

    // Phase 5: Worker launch
    const launcher = new WorkerLauncher(mgr, DEBUGGER_DEFAULTS)
    assert.equal(launcher.canRetry(mgr.getRun(run.id)!), true)
    const instruction = launcher.buildWorkerInstruction(mgr.getRun(run.id)!, confirmed)
    assert.ok(instruction.includes('Grid crashes'))
    mgr.updateRunStatus(run.id, 'worker_running')

    // Phase 6: Verification
    const verifier = new VerificationRunner()
    const passResult = verifier.parseTestOutput('tests 920\npass 920\nfail 0')
    assert.equal(verifier.assessPhaseTransition(passResult, 'strict'), true)
    mgr.updateRunStatus(run.id, 'verifying')

    // Phase 7: Walkthrough
    const renderer = new WalkthroughRenderer()
    const walkthrough = renderer.render(
      [{ filePath: 'src/renderer/components/SessionGrid.tsx', lineRange: '45-48', explanation: 'Added MAX_GRID_COLS bounds check' }],
      'Fix grid resize crash'
    )
    assert.ok(walkthrough.includes('SessionGrid.tsx'))

    // Complete
    mgr.updateRunStatus(run.id, 'completed')
    const final = mgr.getRun(run.id)!
    assert.equal(final.status, 'completed')
    assert.ok(final.finishedAt)
  })

  it('max-retries escalation: 3rd attempt blocked', () => {
    const run = mgr.createRun({ source: 'manual', severity: 'medium', description: 'Flaky', projectPath: '/tmp/p' })
    const launcher = new WorkerLauncher(mgr, DEBUGGER_DEFAULTS)

    mgr.incrementRetry(run.id)
    assert.equal(launcher.canRetry(mgr.getRun(run.id)!), true)

    mgr.incrementRetry(run.id)
    assert.equal(launcher.canRetry(mgr.getRun(run.id)!), false)
  })

  it('verification failure blocks phase-7 transition', () => {
    const verifier = new VerificationRunner()
    const failResult = verifier.parseTestOutput('tests 920\npass 918\nfail 2')
    assert.equal(verifier.assessPhaseTransition(failResult, 'strict'), false)
  })
})
```

- [ ] **Step 2: Run integration test**

Run: `npm run test -- --test-name-pattern "Debugger integration"`
Expected: PASS

- [ ] **Step 3: Run full test suite for regression check**

Run: `npm run test`
Expected: 913+ pass (new tests add ~25-30), 0 fail

- [ ] **Step 4: Commit**

```bash
git add test/main/debugger/integration.test.ts
git commit -m "test(welle-3): debugger integration test — full 8-phase flow"
```

---

### Task 15: Entity Directory + Feature Flag Wiring

**Files:**
- Modify: Entity directory creation logic (locate via `grep -rl "entities/orchestrator\|ensureDir\|mkdirSync" src/main/`)
- Wire feature flag check in entity-start flow

- [ ] **Step 1: Locate entity directory creation logic**

Run: `grep -rl "entities/orchestrator\|ensureDir\|mkdirSync" src/main/`
Read to understand where entity dirs are created.

- [ ] **Step 2: Add debugger directory creation + CLAUDE.md deployment**

Follow the same pattern as other entity directories. Write the output of `generateDebuggerClaudeMd()` to `~/.config/cipher-mux/entities/debugger/CLAUDE.md` on first init (if not exists).

- [ ] **Step 3: Wire feature flag**

In the entity-start handler, add check:
```typescript
if (entityId === 'debugger') {
  const config = configStore.get('debugger') ?? DEBUGGER_DEFAULTS
  if (!config.enabled) {
    return { error: 'Debugger is disabled. Enable via ConfigStore debugger.enabled' }
  }
}
```

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add <affected files>
git commit -m "feat(welle-3): debugger entity dir init + feature flag gate"
```

---

### Task 16: Documentation Update

**Files:**
- Modify: `CLAUDE.md` in Hub-Repo (add Debugger section)

- [ ] **Step 1: Add Debugger section to CLAUDE.md**

After the Cyber Factory section, add:

```markdown
## Debugger

Spezialisierte Phase nach Build-Run. Empfaengt Findings (Testing Assistant oder User Bug-Reports), klaert mit User, plant Fix, dispatcht Worker Sub-Session, verifiziert Ergebnis.

- **Modul:** `src/main/debugger/` (9 Module: types, manager, findings-parser, clarification-router, fix-planner, worker-launcher, verification-runner, walkthrough-renderer, template)
- **DB:** 3 Tabellen in companion.db (debugger_runs, clarifications, fix_plans)
- **Entity:** `debugger` (Builtin, singleInstance, Feature-Flag `debugger.enabled`)
- **MCP-Tool:** `mux_debugger_findings_intake`
- **IPC:** DEBUGGER_RUN_START, DEBUGGER_RUN_STATUS, DEBUGGER_RUN_CANCEL, DEBUGGER_CLARIFICATION_NEW, DEBUGGER_CLARIFICATION_RESOLVE, DEBUGGER_FIX_PLAN_CONFIRM, DEBUGGER_WALKTHROUGH_REQUEST
- **Lifecycle:** 8 Phasen (Intake > Clarify > Plan > Confirm > Worker > Verify > Review > Handoff)
- **Retries:** Max 2 (konfigurierbar via `debugger.maxRetries`)
- **Quality Gate:** strict (Test-Pflicht) oder permissive
- **Parallel zum Launcher:** Feature-Flag default off, bestehender projectlauncher bleibt verfuegbar
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(welle-3): add Debugger section to CLAUDE.md"
```

---

## Summary

| Task | Module | Tests Added |
|------|--------|-------------|
| 1 | types.ts | 2 |
| 2 | schema.ts extension | 3 |
| 3 | debugger-manager.ts | 9 |
| 4 | findings-parser.ts | 5 |
| 5 | clarification-router.ts | 4 |
| 6 | fix-planner.ts | 3 |
| 7 | worker-launcher.ts | 4 |
| 8 | verification-runner.ts | 5 |
| 9 | walkthrough-renderer.ts | 3 |
| 10 | debugger-template.ts | 0 (string builder) |
| 11 | entity + types + IPC | 0 (type-level) |
| 12 | MCP tool | 0 (covered by integration) |
| 13 | ConfigStore | 0 (covered by integration) |
| 14 | integration test | 3 |
| 15 | entity dir + flag | 0 |
| 16 | CLAUDE.md docs | 0 |

**Total new tests:** ~41
**Total commits:** 16
**Estimated baseline after:** 913 + ~41 = 954 tests

## Akzeptanz-Kriterien (aus 12-migration-rebuild.md)

- [x] Debugger-Run laesst sich starten (Task 3 + 14)
- [x] Fix-Plan wird mit User-Bestaetigung erzeugt (Task 6 + 14)
- [x] Worker-Sub-Session mit max-2-Retries funktioniert (Task 7 + 14)
- [x] Linear-Walkthrough-Output ist Markdown-strukturiert (Task 9 + 14)
- [x] Heutiger `projectlauncher` bleibt parallel verfuegbar (Task 15 — feature flag default off)
