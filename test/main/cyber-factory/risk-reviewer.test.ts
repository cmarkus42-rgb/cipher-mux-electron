import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateRiskReview } from '../../../src/main/cyber-factory/risk-reviewer.js'

test('normal review with changed files and verified dependency — all sections present', () => {
  const output = generateRiskReview({
    runId: 'run-001',
    workerId: 'worker-a',
    changedFiles: [{ path: 'src/main/foo.ts', linesChanged: 42 }],
    deletedFiles: [],
    newDependencies: [{ name: 'zod', version: '3.22.4', verified: true }],
    testsStatus: '47 passed, 0 failed',
    schemaChanges: 'added column users.role',
    apiChanges: 'new endpoint POST /api/sessions',
  })

  // frontmatter
  assert.ok(output.includes('run_id: run-001'), 'frontmatter run_id')
  assert.ok(output.includes('worker_id: worker-a'), 'frontmatter worker_id')
  assert.ok(output.includes('date:'), 'frontmatter date')

  // changed files section
  assert.ok(output.includes('## Geaenderte Dateien'), 'section header')
  assert.ok(output.includes('src/main/foo.ts'), 'file name present')
  assert.ok(output.includes('42 Zeilen geaendert'), 'lines changed')

  // deleted files
  assert.ok(output.includes('## Geloeschte Dateien'), 'deleted section')
  assert.ok(output.includes('(keine)'), 'no deleted files')

  // new dependencies
  assert.ok(output.includes('## Neue Abhaengigkeiten'), 'deps section')
  assert.ok(output.includes('zod@3.22.4'), 'dep with version')
  assert.ok(output.includes('verifiziert'), 'verified label')

  // schema/api changes
  assert.ok(output.includes('## Schema- oder API-Aenderungen'), 'schema section')
  assert.ok(output.includes('added column users.role'), 'schema detail')
  assert.ok(output.includes('new endpoint POST /api/sessions'), 'api detail')

  // dependency validation
  assert.ok(output.includes('## Abhaengigkeits-Validierung'), 'validation section')
  assert.ok(output.includes('zod@3.22.4'), 'dep in validation list')

  // off-limits
  assert.ok(output.includes('## Off-Limits-Status'), 'off-limits section')

  // tests
  assert.ok(output.includes('## Tests'), 'tests section')
  assert.ok(output.includes('47 passed, 0 failed'), 'test status')
})

test('review with deleted files and unverified dependency — deleted and slopsquatting risk present', () => {
  const output = generateRiskReview({
    runId: 'run-002',
    workerId: 'worker-b',
    changedFiles: [],
    deletedFiles: ['src/legacy/old-module.ts', 'test/legacy/old-module.test.ts'],
    newDependencies: [{ name: 'some-utility', version: '1.0.0', verified: false }],
    testsStatus: '12 passed, 2 failed',
    offLimitsStatus: 'cipher-mux/session berührt — Freigabe ausstehend',
  })

  // deleted files section populated
  assert.ok(output.includes('## Geloeschte Dateien'), 'deleted section')
  assert.ok(output.includes('src/legacy/old-module.ts'), 'deleted file 1')
  assert.ok(output.includes('test/legacy/old-module.test.ts'), 'deleted file 2')

  // unverified dependency label
  assert.ok(output.includes('NICHT verifiziert'), 'unverified label')

  // slopsquatting risk warning
  assert.ok(output.includes('Slopsquatting-Risiko'), 'slopsquatting risk section')
  assert.ok(
    output.includes('nicht-verifizierten Paketen'),
    'slopsquatting risk mentions unverified packages'
  )

  // off-limits custom status
  assert.ok(output.includes('cipher-mux/session berührt — Freigabe ausstehend'), 'off-limits status')

  // changed files — none
  assert.ok(output.includes('## Geaenderte Dateien'), 'changed section exists')
})
