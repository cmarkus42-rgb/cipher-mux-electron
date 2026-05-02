import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'
import { DebuggerManager } from '../../../src/main/debugger/debugger-manager'
import { FixPlanner } from '../../../src/main/debugger/fix-planner'
import type { FindingsIntake } from '../../../src/main/debugger/types'

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
