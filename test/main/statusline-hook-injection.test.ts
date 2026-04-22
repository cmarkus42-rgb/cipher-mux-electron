import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { injectStatusLineHook } from '../../src/main/monitoring/statusline-hook'

describe('injectStatusLineHook', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-hook-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates settings.local.json with top-level statusLine when file does not exist', () => {
    injectStatusLineHook(tmpDir)

    const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json')
    assert.ok(fs.existsSync(settingsPath), 'settings.local.json should be created')

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    assert.ok(settings.statusLine, 'statusLine key should exist')
    assert.equal(settings.statusLine.type, 'command')
    assert.ok(
      settings.statusLine.command.includes('CIPHER_MUX_SESSION_ID'),
      'command should reference CIPHER_MUX_SESSION_ID env var',
    )
    assert.ok(
      settings.statusLine.command.includes('/tmp/cipher-mux/context/'),
      'command should write to the context directory',
    )
    // Must NOT be under hooks
    assert.equal(settings.hooks, undefined, 'should not create hooks object')
  })

  it('merges with existing settings without overwriting', () => {
    const claudeDir = path.join(tmpDir, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(
      path.join(claudeDir, 'settings.local.json'),
      JSON.stringify({
        permissions: { allow: ['Read'] },
        hooks: {
          PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo ok' }] }],
        },
      }),
    )

    injectStatusLineHook(tmpDir)

    const settings = JSON.parse(
      fs.readFileSync(path.join(claudeDir, 'settings.local.json'), 'utf-8'),
    )

    // Existing settings preserved
    assert.deepEqual(settings.permissions, { allow: ['Read'] })
    assert.ok(settings.hooks.PostToolUse, 'existing PostToolUse hook should be preserved')
    assert.equal(settings.hooks.PostToolUse.length, 1)

    // statusLine added at top level
    assert.ok(settings.statusLine, 'statusLine should be added')
    assert.equal(settings.statusLine.type, 'command')
  })

  it('does not duplicate statusLine if already present', () => {
    // First injection
    injectStatusLineHook(tmpDir)
    // Second injection
    injectStatusLineHook(tmpDir)

    const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json')
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    assert.ok(settings.statusLine.command, 'statusLine should still exist')
  })

  it('migrates legacy hooks.StatusLine to top-level statusLine', () => {
    const claudeDir = path.join(tmpDir, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(
      path.join(claudeDir, 'settings.local.json'),
      JSON.stringify({
        hooks: {
          StatusLine: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'cat > /tmp/old-path.json' }],
            },
          ],
        },
      }),
    )

    injectStatusLineHook(tmpDir)

    const settings = JSON.parse(
      fs.readFileSync(path.join(claudeDir, 'settings.local.json'), 'utf-8'),
    )

    // Legacy key removed
    assert.equal(settings.hooks, undefined, 'empty hooks object should be removed')
    // Top-level statusLine set
    assert.ok(settings.statusLine, 'statusLine should exist at top level')
    assert.equal(settings.statusLine.type, 'command')
  })

  it('creates .claude directory if it does not exist', () => {
    const claudeDir = path.join(tmpDir, '.claude')
    assert.ok(!fs.existsSync(claudeDir), 'precondition: .claude should not exist')

    injectStatusLineHook(tmpDir)

    assert.ok(fs.existsSync(claudeDir), '.claude directory should be created')
  })
})
