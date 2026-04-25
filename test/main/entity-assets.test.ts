import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const { deployEntityAssets } = require('../../src/main/session/entity-assets')

describe('deployEntityAssets()', () => {
  let tmpDir: string
  let sourceDir: string
  let targetDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entity-assets-test-'))
    sourceDir = path.join(tmpDir, 'templates', 'test-entity')
    targetDir = path.join(tmpDir, 'target')

    // Create source template with files
    fs.mkdirSync(path.join(sourceDir, 'guides'), { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'CLAUDE.md'), '# Test Entity\n', 'utf-8')
    fs.writeFileSync(path.join(sourceDir, 'guides', 'intro.md'), '# Intro\n', 'utf-8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('deploys assets when marker file does not exist', () => {
    const config = {
      id: 'companion',
      displayName: 'Test',
      color: '#fff',
      projectPath: targetDir,
      templatePath: 'templates/test-entity',
      features: [],
    }
    const result = deployEntityAssets(config, tmpDir)
    assert.strictEqual(result, true)
    assert.ok(fs.existsSync(path.join(targetDir, 'CLAUDE.md')))
    assert.ok(fs.existsSync(path.join(targetDir, 'guides', 'intro.md')))
    assert.ok(fs.existsSync(path.join(targetDir, '.entity-deployed')))
  })

  it('skips deployment when marker file exists', () => {
    // First deployment
    const config = {
      id: 'companion',
      displayName: 'Test',
      color: '#fff',
      projectPath: targetDir,
      templatePath: 'templates/test-entity',
      features: [],
    }
    deployEntityAssets(config, tmpDir)

    // Modify a file to verify it won't be overwritten
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), '# User Modified\n', 'utf-8')

    // Second deployment — should skip
    const result = deployEntityAssets(config, tmpDir)
    assert.strictEqual(result, false)
    assert.strictEqual(fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf-8'), '# User Modified\n')
  })

  it('does not overwrite existing files in target', () => {
    // Pre-create target with a file
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), '# Pre-existing\n', 'utf-8')

    const config = {
      id: 'companion',
      displayName: 'Test',
      color: '#fff',
      projectPath: targetDir,
      templatePath: 'templates/test-entity',
      features: [],
    }
    deployEntityAssets(config, tmpDir)
    assert.strictEqual(fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf-8'), '# Pre-existing\n')
    // But the guide should be copied since it doesn't exist in target
    assert.ok(fs.existsSync(path.join(targetDir, 'guides', 'intro.md')))
  })

  it('returns false when no templatePath', () => {
    const config = {
      id: 'orchestrator',
      displayName: 'Orchestrator',
      color: '#4fc3f7',
      projectPath: targetDir,
      features: [],
    }
    const result = deployEntityAssets(config, tmpDir)
    assert.strictEqual(result, false)
  })

  it('returns false when source directory does not exist', () => {
    const config = {
      id: 'companion',
      displayName: 'Test',
      color: '#fff',
      projectPath: targetDir,
      templatePath: 'nonexistent/path',
      features: [],
    }
    const result = deployEntityAssets(config, tmpDir)
    assert.strictEqual(result, false)
  })
})
