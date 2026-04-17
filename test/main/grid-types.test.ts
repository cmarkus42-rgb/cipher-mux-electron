import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmptyGrid,
  findFirstEmptySlot,
  assignSessionToGrid,
  removeSessionFromGrid,
  swapSlots,
  resizeGrid,
} from '../../src/shared/grid-types'

describe('grid-types', () => {
  it('createEmptyGrid creates correct number of slots', () => {
    const grid = createEmptyGrid({ cols: 3, rows: 2 })
    assert.strictEqual(grid.slots.length, 6)
    assert.strictEqual(grid.config.cols, 3)
    assert.ok(grid.slots.every((s) => s.sessionId === null))
  })

  it('assignSessionToGrid fills first empty slot', () => {
    const grid = createEmptyGrid({ cols: 2, rows: 1 })
    const { state: g1, slotIndex: i1 } = assignSessionToGrid(grid, 'ses-1')
    assert.strictEqual(i1, 0)
    assert.strictEqual(g1.slots[0].sessionId, 'ses-1')

    const { state: g2, slotIndex: i2 } = assignSessionToGrid(g1, 'ses-2')
    assert.strictEqual(i2, 1)
    assert.strictEqual(g2.slots[1].sessionId, 'ses-2')

    // Grid full
    const { slotIndex: i3 } = assignSessionToGrid(g2, 'ses-3')
    assert.strictEqual(i3, -1)
  })

  it('removeSessionFromGrid clears the slot', () => {
    let grid = createEmptyGrid({ cols: 2, rows: 1 })
    grid = assignSessionToGrid(grid, 'ses-1').state
    grid = removeSessionFromGrid(grid, 'ses-1')
    assert.strictEqual(grid.slots[0].sessionId, null)
  })

  it('swapSlots exchanges two positions', () => {
    let grid = createEmptyGrid({ cols: 3, rows: 1 })
    grid = assignSessionToGrid(grid, 'ses-A').state
    grid = assignSessionToGrid(grid, 'ses-B').state
    grid = swapSlots(grid, 0, 1)
    assert.strictEqual(grid.slots[0].sessionId, 'ses-B')
    assert.strictEqual(grid.slots[1].sessionId, 'ses-A')
  })

  it('resizeGrid preserves sessions and redistributes overflow', () => {
    let grid = createEmptyGrid({ cols: 3, rows: 1 })
    grid = assignSessionToGrid(grid, 'ses-1').state
    grid = assignSessionToGrid(grid, 'ses-2').state
    grid = assignSessionToGrid(grid, 'ses-3').state

    // Shrink to 2x1 — ses-3 overflows and gets redistributed
    const resized = resizeGrid(grid, { cols: 2, rows: 1 })
    assert.strictEqual(resized.slots.length, 2)
    assert.strictEqual(resized.slots[0].sessionId, 'ses-1')
    assert.strictEqual(resized.slots[1].sessionId, 'ses-2')
    // ses-3 dropped (no empty slot available)
  })

  it('resizeGrid grows and keeps existing', () => {
    let grid = createEmptyGrid({ cols: 2, rows: 1 })
    grid = assignSessionToGrid(grid, 'ses-1').state
    const resized = resizeGrid(grid, { cols: 3, rows: 2 })
    assert.strictEqual(resized.slots.length, 6)
    assert.strictEqual(resized.slots[0].sessionId, 'ses-1')
    assert.strictEqual(findFirstEmptySlot(resized), 1)
  })
})
