import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

// Set HUB_ROOT_OVERRIDE before importing hub-paths
let tmpDir: string

describe('hub-paths', () => {
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-paths-test-'))
    process.env.HUB_ROOT_OVERRIDE = tmpDir
    // Create ARCHIV-VERWEIS.md so the walker would find it
    await fs.writeFile(path.join(tmpDir, 'ARCHIV-VERWEIS.md'), '# test')
  })

  after(async () => {
    delete process.env.HUB_ROOT_OVERRIDE
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('hubRoot returns override', async () => {
    // Dynamic import to pick up env var
    const { hubRoot, _resetHubRoot } = await import('../../../src/main/hub/hub-paths')
    _resetHubRoot()
    assert.equal(hubRoot(), tmpDir)
  })

  it('projectsDir is hubRoot/projects', async () => {
    const { projectsDir } = await import('../../../src/main/hub/hub-paths')
    assert.equal(projectsDir(), path.join(tmpDir, 'projects'))
  })

  it('projectDir appends project name', async () => {
    const { projectDir } = await import('../../../src/main/hub/hub-paths')
    assert.equal(projectDir('my-app'), path.join(tmpDir, 'projects', 'my-app'))
  })

  it('migrationsDir is hubRoot/migrations', async () => {
    const { migrationsDir } = await import('../../../src/main/hub/hub-paths')
    assert.equal(migrationsDir(), path.join(tmpDir, 'migrations'))
  })

  it('projectMigrationsDir appends project name', async () => {
    const { projectMigrationsDir } = await import('../../../src/main/hub/hub-paths')
    assert.equal(projectMigrationsDir('foo'), path.join(tmpDir, 'migrations', 'foo'))
  })

  it('workspacesDir is hubRoot/workspaces', async () => {
    const { workspacesDir } = await import('../../../src/main/hub/hub-paths')
    assert.equal(workspacesDir(), path.join(tmpDir, 'workspaces'))
  })

  it('archivVerweisPath is hubRoot/ARCHIV-VERWEIS.md', async () => {
    const { archivVerweisPath } = await import('../../../src/main/hub/hub-paths')
    assert.equal(archivVerweisPath(), path.join(tmpDir, 'ARCHIV-VERWEIS.md'))
  })

  it('dateSuffix returns YYYY-MM-DD format', async () => {
    const { dateSuffix } = await import('../../../src/main/hub/hub-paths')
    assert.match(dateSuffix(), /^\d{4}-\d{2}-\d{2}$/)
  })

  it('DEFAULT_EXCLUDE_DIRS has expected entries', async () => {
    const { DEFAULT_EXCLUDE_DIRS } = await import('../../../src/main/hub/hub-paths')
    assert.ok(DEFAULT_EXCLUDE_DIRS.includes('node_modules'))
    assert.ok(DEFAULT_EXCLUDE_DIRS.includes('dist'))
    assert.ok(DEFAULT_EXCLUDE_DIRS.includes('__pycache__'))
    assert.ok(DEFAULT_EXCLUDE_DIRS.includes('target'))
  })
})
