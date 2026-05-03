import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as fss from 'fs'
import * as path from 'path'
import * as os from 'os'

const ARCHIV_TEMPLATE = `# Archiv-Verweis

## Migrations-Status

| Projekt | Original-Pfad | Hub-Pfad | Status | Freigabe-Datum |
|---------|---------------|----------|--------|----------------|

## Status-Werte
`

describe('integrate (REQ-HUB-001)', () => {
  let tmpDir: string
  let sourceDir: string
  let hubDir: string

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integrate-test-'))
    hubDir = path.join(tmpDir, 'hub')
    sourceDir = path.join(tmpDir, 'source-project')

    // Create hub structure
    await fs.mkdir(path.join(hubDir, 'projects'), { recursive: true })
    await fs.writeFile(path.join(hubDir, 'ARCHIV-VERWEIS.md'), ARCHIV_TEMPLATE)

    process.env.HUB_ROOT_OVERRIDE = hubDir
  })

  after(async () => {
    delete process.env.HUB_ROOT_OVERRIDE
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    // Create fresh source project each test
    await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {})
    await fs.mkdir(sourceDir, { recursive: true })
    await fs.writeFile(path.join(sourceDir, 'package.json'), '{"name":"test"}')
    await fs.writeFile(path.join(sourceDir, 'index.ts'), 'console.log("hi")')
    await fs.mkdir(path.join(sourceDir, '.git'), { recursive: true })
    await fs.writeFile(path.join(sourceDir, '.git', 'config'), '[core]')
    await fs.mkdir(path.join(sourceDir, 'node_modules', 'dep'), { recursive: true })
    await fs.writeFile(path.join(sourceDir, 'node_modules', 'dep', 'index.js'), '')

    // Reset ARCHIV-VERWEIS.md
    await fs.writeFile(path.join(hubDir, 'ARCHIV-VERWEIS.md'), ARCHIV_TEMPLATE)

    // Clean up any prior hub copies
    const projDir = path.join(hubDir, 'projects', 'source-project')
    await fs.rm(projDir, { recursive: true, force: true }).catch(() => {})
    // Clean lock files
    try { await fs.unlink(path.join(hubDir, 'ARCHIV-VERWEIS.md.lock')) } catch { /* ok */ }
  })

  it('copies project to hub, excludes node_modules', async () => {
    const { integrate } = await import('../../../src/main/hub/integrate')
    const result = await integrate({ sourcePath: sourceDir })

    assert.equal(result.success, true)
    assert.ok(result.hubPath.includes('projects/source-project'))
    assert.ok(result.filesCopied >= 2) // package.json, index.ts, .git/config
    assert.ok(result.filesExcluded >= 1) // node_modules/dep/index.js

    // Verify files were copied
    assert.ok(fss.existsSync(path.join(result.hubPath, 'package.json')))
    assert.ok(fss.existsSync(path.join(result.hubPath, 'index.ts')))

    // Verify node_modules excluded
    assert.ok(!fss.existsSync(path.join(result.hubPath, 'node_modules')))
  })

  it('uses custom projectName', async () => {
    const { integrate } = await import('../../../src/main/hub/integrate')
    const result = await integrate({ sourcePath: sourceDir, projectName: 'custom-name' })
    assert.ok(result.hubPath.endsWith('custom-name'))

    // Cleanup
    await fs.rm(path.join(hubDir, 'projects', 'custom-name'), { recursive: true, force: true })
  })

  it('fails if source does not exist', async () => {
    const { integrate } = await import('../../../src/main/hub/integrate')
    await assert.rejects(
      () => integrate({ sourcePath: '/nonexistent/path' }),
      /does not exist/,
    )
  })

  it('fails if project already exists in hub', async () => {
    const { integrate } = await import('../../../src/main/hub/integrate')
    await integrate({ sourcePath: sourceDir })
    await assert.rejects(
      () => integrate({ sourcePath: sourceDir }),
      /existiert bereits/,
    )
  })

  it('warns when source has no .git', async () => {
    await fs.rm(path.join(sourceDir, '.git'), { recursive: true })
    const { integrate } = await import('../../../src/main/hub/integrate')
    const result = await integrate({ sourcePath: sourceDir })
    assert.ok(result.warnings.some(w => w.includes('.git')))
  })

  it('copies everything when excludeBuildArtifacts=false', async () => {
    const { integrate } = await import('../../../src/main/hub/integrate')
    const result = await integrate({
      sourcePath: sourceDir,
      projectName: 'no-exclude',
      excludeBuildArtifacts: false,
    })
    assert.ok(fss.existsSync(path.join(result.hubPath, 'node_modules', 'dep', 'index.js')))
    assert.equal(result.filesExcluded, 0)

    // Cleanup
    await fs.rm(path.join(hubDir, 'projects', 'no-exclude'), { recursive: true, force: true })
  })

  it('original source is untouched after copy', async () => {
    const statBefore = fss.statSync(path.join(sourceDir, 'package.json'))
    const { integrate } = await import('../../../src/main/hub/integrate')
    await integrate({ sourcePath: sourceDir })
    const statAfter = fss.statSync(path.join(sourceDir, 'package.json'))
    assert.equal(statBefore.mtimeMs, statAfter.mtimeMs)
  })
})
