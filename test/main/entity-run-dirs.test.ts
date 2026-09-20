import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const { workspaceKey } = require('../../src/shared/workspace-key')
const {
  resolveRunDir,
  ensureRunDir,
  pruneRunDirs,
} = require('../../src/main/session/entity-run-dir')

let base: string
let entityDir: string

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-runs-'))
  entityDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-entity-'))
  fs.mkdirSync(path.join(entityDir, '.claude', 'skills'), { recursive: true })
  fs.writeFileSync(path.join(entityDir, '.claude', 'skills', 'a.md'), 'skill', 'utf-8')
})

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true })
  fs.rmSync(entityDir, { recursive: true, force: true })
})

describe('workspaceKey', () => {
  it('maps null to the _global sentinel', () => {
    assert.equal(workspaceKey(null), '_global')
  })

  it('maps undefined to the _global sentinel', () => {
    assert.equal(workspaceKey(undefined), '_global')
  })

  it('passes a real workspace id through unchanged', () => {
    assert.equal(workspaceKey('ws-alpha'), 'ws-alpha')
  })
})

describe('resolveRunDir', () => {
  it('separates the same entity across two workspaces', () => {
    const a = resolveRunDir('ws-alpha', 'companion', base)
    const b = resolveRunDir('ws-beta', 'companion', base)
    assert.notEqual(a, b)
    assert.equal(a, path.join(base, 'ws-alpha', 'companion'))
    assert.equal(b, path.join(base, 'ws-beta', 'companion'))
  })

  it('separates two entities inside the same workspace', () => {
    const a = resolveRunDir('ws-alpha', 'companion', base)
    const b = resolveRunDir('ws-alpha', 'refinement', base)
    assert.notEqual(a, b)
  })

  it('uses the _global sentinel when unbound', () => {
    assert.equal(resolveRunDir(null, 'audit', base), path.join(base, '_global', 'audit'))
  })
})

describe('ensureRunDir', () => {
  it('creates the directory', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, [], base)
    assert.ok(fs.existsSync(dir))
  })

  it('links requested names from the entity dir into .claude/', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(dir, '.claude', 'skills')
    assert.ok(fs.existsSync(link))
    assert.equal(fs.readFileSync(path.join(link, 'a.md'), 'utf-8'), 'skill')
  })

  it('is idempotent — a second call does not throw', () => {
    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(base, 'ws-alpha', 'companion', '.claude', 'skills')
    assert.ok(fs.existsSync(link))
  })

  it('repairs a dangling symlink instead of leaving it broken', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(dir, '.claude', 'skills')
    fs.unlinkSync(link)
    fs.symlinkSync(path.join(entityDir, 'does-not-exist'), link)
    assert.equal(fs.existsSync(link), false, 'precondition: link is dangling')

    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    assert.ok(fs.existsSync(link))
    assert.equal(fs.readFileSync(path.join(link, 'a.md'), 'utf-8'), 'skill')
  })

  it('skips link names that do not exist in the entity dir', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['nope'], base)
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'nope')), false)
  })
})

describe('pruneRunDirs', () => {
  it('removes run dirs of workspaces that no longer exist', () => {
    ensureRunDir('ws-alpha', 'companion', entityDir, [], base)
    ensureRunDir('ws-gone', 'companion', entityDir, [], base)

    const removed = pruneRunDirs(['ws-alpha'], base)

    assert.deepEqual(removed, [path.join(base, 'ws-gone')])
    assert.ok(fs.existsSync(path.join(base, 'ws-alpha')))
    assert.equal(fs.existsSync(path.join(base, 'ws-gone')), false)
  })

  it('never removes the _global dir', () => {
    ensureRunDir(null, 'audit', entityDir, [], base)
    const removed = pruneRunDirs(['ws-alpha'], base)
    assert.deepEqual(removed, [])
    assert.ok(fs.existsSync(path.join(base, '_global')))
  })

  it('returns an empty list when the base dir does not exist yet', () => {
    const missing = path.join(base, 'not-created')
    assert.deepEqual(pruneRunDirs(['ws-alpha'], missing), [])
  })
})
