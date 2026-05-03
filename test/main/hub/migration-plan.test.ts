import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as fss from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('migration-plan (REQ-HUB-003)', () => {
  let tmpDir: string
  let hubDir: string
  let projDir: string

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'migplan-test-'))
    hubDir = path.join(tmpDir, 'hub')
    projDir = path.join(hubDir, 'projects', 'plan-proj')

    // Hub structure
    await fs.mkdir(path.join(hubDir, 'projects'), { recursive: true })
    await fs.mkdir(path.join(hubDir, 'migrations'), { recursive: true })
    await fs.writeFile(path.join(hubDir, 'ARCHIV-VERWEIS.md'), '# test')

    // Node.js project with CLAUDE.md
    await fs.mkdir(path.join(projDir, 'src'), { recursive: true })
    await fs.mkdir(path.join(projDir, 'test'), { recursive: true })
    await fs.writeFile(path.join(projDir, 'package.json'), JSON.stringify({
      name: 'plan-proj',
      dependencies: {},
      scripts: { test: 'node --test' },
    }))
    await fs.writeFile(path.join(projDir, 'CLAUDE.md'), '# Project')
    await fs.writeFile(path.join(projDir, 'src', 'main.ts'), '')
    await fs.writeFile(path.join(projDir, 'test', 'main.test.ts'), '')

    process.env.HUB_ROOT_OVERRIDE = hubDir
  })

  after(async () => {
    delete process.env.HUB_ROOT_OVERRIDE
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('generates plan with 3 sections', async () => {
    const { migrationPlan } = await import('../../../src/main/hub/migration-plan')
    const result = await migrationPlan({ projectName: 'plan-proj' })

    assert.ok(result.planPath.includes('migration-plan-'))
    assert.ok(result.sections.unchanged > 0, 'should have unchanged items')
    assert.ok(result.sections.new > 0, 'should have new items')
    // CLAUDE.md exists → extended section
    assert.ok(result.sections.extended > 0, 'should have extended items')
  })

  it('plan file has checkbox format', async () => {
    const { migrationPlan } = await import('../../../src/main/hub/migration-plan')
    const result = await migrationPlan({ projectName: 'plan-proj' })

    const content = fss.readFileSync(result.planPath, 'utf-8')
    assert.ok(content.includes('- [ ] **S-'))
    assert.ok(content.includes('## 1. Bleibt unveraendert'))
    assert.ok(content.includes('## 2. Bleibt, wird erweitert'))
    assert.ok(content.includes('## 3. Kommt neu hinzu'))
  })

  it('is idempotent (Q04)', async () => {
    const { migrationPlan } = await import('../../../src/main/hub/migration-plan')
    const r1 = await migrationPlan({ projectName: 'plan-proj' })
    const r2 = await migrationPlan({ projectName: 'plan-proj' })
    assert.equal(r1.sections.unchanged, r2.sections.unchanged)
    assert.equal(r1.sections.extended, r2.sections.extended)
    assert.equal(r1.sections.new, r2.sections.new)
  })

  it('writes plan to migrations/', async () => {
    const { migrationPlan } = await import('../../../src/main/hub/migration-plan')
    const result = await migrationPlan({ projectName: 'plan-proj' })
    assert.ok(fss.existsSync(result.planPath))
  })

  it('rejects invalid pack-light components', async () => {
    const { migrationPlan } = await import('../../../src/main/hub/migration-plan')
    await assert.rejects(
      () => migrationPlan({
        projectName: 'plan-proj',
        mode: 'pack-light',
        components: ['nonexistent-component'],
      }),
      /Unbekannte Pack-Komponenten/,
    )
  })

  it('pack-light includes only requested components in "new" section', async () => {
    const { migrationPlan } = await import('../../../src/main/hub/migration-plan')
    const result = await migrationPlan({
      projectName: 'plan-proj',
      mode: 'pack-light',
      components: ['personas', 'debugger'],
    })
    const content = fss.readFileSync(result.planPath, 'utf-8')
    assert.ok(content.includes('Pack-Komponente: personas'))
    assert.ok(content.includes('Pack-Komponente: debugger'))
  })

  it('throws for missing project', async () => {
    const { migrationPlan } = await import('../../../src/main/hub/migration-plan')
    await assert.rejects(
      () => migrationPlan({ projectName: 'nonexistent' }),
      /nicht gefunden/,
    )
  })

  it('reports gaps when specs are missing', async () => {
    const { migrationPlan } = await import('../../../src/main/hub/migration-plan')
    const result = await migrationPlan({ projectName: 'plan-proj' })
    // plan-proj has no docs/SPEC.md
    assert.ok(result.gaps.some(g => g.includes('Spezifikation')))
  })
})
