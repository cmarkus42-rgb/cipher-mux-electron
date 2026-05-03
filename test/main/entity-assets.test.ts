import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const { deployEntityAssets } = require('../../src/main/session/entity-assets')
const { APP_VERSION } = require('../../src/shared/constants')

describe('deployEntityAssets()', () => {
  let tmpDir: string
  let sourceDir: string
  let targetDir: string

  const makeConfig = (overrides: Record<string, unknown> = {}) => ({
    id: 'companion',
    displayName: 'Test',
    color: '#fff',
    projectPath: targetDir,
    templatePath: 'templates/test-entity',
    features: [],
    ...overrides,
  })

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entity-assets-test-'))
    sourceDir = path.join(tmpDir, 'templates', 'test-entity')
    targetDir = path.join(tmpDir, 'target')

    // Create source template with files
    fs.mkdirSync(path.join(sourceDir, 'guides'), { recursive: true })
    fs.mkdirSync(path.join(sourceDir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'CLAUDE.md'), '# Test Entity\n', 'utf-8')
    fs.writeFileSync(path.join(sourceDir, 'guides', 'intro.md'), '# Intro\n', 'utf-8')
    fs.writeFileSync(
      path.join(sourceDir, '.claude', 'settings.local.json'),
      JSON.stringify({ model: 'opus' }),
      'utf-8'
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('deploys assets when marker file does not exist', () => {
    const result = deployEntityAssets(makeConfig(), tmpDir)
    assert.strictEqual(result, true)
    assert.ok(fs.existsSync(path.join(targetDir, 'CLAUDE.md')))
    assert.ok(fs.existsSync(path.join(targetDir, 'guides', 'intro.md')))
    assert.ok(fs.existsSync(path.join(targetDir, '.entity-deployed')))
  })

  it('writes appVersion into marker file', () => {
    deployEntityAssets(makeConfig(), tmpDir)
    const marker = JSON.parse(fs.readFileSync(path.join(targetDir, '.entity-deployed'), 'utf-8'))
    assert.strictEqual(marker.appVersion, APP_VERSION)
    assert.strictEqual(marker.entityId, 'companion')
    assert.ok(marker.deployedAt)
  })

  it('skips deployment when marker has same version', () => {
    // First deployment
    deployEntityAssets(makeConfig(), tmpDir)

    // Modify a file to verify it won't be overwritten
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), '# User Modified\n', 'utf-8')

    // Second deployment — same version, should skip
    const result = deployEntityAssets(makeConfig(), tmpDir)
    assert.strictEqual(result, false)
    assert.strictEqual(fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf-8'), '# User Modified\n')
  })

  it('redeploys and overwrites on version upgrade', () => {
    // First deployment
    deployEntityAssets(makeConfig(), tmpDir)

    // Simulate user modification
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), '# User Modified\n', 'utf-8')

    // Simulate old version in marker
    const markerPath = path.join(targetDir, '.entity-deployed')
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
    marker.appVersion = 'v0.0.1-old'
    fs.writeFileSync(markerPath, JSON.stringify(marker), 'utf-8')

    // Redeploy — should overwrite template files
    const result = deployEntityAssets(makeConfig(), tmpDir)
    assert.strictEqual(result, true)
    assert.strictEqual(
      fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf-8'),
      '# Test Entity\n'
    )

    // Verify marker updated with current version
    const updatedMarker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
    assert.strictEqual(updatedMarker.appVersion, APP_VERSION)
  })

  it('redeploys when marker has no appVersion (legacy marker)', () => {
    // First deployment
    deployEntityAssets(makeConfig(), tmpDir)

    // Remove appVersion from marker (simulate legacy format)
    const markerPath = path.join(targetDir, '.entity-deployed')
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
    delete marker.appVersion
    fs.writeFileSync(markerPath, JSON.stringify(marker), 'utf-8')

    // Modify file
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), '# Old\n', 'utf-8')

    // Should redeploy (undefined !== APP_VERSION)
    const result = deployEntityAssets(makeConfig(), tmpDir)
    assert.strictEqual(result, true)
    assert.strictEqual(
      fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf-8'),
      '# Test Entity\n'
    )
  })

  it('does not overwrite settings.local.json on upgrade', () => {
    // First deployment
    deployEntityAssets(makeConfig(), tmpDir)

    // Write custom settings
    const settingsPath = path.join(targetDir, '.claude', 'settings.local.json')
    fs.writeFileSync(settingsPath, JSON.stringify({ custom: true }), 'utf-8')

    // Simulate version upgrade
    const markerPath = path.join(targetDir, '.entity-deployed')
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
    marker.appVersion = 'v0.0.1-old'
    fs.writeFileSync(markerPath, JSON.stringify(marker), 'utf-8')

    // Redeploy
    deployEntityAssets(makeConfig(), tmpDir)

    // settings.local.json must be preserved (not overwritten)
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    assert.strictEqual(settings.custom, true)
  })

  it('does not overwrite existing files on first deploy', () => {
    // Pre-create target with a file
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), '# Pre-existing\n', 'utf-8')

    deployEntityAssets(makeConfig(), tmpDir)
    assert.strictEqual(fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf-8'), '# Pre-existing\n')
    // But the guide should be copied since it doesn't exist in target
    assert.ok(fs.existsSync(path.join(targetDir, 'guides', 'intro.md')))
  })

  it('returns false when no templatePath', () => {
    const result = deployEntityAssets(makeConfig({ templatePath: undefined }), tmpDir)
    assert.strictEqual(result, false)
  })

  it('returns false when source directory does not exist', () => {
    const result = deployEntityAssets(makeConfig({ templatePath: 'nonexistent/path' }), tmpDir)
    assert.strictEqual(result, false)
  })

  it('redeploys on corrupt marker', () => {
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, '.entity-deployed'), 'not json', 'utf-8')

    const result = deployEntityAssets(makeConfig(), tmpDir)
    assert.strictEqual(result, true)
    assert.ok(fs.existsSync(path.join(targetDir, 'CLAUDE.md')))
  })
})
