# Welle 4 Implementation Plan — Testing Assistant + Audit + Workspace-Memory

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three code packages of Wave 4: Testing Assistant (new module replacing watchdog), Audit full implementation (extending skeleton), and Workspace-Memory UI completion.

**Architecture:** Each package is a standalone module under `src/main/` with its own types, manager, DB tables (in companion schema), MCP tools, IPC channels, ConfigStore section, and entity CLAUDE.md template. All follow the established debugger/cyber-factory patterns.

**Tech Stack:** TypeScript strict, better-sqlite3 (WAL), Node.js native test runner, Electron IPC, MCP Streamable HTTP (zod schemas)

**Working directory:** `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron/`

**Branch:** `feat/cyber-factory-pack` (continue existing)

**Security note:** The test-runner module uses `execFileSync` (not `exec`) to avoid command injection. Test commands are sourced from project CLAUDE.md, not user input, but the safe API is used regardless.

---

## File Structure

### Testing Assistant (new)

```
src/main/testing-assistant/
├── types.ts                        — Interfaces, enums, config, defaults
├── testing-assistant-manager.ts    — CRUD for runs/findings, DB access
├── test-runner.ts                  — Execute test suite, parse output
├── test-quality-audit.ts           — Behavioral vs implementation test heuristics
├── adversarial-prober.ts           — Edge case generation
├── owasp-spotcheck.ts              — OWASP top-10 light check
├── off-limits-audit.ts             — Path check against off-limits list
├── findings-reporter.ts            — Markdown report generation
├── handoff-debugger.ts             — Severity routing logic
└── testing-template.ts             — Entity CLAUDE.md generator

test/main/testing-assistant/
├── types.test.ts
├── testing-assistant-manager.test.ts
├── test-runner.test.ts
├── test-quality-audit.test.ts
├── adversarial-prober.test.ts
├── findings-reporter.test.ts
└── handoff-debugger.test.ts
```

### Audit (extend existing skeleton)

```
src/main/audit/
├── types.ts                        — EXTEND: add CognitiveDebtNote, ReleaseRecommendation
├── audit-manager.ts                — REWRITE: full DB-backed CRUD
├── code-review.ts                  — NEW: readability/convention checks
├── security-audit.ts               — NEW: OWASP full pass
├── adr-consistency.ts              — NEW: ADR existence checks
├── cognitive-debt-evaluator.ts     — NEW: complexity heuristics
├── findings-reporter.ts            — NEW: structured markdown report
├── release-recommender.ts          — NEW: verdict generator
└── audit-template.ts               — NEW: entity CLAUDE.md generator

test/main/audit/
├── audit-manager.test.ts
├── release-recommender.test.ts
├── security-audit.test.ts
└── cognitive-debt-evaluator.test.ts
```

### Workspace-Memory UI (extend existing)

```
src/main/workspace-memory/
└── session-scope-cleanup.ts        — NEW: cleanup on session end

Modify:
├── src/shared/types.ts             — Add TestingAssistantConfig, AuditConfig (full), MemoryConfig, AppConfig keys
├── src/shared/ipc-channels.ts      — Add TESTING_*, AUDIT_* channels
├── src/main/companion/schema.ts    — Add testing_runs, findings, audit_runs tables
├── src/main/session/entity-registry.ts — Add testing-assistant builtin
├── src/main/mcp/mcp-tools.ts       — Register mux_testing_*, mux_audit_* tools
├── src/main/config/config-store.ts — Add defaults for testing_assistant, audit, memory sections
```

---

## Task 1: Testing Assistant — Types + Config

**Files:**
- Create: `src/main/testing-assistant/types.ts`
- Modify: `src/shared/types.ts:290` (add TestingAssistantConfig to AppConfig)
- Modify: `src/main/config/config-store.ts` (add defaults)
- Test: `test/main/testing-assistant/types.test.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/main/testing-assistant/types.ts — Testing Assistant core types and defaults

export type TestingRunStatus =
  | 'pending'
  | 'running_tests'
  | 'quality_audit'
  | 'adversarial'
  | 'owasp'
  | 'off_limits'
  | 'reporting'
  | 'handoff'
  | 'completed'
  | 'failed'

export type FindingSeverity = 'high' | 'medium' | 'low'

export type FindingCategory =
  | 'test-failure'
  | 'implementation-test'
  | 'adversarial'
  | 'owasp'
  | 'off-limits'
  | 'setup-error'

export interface TestingRun {
  id: string
  cyberFactoryRunId: string | null
  welleId: string | null
  status: TestingRunStatus
  startedAt: number
  finishedAt: number | null
  projectPath: string
  workspaceId: string | null
  testCommand: string | null
}

export interface Finding {
  id: string
  runId: string
  severity: FindingSeverity
  category: FindingCategory
  filePath: string | null
  lineNumber: number | null
  description: string
  reproduction: string | null
  suggestion: string | null
}

export interface TestSuiteResult {
  runId: string
  total: number
  passed: number
  failed: number
  rawOutput: string
}

export interface TestQualityReport {
  runId: string
  behavioralCount: number
  implementationCount: number
  problematicTests: string[]
}

export interface TestingAssistantConfig {
  enabled: boolean
  adversarialDepth: 'shallow' | 'standard' | 'deep'
  owaspChecks: boolean
  offLimitsAudit: boolean
  testQualityAudit: boolean
  autoHandoffOnSeverityHigh: boolean
}

export const TESTING_ASSISTANT_DEFAULTS: Readonly<TestingAssistantConfig> = Object.freeze({
  enabled: false,
  adversarialDepth: 'standard',
  owaspChecks: true,
  offLimitsAudit: true,
  testQualityAudit: true,
  autoHandoffOnSeverityHigh: true,
})
```

- [ ] **Step 2: Write the test**

```typescript
// test/main/testing-assistant/types.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TESTING_ASSISTANT_DEFAULTS } from '../../../src/main/testing-assistant/types'

describe('testing-assistant/types', () => {
  it('TESTING_ASSISTANT_DEFAULTS has all required fields', () => {
    assert.equal(TESTING_ASSISTANT_DEFAULTS.enabled, false)
    assert.equal(TESTING_ASSISTANT_DEFAULTS.adversarialDepth, 'standard')
    assert.equal(TESTING_ASSISTANT_DEFAULTS.owaspChecks, true)
    assert.equal(TESTING_ASSISTANT_DEFAULTS.autoHandoffOnSeverityHigh, true)
  })

  it('defaults are frozen', () => {
    assert.throws(() => {
      ;(TESTING_ASSISTANT_DEFAULTS as any).enabled = true
    })
  })
})
```

- [ ] **Step 3: Run test**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/testing-assistant/types.test.ts`
Expected: PASS

- [ ] **Step 4: Add to AppConfig in shared/types.ts**

After line ~290 (after `debugger?`), add:
```typescript
  /** Testing Assistant module configuration. */
  testing_assistant?: import('../main/testing-assistant/types').TestingAssistantConfig
```

- [ ] **Step 5: Add defaults in config-store.ts**

In the defaults object, add:
```typescript
  testing_assistant: {
    enabled: false,
    adversarialDepth: 'standard' as const,
    owaspChecks: true,
    offLimitsAudit: true,
    testQualityAudit: true,
    autoHandoffOnSeverityHigh: true,
  },
```

- [ ] **Step 6: Add experimental flag**

In `experimental?` section of AppConfig:
```typescript
    /** Enable Testing Assistant (replaces watchdog). */
    testing_assistant?: boolean
```

- [ ] **Step 7: Commit**

```bash
git add src/main/testing-assistant/types.ts test/main/testing-assistant/types.test.ts src/shared/types.ts src/main/config/config-store.ts
git commit -m "feat(welle-4): testing assistant types + config defaults"
```

---

## Task 2: Testing Assistant — DB Schema + Manager

**Files:**
- Modify: `src/main/companion/schema.ts` (add testing tables)
- Create: `src/main/testing-assistant/testing-assistant-manager.ts`
- Test: `test/main/testing-assistant/testing-assistant-manager.test.ts`

- [ ] **Step 1: Add testing tables to schema.ts**

Append to `COMPANION_SCHEMA_SQL` (before the closing backtick):
```sql
  CREATE TABLE IF NOT EXISTS testing_runs (
    id TEXT PRIMARY KEY,
    cyber_factory_run_id TEXT,
    welle_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    project_path TEXT NOT NULL,
    workspace_id TEXT,
    test_command TEXT
  );

  CREATE TABLE IF NOT EXISTS testing_findings (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES testing_runs(id),
    severity TEXT NOT NULL DEFAULT 'medium',
    category TEXT NOT NULL,
    file_path TEXT,
    line_number INTEGER,
    description TEXT NOT NULL,
    reproduction TEXT,
    suggestion TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_testing_findings_run ON testing_findings(run_id);
  CREATE INDEX IF NOT EXISTS idx_testing_findings_severity ON testing_findings(severity);

  CREATE TABLE IF NOT EXISTS testing_suite_results (
    run_id TEXT PRIMARY KEY REFERENCES testing_runs(id),
    total INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    raw_output TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS testing_quality_reports (
    run_id TEXT PRIMARY KEY REFERENCES testing_runs(id),
    behavioral_count INTEGER NOT NULL DEFAULT 0,
    implementation_count INTEGER NOT NULL DEFAULT 0,
    problematic_tests TEXT NOT NULL DEFAULT '[]'
  );
```

- [ ] **Step 2: Write testing-assistant-manager.ts**

```typescript
// src/main/testing-assistant/testing-assistant-manager.ts
import Database from 'better-sqlite3'
import { ulid } from 'ulidx'
import type {
  TestingRun, Finding, TestSuiteResult, TestQualityReport,
  TestingRunStatus, FindingSeverity, FindingCategory,
} from './types'

export class TestingAssistantManager {
  private db: Database.Database
  private stmtInsertRun: Database.Statement
  private stmtInsertFinding: Database.Statement
  private stmtInsertSuiteResult: Database.Statement
  private stmtInsertQualityReport: Database.Statement
  private stmtUpdateRunStatus: Database.Statement
  private stmtGetRun: Database.Statement
  private stmtListFindings: Database.Statement

  constructor(db: Database.Database) {
    this.db = db

    this.stmtInsertRun = db.prepare(
      `INSERT INTO testing_runs (id, cyber_factory_run_id, welle_id, status, started_at, project_path, workspace_id, test_command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtInsertFinding = db.prepare(
      `INSERT INTO testing_findings (id, run_id, severity, category, file_path, line_number, description, reproduction, suggestion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtInsertSuiteResult = db.prepare(
      `INSERT OR REPLACE INTO testing_suite_results (run_id, total, passed, failed, raw_output)
       VALUES (?, ?, ?, ?, ?)`
    )
    this.stmtInsertQualityReport = db.prepare(
      `INSERT OR REPLACE INTO testing_quality_reports (run_id, behavioral_count, implementation_count, problematic_tests)
       VALUES (?, ?, ?, ?)`
    )
    this.stmtUpdateRunStatus = db.prepare(
      `UPDATE testing_runs SET status = ?, finished_at = ? WHERE id = ?`
    )
    this.stmtGetRun = db.prepare(`SELECT * FROM testing_runs WHERE id = ?`)
    this.stmtListFindings = db.prepare(`SELECT * FROM testing_findings WHERE run_id = ? ORDER BY severity ASC`)
  }

  createRun(opts: {
    projectPath: string
    cyberFactoryRunId?: string
    welleId?: string
    workspaceId?: string
    testCommand?: string
  }): TestingRun {
    const id = `trun-${ulid()}`
    const now = Date.now()
    this.stmtInsertRun.run(
      id, opts.cyberFactoryRunId ?? null, opts.welleId ?? null,
      'pending', now, opts.projectPath, opts.workspaceId ?? null, opts.testCommand ?? null
    )
    return {
      id, cyberFactoryRunId: opts.cyberFactoryRunId ?? null,
      welleId: opts.welleId ?? null, status: 'pending',
      startedAt: now, finishedAt: null, projectPath: opts.projectPath,
      workspaceId: opts.workspaceId ?? null, testCommand: opts.testCommand ?? null,
    }
  }

  getRun(id: string): TestingRun | null {
    const row = this.stmtGetRun.get(id) as any
    if (!row) return null
    return {
      id: row.id, cyberFactoryRunId: row.cyber_factory_run_id,
      welleId: row.welle_id, status: row.status as TestingRunStatus,
      startedAt: row.started_at, finishedAt: row.finished_at,
      projectPath: row.project_path, workspaceId: row.workspace_id,
      testCommand: row.test_command,
    }
  }

  updateStatus(id: string, status: TestingRunStatus): void {
    const finishedAt = (status === 'completed' || status === 'failed') ? Date.now() : null
    this.stmtUpdateRunStatus.run(status, finishedAt, id)
  }

  addFinding(opts: {
    runId: string
    severity: FindingSeverity
    category: FindingCategory
    description: string
    filePath?: string
    lineNumber?: number
    reproduction?: string
    suggestion?: string
  }): Finding {
    const id = `tfnd-${ulid()}`
    this.stmtInsertFinding.run(
      id, opts.runId, opts.severity, opts.category,
      opts.filePath ?? null, opts.lineNumber ?? null,
      opts.description, opts.reproduction ?? null, opts.suggestion ?? null
    )
    return {
      id, runId: opts.runId, severity: opts.severity, category: opts.category,
      filePath: opts.filePath ?? null, lineNumber: opts.lineNumber ?? null,
      description: opts.description, reproduction: opts.reproduction ?? null,
      suggestion: opts.suggestion ?? null,
    }
  }

  listFindings(runId: string): Finding[] {
    const rows = this.stmtListFindings.all(runId) as any[]
    return rows.map(r => ({
      id: r.id, runId: r.run_id, severity: r.severity as FindingSeverity,
      category: r.category as FindingCategory, filePath: r.file_path,
      lineNumber: r.line_number, description: r.description,
      reproduction: r.reproduction, suggestion: r.suggestion,
    }))
  }

  saveSuiteResult(result: TestSuiteResult): void {
    this.stmtInsertSuiteResult.run(
      result.runId, result.total, result.passed, result.failed, result.rawOutput
    )
  }

  saveQualityReport(report: TestQualityReport): void {
    this.stmtInsertQualityReport.run(
      report.runId, report.behavioralCount, report.implementationCount,
      JSON.stringify(report.problematicTests)
    )
  }
}
```

- [ ] **Step 3: Write test**

```typescript
// test/main/testing-assistant/testing-assistant-manager.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'
import { TestingAssistantManager } from '../../../src/main/testing-assistant/testing-assistant-manager'

describe('TestingAssistantManager', () => {
  let db: Database.Database
  let manager: TestingAssistantManager

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
    manager = new TestingAssistantManager(db)
  })

  it('creates a run with generated ID', () => {
    const run = manager.createRun({ projectPath: '/tmp/test-project' })
    assert.ok(run.id.startsWith('trun-'))
    assert.equal(run.status, 'pending')
    assert.equal(run.projectPath, '/tmp/test-project')
  })

  it('getRun returns null for unknown ID', () => {
    assert.equal(manager.getRun('nonexistent'), null)
  })

  it('getRun returns created run', () => {
    const created = manager.createRun({ projectPath: '/tmp/p', workspaceId: 'ws-1' })
    const fetched = manager.getRun(created.id)
    assert.equal(fetched!.id, created.id)
    assert.equal(fetched!.workspaceId, 'ws-1')
  })

  it('updateStatus sets finished_at on completed', () => {
    const run = manager.createRun({ projectPath: '/tmp/p' })
    manager.updateStatus(run.id, 'completed')
    const fetched = manager.getRun(run.id)
    assert.equal(fetched!.status, 'completed')
    assert.ok(fetched!.finishedAt !== null)
  })

  it('addFinding creates finding with prefixed ID', () => {
    const run = manager.createRun({ projectPath: '/tmp/p' })
    const finding = manager.addFinding({
      runId: run.id, severity: 'high', category: 'owasp',
      description: 'SQL Injection in userSearch',
      filePath: 'src/controllers/user.ts', lineNumber: 42,
    })
    assert.ok(finding.id.startsWith('tfnd-'))
    assert.equal(finding.severity, 'high')
  })

  it('listFindings returns sorted by severity', () => {
    const run = manager.createRun({ projectPath: '/tmp/p' })
    manager.addFinding({ runId: run.id, severity: 'low', category: 'test-failure', description: 'Minor' })
    manager.addFinding({ runId: run.id, severity: 'high', category: 'owasp', description: 'Critical' })
    const findings = manager.listFindings(run.id)
    assert.equal(findings.length, 2)
    assert.equal(findings[0].severity, 'high')
  })

  it('saveSuiteResult persists test counts', () => {
    const run = manager.createRun({ projectPath: '/tmp/p' })
    manager.saveSuiteResult({ runId: run.id, total: 100, passed: 95, failed: 5, rawOutput: '...' })
    const row = db.prepare('SELECT * FROM testing_suite_results WHERE run_id = ?').get(run.id) as any
    assert.equal(row.total, 100)
    assert.equal(row.failed, 5)
  })
})
```

- [ ] **Step 4: Run test**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/testing-assistant/testing-assistant-manager.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/companion/schema.ts src/main/testing-assistant/testing-assistant-manager.ts test/main/testing-assistant/testing-assistant-manager.test.ts
git commit -m "feat(welle-4): testing assistant manager + DB schema"
```

---

## Task 3: Testing Assistant — Test Runner + Quality Audit

**Files:**
- Create: `src/main/testing-assistant/test-runner.ts`
- Create: `src/main/testing-assistant/test-quality-audit.ts`
- Test: `test/main/testing-assistant/test-runner.test.ts`
- Test: `test/main/testing-assistant/test-quality-audit.test.ts`

- [ ] **Step 1: Write test-runner.ts**

```typescript
// src/main/testing-assistant/test-runner.ts
import { execFileSync } from 'child_process'
import type { TestSuiteResult } from './types'

export interface TestRunnerOpts {
  projectPath: string
  testCommand: string
  timeoutMs?: number
}

export interface TestRunnerResult {
  success: boolean
  suiteResult: TestSuiteResult | null
  error: string | null
}

/**
 * Parse common test runner output formats (Vitest, Jest, node:test).
 * Returns total/passed/failed counts.
 */
export function parseTestOutput(raw: string): { total: number; passed: number; failed: number } {
  // Vitest/Jest: "Tests  X passed | Y failed | Z total"
  const vitestMatch = raw.match(/Tests\s+(\d+)\s+passed\s*\|\s*(\d+)\s+failed\s*\|\s*(\d+)\s+total/i)
  if (vitestMatch) {
    return { passed: parseInt(vitestMatch[1]), failed: parseInt(vitestMatch[2]), total: parseInt(vitestMatch[3]) }
  }

  // node:test: "# tests N" + "# pass N" + "# fail N"
  const nodeTotal = raw.match(/# tests\s+(\d+)/)?.[1]
  const nodePass = raw.match(/# pass\s+(\d+)/)?.[1]
  const nodeFail = raw.match(/# fail\s+(\d+)/)?.[1]
  if (nodeTotal) {
    const total = parseInt(nodeTotal)
    const passed = nodePass ? parseInt(nodePass) : 0
    const failed = nodeFail ? parseInt(nodeFail) : 0
    return { total, passed, failed }
  }

  // Jest alternative: "Tests: X passed, Y failed, Z total"
  const jestMatch = raw.match(/Tests:\s+(\d+)\s+passed,?\s*(\d+)?\s*failed?,?\s*(\d+)\s+total/i)
  if (jestMatch) {
    return { passed: parseInt(jestMatch[1]), failed: parseInt(jestMatch[2] || '0'), total: parseInt(jestMatch[3]) }
  }

  // Fallback: count "pass" and "fail" lines
  const passLines = (raw.match(/\u2713|pass|ok \d/gi) || []).length
  const failLines = (raw.match(/\u2717|fail|not ok \d/gi) || []).length
  return { total: passLines + failLines, passed: passLines, failed: failLines }
}

/**
 * Execute the test suite for a project.
 * Uses execFileSync with shell:true for the test command (from CLAUDE.md config, not user input).
 */
export function runTestSuite(opts: TestRunnerOpts, runId: string): TestRunnerResult {
  const timeout = opts.timeoutMs ?? 120_000
  // Split command for execFileSync — use shell since test commands may include pipes/flags
  const shell = process.platform === 'win32' ? 'cmd' : '/bin/sh'
  const shellArgs = process.platform === 'win32' ? ['/c', opts.testCommand] : ['-c', opts.testCommand]

  try {
    const raw = execFileSync(shell, shellArgs, {
      cwd: opts.projectPath,
      timeout,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    })
    const counts = parseTestOutput(raw)
    return {
      success: counts.failed === 0,
      suiteResult: { runId, ...counts, rawOutput: raw.slice(0, 50_000) },
      error: null,
    }
  } catch (err: any) {
    const raw = (err.stdout || '') + '\n' + (err.stderr || '')
    const counts = parseTestOutput(raw)
    if (counts.total > 0) {
      return {
        success: false,
        suiteResult: { runId, ...counts, rawOutput: raw.slice(0, 50_000) },
        error: null,
      }
    }
    return { success: false, suiteResult: null, error: raw.slice(0, 5000) || err.message }
  }
}
```

- [ ] **Step 2: Write test-quality-audit.ts**

```typescript
// src/main/testing-assistant/test-quality-audit.ts
import * as fs from 'fs'
import * as path from 'path'
import type { TestQualityReport } from './types'

/** Heuristic patterns that suggest implementation-detail tests. */
const IMPLEMENTATION_PATTERNS = [
  /\.toHaveBeenCalled/,
  /\.toHaveBeenCalledWith/,
  /mock\.(calls|results|instances)/i,
  /jest\.spyOn|vi\.spyOn|sinon\.spy/,
  /expect\(.*\.mock\./,
  /renders\s+(a|the|correctly)/i,
  /calls\s+(the|a)\s+\w+\s+(method|function)/i,
  /invokes\s+/i,
]

/** Heuristic patterns that suggest behavioral tests. */
const BEHAVIORAL_PATTERNS = [
  /should\s+(return|throw|reject|resolve|produce|output|emit)/i,
  /returns?\s+(the|a|an|correct|expected)/i,
  /throws?\s+(when|if|on|for)/i,
  /given\s+.*when\s+.*then/i,
  /assert\.(equal|deepEqual|ok|throws|rejects)/,
  /expect\(result\)/,
]

export interface QualityAuditOpts {
  projectPath: string
  testGlob?: string
}

/**
 * Analyze test files for behavioral vs implementation test ratio.
 */
export function auditTestQuality(opts: QualityAuditOpts, runId: string): TestQualityReport {
  const testDir = findTestDir(opts.projectPath)
  if (!testDir) {
    return { runId, behavioralCount: 0, implementationCount: 0, problematicTests: [] }
  }

  const files = collectTestFiles(testDir)
  let behavioralCount = 0
  let implementationCount = 0
  const problematicTests: string[] = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const relPath = path.relative(opts.projectPath, file)

    const implScore = IMPLEMENTATION_PATTERNS.reduce(
      (score, p) => score + (p.test(content) ? 1 : 0), 0
    )
    const behavScore = BEHAVIORAL_PATTERNS.reduce(
      (score, p) => score + (p.test(content) ? 1 : 0), 0
    )

    if (implScore > behavScore && implScore >= 3) {
      implementationCount++
      problematicTests.push(relPath)
    } else {
      behavioralCount++
    }
  }

  return { runId, behavioralCount, implementationCount, problematicTests }
}

function findTestDir(projectPath: string): string | null {
  for (const candidate of ['test', 'tests', '__tests__', 'spec']) {
    const dir = path.join(projectPath, candidate)
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir
  }
  return null
}

function collectTestFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...collectTestFiles(full))
    } else if (entry.isFile() && /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}
```

- [ ] **Step 3: Write test-runner test**

```typescript
// test/main/testing-assistant/test-runner.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseTestOutput } from '../../../src/main/testing-assistant/test-runner'

describe('test-runner/parseTestOutput', () => {
  it('parses node:test format', () => {
    const raw = '# tests 42\n# pass 40\n# fail 2\n# duration_ms 1234'
    const result = parseTestOutput(raw)
    assert.equal(result.total, 42)
    assert.equal(result.passed, 40)
    assert.equal(result.failed, 2)
  })

  it('parses Vitest format', () => {
    const raw = 'Tests  95 passed | 3 failed | 98 total'
    const result = parseTestOutput(raw)
    assert.equal(result.total, 98)
    assert.equal(result.passed, 95)
    assert.equal(result.failed, 3)
  })

  it('returns zeros for unrecognized format', () => {
    const result = parseTestOutput('no test info here')
    assert.equal(result.total, 0)
    assert.equal(result.passed, 0)
    assert.equal(result.failed, 0)
  })
})
```

- [ ] **Step 4: Write test-quality-audit test**

```typescript
// test/main/testing-assistant/test-quality-audit.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { auditTestQuality } from '../../../src/main/testing-assistant/test-quality-audit'

describe('test-quality-audit', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tqa-'))
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('classifies behavioral test correctly', () => {
    fs.writeFileSync(path.join(tmpDir, 'test', 'math.test.ts'),
      `describe('add', () => {
        it('returns the sum of two numbers', () => {
          assert.equal(add(1, 2), 3)
          assert.equal(add(-1, 1), 0)
        })
      })`)
    const report = auditTestQuality({ projectPath: tmpDir }, 'run-1')
    assert.equal(report.behavioralCount, 1)
    assert.equal(report.implementationCount, 0)
  })

  it('classifies mock-heavy test as implementation', () => {
    fs.writeFileSync(path.join(tmpDir, 'test', 'service.test.ts'),
      `describe('UserService', () => {
        it('calls the repository method', () => {
          const spy = jest.spyOn(repo, 'findById')
          service.getUser(1)
          expect(spy).toHaveBeenCalledWith(1)
          expect(spy.mock.calls.length).toBe(1)
          expect(spy.mock.results[0]).toBeDefined()
        })
      })`)
    const report = auditTestQuality({ projectPath: tmpDir }, 'run-1')
    assert.equal(report.implementationCount, 1)
    assert.ok(report.problematicTests.length > 0)
  })

  it('returns zeros when no test dir exists', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tqa-empty-'))
    const report = auditTestQuality({ projectPath: emptyDir }, 'run-1')
    assert.equal(report.behavioralCount, 0)
    assert.equal(report.implementationCount, 0)
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/testing-assistant/test-runner.test.ts test/main/testing-assistant/test-quality-audit.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/testing-assistant/test-runner.ts src/main/testing-assistant/test-quality-audit.ts test/main/testing-assistant/test-runner.test.ts test/main/testing-assistant/test-quality-audit.test.ts
git commit -m "feat(welle-4): test runner + quality audit modules"
```

---

## Task 4: Testing Assistant — Adversarial Prober + OWASP + Off-Limits

**Files:**
- Create: `src/main/testing-assistant/adversarial-prober.ts`
- Create: `src/main/testing-assistant/owasp-spotcheck.ts`
- Create: `src/main/testing-assistant/off-limits-audit.ts`
- Test: `test/main/testing-assistant/adversarial-prober.test.ts`

- [ ] **Step 1: Write adversarial-prober.ts**

```typescript
// src/main/testing-assistant/adversarial-prober.ts
import type { FindingSeverity } from './types'

export type AdversarialDepth = 'shallow' | 'standard' | 'deep'

export interface ProbeSpec {
  category: string
  description: string
  inputExample: string
}

/** Edge case categories by depth level. */
const PROBE_CATEGORIES: Record<AdversarialDepth, string[]> = {
  shallow: ['empty-input', 'boundary-conditions'],
  standard: ['empty-input', 'large-input', 'unicode', 'boundary-conditions', 'unauthorized-access'],
  deep: ['empty-input', 'large-input', 'unicode', 'race-conditions', 'boundary-conditions', 'unauthorized-access', 'auth-bypass'],
}

const PROBE_TEMPLATES: Record<string, ProbeSpec[]> = {
  'empty-input': [
    { category: 'empty-input', description: 'Empty string input', inputExample: '""' },
    { category: 'empty-input', description: 'Null/undefined input', inputExample: 'null' },
    { category: 'empty-input', description: 'Empty array input', inputExample: '[]' },
  ],
  'large-input': [
    { category: 'large-input', description: 'String 10x typical size', inputExample: '"A".repeat(100000)' },
    { category: 'large-input', description: 'Array with 10000 items', inputExample: 'Array(10000).fill(0)' },
  ],
  'unicode': [
    { category: 'unicode', description: 'Emoji in string fields', inputExample: '"Hello world"' },
    { category: 'unicode', description: 'RTL text', inputExample: 'Arabic/Hebrew text' },
    { category: 'unicode', description: 'Zero-width chars', inputExample: '"hell\\u200Bo"' },
  ],
  'boundary-conditions': [
    { category: 'boundary-conditions', description: 'Integer overflow (MAX_SAFE_INTEGER)', inputExample: 'Number.MAX_SAFE_INTEGER + 1' },
    { category: 'boundary-conditions', description: 'Negative index', inputExample: '-1' },
    { category: 'boundary-conditions', description: 'Zero value', inputExample: '0' },
  ],
  'race-conditions': [
    { category: 'race-conditions', description: 'Two concurrent requests to same resource', inputExample: 'Promise.all([req1(), req2()])' },
  ],
  'unauthorized-access': [
    { category: 'unauthorized-access', description: 'No auth token', inputExample: 'headers: {}' },
    { category: 'unauthorized-access', description: 'Expired token', inputExample: 'headers: { Authorization: "Bearer expired" }' },
  ],
  'auth-bypass': [
    { category: 'auth-bypass', description: 'Direct URL access to admin endpoint', inputExample: 'GET /api/admin/users (no auth)' },
  ],
}

/**
 * Generate adversarial probe specifications based on depth.
 * These specs describe WHAT to test — actual execution is done by the entity session.
 */
export function generateProbeSpecs(depth: AdversarialDepth): ProbeSpec[] {
  const categories = PROBE_CATEGORIES[depth]
  const specs: ProbeSpec[] = []
  for (const cat of categories) {
    specs.push(...(PROBE_TEMPLATES[cat] || []))
  }
  return specs
}

/**
 * Count probe specs for a given depth — useful for reporting.
 */
export function probeCount(depth: AdversarialDepth): number {
  return generateProbeSpecs(depth).length
}
```

- [ ] **Step 2: Write owasp-spotcheck.ts**

```typescript
// src/main/testing-assistant/owasp-spotcheck.ts
import * as fs from 'fs'
import * as path from 'path'
import type { FindingSeverity } from './types'

export interface OwaspFinding {
  rule: string
  severity: FindingSeverity
  filePath: string
  lineNumber: number
  description: string
}

/** Patterns that indicate potential OWASP vulnerabilities. */
const OWASP_RULES: Array<{
  id: string
  pattern: RegExp
  severity: FindingSeverity
  description: string
}> = [
  { id: 'SQL-INJ', pattern: /`[^`]*\$\{[^}]+\}[^`]*`.*(?:query|exec|prepare|raw)/i, severity: 'high', description: 'Possible SQL injection — string interpolation in query' },
  { id: 'SQL-INJ-CONCAT', pattern: /(?:query|exec|execute)\s*\(\s*['"][^'"]*['"]\s*\+/i, severity: 'high', description: 'Possible SQL injection — string concatenation in query' },
  { id: 'HARDCODED-SECRET', pattern: /(?:password|secret|apikey|api_key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, severity: 'high', description: 'Hardcoded secret or credential' },
  { id: 'XSS-INNERHTML', pattern: /innerHTML\s*=|dangerouslySetInnerHTML|v-html/i, severity: 'medium', description: 'Potential XSS — unescaped HTML insertion' },
  { id: 'EVAL', pattern: /\beval\s*\(|new\s+Function\s*\(/i, severity: 'medium', description: 'Use of eval or Function constructor' },
]

/**
 * Scan project files for OWASP vulnerability patterns.
 */
export function runOwaspSpotcheck(projectPath: string): OwaspFinding[] {
  const findings: OwaspFinding[] = []
  const files = collectSourceFiles(projectPath)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    const relPath = path.relative(projectPath, file)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue

      for (const rule of OWASP_RULES) {
        if (rule.pattern.test(line)) {
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            filePath: relPath,
            lineNumber: i + 1,
            description: rule.description,
          })
        }
      }
    }
  }

  return findings
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = []
  const skip = new Set(['node_modules', 'dist', '.git', 'coverage', 'build'])

  function walk(d: string) {
    if (!fs.existsSync(d)) return
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const entry of entries) {
      if (skip.has(entry.name)) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|js|tsx|jsx|mjs|cjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        results.push(full)
      }
    }
  }

  walk(dir)
  return results
}
```

- [ ] **Step 3: Write off-limits-audit.ts**

```typescript
// src/main/testing-assistant/off-limits-audit.ts
import type { FindingSeverity } from './types'

export interface OffLimitsViolation {
  filePath: string
  offLimitsPath: string
  severity: FindingSeverity
  description: string
}

/**
 * Check a list of changed file paths against the off-limits list.
 * Off-limits paths come from project CLAUDE.md or Memory (kind=off_limit).
 */
export function checkOffLimits(
  changedFiles: string[],
  offLimitsPaths: string[]
): OffLimitsViolation[] {
  if (offLimitsPaths.length === 0 || changedFiles.length === 0) return []

  const violations: OffLimitsViolation[] = []

  for (const file of changedFiles) {
    for (const offLimit of offLimitsPaths) {
      if (file.startsWith(offLimit) || file === offLimit) {
        violations.push({
          filePath: file,
          offLimitsPath: offLimit,
          severity: 'high',
          description: `File ${file} is in off-limits area: ${offLimit}`,
        })
      }
    }
  }

  return violations
}
```

- [ ] **Step 4: Write adversarial-prober test**

```typescript
// test/main/testing-assistant/adversarial-prober.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateProbeSpecs, probeCount } from '../../../src/main/testing-assistant/adversarial-prober'

describe('adversarial-prober', () => {
  it('shallow depth produces at least 2 categories', () => {
    const specs = generateProbeSpecs('shallow')
    assert.ok(specs.length >= 4)
    const cats = new Set(specs.map(s => s.category))
    assert.ok(cats.has('empty-input'))
    assert.ok(cats.has('boundary-conditions'))
  })

  it('standard depth includes unicode + unauthorized', () => {
    const specs = generateProbeSpecs('standard')
    const cats = new Set(specs.map(s => s.category))
    assert.ok(cats.has('unicode'))
    assert.ok(cats.has('unauthorized-access'))
  })

  it('deep depth includes race-conditions + auth-bypass', () => {
    const specs = generateProbeSpecs('deep')
    const cats = new Set(specs.map(s => s.category))
    assert.ok(cats.has('race-conditions'))
    assert.ok(cats.has('auth-bypass'))
  })

  it('probeCount matches specs length', () => {
    assert.equal(probeCount('standard'), generateProbeSpecs('standard').length)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/testing-assistant/adversarial-prober.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/testing-assistant/adversarial-prober.ts src/main/testing-assistant/owasp-spotcheck.ts src/main/testing-assistant/off-limits-audit.ts test/main/testing-assistant/adversarial-prober.test.ts
git commit -m "feat(welle-4): adversarial prober + OWASP spotcheck + off-limits audit"
```

---

## Task 5: Testing Assistant — Findings Reporter + Handoff + Template

**Files:**
- Create: `src/main/testing-assistant/findings-reporter.ts`
- Create: `src/main/testing-assistant/handoff-debugger.ts`
- Create: `src/main/testing-assistant/testing-template.ts`
- Test: `test/main/testing-assistant/findings-reporter.test.ts`
- Test: `test/main/testing-assistant/handoff-debugger.test.ts`

- [ ] **Step 1: Write findings-reporter.ts**

```typescript
// src/main/testing-assistant/findings-reporter.ts
import type { Finding, TestSuiteResult, TestQualityReport } from './types'
import type { OwaspFinding } from './owasp-spotcheck'
import type { OffLimitsViolation } from './off-limits-audit'

export interface ReportData {
  runId: string
  welleId: string | null
  timestamp: string
  suiteResult: TestSuiteResult | null
  qualityReport: TestQualityReport | null
  findings: Finding[]
  owaspFindings: OwaspFinding[]
  offLimitsViolations: OffLimitsViolation[]
}

/**
 * Generate a structured Markdown findings report.
 */
export function generateFindingsReport(data: ReportData): string {
  const { runId, welleId, timestamp, suiteResult, qualityReport, findings } = data

  const highCount = findings.filter(f => f.severity === 'high').length
  const mediumCount = findings.filter(f => f.severity === 'medium').length
  const lowCount = findings.filter(f => f.severity === 'low').length
  const status = findings.length === 0 ? 'sauber' : 'Findings vorhanden'

  let md = `# Testing-Run-Report — ${runId}\n\n`
  md += `**Welle:** ${welleId || 'n/a'}\n`
  md += `**Datum:** ${timestamp}\n`
  md += `**Status:** ${status}\n\n`

  md += `## Test-Suite\n\n`
  if (suiteResult) {
    md += `- ${suiteResult.total} Tests, ${suiteResult.passed} passed, ${suiteResult.failed} failed\n\n`
  } else {
    md += `- Test-Suite konnte nicht ausgefuehrt werden\n\n`
  }

  md += `## Test-Qualitaet\n\n`
  if (qualityReport) {
    const total = qualityReport.behavioralCount + qualityReport.implementationCount
    const pct = total > 0 ? Math.round((qualityReport.behavioralCount / total) * 100) : 0
    md += `- ${pct}% Behavioral, ${100 - pct}% Implementations-Verdacht\n`
    if (qualityReport.problematicTests.length > 0) {
      md += `- Problematische Tests: ${qualityReport.problematicTests.join(', ')}\n`
    }
    md += '\n'
  } else {
    md += `- Kein Quality-Audit durchgefuehrt\n\n`
  }

  md += `## Findings (sortiert nach Severity)\n\n`
  if (highCount > 0) {
    md += `### Hoch (${highCount})\n\n`
    for (const f of findings.filter(f => f.severity === 'high')) {
      md += `- **${f.id}:** ${f.description}\n`
      if (f.reproduction) md += `  - Reproduktion: ${f.reproduction}\n`
      if (f.suggestion) md += `  - Vorschlag: ${f.suggestion}\n`
    }
    md += '\n'
  }
  if (mediumCount > 0) {
    md += `### Mittel (${mediumCount})\n\n`
    for (const f of findings.filter(f => f.severity === 'medium')) {
      md += `- **${f.id}:** ${f.description}\n`
    }
    md += '\n'
  }
  if (lowCount > 0) {
    md += `### Niedrig (${lowCount})\n\n`
    for (const f of findings.filter(f => f.severity === 'low')) {
      md += `- **${f.id}:** ${f.description}\n`
    }
    md += '\n'
  }
  if (findings.length === 0) {
    md += `Keine Findings.\n\n`
  }

  md += `## Off-Limits\n\n`
  if (data.offLimitsViolations.length === 0) {
    md += `- Keine Verletzungen\n`
  } else {
    for (const v of data.offLimitsViolations) {
      md += `- ${v.filePath} verletzt off-limits: ${v.offLimitsPath}\n`
    }
  }

  return md
}
```

- [ ] **Step 2: Write handoff-debugger.ts**

```typescript
// src/main/testing-assistant/handoff-debugger.ts
import type { Finding } from './types'

export type HandoffDecision = 'debugger' | 'audit' | 'optional-debugger'

/**
 * Determine handoff target based on findings severity.
 * - Severity-Hoch OR >5 Mittel -> Debugger
 * - Mittel <=5, nothing Hoch -> Optional Debugger or Audit
 * - Clean -> Audit
 */
export function decideHandoff(findings: Finding[]): HandoffDecision {
  const highCount = findings.filter(f => f.severity === 'high').length
  const mediumCount = findings.filter(f => f.severity === 'medium').length

  if (highCount > 0 || mediumCount > 5) return 'debugger'
  if (mediumCount > 0) return 'optional-debugger'
  return 'audit'
}

/**
 * Build a structured handoff payload for the debugger.
 */
export function buildDebuggerHandoff(findings: Finding[], runId: string): {
  runId: string
  findings: Array<{
    symptom: string
    severity: string
    reproduction: string | null
    affectedAreas: string[]
    source: 'testing-assistant'
  }>
} {
  const highAndMedium = findings.filter(f => f.severity === 'high' || f.severity === 'medium')
  return {
    runId,
    findings: highAndMedium.map(f => ({
      symptom: f.description,
      severity: f.severity,
      reproduction: f.reproduction,
      affectedAreas: f.filePath ? [f.filePath] : [],
      source: 'testing-assistant' as const,
    })),
  }
}
```

- [ ] **Step 3: Write testing-template.ts**

```typescript
// src/main/testing-assistant/testing-template.ts

/**
 * Generate the CLAUDE.md for the testing-assistant entity directory.
 * Deployed to ~/.config/cipher-mux/entities/testing-assistant/CLAUDE.md
 */
export function generateTestingAssistantClaudeMd(): string {
  return `# Testing Assistant — Entity CLAUDE.md

Du bist der **Testing Assistant** in cipher-mux. Deine Rolle: Test/QA-Phase zwischen Build (Cyber Factory) und Bugfix (Debugger).

## Zwei Hauptachsen

1. **Spec-Conformance-Checking** — REQ-ID-Pruefung, Code-Pointer-Nachweis, Drift-Erkennung
2. **Adversarial Probing** — Edge Cases, Race Conditions, OWASP-Spotcheck

## Lifecycle (7 Phasen)

1. **Test-Suite laufen lassen** — Befehle aus CLAUDE.md. Strukturiertes Resultat: total/passed/failed
2. **Test-Qualitaets-Audit** — Verhaltens- vs. Implementations-Tests, Problematische markieren
3. **Adversarial Probing** — Edge Cases testen (leer, gross, Unicode, Race, Boundary, Auth)
4. **OWASP-Spotcheck** — SQL Injection, XSS, Hardcoded Secrets, Slopsquatting
5. **Off-Limits-Audit** — Diff gegen Off-Limits-Liste pruefen
6. **Findings-Report konsolidieren** — Markdown-Report mit allen Sektionen
7. **Uebergabe** — Debugger (bei Hoch/viele Mittel) oder Audit (bei sauber)

## Persona-Akzent

Skeptisch, gruendlich. "Lass uns das mal kaputt machen." Findings sachlich, keine Schuldzuweisungen.

## MCP-Tools (verfuegbar)

- \`mux_testing_run_start\` — Run starten
- \`mux_testing_findings_handoff_debugger\` — Strukturierter Debugger-Handoff
- \`mux_testing_run_complete\` — Run abschliessen, Audit-Empfehlung
- \`mux_create_session\` — parallele Adversarial-Sessions bei Bedarf
- \`mux_notes_create\` — Findings-Reports als Notes speichern
- \`mux_input_request_create\` — User-Eskalation bei kritischen Findings
- \`mux_companion_memory_recall\` — bekannte Fehler-Muster aus frueheren Runs

## Abgrenzung

- Du **laesst Tests laufen**, fixst sie aber NICHT
- Du **findest** Bugs, fixst sie aber NICHT (Debugger)
- Du **pruefst** Sicherheit leicht (Spotcheck), nicht vollstaendig (Audit)
- Du **dokumentierst** alles strukturiert in Findings-Reports
`
}
```

- [ ] **Step 4: Write tests**

```typescript
// test/main/testing-assistant/findings-reporter.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateFindingsReport } from '../../../src/main/testing-assistant/findings-reporter'

describe('findings-reporter', () => {
  it('generates report with all sections', () => {
    const report = generateFindingsReport({
      runId: 'trun-test', welleId: 'w-1', timestamp: '2026-05-02T10:00:00Z',
      suiteResult: { runId: 'trun-test', total: 50, passed: 48, failed: 2, rawOutput: '' },
      qualityReport: { runId: 'trun-test', behavioralCount: 8, implementationCount: 2, problematicTests: ['a.test.ts'] },
      findings: [
        { id: 'F-001', runId: 'trun-test', severity: 'high', category: 'owasp', description: 'SQL Injection', filePath: 'src/db.ts', lineNumber: 10, reproduction: 'GET /q?=drop', suggestion: 'Use prepared stmt' },
        { id: 'F-002', runId: 'trun-test', severity: 'low', category: 'test-failure', description: 'Flaky test', filePath: null, lineNumber: null, reproduction: null, suggestion: null },
      ],
      owaspFindings: [], offLimitsViolations: [],
    })
    assert.ok(report.includes('# Testing-Run-Report'))
    assert.ok(report.includes('### Hoch (1)'))
    assert.ok(report.includes('SQL Injection'))
    assert.ok(report.includes('### Niedrig (1)'))
    assert.ok(report.includes('80% Behavioral'))
    assert.ok(report.includes('Keine Verletzungen'))
  })

  it('reports sauber when no findings', () => {
    const report = generateFindingsReport({
      runId: 'trun-clean', welleId: null, timestamp: '2026-05-02T10:00:00Z',
      suiteResult: null, qualityReport: null, findings: [], owaspFindings: [], offLimitsViolations: [],
    })
    assert.ok(report.includes('**Status:** sauber'))
    assert.ok(report.includes('Keine Findings'))
  })
})
```

```typescript
// test/main/testing-assistant/handoff-debugger.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decideHandoff, buildDebuggerHandoff } from '../../../src/main/testing-assistant/handoff-debugger'
import type { Finding } from '../../../src/main/testing-assistant/types'

describe('handoff-debugger', () => {
  const makeFinding = (severity: 'high' | 'medium' | 'low'): Finding => ({
    id: `f-${Math.random()}`, runId: 'r1', severity, category: 'test-failure',
    description: 'test', filePath: null, lineNumber: null, reproduction: null, suggestion: null,
  })

  it('routes to debugger on severity high', () => {
    assert.equal(decideHandoff([makeFinding('high')]), 'debugger')
  })

  it('routes to debugger on >5 medium', () => {
    const findings = Array.from({ length: 6 }, () => makeFinding('medium'))
    assert.equal(decideHandoff(findings), 'debugger')
  })

  it('routes to optional-debugger on <=5 medium', () => {
    const findings = [makeFinding('medium'), makeFinding('medium')]
    assert.equal(decideHandoff(findings), 'optional-debugger')
  })

  it('routes to audit when clean', () => {
    assert.equal(decideHandoff([]), 'audit')
    assert.equal(decideHandoff([makeFinding('low')]), 'audit')
  })

  it('buildDebuggerHandoff includes only high+medium', () => {
    const findings = [makeFinding('high'), makeFinding('low'), makeFinding('medium')]
    const handoff = buildDebuggerHandoff(findings, 'run-1')
    assert.equal(handoff.findings.length, 2)
    assert.ok(handoff.findings.every(f => f.source === 'testing-assistant'))
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/testing-assistant/findings-reporter.test.ts test/main/testing-assistant/handoff-debugger.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/testing-assistant/findings-reporter.ts src/main/testing-assistant/handoff-debugger.ts src/main/testing-assistant/testing-template.ts test/main/testing-assistant/findings-reporter.test.ts test/main/testing-assistant/handoff-debugger.test.ts
git commit -m "feat(welle-4): findings reporter + handoff logic + testing template"
```

---

## Task 6: Testing Assistant — Entity Registration + IPC + MCP Tools

**Files:**
- Modify: `src/main/session/entity-registry.ts` (add testing-assistant builtin)
- Modify: `src/shared/ipc-channels.ts` (add TESTING_* channels)
- Modify: `src/main/mcp/mcp-tools.ts` (register 3 new tools)
- Modify: `src/shared/types.ts` (add BuiltinEntityId entry)

- [ ] **Step 1: Add to BuiltinEntityId type**

In `src/shared/types.ts` line 21, add `'testing-assistant'` to the union:
```typescript
export type BuiltinEntityId = 'orchestrator' | 'cyber-factory' | 'launcher' | 'companion' | 'refinement' | 'voice-relay' | 'audit' | 'ideation-partner' | 'debugger' | 'testing-assistant'
```

- [ ] **Step 2: Register builtin entity**

In `src/main/session/entity-registry.ts`, after the debugger registration (line ~178), add:
```typescript
  registry.register({
    id: 'testing-assistant',
    displayName: 'Testing Assistant',
    icon: '\uD83E\uDDEA',
    color: '#2ecc71',
    projectPath: `${entitiesBase}/testing-assistant`,
    features: ['mcp', 'memory'],
    visible: true,
    sortOrder: 76,
    singleInstance: true,
  })
```

- [ ] **Step 3: Add IPC channels**

In `src/shared/ipc-channels.ts`, add after DEBUGGER channels:
```typescript
  // Testing Assistant
  TESTING_RUN_START: 'cipher-mux:testing:run-start',
  TESTING_RUN_STATUS: 'cipher-mux:testing:run-status',
  TESTING_RUN_COMPLETE: 'cipher-mux:testing:run-complete',
  TESTING_FINDINGS_LIST: 'cipher-mux:testing:findings-list',
```

- [ ] **Step 4: Register MCP tools in mcp-tools.ts**

Add three tools following established pattern (`server.registerTool` with zod schema):
- `mux_testing_run_start` — creates a TestingRun via manager
- `mux_testing_findings_handoff_debugger` — lists findings, builds handoff payload
- `mux_testing_run_complete` — marks run complete, returns handoff decision

Each tool checks `ctx.testingAssistantManager` availability, calls the manager, returns JSON response.

- [ ] **Step 5: Add testingAssistantManager to ToolContext type**

In the ToolContext interface, add:
```typescript
  testingAssistantManager?: import('../testing-assistant/testing-assistant-manager').TestingAssistantManager
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/main/session/entity-registry.ts src/main/mcp/mcp-tools.ts
git commit -m "feat(welle-4): testing assistant entity + IPC + MCP tools"
```

---

## Task 7: Audit — Full Types + Manager Rewrite

**Files:**
- Rewrite: `src/main/audit/types.ts`
- Rewrite: `src/main/audit/audit-manager.ts`
- Modify: `src/main/companion/schema.ts` (add audit tables)
- Test: `test/main/audit/audit-manager.test.ts`

- [ ] **Step 1: Rewrite types.ts with full types**

Replace skeleton with: AuditSeverity, AuditCategory (add 'cognitive-debt'), AuditVerdict, AuditStatus (full lifecycle states), AuditScope, AuditFinding, CognitiveDebtNote, ReleaseRecommendation, AuditRun (with projectPath, workspaceId), AuditConfig, AUDIT_DEFAULTS.

- [ ] **Step 2: Add audit tables to schema.ts**

Four tables: `audit_runs`, `audit_findings`, `audit_cognitive_debt`, `audit_recommendations`. Pattern matches debugger/testing tables (CREATE IF NOT EXISTS, foreign keys, indexes).

- [ ] **Step 3: Rewrite audit-manager.ts as DB-backed CRUD**

Pattern: pre-prepared statements in constructor, methods for createRun, getRun, updateStatus, addFinding, listFindings, addCognitiveDebt, saveRecommendation, getRecommendation. ID prefix: `arun-`, `afnd-`, `adbt-`.

- [ ] **Step 4: Write test**

Test: create run, getRun roundtrip, updateStatus sets finishedAt, addFinding+listFindings sorted, saveRecommendation+getRecommendation. Uses in-memory DB with COMPANION_SCHEMA_SQL.

- [ ] **Step 5: Run test**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/audit/audit-manager.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/audit/types.ts src/main/audit/audit-manager.ts src/main/companion/schema.ts test/main/audit/audit-manager.test.ts
git commit -m "feat(welle-4): audit full types + DB-backed manager"
```

---

## Task 8: Audit — Release Recommender + Security + Cognitive Debt + Template

**Files:**
- Create: `src/main/audit/release-recommender.ts`
- Create: `src/main/audit/security-audit.ts`
- Create: `src/main/audit/cognitive-debt-evaluator.ts`
- Create: `src/main/audit/audit-template.ts`
- Test: `test/main/audit/release-recommender.test.ts`

- [ ] **Step 1: Write release-recommender.ts**

Implements the verdict table from spec: 0 High + <=3 Medium = release, 4-10 Medium = release-after-fix, >10 Medium or any High = blocked. Returns ReleaseRecommendation with rationale string.

- [ ] **Step 2: Write security-audit.ts**

Reuses `runOwaspSpotcheck` from testing-assistant, converts OwaspFinding[] to AuditFinding[] with recommendations per rule.

- [ ] **Step 3: Write cognitive-debt-evaluator.ts**

Walks src/ files, finds functions >50 lines (configurable threshold), returns CognitiveDebtNote[].

- [ ] **Step 4: Write audit-template.ts**

Returns entity CLAUDE.md string with lifecycle (7 phases), persona akzent, MCP tools, verdict rules.

- [ ] **Step 5: Write release-recommender test**

Tests all verdict scenarios: clean -> release, few medium -> release, many medium -> release-after-fix, too many -> blocked, any high -> blocked, critical -> blocked.

- [ ] **Step 6: Run tests + Commit**

```bash
git add src/main/audit/release-recommender.ts src/main/audit/security-audit.ts src/main/audit/cognitive-debt-evaluator.ts src/main/audit/audit-template.ts test/main/audit/release-recommender.test.ts
git commit -m "feat(welle-4): audit release recommender + security + cognitive debt + template"
```

---

## Task 9: Audit — MCP Tools + IPC + Config

**Files:**
- Modify: `src/shared/ipc-channels.ts` (add AUDIT_* channels)
- Modify: `src/shared/types.ts` (add AuditConfig to AppConfig)
- Modify: `src/main/config/config-store.ts` (add audit defaults)
- Modify: `src/main/mcp/mcp-tools.ts` (register 2 audit tools)

- [ ] **Step 1: Add IPC channels (AUDIT_RUN_START, AUDIT_RUN_STATUS, AUDIT_RUN_COMPLETE)**
- [ ] **Step 2: Add AuditConfig to AppConfig + experimental flag**
- [ ] **Step 3: Add defaults in config-store.ts**
- [ ] **Step 4: Register `mux_audit_run_start` and `mux_audit_run_complete` MCP tools**
- [ ] **Step 5: Add auditManager to ToolContext**
- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts src/main/config/config-store.ts src/main/mcp/mcp-tools.ts
git commit -m "feat(welle-4): audit MCP tools + IPC + config"
```

---

## Task 10: Workspace-Memory — Session Scope Cleanup + ConfigStore

**Files:**
- Create: `src/main/workspace-memory/session-scope-cleanup.ts`
- Modify: `src/shared/types.ts` (add MemoryConfig)
- Modify: `src/main/config/config-store.ts` (add memory defaults)
- Test: `test/main/workspace-memory/session-scope-cleanup.test.ts`

- [ ] **Step 1: Write session-scope-cleanup.ts**

Three functions:
- `cleanupSessionMemory(db, sessionId)` — DELETE WHERE scope_kind='session' AND scope_id=?
- `archiveWorkspaceMemory(db, workspaceId)` — UPDATE scope_kind to 'archived-workspace'
- `deleteWorkspaceMemory(db, workspaceId)` — DELETE WHERE scope_kind='workspace' AND scope_id=?

- [ ] **Step 2: Add MemoryConfig type + AppConfig key**

```typescript
export interface MemoryConfig {
  enabled: boolean
  ftsEnabled: boolean
  retentionDays: number
  sessionScopeAutoDelete: boolean
  archiveOnWorkspaceDelete: boolean
}
```

- [ ] **Step 3: Add defaults**
- [ ] **Step 4: Write test (in-memory DB, insert memories with different scopes, verify cleanup)**
- [ ] **Step 5: Run test + Commit**

```bash
git add src/main/workspace-memory/session-scope-cleanup.ts src/shared/types.ts src/main/config/config-store.ts test/main/workspace-memory/session-scope-cleanup.test.ts
git commit -m "feat(welle-4): workspace memory session cleanup + config"
```

---

## Task 11: Integration — Wire Managers into Init Chain + Full Test Run

**Files:**
- Modify: `src/main/ipc-hub.ts` (instantiate managers, pass to MCP ToolContext)

- [ ] **Step 1: Import and instantiate TestingAssistantManager (receives companion DB)**
- [ ] **Step 2: Import and instantiate AuditManager (receives companion DB)**
- [ ] **Step 3: Pass both to MCP ToolContext**
- [ ] **Step 4: Deploy entity CLAUDE.md files (testing-assistant + audit) in init**
- [ ] **Step 5: Run full test suite**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npm run test`
Expected: All existing tests PASS + all new tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-hub.ts
git commit -m "feat(welle-4): wire testing-assistant + audit managers into init chain"
```

---

## Task 12: Hub-Migration Handover Note

- [ ] **Step 1: Write self-contained Hub-Migration handover note**

Create as cipher-mux Note (via filesystem or MCP). Content covers: what Hub-Migration means, all spec links, step-by-step procedure, acceptance criteria, brownfield tool specs. See separate step after plan execution.

- [ ] **Step 2: Commit docs reference**

---

## Summary

| Task | Module | New Files | Tests |
|------|--------|-----------|-------|
| 1 | TA types/config | 1 | 1 |
| 2 | TA DB+Manager | 1 | 1 |
| 3 | TA Runner+Quality | 2 | 2 |
| 4 | TA Adversarial+OWASP+OffLimits | 3 | 1 |
| 5 | TA Reporter+Handoff+Template | 3 | 2 |
| 6 | TA Entity+IPC+MCP | — (modify) | — |
| 7 | Audit types+Manager | — (rewrite) | 1 |
| 8 | Audit Recommender+Security+Debt | 4 | 1 |
| 9 | Audit MCP+IPC+Config | — (modify) | — |
| 10 | WM Cleanup+Config | 1 | 1 |
| 11 | Integration wiring | — (modify) | full suite |
| 12 | Hub note | 1 note | — |

**Total: ~15 new source files, ~10 modified files, ~10 test files, 12 commits**
