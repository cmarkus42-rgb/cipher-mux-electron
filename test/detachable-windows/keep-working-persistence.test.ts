import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * REQ-DW-008: Keep Working Persistence — tests that detached window state
 * is correctly saved on quit and restored on start.
 *
 * The production flow:
 *   Quit:  destroy() → configStore.set('detachedWindows', entries)
 *   Start: restoreDetachedWindows() → reads saved entries, validates, reopens
 *
 * We test the pure persistence/validation logic without Electron.
 */

interface DetachedSnapshot {
  type: 'session' | 'note'
  entityId: string
  bounds: { x: number; y: number; width: number; height: number }
}

/** Simulates the save logic from IpcHub.destroy() */
function saveDetachedSnapshot(
  entries: DetachedSnapshot[],
  configPath: string,
): void {
  const config = readConfig(configPath)
  if (entries.length > 0) {
    config.detachedWindows = entries
  } else {
    delete config.detachedWindows
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/** Simulates the restore logic from IpcHub.restoreDetachedWindows() */
function restoreDetachedSnapshot(
  configPath: string,
  isValid: (entry: { type: 'session' | 'note'; entityId: string }) => boolean,
): { restored: DetachedSnapshot[]; skipped: string[] } {
  const config = readConfig(configPath)
  const saved: DetachedSnapshot[] | undefined = config.detachedWindows

  if (!saved || saved.length === 0) return { restored: [], skipped: [] }

  const restored: DetachedSnapshot[] = []
  const skipped: string[] = []

  for (const entry of saved) {
    if (isValid(entry)) {
      restored.push(entry)
    } else {
      skipped.push(entry.entityId)
    }
  }

  // Clear consumed snapshot (production does configStore.set('detachedWindows', undefined))
  delete config.detachedWindows
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

  return { restored, skipped }
}

function readConfig(configPath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

describe('REQ-DW-008: Keep Working Persistence', () => {
  const tmpDir = path.join(os.tmpdir(), `cipher-mux-kw-detach-test-${Date.now()}`)
  const configPath = path.join(tmpDir, 'config.json')

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(configPath, '{}', 'utf-8')
  })

  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('saves detached window entries on quit', () => {
    const entries: DetachedSnapshot[] = [
      { type: 'session', entityId: 'sess-1', bounds: { x: 100, y: 200, width: 800, height: 600 } },
      { type: 'note', entityId: 'note-abc', bounds: { x: 300, y: 400, width: 640, height: 480 } },
    ]
    saveDetachedSnapshot(entries, configPath)

    const config = readConfig(configPath)
    assert.ok(Array.isArray(config.detachedWindows))
    assert.strictEqual((config.detachedWindows as DetachedSnapshot[]).length, 2)
  })

  it('restores detached state on start with valid entries', () => {
    const entries: DetachedSnapshot[] = [
      { type: 'session', entityId: 'sess-1', bounds: { x: 100, y: 200, width: 800, height: 600 } },
    ]
    saveDetachedSnapshot(entries, configPath)

    const activeSessions = new Set(['sess-1'])
    const result = restoreDetachedSnapshot(configPath, (e) => {
      return e.type === 'session' ? activeSessions.has(e.entityId) : true
    })

    assert.strictEqual(result.restored.length, 1)
    assert.strictEqual(result.restored[0].entityId, 'sess-1')
    assert.strictEqual(result.skipped.length, 0)
  })

  it('skips stale sessions that no longer exist', () => {
    const entries: DetachedSnapshot[] = [
      { type: 'session', entityId: 'sess-alive', bounds: { x: 0, y: 0, width: 800, height: 600 } },
      { type: 'session', entityId: 'sess-dead', bounds: { x: 0, y: 0, width: 800, height: 600 } },
    ]
    saveDetachedSnapshot(entries, configPath)

    const activeSessions = new Set(['sess-alive'])
    const result = restoreDetachedSnapshot(configPath, (e) => {
      return e.type === 'session' ? activeSessions.has(e.entityId) : true
    })

    assert.strictEqual(result.restored.length, 1)
    assert.strictEqual(result.restored[0].entityId, 'sess-alive')
    assert.strictEqual(result.skipped.length, 1)
    assert.strictEqual(result.skipped[0], 'sess-dead')
  })

  it('clears consumed snapshot after restore', () => {
    const entries: DetachedSnapshot[] = [
      { type: 'session', entityId: 'sess-1', bounds: { x: 0, y: 0, width: 800, height: 600 } },
    ]
    saveDetachedSnapshot(entries, configPath)

    restoreDetachedSnapshot(configPath, () => true)

    const config = readConfig(configPath)
    assert.strictEqual(config.detachedWindows, undefined, 'snapshot should be cleared after restore')
  })

  it('handles no saved snapshot gracefully', () => {
    const result = restoreDetachedSnapshot(configPath, () => true)
    assert.strictEqual(result.restored.length, 0)
    assert.strictEqual(result.skipped.length, 0)
  })

  it('saves empty array as no-snapshot (clears key)', () => {
    // First save some entries
    saveDetachedSnapshot(
      [{ type: 'session', entityId: 'sess-1', bounds: { x: 0, y: 0, width: 800, height: 600 } }],
      configPath,
    )
    // Now save empty
    saveDetachedSnapshot([], configPath)

    const config = readConfig(configPath)
    assert.strictEqual(config.detachedWindows, undefined)
  })

  it('preserves bounds through save/restore cycle', () => {
    const bounds = { x: 150, y: 250, width: 1024, height: 768 }
    saveDetachedSnapshot([{ type: 'note', entityId: 'note-1', bounds }], configPath)

    const result = restoreDetachedSnapshot(configPath, () => true)
    assert.deepStrictEqual(result.restored[0].bounds, bounds)
  })
})
