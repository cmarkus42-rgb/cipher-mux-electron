import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFileSync } from 'child_process'

const tmpDir = path.join(os.tmpdir(), `hub-release-test-${Date.now()}`)
process.env.HUB_ROOT_OVERRIDE = tmpDir

import { hubRelease } from '../../../src/main/hub/release'

describe('hub release (REQ-HUB-006)', () => {
  const projectName = 'release-project'
  const projDir = path.join(tmpDir, 'projects', projectName)
  const originalDir = path.join(tmpDir, 'original-project')

  before(() => {
    // Hub structure
    fs.mkdirSync(projDir, { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'workspaces'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'migrations', projectName), { recursive: true })

    // Create .project-meta.json
    fs.writeFileSync(path.join(projDir, '.project-meta.json'), JSON.stringify({
      archived_origin: originalDir,
      lifecycle_phase: 'brownfield-adopted',
    }))

    // Create workspace config
    fs.writeFileSync(path.join(tmpDir, 'workspaces', `ws-${projectName}.json`), JSON.stringify({
      name: projectName,
      projectPath: projDir,
    }))

    // Create original project with git repo
    fs.mkdirSync(originalDir, { recursive: true })
    execFileSync('git', ['init'], { cwd: originalDir })
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/test/repo.git'], { cwd: originalDir })

    // Create ARCHIV-VERWEIS.md
    fs.writeFileSync(path.join(tmpDir, 'ARCHIV-VERWEIS.md'), [
      '# Archiv-Verweis',
      '',
      '## Migrations-Status',
      '',
      '| Projekt | Original-Pfad | Hub-Pfad | Status | Freigabe-Datum |',
      '|---------|---------------|----------|--------|----------------|',
      `| ${projectName} | ${originalDir} | projects/${projectName} | migriert-getestet | — |`,
      '',
    ].join('\n'))
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.HUB_ROOT_OVERRIDE
  })

  it('throws when status is not migriert-getestet', async () => {
    // Temporarily change status
    const avPath = path.join(tmpDir, 'ARCHIV-VERWEIS.md')
    const content = fs.readFileSync(avPath, 'utf-8')
    fs.writeFileSync(avPath, content.replace('migriert-getestet', 'kopiert'))

    await assert.rejects(
      hubRelease(projectName),
      /Projekt muss erst verifiziert werden/,
    )

    // Restore
    fs.writeFileSync(avPath, content)
  })

  it('releases project successfully', async () => {
    const result = await hubRelease(projectName)

    assert.equal(result.released, true)
    assert.equal(result.hubPath, projDir)
    assert.equal(result.originalPath, originalDir)
    assert.equal(result.originalPushUrl, 'https://github.com/test/repo.git')
    assert.equal(result.pushSperreGesetzt, true)
    assert.equal(result.migratedMdGeschrieben, true)
    assert.equal(result.workspaceUpdated, true)

    // Verify MIGRATED.md in original
    const migratedMd = fs.readFileSync(path.join(originalDir, 'MIGRATED.md'), 'utf-8')
    assert.ok(migratedMd.includes(projDir))

    // Verify push URL is locked
    const pushUrl = execFileSync('git', ['remote', 'get-url', '--push', 'origin'], {
      cwd: originalDir,
      encoding: 'utf-8',
    }).trim()
    assert.equal(pushUrl, 'no-push')

    // Verify original_push_url saved in project meta
    const meta = JSON.parse(fs.readFileSync(path.join(projDir, '.project-meta.json'), 'utf-8'))
    assert.equal(meta.original_push_url, 'https://github.com/test/repo.git')

    // Verify workspace config updated
    const ws = JSON.parse(fs.readFileSync(path.join(tmpDir, 'workspaces', `ws-${projectName}.json`), 'utf-8'))
    assert.equal(ws.projectPath, projDir)
    assert.ok(ws.releasedAt)
  })

  it('handles missing original gracefully', async () => {
    const ghostProject = 'ghost-orig'
    const ghostDir = path.join(tmpDir, 'projects', ghostProject)
    fs.mkdirSync(ghostDir, { recursive: true })
    fs.writeFileSync(path.join(ghostDir, '.project-meta.json'), '{}')
    fs.mkdirSync(path.join(tmpDir, 'migrations', ghostProject), { recursive: true })

    // Add to ARCHIV-VERWEIS
    const avPath = path.join(tmpDir, 'ARCHIV-VERWEIS.md')
    const avContent = fs.readFileSync(avPath, 'utf-8')
    fs.writeFileSync(avPath, avContent.trimEnd() +
      `\n| ${ghostProject} | /nonexistent/path | projects/${ghostProject} | migriert-getestet | — |\n`)

    const result = await hubRelease(ghostProject)

    // Release succeeds but push lock and MIGRATED.md can't be set
    assert.equal(result.released, true)
    assert.equal(result.pushSperreGesetzt, false)
    assert.equal(result.migratedMdGeschrieben, false)
    assert.equal(result.originalPushUrl, 'unknown')
  })
})
