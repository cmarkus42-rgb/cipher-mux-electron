import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { KickoffManager } from '../../src/main/project/kickoff-manager'

describe('KickoffManager', () => {
  let tmpDir: string
  let requirementsFile: string
  let manager: KickoffManager

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-kickoff-test-'))
    manager = new KickoffManager()

    // Create a requirements file
    requirementsFile = path.join(tmpDir, 'requirements.md')
    fs.writeFileSync(requirementsFile, '# Requirements\n\n- Feature A\n- Feature B\n', 'utf-8')
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should create directory structure', async () => {
    const result = await manager.kickoff({
      requirementsFile,
      targetDir: tmpDir,
      projectName: 'test-project',
      autoInterview: false,
    })

    assert.ok(fs.existsSync(result.projectPath))
    assert.ok(fs.statSync(result.projectPath).isDirectory())
    assert.ok(fs.existsSync(path.join(result.projectPath, 'docs')))
    assert.ok(fs.statSync(path.join(result.projectPath, 'docs')).isDirectory())
  })

  it('should copy requirements file', async () => {
    const result = await manager.kickoff({
      requirementsFile,
      targetDir: tmpDir,
      projectName: 'test-req-copy',
      autoInterview: false,
    })

    const copiedPath = path.join(result.projectPath, 'docs', 'requirements.md')
    assert.ok(fs.existsSync(copiedPath))
    const content = fs.readFileSync(copiedPath, 'utf-8')
    assert.ok(content.includes('Feature A'))
    assert.equal(result.requirementsCopied, true)
  })

  it('should generate CLAUDE.md with project name', async () => {
    const result = await manager.kickoff({
      requirementsFile,
      targetDir: tmpDir,
      projectName: 'my-awesome-project',
      autoInterview: false,
    })

    assert.ok(fs.existsSync(result.claudeMdPath))
    const content = fs.readFileSync(result.claudeMdPath, 'utf-8')
    assert.ok(content.includes('# my-awesome-project'))
    assert.ok(content.includes('Phase: 1'))
    assert.ok(content.includes('Anforderungsinterview'))
  })

  it('should throw when requirements file is missing', async () => {
    await assert.rejects(
      () =>
        manager.kickoff({
          requirementsFile: path.join(tmpDir, 'nonexistent.md'),
          targetDir: tmpDir,
          projectName: 'fail-project',
          autoInterview: false,
        }),
      (err: Error) => {
        assert.ok(err.message.includes('Requirements file not found'))
        return true
      },
    )
  })

  it('should throw when target directory already exists', async () => {
    // Create the directory first
    const existingDir = path.join(tmpDir, 'existing-project')
    fs.mkdirSync(existingDir)

    await assert.rejects(
      () =>
        manager.kickoff({
          requirementsFile,
          targetDir: tmpDir,
          projectName: 'existing-project',
          autoInterview: false,
        }),
      (err: Error) => {
        assert.ok(err.message.includes('already exists'))
        return true
      },
    )
  })
})
