import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmptyGrid,
  findFirstEmptySlot,
  assignSessionToGrid,
  removeSessionFromGrid,
  swapSlots,
  resizeGrid,
  computeGridStyle,
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

  describe('computeGridStyle', () => {
    it('columns use flexible min-width so they scale with container', () => {
      const style = computeGridStyle(3, 2)
      // Must NOT contain a fixed pixel minimum like 640px
      assert.ok(
        !style.gridTemplateColumns.includes('640px'),
        `Column template should not have fixed 640px minimum, got: ${style.gridTemplateColumns}`,
      )
      // Should use repeat with the correct column count
      assert.ok(
        style.gridTemplateColumns.includes('repeat(3,'),
        `Should use repeat(3, ...), got: ${style.gridTemplateColumns}`,
      )
    })

    it('column template adjusts when column count changes', () => {
      const style2 = computeGridStyle(2, 2)
      const style3 = computeGridStyle(3, 2)
      // Both should use 1fr-based flexible columns
      assert.ok(style2.gridTemplateColumns.includes('1fr'))
      assert.ok(style3.gridTemplateColumns.includes('1fr'))
      // Column count in the repeat should differ
      assert.ok(style2.gridTemplateColumns.includes('repeat(2,'))
      assert.ok(style3.gridTemplateColumns.includes('repeat(3,'))
    })

    it('row template uses correct row count', () => {
      const style = computeGridStyle(2, 3)
      assert.ok(style.gridTemplateRows.includes('repeat(3,'))
    })

    it('row template uses fixed cell height', () => {
      const style = computeGridStyle(2, 3)
      // Must use fixed pixel height per row, not flexible 1fr
      assert.ok(
        style.gridTemplateRows.includes('380px'),
        `Row template should use fixed 380px height, got: ${style.gridTemplateRows}`,
      )
    })

    it('row height is consistent regardless of row count', () => {
      const style2 = computeGridStyle(2, 2)
      const style3 = computeGridStyle(2, 3)
      assert.strictEqual(
        style2.gridTemplateRows, 'repeat(2, 380px)',
        `2-row grid should use fixed height, got: ${style2.gridTemplateRows}`,
      )
      assert.strictEqual(
        style3.gridTemplateRows, 'repeat(3, 380px)',
        `3-row grid should use fixed height, got: ${style3.gridTemplateRows}`,
      )
    })

    it('does not touch column template (width unchanged)', () => {
      const style = computeGridStyle(3, 2)
      assert.strictEqual(
        style.gridTemplateColumns,
        'repeat(3, minmax(0, 1fr))',
        'Column template must remain unchanged',
      )
    })
  })
})
