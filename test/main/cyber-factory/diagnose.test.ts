import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateDiagnoseReport,
  formatDiagnoseMarkdown,
} from '../../../src/main/cyber-factory/diagnose.js'
import type { CyberFactoryRun, Welle } from '../../../src/main/cyber-factory/types.js'

// ─── Fixtures ─────────────────────────────────────────────

const NOW = 1_746_000_000_000

const makeRun = (
  id: string,
  status: CyberFactoryRun['status'],
): CyberFactoryRun => ({
  id,
  detailSpecPath: '/tmp/spec.md',
  projectPath: '/tmp/project',
  workspaceId: null,
  status,
  startedAt: NOW - 60_000,
  finishedAt: null,
  config: null,
})

const makeWelle = (
  id: string,
  runId: string,
  reihenfolge: number,
  status: Welle['status'],
): Welle => ({
  id,
  runId,
  reihenfolge,
  status,
  startedAt: NOW - 30_000,
  finishedAt: null,
})

// ─── Tests ────────────────────────────────────────────────

describe('generateDiagnoseReport', () => {
  it('produces health report for a run', () => {
    const run = makeRun('cf-test-1', 'running')
    const wellen = [makeWelle('w-1', 'cf-test-1', 1, 'running')]
    const workers = [
      {
        subProjektId: 'sp-auth',
        name: 'auth',
        status: 'running',
        tmuxSession: 'cmux-auth-1',
        contextUsagePercent: 45,
        lastOutput: 'writing auth module',
        lastHeartbeat: NOW - 5_000,
      },
      {
        subProjektId: 'sp-db',
        name: 'db',
        status: 'stuck',
        tmuxSession: 'cmux-db-1',
        contextUsagePercent: 80,
        lastOutput: null,
        lastHeartbeat: NOW - 600_000,
      },
    ]

    const report = generateDiagnoseReport({
      run,
      wellen,
      workers,
      escalationBacklog: 1,
    })

    assert.equal(report.runId, 'cf-test-1')
    assert.equal(report.runStatus, 'running')
    assert.ok(typeof report.timestamp === 'number')
    assert.ok(report.timestamp > 0)

    assert.deepEqual(report.wellenStatus, ['running'])

    assert.equal(report.workerStatus.length, 2)
    assert.equal(report.workerStatus[0], 'running')
    assert.equal(report.workerStatus[1], 'stuck')

    assert.equal(report.escalationBacklog.length, 1)
  })
})

describe('formatDiagnoseMarkdown', () => {
  it('formats report as readable markdown', () => {
    const run = makeRun('cf-markdown-1', 'completed')
    const report = generateDiagnoseReport({
      run,
      wellen: [],
      workers: [],
      escalationBacklog: 0,
    })

    const md = formatDiagnoseMarkdown(report)

    assert.ok(md.includes('# Cyber Factory Diagnose'), 'should include title')
    assert.ok(md.includes('cf-markdown-1'), 'should include run id')
    assert.ok(md.includes('completed'), 'should include run status')
  })
})
