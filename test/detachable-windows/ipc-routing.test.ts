import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

/**
 * REQ-DW-006: IPC Routing — tests that TERMINAL_DATA is routed to the correct
 * window based on detach state.
 *
 * The production routing logic in ipc-hub.ts:
 *   if (windowManager.isDetached(paneId)) → send to detached window
 *   else → send to mainWindow
 *
 * We test this routing decision logic without Electron by simulating the
 * WindowManager interface and the routing branch.
 */

interface RoutedMessage {
  target: 'main' | 'detached'
  channel: string
  data: unknown
}

class MockWindowManager {
  private detachedSet = new Set<string>()
  readonly messages: RoutedMessage[] = []

  detach(entityId: string): void {
    this.detachedSet.add(entityId)
  }

  dock(entityId: string): void {
    this.detachedSet.delete(entityId)
  }

  isDetached(entityId: string): boolean {
    return this.detachedSet.has(entityId)
  }

  sendToMainWindow(channel: string, data: unknown): void {
    this.messages.push({ target: 'main', channel, data })
  }

  sendToDetachedWindow(entityId: string, channel: string, data: unknown): void {
    if (this.detachedSet.has(entityId)) {
      this.messages.push({ target: 'detached', channel, data })
    }
  }
}

/** Simulates the routing logic from ipc-hub.ts tmux output handler */
function routeTerminalData(wm: MockWindowManager, paneId: string, data: string): void {
  const channel = 'cipher-mux:terminal:data'
  if (wm.isDetached(paneId)) {
    wm.sendToDetachedWindow(paneId, channel, { paneId, data })
  } else {
    wm.sendToMainWindow(channel, { paneId, data })
  }
}

describe('REQ-DW-006: IPC Routing', () => {
  let wm: MockWindowManager

  beforeEach(() => {
    wm = new MockWindowManager()
  })

  it('routes TERMINAL_DATA to mainWindow when session is not detached', () => {
    routeTerminalData(wm, 'session-1', 'hello')
    assert.strictEqual(wm.messages.length, 1)
    assert.strictEqual(wm.messages[0].target, 'main')
    assert.deepStrictEqual(wm.messages[0].data, { paneId: 'session-1', data: 'hello' })
  })

  it('routes TERMINAL_DATA to detached window when session is detached', () => {
    wm.detach('session-1')
    routeTerminalData(wm, 'session-1', 'hello')
    assert.strictEqual(wm.messages.length, 1)
    assert.strictEqual(wm.messages[0].target, 'detached')
    assert.deepStrictEqual(wm.messages[0].data, { paneId: 'session-1', data: 'hello' })
  })

  it('switches routing when session is detached after initial messages', () => {
    // Send while docked
    routeTerminalData(wm, 'session-1', 'data-1')
    assert.strictEqual(wm.messages[0].target, 'main')

    // Detach
    wm.detach('session-1')
    routeTerminalData(wm, 'session-1', 'data-2')
    assert.strictEqual(wm.messages[1].target, 'detached')
  })

  it('switches routing back when session is docked after being detached', () => {
    wm.detach('session-1')
    routeTerminalData(wm, 'session-1', 'data-1')
    assert.strictEqual(wm.messages[0].target, 'detached')

    // Dock back
    wm.dock('session-1')
    routeTerminalData(wm, 'session-1', 'data-2')
    assert.strictEqual(wm.messages[1].target, 'main')
  })

  it('routes different sessions independently', () => {
    wm.detach('session-1')
    // session-1 is detached, session-2 is not
    routeTerminalData(wm, 'session-1', 'for-detached')
    routeTerminalData(wm, 'session-2', 'for-main')
    assert.strictEqual(wm.messages[0].target, 'detached')
    assert.strictEqual(wm.messages[1].target, 'main')
  })

  it('handles rapid detach/dock cycles correctly', () => {
    wm.detach('session-1')
    wm.dock('session-1')
    wm.detach('session-1')

    routeTerminalData(wm, 'session-1', 'after-cycles')
    assert.strictEqual(wm.messages[0].target, 'detached')
  })
})
