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
