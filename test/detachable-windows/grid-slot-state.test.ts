import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyGrid, assignSessionToGrid } from '../../src/shared/grid-types'
import type { GridState } from '../../src/shared/grid-types'

/**
 * REQ-DW-010: Grid Slot State — tests that detach/dock operations correctly
 * update grid slot assignments and detachedIds tracking.
 *
 * We test the pure data model logic from useGrid's detachFromGrid/dockToGrid
 * without the React/Preact hooks layer.
 */

/** Pure-function equivalent of useGrid's detachFromGrid */
function detachFromGrid(grid: GridState, entityId: string): { grid: GridState; detachedIds: Set<string> } {
  const idx = grid.slots.findIndex(s => s.sessionId === entityId)
  if (idx === -1) return { grid, detachedIds: new Set([entityId]) }
  const newSlots = [...grid.slots]
  newSlots[idx] = { ...newSlots[idx], sessionId: null }
  return {
    grid: { ...grid, slots: newSlots },
    detachedIds: new Set([entityId]),
  }
}

/** Pure-function equivalent of useGrid's dockToGrid */
function dockToGrid(
  grid: GridState,
  detachedIds: Set<string>,
  entityId: string,
  slotIndex?: number,
): { grid: GridState; detachedIds: Set<string> } {
  const newDetached = new Set(detachedIds)
  newDetached.delete(entityId)

  if (slotIndex !== undefined) {
    const newSlots = [...grid.slots]
    if (slotIndex >= 0 && slotIndex < newSlots.length) {
      newSlots[slotIndex] = { ...newSlots[slotIndex], sessionId: entityId }
    }
    return { grid: { ...grid, slots: newSlots }, detachedIds: newDetached }
  }

  return { grid, detachedIds: newDetached }
}

describe('REQ-DW-010: Grid Slot State', () => {
  let grid: GridState

  beforeEach(() => {
    grid = createEmptyGrid({ cols: 2, rows: 2 })
  })

  it('detachFromGrid clears the slot sessionId to null', () => {
    // Place a session first
    const { state } = assignSessionToGrid(grid, 'sess-1')
    assert.notStrictEqual(state.slots[0].sessionId, null)

    // Detach it
    const result = detachFromGrid(state, 'sess-1')
    const slot = result.grid.slots.find((_, i) => state.slots[i].sessionId === 'sess-1')
    // The slot that had sess-1 should now be null
    assert.strictEqual(result.grid.slots[0].sessionId, null)
  })

  it('detachFromGrid adds entity to detachedIds', () => {
    const { state } = assignSessionToGrid(grid, 'sess-1')
    const result = detachFromGrid(state, 'sess-1')
    assert.strictEqual(result.detachedIds.has('sess-1'), true)
  })

  it('session is not in both grid and detachedIds simultaneously', () => {
    const { state } = assignSessionToGrid(grid, 'sess-1')
    const result = detachFromGrid(state, 'sess-1')

    // Grid should NOT have sess-1 in any slot
    const inGrid = result.grid.slots.some(s => s.sessionId === 'sess-1')
    assert.strictEqual(inGrid, false, 'session should not be in grid after detach')

    // detachedIds SHOULD have sess-1
    assert.strictEqual(result.detachedIds.has('sess-1'), true, 'session should be in detachedIds')
  })

  it('dockToGrid with slotIndex places session back in grid', () => {
    const { state } = assignSessionToGrid(grid, 'sess-1')
    const detached = detachFromGrid(state, 'sess-1')

    // Dock back to slot 2
    const docked = dockToGrid(detached.grid, detached.detachedIds, 'sess-1', 2)
    assert.strictEqual(docked.grid.slots[2].sessionId, 'sess-1')
    assert.strictEqual(docked.detachedIds.has('sess-1'), false)
  })

  it('dockToGrid without slotIndex only removes from detachedIds', () => {
    const { state } = assignSessionToGrid(grid, 'sess-1')
    const detached = detachFromGrid(state, 'sess-1')

    const docked = dockToGrid(detached.grid, detached.detachedIds, 'sess-1')
    // No slot should have sess-1
    const inGrid = docked.grid.slots.some(s => s.sessionId === 'sess-1')
    assert.strictEqual(inGrid, false)
    assert.strictEqual(docked.detachedIds.has('sess-1'), false)
  })

  it('detachedIds tracks multiple detached sessions', () => {
    // Add two sessions
    let state = assignSessionToGrid(grid, 'sess-1').state
    state = assignSessionToGrid(state, 'sess-2').state

    // Detach both
    const d1 = detachFromGrid(state, 'sess-1')
    const d2 = detachFromGrid(d1.grid, 'sess-2')

    // Merge detachedIds
    const allDetached = new Set([...d1.detachedIds, ...d2.detachedIds])
    assert.strictEqual(allDetached.has('sess-1'), true)
    assert.strictEqual(allDetached.has('sess-2'), true)
    assert.strictEqual(allDetached.size, 2)
  })

  it('detachFromGrid on non-existent session still adds to detachedIds', () => {
    const result = detachFromGrid(grid, 'ghost-session')
    assert.strictEqual(result.detachedIds.has('ghost-session'), true)
    // Grid unchanged
    assert.deepStrictEqual(result.grid, grid)
  })

  it('dockToGrid with out-of-bounds slotIndex does not crash', () => {
    const detachedIds = new Set(['sess-1'])
    const docked = dockToGrid(grid, detachedIds, 'sess-1', 999)
    // Should still remove from detachedIds
    assert.strictEqual(docked.detachedIds.has('sess-1'), false)
  })

  it('full detach/dock cycle preserves grid integrity', () => {
    // Fill grid
    let state = assignSessionToGrid(grid, 'sess-1').state
    state = assignSessionToGrid(state, 'sess-2').state
    state = assignSessionToGrid(state, 'sess-3').state

    // Detach sess-2
    const detached = detachFromGrid(state, 'sess-2')
    assert.strictEqual(detached.grid.slots.filter(s => s.sessionId !== null).length, 2)

    // Dock sess-2 back to same slot
    const slotIdx = state.slots.findIndex(s => s.sessionId === 'sess-2')
    const docked = dockToGrid(detached.grid, detached.detachedIds, 'sess-2', slotIdx)
    assert.strictEqual(docked.grid.slots[slotIdx].sessionId, 'sess-2')
    assert.strictEqual(docked.grid.slots.filter(s => s.sessionId !== null).length, 3)
  })
})
