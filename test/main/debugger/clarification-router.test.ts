import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'
import { DebuggerManager } from '../../../src/main/debugger/debugger-manager'
import { ClarificationRouter } from '../../../src/main/debugger/clarification-router'
import type { FindingsIntake } from '../../../src/main/debugger/types'

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
