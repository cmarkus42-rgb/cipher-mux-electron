import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyGrid, assignSessionToGrid } from '../../src/shared/grid-types'

describe('GridSlot type field', () => {
  it('defaults to session type on empty grid', () => {
    const grid = createEmptyGrid()
    for (const slot of grid.slots) {
      assert.strictEqual(slot.type, 'session')
    }
  })

  it('preserves type on assignSessionToGrid', () => {
    const grid = createEmptyGrid()
    grid.slots[0].type = 'notes'
    const { state } = assignSessionToGrid(grid, 'test-123')
    assert.strictEqual(state.slots[0].type, 'notes')
    assert.strictEqual(state.slots[0].sessionId, null)
    assert.strictEqual(state.slots[1].sessionId, 'test-123')
  })
})
