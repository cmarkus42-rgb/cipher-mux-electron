import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AuditManager } from '../../src/main/audit/audit-manager'

describe('AuditManager', () => {
  it('creates a run with pending status', () => {
    const mgr = new AuditManager()
    const run = mgr.createRun('cipher-mux-electron')
    assert.equal(run.status, 'pending')
    assert.equal(run.scope, 'cipher-mux-electron')
    assert.ok(run.id.startsWith('audit-'))
    assert.deepEqual(run.findings, [])
  })

  it('retrieves a run by ID', () => {
    const mgr = new AuditManager()
    const run = mgr.createRun('test-project')
    const found = mgr.getRun(run.id)
    assert.ok(found)
    assert.equal(found!.id, run.id)
  })

  it('lists all runs', () => {
    const mgr = new AuditManager()
    mgr.createRun('project-a')
    mgr.createRun('project-b')
    assert.equal(mgr.listRuns().length, 2)
  })

  it('updates run status', () => {
    const mgr = new AuditManager()
    const run = mgr.createRun('test')
    mgr.updateStatus(run.id, 'running')
    assert.equal(mgr.getRun(run.id)!.status, 'running')
  })

  it('returns undefined for unknown run ID', () => {
    const mgr = new AuditManager()
    assert.equal(mgr.getRun('nonexistent'), undefined)
  })
})
