import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'
import { DebuggerManager } from '../../../src/main/debugger/debugger-manager'
import { ClarificationRouter } from '../../../src/main/debugger/clarification-router'
import { FixPlanner } from '../../../src/main/debugger/fix-planner'
import { WorkerLauncher } from '../../../src/main/debugger/worker-launcher'
import { VerificationRunner } from '../../../src/main/debugger/verification-runner'
import { WalkthroughRenderer } from '../../../src/main/debugger/walkthrough-renderer'
import { parseFindings } from '../../../src/main/debugger/findings-parser'
import { DEBUGGER_DEFAULTS } from '../../../src/main/debugger/types'

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
