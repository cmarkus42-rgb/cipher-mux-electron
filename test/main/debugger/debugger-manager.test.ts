import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'
import { DebuggerManager } from '../../../src/main/debugger/debugger-manager'

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
