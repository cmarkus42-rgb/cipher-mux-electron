import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

/**
 * REQ-DW-005: Window Registry — tests WindowManager's detached window tracking.
 *
 * We test the registry logic (Map operations, isDetached, getDetachedEntries,
 * sendToAllWindows iteration) by building a minimal WindowManager stub that
 * mirrors the production Map<string, { window, entry }> pattern.
 *
 * Electron's BrowserWindow can't be instantiated in node:test, so we mock
 * the window objects with the minimal interface WindowManager actually uses.
 */

interface FakeWindow {
  id: number
  destroyed: boolean
  lastSent: Array<{ channel: string; data: unknown }>
  isDestroyed(): boolean
  close(): void
  focus(): void
  getBounds(): { x: number; y: number; width: number; height: number }
  webContents: {
    send(channel: string, data: unknown): void
  }
}

function createFakeWindow(id = 1): FakeWindow {
  const win: FakeWindow = {
    id,
    destroyed: false,
    lastSent: [],
    isDestroyed() { return this.destroyed },
    close() { this.destroyed = true },
    focus() {},
    getBounds() { return { x: 0, y: 0, width: 800, height: 600 } },
    webContents: {
      send(channel: string, data: unknown) { win.lastSent.push({ channel, data }) },
    },
  }
  return win
}

interface DetachedEntry {
  type: 'session' | 'note'
  entityId: string
  bounds: { x: number; y: number; width: number; height: number }
}

/**
 * Minimal registry that mirrors WindowManager's detached window logic.
 * We extract the pure data-structure behavior to test without Electron.
 */
class DetachedWindowRegistry {
  private windows = new Map<string, { window: FakeWindow; entry: DetachedEntry }>()

  open(type: 'session' | 'note', entityId: string): FakeWindow {
    const existing = this.windows.get(entityId)
    if (existing && !existing.window.isDestroyed()) {
      existing.window.focus()
      return existing.window
    }
    const win = createFakeWindow()
    const entry: DetachedEntry = {
      type,
      entityId,
      bounds: win.getBounds(),
    }
    this.windows.set(entityId, { window: win, entry })
    return win
  }

  close(entityId: string): void {
    const existing = this.windows.get(entityId)
    if (existing && !existing.window.isDestroyed()) {
      existing.window.close()
    }
    this.windows.delete(entityId)
  }

  isDetached(entityId: string): boolean {
    const existing = this.windows.get(entityId)
    return !!existing && !existing.window.isDestroyed()
  }

  getDetachedEntries(): DetachedEntry[] {
    return Array.from(this.windows.values()).map(({ entry }) => entry)
  }

  getWindow(entityId: string): FakeWindow | null {
    const existing = this.windows.get(entityId)
    if (existing && !existing.window.isDestroyed()) return existing.window
    return null
  }

  sendToAll(channel: string, data: unknown): void {
    for (const { window: win } of Array.from(this.windows.values())) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
  }
}

describe('REQ-DW-005: Window Registry', () => {
  let registry: DetachedWindowRegistry

  beforeEach(() => {
    registry = new DetachedWindowRegistry()
  })

  it('openDetachedWindow creates an entry in the registry', () => {
    registry.open('session', 'sess-1')
    assert.strictEqual(registry.isDetached('sess-1'), true)
    assert.strictEqual(registry.getDetachedEntries().length, 1)
    assert.strictEqual(registry.getDetachedEntries()[0].entityId, 'sess-1')
    assert.strictEqual(registry.getDetachedEntries()[0].type, 'session')
  })

  it('openDetachedWindow with note type stores correct type', () => {
    registry.open('note', 'note-abc')
    assert.strictEqual(registry.getDetachedEntries()[0].type, 'note')
    assert.strictEqual(registry.getDetachedEntries()[0].entityId, 'note-abc')
  })

  it('opening same entity twice returns existing window (no duplicate)', () => {
    const win1 = registry.open('session', 'sess-1')
    const win2 = registry.open('session', 'sess-1')
    assert.strictEqual(win1, win2, 'should return same window instance')
    assert.strictEqual(registry.getDetachedEntries().length, 1)
  })

  it('closeDetachedWindow removes the entry', () => {
    registry.open('session', 'sess-1')
    assert.strictEqual(registry.isDetached('sess-1'), true)
    registry.close('sess-1')
    assert.strictEqual(registry.isDetached('sess-1'), false)
    assert.strictEqual(registry.getDetachedEntries().length, 0)
  })

  it('closeDetachedWindow on non-existent entry is a no-op', () => {
    registry.close('non-existent')
    assert.strictEqual(registry.getDetachedEntries().length, 0)
  })

  it('isDetached returns false for unknown entity', () => {
    assert.strictEqual(registry.isDetached('unknown'), false)
  })

  it('isDetached returns false after window is destroyed', () => {
    const win = registry.open('session', 'sess-1')
    win.destroyed = true
    assert.strictEqual(registry.isDetached('sess-1'), false)
  })

  it('getDetachedEntries returns all entries', () => {
    registry.open('session', 'sess-1')
    registry.open('note', 'note-1')
    registry.open('session', 'sess-2')
    const entries = registry.getDetachedEntries()
    assert.strictEqual(entries.length, 3)
    const ids = entries.map(e => e.entityId).sort()
    assert.deepStrictEqual(ids, ['note-1', 'sess-1', 'sess-2'])
  })

  it('sendToAllWindows iterates all non-destroyed windows', () => {
    registry.open('session', 'sess-1')
    registry.open('note', 'note-1')
    const destroyedWin = registry.open('session', 'sess-destroyed')
    destroyedWin.destroyed = true

    registry.sendToAll('test-channel', { hello: true })

    const win1 = registry.getWindow('sess-1')!
    const win2 = registry.getWindow('note-1')!
    assert.strictEqual(win1.lastSent.length, 1)
    assert.strictEqual(win1.lastSent[0].channel, 'test-channel')
    assert.strictEqual(win2.lastSent.length, 1)
    // Destroyed window should not have received the message
    assert.strictEqual(destroyedWin.lastSent.length, 0)
  })

  it('getWindow returns null for destroyed window', () => {
    const win = registry.open('session', 'sess-1')
    win.destroyed = true
    assert.strictEqual(registry.getWindow('sess-1'), null)
  })

  it('multiple open/close cycles work correctly', () => {
    registry.open('session', 'sess-1')
    registry.close('sess-1')
    registry.open('session', 'sess-1')
    assert.strictEqual(registry.isDetached('sess-1'), true)
    assert.strictEqual(registry.getDetachedEntries().length, 1)
  })
})
