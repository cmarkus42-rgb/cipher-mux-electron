import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFileSync } from 'child_process'

const tmpDir = path.join(os.tmpdir(), `hub-rollback-test-${Date.now()}`)
process.env.HUB_ROOT_OVERRIDE = tmpDir

import { hubRollback } from '../../../src/main/hub/rollback'

describe('hub rollback (REQ-HUB-007)', () => {
  const projectName = 'rollback-project'
  const projDir = path.join(tmpDir, 'projects', projectName)
  const originalDir = path.join(tmpDir, 'original-rb')

  before(() => {
    // Hub structure
    fs.mkdirSync(projDir, { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'workspaces'), { recursive: true })

    // Create .project-meta.json with original_push_url
    fs.writeFileSync(path.join(projDir, '.project-meta.json'), JSON.stringify({
      archived_origin: originalDir,
      lifecycle_phase: 'freigegeben',
      original_push_url: 'https://github.com/test/rollback-repo.git',
    }))

    // Create workspace config pointing to hub
    fs.writeFileSync(path.join(tmpDir, 'workspaces', `ws-${projectName}.json`), JSON.stringify({
      name: projectName,
      projectPath: projDir,
    }))

    // Create original directory with git + MIGRATED.md + locked push URL
    fs.mkdirSync(originalDir, { recursive: true })
    execFileSync('git', ['init'], { cwd: originalDir })
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/test/rollback-repo.git'], { cwd: originalDir })
    execFileSync('git', ['remote', 'set-url', '--push', 'origin', 'no-push'], { cwd: originalDir })
    fs.writeFileSync(path.join(originalDir, 'MIGRATED.md'), '# MIGRATED\n')

    // ARCHIV-VERWEIS.md
    fs.writeFileSync(path.join(tmpDir, 'ARCHIV-VERWEIS.md'), [
      '# Archiv-Verweis',
      '',
      '## Migrations-Status',
      '',
      '| Projekt | Original-Pfad | Hub-Pfad | Status | Freigabe-Datum |',
      '|---------|---------------|----------|--------|----------------|',
      `| ${projectName} | ${originalDir} | projects/${projectName} | freigegeben | 2026-05-01 |`,
      '',
    ].join('\n'))
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.HUB_ROOT_OVERRIDE
  })

  it('throws when original path is unreachable', async () => {
    const ghostProj = 'ghost-rollback'
    const ghostDir = path.join(tmpDir, 'projects', ghostProj)
    fs.mkdirSync(ghostDir, { recursive: true })

    const avPath = path.join(tmpDir, 'ARCHIV-VERWEIS.md')
    const content = fs.readFileSync(avPath, 'utf-8')
    fs.writeFileSync(avPath, content.trimEnd() +
      `\n| ${ghostProj} | /nonexistent/rb | projects/${ghostProj} | freigegeben | 2026-05-01 |\n`)

    await assert.rejects(
      hubRollback({ projectName: ghostProj }),
      /Original-Pfad nicht gefunden/,
    )
  })

  it('rolls back successfully — restores push URL and removes MIGRATED.md', async () => {
    const result = await hubRollback({ projectName })

    assert.equal(result.rolledBack, true)
    assert.equal(result.workspacePointsTo, originalDir)
    assert.equal(result.pushSperreEntfernt, true)
    assert.equal(result.hubCopyRemoved, false)

    // Push URL restored
    const pushUrl = execFileSync('git', ['remote', 'get-url', '--push', 'origin'], {
      cwd: originalDir,
      encoding: 'utf-8',
    }).trim()
    assert.equal(pushUrl, 'https://github.com/test/rollback-repo.git')

    // MIGRATED.md removed
    assert.equal(fs.existsSync(path.join(originalDir, 'MIGRATED.md')), false)

    // Workspace config points to original
    const ws = JSON.parse(fs.readFileSync(path.join(tmpDir, 'workspaces', `ws-${projectName}.json`), 'utf-8'))
    assert.equal(ws.projectPath, originalDir)
    assert.ok(ws.rolledBackAt)

    // Status is parallel-betrieben (hub copy kept)
    const av = fs.readFileSync(path.join(tmpDir, 'ARCHIV-VERWEIS.md'), 'utf-8')
    assert.ok(av.includes('parallel-betrieben'))
  })

  it('removes hub copy with user confirmation', async () => {
    const rmProject = 'rm-hub-copy'
    const rmProjDir = path.join(tmpDir, 'projects', rmProject)
    const rmOrigDir = path.join(tmpDir, 'rm-original')
    fs.mkdirSync(rmProjDir, { recursive: true })
    fs.mkdirSync(rmOrigDir, { recursive: true })
    execFileSync('git', ['init'], { cwd: rmOrigDir })
    execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/rm.git'], { cwd: rmOrigDir })

    fs.writeFileSync(path.join(rmProjDir, '.project-meta.json'), JSON.stringify({
      original_push_url: 'https://example.com/rm.git',
    }))
    fs.writeFileSync(path.join(tmpDir, 'workspaces', `ws-${rmProject}.json`), JSON.stringify({
      name: rmProject,
      projectPath: rmProjDir,
    }))

    const avPath = path.join(tmpDir, 'ARCHIV-VERWEIS.md')
    const content = fs.readFileSync(avPath, 'utf-8')
    fs.writeFileSync(avPath, content.trimEnd() +
      `\n| ${rmProject} | ${rmOrigDir} | projects/${rmProject} | freigegeben | 2026-05-01 |\n`)

    const mockInput = { create: async () => 'yes' as string | null }
    const result = await hubRollback({ projectName: rmProject, removeHubCopy: true }, mockInput)

    assert.equal(result.hubCopyRemoved, true)
    assert.equal(fs.existsSync(rmProjDir), false)
  })

  it('does NOT remove hub copy without confirmation', async () => {
    const noRmProject = 'no-rm-project'
    const noRmDir = path.join(tmpDir, 'projects', noRmProject)
    const noRmOrig = path.join(tmpDir, 'no-rm-orig')
    fs.mkdirSync(noRmDir, { recursive: true })
    fs.mkdirSync(noRmOrig, { recursive: true })
    execFileSync('git', ['init'], { cwd: noRmOrig })
    execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/nrm.git'], { cwd: noRmOrig })

    fs.writeFileSync(path.join(noRmDir, '.project-meta.json'), JSON.stringify({
      original_push_url: 'https://example.com/nrm.git',
    }))
    fs.writeFileSync(path.join(tmpDir, 'workspaces', `ws-${noRmProject}.json`), JSON.stringify({
      name: noRmProject,
      projectPath: noRmDir,
    }))

    const avPath = path.join(tmpDir, 'ARCHIV-VERWEIS.md')
    const avContent = fs.readFileSync(avPath, 'utf-8')
    fs.writeFileSync(avPath, avContent.trimEnd() +
      `\n| ${noRmProject} | ${noRmOrig} | projects/${noRmProject} | freigegeben | 2026-05-01 |\n`)

    // No inputRequest → destructive action refused
    const result = await hubRollback({ projectName: noRmProject, removeHubCopy: true })

    assert.equal(result.hubCopyRemoved, false)
    assert.equal(fs.existsSync(noRmDir), true) // still there
  })
})
