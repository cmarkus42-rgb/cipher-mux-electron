import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('brand module', () => {
  const tmpDir = path.join(os.tmpdir(), `brand-test-${Date.now()}`)
  const communityYaml = path.join(tmpDir, 'profile.community.yaml')
  const cipherYaml = path.join(tmpDir, 'profile.cipher.yaml')

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(
      communityYaml,
      [
        'appName: cipher-mux',
        'scanPaths: []',
        'defaultProjectDir: ""',
        'orchestratorDir: "~/.config/cipher-mux/orchestrator"',
        'statusLineDir: /tmp/cipher-mux/context',
        'projectLauncherDir: ""',
        'qualityBaselineDir: ""',
        'ipcPrefix: cipher-mux',
      ].join('\n'),
    )
    fs.writeFileSync(
      cipherYaml,
      [
        'appName: cipher-mux',
        'scanPaths:',
        '  - /Users/Shared/Nextcloud/Claude/ClaudeCode01',
        'defaultProjectDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01',
        'orchestratorDir: "~/.config/cipher-mux/orchestrator"',
        'statusLineDir: /tmp/cipher-mux/context',
        'projectLauncherDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher',
        'qualityBaselineDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox',
        'ipcPrefix: cipher-mux',
      ].join('\n'),
    )
  })
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('loads community profile with empty scanPaths', () => {
    const { loadProfile } = require('../../src/shared/brand') as typeof import('../../src/shared/brand')
    const brand = loadProfile(communityYaml)
    assert.strictEqual(brand.appName, 'cipher-mux')
    assert.deepStrictEqual(brand.scanPaths, [])
    assert.strictEqual(brand.defaultProjectDir, '')
    assert.strictEqual(brand.projectLauncherDir, '')
    assert.strictEqual(brand.qualityBaselineDir, '')
    assert.strictEqual(brand.ipcPrefix, 'cipher-mux')
  })

  it('loads cipher profile with populated paths', () => {
    const { loadProfile } = require('../../src/shared/brand') as typeof import('../../src/shared/brand')
    const brand = loadProfile(cipherYaml)
    assert.deepStrictEqual(brand.scanPaths, ['/Users/Shared/Nextcloud/Claude/ClaudeCode01'])
    assert.strictEqual(brand.projectLauncherDir, '/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher')
    assert.strictEqual(brand.qualityBaselineDir, '/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox')
  })

  it('falls back to community defaults when file is missing', () => {
    const { loadProfile } = require('../../src/shared/brand') as typeof import('../../src/shared/brand')
    const brand = loadProfile(path.join(tmpDir, 'nonexistent.yaml'))
    assert.strictEqual(brand.appName, 'cipher-mux')
    assert.deepStrictEqual(brand.scanPaths, [])
  })

  it('exposes BRAND singleton from resolved profile', () => {
    const { BRAND } = require('../../src/shared/brand') as typeof import('../../src/shared/brand')
    assert.strictEqual(typeof BRAND.appName, 'string')
    assert.strictEqual(BRAND.ipcPrefix, 'cipher-mux')
  })
})
