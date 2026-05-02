/**
 * Tests for CyberFactoryManager — run/welle/sub-projekt CRUD.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { MemoryStore } from '../../../src/main/companion/memory-store.js'
import { CyberFactoryManager } from '../../../src/main/cyber-factory/cyber-factory-manager.js'

describe('CyberFactoryManager', () => {
  let tmpDir: string
  let store: MemoryStore
  let mgr: CyberFactoryManager

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-manager-test-'))
    store = new MemoryStore(path.join(tmpDir, 'companion.db'))
    mgr = new CyberFactoryManager(store)
  })

  after(async () => {
    store.close()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // 1. creates a new run
  it('creates a new run', () => {
    const run = mgr.createRun({
      detailSpecPath: '/tmp/spec.md',
      projectPath: '/tmp/project',
    })

    assert.ok(run.id.startsWith('cf-'), `id should start with "cf-", got: ${run.id}`)
    assert.equal(run.status, 'pending')
    assert.equal(run.detailSpecPath, '/tmp/spec.md')
    assert.equal(run.projectPath, '/tmp/project')
    assert.equal(run.workspaceId, null)
    assert.equal(run.finishedAt, null)
    assert.ok(typeof run.startedAt === 'number' && run.startedAt > 0)
  })

  // 2. gets a run by ID
  it('gets a run by ID', () => {
    const created = mgr.createRun({
      detailSpecPath: '/tmp/spec2.md',
      projectPath: '/tmp/project2',
      workspaceId: 'ws-abc',
    })

    const fetched = mgr.getRun(created.id)
    assert.ok(fetched !== null)
    assert.equal(fetched.id, created.id)
    assert.equal(fetched.detailSpecPath, '/tmp/spec2.md')
    assert.equal(fetched.projectPath, '/tmp/project2')
    assert.equal(fetched.workspaceId, 'ws-abc')
    assert.equal(fetched.status, 'pending')
  })

  // 3. updates run status
  it('updates run status', () => {
    const run = mgr.createRun({
      detailSpecPath: '/tmp/spec3.md',
      projectPath: '/tmp/project3',
    })

    mgr.updateRunStatus(run.id, 'running')

    const updated = mgr.getRun(run.id)
    assert.ok(updated !== null)
    assert.equal(updated.status, 'running')
    // Non-terminal status — finishedAt should remain null
    assert.equal(updated.finishedAt, null)
  })

  // 4. creates wellen for a run
  it('creates wellen for a run', () => {
    const run = mgr.createRun({
      detailSpecPath: '/tmp/spec4.md',
      projectPath: '/tmp/project4',
    })

    const welle = mgr.createWelle(run.id, 1)

    assert.ok(welle.id.startsWith('welle-'), `id should start with "welle-", got: ${welle.id}`)
    assert.equal(welle.runId, run.id)
    assert.equal(welle.reihenfolge, 1)
    assert.equal(welle.status, 'pending')
    assert.equal(welle.startedAt, null)
    assert.equal(welle.finishedAt, null)
  })

  // 5. creates sub-projekte for a welle
  it('creates sub-projekte for a welle', () => {
    const run = mgr.createRun({
      detailSpecPath: '/tmp/spec5.md',
      projectPath: '/tmp/project5',
    })
    const welle = mgr.createWelle(run.id, 1)

    const sp = mgr.createSubProjekt(welle.id, {
      name: 'auth-service',
      model: 'sonnet',
      tokenBudget: 50_000,
    })

    assert.ok(sp.id.startsWith('sp-'), `id should start with "sp-", got: ${sp.id}`)
    assert.equal(sp.welleId, welle.id)
    assert.equal(sp.name, 'auth-service')
    assert.equal(sp.model, 'sonnet')
    assert.equal(sp.tokenBudget, 50_000)
    assert.equal(sp.status, 'pending')
  })

  // 6. lists wellen for a run
  it('lists wellen for a run', () => {
    const run = mgr.createRun({
      detailSpecPath: '/tmp/spec6.md',
      projectPath: '/tmp/project6',
    })

    mgr.createWelle(run.id, 2)
    mgr.createWelle(run.id, 1)

    const wellen = mgr.listWellen(run.id)
    assert.equal(wellen.length, 2)
    // Should be ordered by reihenfolge ascending
    assert.equal(wellen[0].reihenfolge, 1)
    assert.equal(wellen[1].reihenfolge, 2)
  })

  // 7. lists sub-projekte for a welle
  it('lists sub-projekte for a welle', () => {
    const run = mgr.createRun({
      detailSpecPath: '/tmp/spec7.md',
      projectPath: '/tmp/project7',
    })
    const welle = mgr.createWelle(run.id, 1)

    mgr.createSubProjekt(welle.id, { name: 'frontend' })
    mgr.createSubProjekt(welle.id, { name: 'backend' })

    const sps = mgr.listSubProjekte(welle.id)
    assert.equal(sps.length, 2)
    const names = sps.map(s => s.name).sort()
    assert.deepEqual(names, ['backend', 'frontend'])
  })

  // 8. updates sub-projekt status and heartbeat
  it('updates sub-projekt status and heartbeat', () => {
    const run = mgr.createRun({
      detailSpecPath: '/tmp/spec8.md',
      projectPath: '/tmp/project8',
    })
    const welle = mgr.createWelle(run.id, 1)
    const sp = mgr.createSubProjekt(welle.id, { name: 'worker-a' })

    const heartbeat = Date.now()
    mgr.updateSubProjekt(sp.id, {
      status: 'running',
      lastHeartbeat: heartbeat,
      tmuxSession: 'mux-worker-a',
    })

    const updated = mgr.getSubProjekt(sp.id)
    assert.ok(updated !== null)
    assert.equal(updated.status, 'running')
    assert.equal(updated.lastHeartbeat, heartbeat)
    assert.equal(updated.tmuxSession, 'mux-worker-a')
  })
})
