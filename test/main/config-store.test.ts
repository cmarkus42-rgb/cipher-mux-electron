import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { deepMerge } from '../../src/main/util/deep-merge'

describe('config persistence', () => {
  const tmpDir = path.join(os.tmpdir(), `cipher-mux-config-test-${Date.now()}`)
  const configPath = path.join(tmpDir, 'config.json')

  before(() => fs.mkdirSync(tmpDir, { recursive: true }))
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('writes and reads config correctly', () => {
    const data = { ui: { theme: 'ivory', chatroomVisible: true } }
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    assert.deepStrictEqual(parsed.ui.theme, 'ivory')
    assert.deepStrictEqual(parsed.ui.chatroomVisible, true)
  })

  it('handles empty file gracefully', () => {
    fs.writeFileSync(configPath, '', 'utf-8')
    const raw = fs.readFileSync(configPath, 'utf-8')
    assert.throws(() => JSON.parse(raw))
  })

  it('deep merges with defaults using production deepMerge', () => {
    const defaults = { ui: { theme: 'ivory', chatroomVisible: false, grid: { cols: 5, rows: 2 } } }
    const saved = { ui: { theme: 'dark' } }

    // Shallow spread loses grid — verify this is the bug
    const shallow = { ...defaults, ...saved }
    assert.strictEqual(shallow.ui.grid, undefined) // BUG: grid lost

    // Production deepMerge preserves nested defaults
    const deep = deepMerge(defaults, saved)
    assert.strictEqual(deep.ui.theme, 'dark')
    assert.strictEqual(deep.ui.grid.cols, 5) // preserved
    assert.strictEqual(deep.ui.chatroomVisible, false) // preserved
  })

  it('deepMerge replaces arrays rather than merging them', () => {
    const target = { items: [1, 2, 3], name: 'a' }
    const source = { items: [9] }
    const result = deepMerge(target, source)
    assert.deepStrictEqual(result.items, [9])
    assert.strictEqual(result.name, 'a')
  })

  it('deepMerge does not overwrite with undefined source keys', () => {
    const target = { a: 1, b: 2 }
    const source = { a: 5 }
    const result = deepMerge(target, source)
    assert.strictEqual(result.a, 5)
    assert.strictEqual(result.b, 2)
  })
})
