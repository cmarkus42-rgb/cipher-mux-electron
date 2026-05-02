import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'
import { AuditManager } from '../../../src/main/audit/audit-manager'

describe('AuditManager', () => {
  let db: Database.Database
  let manager: AuditManager

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
    manager = new AuditManager(db)
  })

  it('creates a run with arun- prefix', () => {
    const run = manager.createRun({ scope: 'welle', projectPath: '/tmp/p' })
    assert.ok(run.id.startsWith('arun-'))
    assert.equal(run.scope, 'welle')
    assert.equal(run.status, 'pending')
  })

  it('getRun returns null for unknown', () => {
    assert.equal(manager.getRun('nope'), null)
  })

  it('updateStatus sets finished_at on completed', () => {
    const run = manager.createRun({ scope: 'komplett', projectPath: '/tmp/p' })
    manager.updateStatus(run.id, 'completed')
    const fetched = manager.getRun(run.id)!
    assert.equal(fetched.status, 'completed')
    assert.ok(fetched.finishedAt !== null)
  })

  it('addFinding + listFindings round-trips', () => {
    const run = manager.createRun({ scope: 'welle', projectPath: '/tmp/p' })
    manager.addFinding({ runId: run.id, severity: 'high', category: 'security', description: 'SQL Injection', recommendation: 'Use prepared stmt' })
    manager.addFinding({ runId: run.id, severity: 'low', category: 'code-quality', description: 'Long function', recommendation: 'Split' })
    const findings = manager.listFindings(run.id)
    assert.equal(findings.length, 2)
    assert.equal(findings[0].severity, 'high')
  })

  it('saveRecommendation + getRecommendation', () => {
    const run = manager.createRun({ scope: 'welle', projectPath: '/tmp/p' })
    manager.saveRecommendation({ runId: run.id, verdict: 'blocked', rationale: 'SQL injection', highCount: 1, mediumCount: 0, lowCount: 0 })
    const rec = manager.getRecommendation(run.id)!
    assert.equal(rec.verdict, 'blocked')
    assert.equal(rec.highCount, 1)
  })
})
