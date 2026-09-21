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
  liveWorkspaceIds,
} = require('../../src/main/session/entity-run-dir')

let base: string
let entityDir: string

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-runs-'))
  entityDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-entity-'))
  fs.mkdirSync(path.join(entityDir, 'skills'), { recursive: true })
  fs.writeFileSync(path.join(entityDir, 'skills', 'a.md'), 'skill', 'utf-8')
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

  it('links requested top-level names from the entity dir into the run dir', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(dir, 'skills')
    assert.ok(fs.existsSync(link))
    assert.equal(fs.readFileSync(path.join(link, 'a.md'), 'utf-8'), 'skill')
  })

  it('is idempotent — a second call does not throw', () => {
    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(base, 'ws-alpha', 'companion', 'skills')
    assert.ok(fs.existsSync(link))
  })

  it('repairs a dangling symlink instead of leaving it broken', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(dir, 'skills')
    fs.unlinkSync(link)
    fs.symlinkSync(path.join(entityDir, 'does-not-exist'), link)
    assert.equal(fs.existsSync(link), false, 'precondition: link is dangling')

    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    assert.ok(fs.existsSync(link))
    assert.equal(fs.readFileSync(path.join(link, 'a.md'), 'utf-8'), 'skill')
  })

  it('skips link names that do not exist in the entity dir', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['nope'], base)
    assert.equal(fs.existsSync(path.join(dir, 'nope')), false)
  })

  it('does not replace a real directory with a symlink', () => {
    const dir = resolveRunDir('ws-alpha', 'companion', base)
    fs.mkdirSync(dir, { recursive: true })
    const realSkillsDir = path.join(dir, 'skills')
    fs.mkdirSync(realSkillsDir)
    fs.writeFileSync(path.join(realSkillsDir, 'user-data.txt'), 'precious', 'utf-8')

    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)

    const link = path.join(dir, 'skills')
    const stat = fs.lstatSync(link)
    assert.equal(stat.isSymbolicLink(), false, 'skills should still be a real directory')
    assert.equal(fs.readFileSync(path.join(link, 'user-data.txt'), 'utf-8'), 'precious', 'user data must be preserved')
  })

  it('creates the .claude dir even when no link name is under it', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    assert.ok(fs.existsSync(path.join(dir, '.claude')))
  })

  it('links a nested name end to end (Companion /startup command)', () => {
    fs.mkdirSync(path.join(entityDir, '.claude', 'commands'), { recursive: true })
    fs.writeFileSync(path.join(entityDir, '.claude', 'commands', 'startup.md'), 'startup routine', 'utf-8')

    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['.claude/commands'], base)
    const linkedFile = path.join(dir, '.claude', 'commands', 'startup.md')
    assert.ok(fs.existsSync(linkedFile))
    assert.equal(fs.readFileSync(linkedFile, 'utf-8'), 'startup routine')
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

describe('liveWorkspaceIds', () => {
  it('unions configured ids with session workspace ids', () => {
    const ids = liveWorkspaceIds(['ws-alpha'], ['ws-beta'])
    assert.deepEqual([...ids].sort(), ['ws-alpha', 'ws-beta'])
  })

  it('deduplicates ids present in both sources', () => {
    const ids = liveWorkspaceIds(['ws-alpha'], ['ws-alpha'])
    assert.deepEqual(ids, ['ws-alpha'])
  })

  it('keeps a session workspace id alive even if the workspace was deleted', () => {
    // Simulates: workspace deleted from config, but its session is still running.
    const ids = liveWorkspaceIds([], ['ws-gone'])
    assert.deepEqual(ids, ['ws-gone'])
  })

  it('ignores null and undefined session workspace ids (unbound sessions)', () => {
    const ids = liveWorkspaceIds(['ws-alpha'], [null, undefined, 'ws-beta'])
    assert.deepEqual([...ids].sort(), ['ws-alpha', 'ws-beta'])
  })

  it('returns an empty list when nothing is configured or running', () => {
    assert.deepEqual(liveWorkspaceIds([], []), [])
  })
})
