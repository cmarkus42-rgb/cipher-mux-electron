import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'
import { DebuggerManager } from '../../../src/main/debugger/debugger-manager'
import { WorkerLauncher } from '../../../src/main/debugger/worker-launcher'
import { DEBUGGER_DEFAULTS } from '../../../src/main/debugger/types'

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
