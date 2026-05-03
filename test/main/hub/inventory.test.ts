import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as fss from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('inventory (REQ-HUB-002)', () => {
  let tmpDir: string
  let hubDir: string
  let projDir: string

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'inventory-test-'))
    hubDir = path.join(tmpDir, 'hub')
    projDir = path.join(hubDir, 'projects', 'test-proj')

    // Hub structure
    await fs.mkdir(path.join(hubDir, 'projects'), { recursive: true })
    await fs.mkdir(path.join(hubDir, 'migrations'), { recursive: true })
    await fs.writeFile(path.join(hubDir, 'ARCHIV-VERWEIS.md'), '# test')

    // Create a Node.js project
    await fs.mkdir(path.join(projDir, 'src'), { recursive: true })
    await fs.mkdir(path.join(projDir, 'test'), { recursive: true })
    await fs.mkdir(path.join(projDir, 'docs', 'decisions'), { recursive: true })
    await fs.writeFile(path.join(projDir, 'package.json'), JSON.stringify({
      name: 'test-proj',
      dependencies: { electron: '^30.0.0' },
      devDependencies: { vitest: '^1.0.0' },
      scripts: { test: 'vitest' },
    }))
    await fs.writeFile(path.join(projDir, 'CLAUDE.md'), '# Test CLAUDE.md')
    await fs.writeFile(path.join(projDir, 'src', 'main.ts'), 'console.log("hi")')
    await fs.writeFile(path.join(projDir, 'test', 'main.test.ts'), 'it("works", () => {})')
    await fs.writeFile(path.join(projDir, 'docs', 'SPEC.md'), '# SPEC\n\nREQ-TEST-001\nREQ-TEST-002')
    await fs.writeFile(path.join(projDir, 'docs', 'requirements.md'), '# Requirements')
    await fs.writeFile(path.join(projDir, 'docs', 'decisions', 'ADR-001-test.md'), '# ADR')
    await fs.writeFile(path.join(projDir, 'docs', 'decisions', 'ADR-002-test.md'), '# ADR')

    process.env.HUB_ROOT_OVERRIDE = hubDir
  })

  after(async () => {
    delete process.env.HUB_ROOT_OVERRIDE
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('detects Node.js/Electron stack', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    const result = await inventory({ projectName: 'test-proj' })
    assert.equal(result.stack.runtime, 'node')
    assert.equal(result.stack.manifest, 'package.json')
    assert.equal(result.stack.framework, 'electron')
    assert.equal(result.stack.testFramework, 'vitest')
  })

  it('detects directory structure', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    const result = await inventory({ projectName: 'test-proj' })
    assert.equal(result.structure.codeDir, 'src')
    assert.equal(result.structure.testDir, 'test')
    assert.equal(result.structure.docsDir, 'docs')
    assert.equal(result.structure.hasClaudeMd, true)
  })

  it('detects specs and ADRs', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    const result = await inventory({ projectName: 'test-proj' })
    assert.ok(result.specs.existingSpecs.length >= 2) // SPEC.md + requirements.md
    assert.ok(result.specs.reqIdsFound >= 2) // REQ-TEST-001, REQ-TEST-002
    assert.equal(result.specs.adrsFound, 2)
  })

  it('counts test files', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    const result = await inventory({ projectName: 'test-proj' })
    assert.ok(result.tests.testFileCount >= 1)
  })

  it('calculates brownfield signals', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    const result = await inventory({ projectName: 'test-proj' })
    // Has: CLAUDE.md, specs, ADRs, tests, REQ-IDs = 5 signals (no .project-meta.json)
    assert.ok(result.brownfieldSignals >= 4)
  })

  it('is idempotent (Q04)', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    const r1 = await inventory({ projectName: 'test-proj' })
    const r2 = await inventory({ projectName: 'test-proj' })
    assert.deepEqual(r1.stack, r2.stack)
    assert.deepEqual(r1.structure, r2.structure)
    assert.deepEqual(r1.specs, r2.specs)
    assert.equal(r1.brownfieldSignals, r2.brownfieldSignals)
  })

  it('writes inventory report to migrations/', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    await inventory({ projectName: 'test-proj' })
    const migDir = path.join(hubDir, 'migrations', 'test-proj')
    const files = fss.readdirSync(migDir).filter(f => f.startsWith('inventory-'))
    assert.ok(files.length >= 1)
  })

  it('does not modify project files (Q02)', async () => {
    const pkgBefore = fss.statSync(path.join(projDir, 'package.json'))
    const { inventory } = await import('../../../src/main/hub/inventory')
    await inventory({ projectName: 'test-proj' })
    const pkgAfter = fss.statSync(path.join(projDir, 'package.json'))
    assert.equal(pkgBefore.mtimeMs, pkgAfter.mtimeMs)
  })

  it('throws for missing project', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    await assert.rejects(
      () => inventory({ projectName: 'nonexistent' }),
      /nicht gefunden/,
    )
  })
})

describe('inventory — Python project', () => {
  let tmpDir: string
  let hubDir: string

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'inv-py-test-'))
    hubDir = path.join(tmpDir, 'hub')
    const projDir = path.join(hubDir, 'projects', 'py-proj')

    await fs.mkdir(path.join(hubDir, 'projects'), { recursive: true })
    await fs.mkdir(path.join(hubDir, 'migrations'), { recursive: true })
    await fs.writeFile(path.join(hubDir, 'ARCHIV-VERWEIS.md'), '# test')
    await fs.mkdir(path.join(projDir, 'source'), { recursive: true })
    await fs.writeFile(path.join(projDir, 'pyproject.toml'), '[project]\nname="py-proj"')
    await fs.writeFile(path.join(projDir, 'source', 'main.py'), 'print("hi")')

    process.env.HUB_ROOT_OVERRIDE = hubDir
  })

  after(async () => {
    delete process.env.HUB_ROOT_OVERRIDE
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('detects Python stack', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    const result = await inventory({ projectName: 'py-proj' })
    assert.equal(result.stack.runtime, 'python')
    assert.equal(result.stack.manifest, 'pyproject.toml')
  })

  it('suggests path alias for non-standard code dir', async () => {
    const { inventory } = await import('../../../src/main/hub/inventory')
    const result = await inventory({ projectName: 'py-proj' })
    assert.equal(result.structure.codeDir, 'source')
    assert.equal(result.pathAliases['src'], 'source')
  })
})
