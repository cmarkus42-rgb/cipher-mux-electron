/**
 * Cyber Factory — integration tests.
 * Exercises the full lifecycle: runs, wellen, sub-projekte, memory scopes,
 * escalation classification, stuck detection, risk review, and diagnose.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { MemoryStore } from '../../../src/main/companion/memory-store.js'
import { CyberFactoryManager } from '../../../src/main/cyber-factory/cyber-factory-manager.js'
import { classifyEscalation } from '../../../src/main/cyber-factory/escalation-classifier.js'
import { detectStuck } from '../../../src/main/cyber-factory/worker-monitor.js'
import { generateRiskReview } from '../../../src/main/cyber-factory/risk-reviewer.js'
import { generateDiagnoseReport, formatDiagnoseMarkdown } from '../../../src/main/cyber-factory/diagnose.js'
import { CYBER_FACTORY_DEFAULTS } from '../../../src/main/cyber-factory/types.js'

// ─── Suite 1: Full run lifecycle ──────────────────────────────────────────────

describe('Cyber Factory — full run lifecycle', () => {
  let tmpDir: string
  let store: MemoryStore
  let mgr: CyberFactoryManager

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cf-integration-'))
    store = new MemoryStore(path.join(tmpDir, 'companion.db'))
    mgr = new CyberFactoryManager(store)
  })

  afterEach(async () => {
    store.close()
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates run, wellen, sub-projekte and tracks status transitions', () => {
    // Create run
    const run = mgr.createRun({
      detailSpecPath: '/tmp/detail-spec.md',
      projectPath: '/tmp/myproject',
    })
    assert.ok(run.id.startsWith('cf-'), `run id should start with "cf-", got: ${run.id}`)
    assert.equal(run.status, 'pending')
    assert.equal(run.finishedAt, null)

    // Create 2 wellen
    const welle1 = mgr.createWelle(run.id, 1)
    const welle2 = mgr.createWelle(run.id, 2)
    assert.equal(welle1.reihenfolge, 1)
    assert.equal(welle2.reihenfolge, 2)
    assert.equal(welle1.status, 'pending')

    // Create 2 sub-projekte in welle 1
    const sp1 = mgr.createSubProjekt(welle1.id, {
      name: 'db-schema',
      model: 'haiku',
      tokenBudget: 20000,
    })
    const sp2 = mgr.createSubProjekt(welle1.id, {
      name: 'auth-module',
      model: 'sonnet',
      tokenBudget: 50000,
    })
    assert.equal(sp1.name, 'db-schema')
    assert.equal(sp1.model, 'haiku')
    assert.equal(sp1.tokenBudget, 20000)
    assert.equal(sp2.name, 'auth-module')
    assert.equal(sp2.model, 'sonnet')

    // Create 1 sub-projekt in welle 2
    const sp3 = mgr.createSubProjekt(welle2.id, {
      name: 'api-routes',
      model: 'sonnet',
      tokenBudget: 50000,
    })
    assert.equal(sp3.name, 'api-routes')

    // Update run to running
    mgr.updateRunStatus(run.id, 'running')
    const runningRun = mgr.getRun(run.id)
    assert.ok(runningRun !== null)
    assert.equal(runningRun.status, 'running')
    assert.equal(runningRun.finishedAt, null)

    // Update welle-1 sub-projekte to running with heartbeat
    const now = Date.now()
    mgr.updateSubProjekt(sp1.id, { status: 'running', lastHeartbeat: now })
    mgr.updateSubProjekt(sp2.id, { status: 'running', lastHeartbeat: now })

    const updatedSp1 = mgr.getSubProjekt(sp1.id)
    assert.ok(updatedSp1 !== null)
    assert.equal(updatedSp1.status, 'running')
    assert.ok(updatedSp1.lastHeartbeat !== null && updatedSp1.lastHeartbeat > 0)

    // detectStuck should return false for a fresh heartbeat
    const notStuck = detectStuck(
      {
        lastHeartbeat: now,
        lastOutputLength: 1000,
        previousOutputLength: 500,
        lastOutputCheckAt: now,
      },
      CYBER_FACTORY_DEFAULTS.stuckDetection,
      now + 1000,
    )
    assert.equal(notStuck, false, 'freshly updated worker should not be stuck')

    // Update both welle-1 sub-projekte to completed
    mgr.updateSubProjekt(sp1.id, { status: 'completed' })
    mgr.updateSubProjekt(sp2.id, { status: 'completed' })

    const completedSp1 = mgr.getSubProjekt(sp1.id)
    assert.ok(completedSp1 !== null)
    assert.equal(completedSp1.status, 'completed')

    // Generate risk review for sp1
    const changedFileName = 'src/db/schema.ts'
    const review = generateRiskReview({
      runId: run.id,
      workerId: sp1.id,
      changedFiles: [{ path: changedFileName, linesChanged: 42 }],
      deletedFiles: [],
      newDependencies: [],
      testsStatus: 'All tests pass.',
    })
    assert.ok(review.includes(changedFileName), `review should mention ${changedFileName}`)
    assert.ok(review.includes(run.id), 'review should include run id')

    // Generate diagnose report and format as markdown
    const wellen = mgr.listWellen(run.id)
    const sp1Data = mgr.getSubProjekt(sp1.id)!
    const sp2Data = mgr.getSubProjekt(sp2.id)!
    const sp3Data = mgr.getSubProjekt(sp3.id)!

    const diagnoseReport = generateDiagnoseReport({
      run: runningRun,
      wellen,
      workers: [
        {
          subProjektId: sp1Data.id,
          name: sp1Data.name,
          status: sp1Data.status,
          tmuxSession: null,
          contextUsagePercent: null,
          lastOutput: null,
          lastHeartbeat: sp1Data.lastHeartbeat,
        },
        {
          subProjektId: sp2Data.id,
          name: sp2Data.name,
          status: sp2Data.status,
          tmuxSession: null,
          contextUsagePercent: null,
          lastOutput: null,
          lastHeartbeat: sp2Data.lastHeartbeat,
        },
        {
          subProjektId: sp3Data.id,
          name: sp3Data.name,
          status: sp3Data.status,
          tmuxSession: null,
          contextUsagePercent: null,
          lastOutput: null,
          lastHeartbeat: sp3Data.lastHeartbeat,
        },
      ],
      escalationBacklog: 0,
    })

    const markdown = formatDiagnoseMarkdown(diagnoseReport)
    assert.ok(markdown.includes('Cyber Factory Diagnose'), 'markdown should include title')
    assert.ok(markdown.includes(run.id), 'markdown should include run id')

    // Update run to completed — finishedAt should be set
    mgr.updateRunStatus(run.id, 'completed')
    const completedRun = mgr.getRun(run.id)
    assert.ok(completedRun !== null)
    assert.equal(completedRun.status, 'completed')
    assert.ok(
      typeof completedRun.finishedAt === 'number' && completedRun.finishedAt > 0,
      'finishedAt should be set after completion',
    )
  })
})

// ─── Suite 2: Workspace memory integration ────────────────────────────────────

describe('Cyber Factory — workspace memory integration', () => {
  let tmpDir: string
  let store: MemoryStore
  let mgr: CyberFactoryManager

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cf-memory-'))
    store = new MemoryStore(path.join(tmpDir, 'companion.db'))
    mgr = new CyberFactoryManager(store)
  })

  afterEach(async () => {
    store.close()
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
  })

  it('scopes memories to workspace vs user and recalls them correctly', () => {
    const workspaceId = 'ws-test'

    // Create run with workspaceId
    const run = mgr.createRun({
      detailSpecPath: '/tmp/spec.md',
      projectPath: '/tmp/proj',
      workspaceId,
    })
    assert.equal(run.workspaceId, workspaceId)

    // Write workspace-scoped memory: welle-plan kind
    store.write({
      text: 'Welle 1 plan: build auth and db schema in parallel',
      kind: 'welle-plan',
      scopeKind: 'workspace',
      scopeId: workspaceId,
    })

    // Write workspace-scoped memory: decision kind
    store.write({
      text: 'Decided to use PostgreSQL for persistence',
      kind: 'decision',
      scopeKind: 'workspace',
      scopeId: workspaceId,
    })

    // Write user-scoped memory: preference kind (no scope override → defaults to 'user')
    store.write({
      text: 'User prefers TypeScript strict mode',
      kind: 'preference',
    })

    // Recall workspace-scoped — expect exactly 2
    const wsMemories = store.recall({
      scopeKind: 'workspace',
      scopeId: workspaceId,
      limit: 50,
    })
    assert.equal(wsMemories.length, 2, 'should recall 2 workspace-scoped memories')

    const wsKinds = new Set(wsMemories.map((m) => m.kind))
    assert.ok(wsKinds.has('welle-plan'), 'workspace memories should include welle-plan')
    assert.ok(wsKinds.has('decision'), 'workspace memories should include decision')

    // Recall user-scoped — expect exactly 1
    const userMemories = store.recall({
      scopeKind: 'user',
      limit: 50,
    })
    assert.equal(userMemories.length, 1, 'should recall 1 user-scoped memory')
    assert.equal(userMemories[0].kind, 'preference')
  })
})

// ─── Suite 3: Escalation level coverage ───────────────────────────────────────

describe('Cyber Factory — escalation level coverage', () => {
  it('level 1: keyword match in spec → autonomous level 1', () => {
    const result = classifyEscalation({
      question: 'Which database should we use for the schema?',
      detailSpecContent: 'Use PostgreSQL as the primary database. Schema migrations via Flyway.',
      crossSessionDecisions: [],
      hasWebSearchCapability: false,
    })
    assert.equal(result.level, 1)
    assert.equal(result.autonomous, true)
  })

  it('level 3: cross-session decision present (no spec) → autonomous level 3', () => {
    const result = classifyEscalation({
      question: 'Should we cache API responses?',
      detailSpecContent: '',
      crossSessionDecisions: [
        { sessionId: 'session-abc', decision: 'Use Redis for API response caching' },
      ],
      hasWebSearchCapability: false,
    })
    assert.equal(result.level, 3)
    assert.equal(result.autonomous, true)
    assert.ok(
      result.reasoning.includes('Redis') || result.reasoning.includes('Cross-session'),
      'reasoning should reference the cross-session decision',
    )
  })

  it('level 5: no spec, no cross-session, no web search → not autonomous', () => {
    const result = classifyEscalation({
      question: 'What color should the UI buttons be?',
      detailSpecContent: '',
      crossSessionDecisions: [],
      hasWebSearchCapability: false,
    })
    assert.equal(result.level, 5)
    assert.equal(result.autonomous, false)
  })
})
