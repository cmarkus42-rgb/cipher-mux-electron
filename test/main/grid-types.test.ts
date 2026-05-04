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
  getCoveredSlots,
  nextRowSpan,
  getFocusModeOverlappedSlots,
  getFocusModePlacement,
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

  describe('getCoveredSlots', () => {
    it('returns empty set when no rowSpan > 1', () => {
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      assert.strictEqual(getCoveredSlots(grid).size, 0)
    })

    it('marks slots below a rowSpan=2 cell as covered', () => {
      // 2x2 grid, slot(0,0) has rowSpan=2 → slot(1,0) is covered
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[0].rowSpan = 2
      const covered = getCoveredSlots(grid)
      assert.ok(covered.has(2), 'slot at row=1,col=0 (idx=2) should be covered')
      assert.strictEqual(covered.size, 1)
    })

    it('marks multiple rows for rowSpan=3', () => {
      const grid = createEmptyGrid({ cols: 2, rows: 3 })
      grid.slots[0].rowSpan = 3 // col=0, row=0, spans all 3 rows
      const covered = getCoveredSlots(grid)
      assert.ok(covered.has(2), 'row=1,col=0 covered')
      assert.ok(covered.has(4), 'row=2,col=0 covered')
      assert.strictEqual(covered.size, 2)
    })
  })

  describe('findFirstEmptySlot with rowSpan', () => {
    it('skips slots covered by rowSpan', () => {
      // 2x2 grid: slot(0,0) has ses-1 with rowSpan=2
      // Slots: [ses-1(span2), null, COVERED, null]
      // findFirstEmptySlot should return idx=1 (not idx=2 which is covered)
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[0] = { sessionId: 'ses-1', rowSpan: 2, type: 'session' }
      const idx = findFirstEmptySlot(grid)
      assert.strictEqual(idx, 1, 'should skip covered slot at idx=2 and find idx=1')
    })

    it('returns -1 when all free slots are covered', () => {
      // 1x2 grid: slot(0,0) has ses-1 with rowSpan=2 → slot(1,0) covered
      const grid = createEmptyGrid({ cols: 1, rows: 2 })
      grid.slots[0] = { sessionId: 'ses-1', rowSpan: 2, type: 'session' }
      const idx = findFirstEmptySlot(grid)
      assert.strictEqual(idx, -1, 'only free slot is covered, should return -1')
    })

    it('assignSessionToGrid respects rowSpan coverage', () => {
      // 2x2 grid: col0 fully spanned by ses-1
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[0] = { sessionId: 'ses-1', rowSpan: 2, type: 'session' }
      // Assign ses-2 — should go to idx=1 (row=0,col=1), NOT idx=2 (covered)
      const { state, slotIndex } = assignSessionToGrid(grid, 'ses-2')
      assert.strictEqual(slotIndex, 1)
      assert.strictEqual(state.slots[1].sessionId, 'ses-2')
      // idx=2 should still be null (covered, not assigned)
      assert.strictEqual(state.slots[2].sessionId, null)
    })
  })

  describe('nextRowSpan', () => {
    it('returns same span when maxRows is 1 (no toggle)', () => {
      assert.strictEqual(nextRowSpan(1, 1), 1)
    })

    it('rotates 1→2→1 for 2-row grid', () => {
      assert.strictEqual(nextRowSpan(1, 2), 2)
      assert.strictEqual(nextRowSpan(2, 2), 1)
      // Full cycle
      let span = 1
      span = nextRowSpan(span, 2); assert.strictEqual(span, 2)
      span = nextRowSpan(span, 2); assert.strictEqual(span, 1)
      span = nextRowSpan(span, 2); assert.strictEqual(span, 2)
    })

    it('rotates 1→2→3→1 for 3-row grid', () => {
      assert.strictEqual(nextRowSpan(1, 3), 2)
      assert.strictEqual(nextRowSpan(2, 3), 3)
      assert.strictEqual(nextRowSpan(3, 3), 1)
      // Full cycle — no stuck state
      let span = 1
      for (let i = 0; i < 6; i++) {
        span = nextRowSpan(span, 3)
      }
      assert.strictEqual(span, 1, 'after 6 toggles (2 full cycles) should be back at 1')
    })
  })

  describe('computeGridStyle', () => {
    it('columns enforce fixed minimum width to prevent compression', () => {
      const style = computeGridStyle(3, 2)
      // Must contain a fixed pixel minimum (640px) so cells don't compress
      assert.ok(
        style.gridTemplateColumns.includes('640px'),
        `Column template must enforce 640px minimum, got: ${style.gridTemplateColumns}`,
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

    it('uses fixed minimum width for columns (640px)', () => {
      const style = computeGridStyle(3, 2)
      assert.strictEqual(
        style.gridTemplateColumns,
        'repeat(3, minmax(640px, 1fr))',
        'Column template must enforce 640px minimum cell width',
      )
    })
  })

  describe('getFocusModeOverlappedSlots', () => {
    it('returns 3 overlapped slots for focus at top-left of 3x3 grid', () => {
      const grid = createEmptyGrid({ cols: 3, rows: 3 })
      grid.slots[0] = { sessionId: 'ses-1', rowSpan: 1, type: 'session' }
      const overlapped = getFocusModeOverlappedSlots(grid, 0)
      // Focus at (0,0) expands right and down: covers (0,1), (1,0), (1,1)
      assert.ok(overlapped.has(1), 'should overlap col=1,row=0')
      assert.ok(overlapped.has(3), 'should overlap col=0,row=1')
      assert.ok(overlapped.has(4), 'should overlap col=1,row=1')
      assert.strictEqual(overlapped.size, 3)
    })

    it('clamps to grid bounds at bottom-right corner', () => {
      // 2x2 grid, focus at idx=3 (col=1, row=1) — no room to expand
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[3] = { sessionId: 'ses-1', rowSpan: 1, type: 'session' }
      const overlapped = getFocusModeOverlappedSlots(grid, 3)
      // At bottom-right, can't expand right or down — no overlapped slots
      assert.strictEqual(overlapped.size, 0)
    })

    it('clamps at right edge (col=last)', () => {
      // 3x2 grid, focus at idx=2 (col=2, row=0) — can expand down but not right
      const grid = createEmptyGrid({ cols: 3, rows: 2 })
      grid.slots[2] = { sessionId: 'ses-1', rowSpan: 1, type: 'session' }
      const overlapped = getFocusModeOverlappedSlots(grid, 2)
      // Only (2,1) below
      assert.ok(overlapped.has(5), 'should overlap col=2,row=1')
      assert.strictEqual(overlapped.size, 1)
    })

    it('clamps at bottom edge (row=last)', () => {
      // 2x2 grid, focus at idx=2 (col=0, row=1) — can expand right but not down
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[2] = { sessionId: 'ses-1', rowSpan: 1, type: 'session' }
      const overlapped = getFocusModeOverlappedSlots(grid, 2)
      // Only (1,1) to the right
      assert.ok(overlapped.has(3), 'should overlap col=1,row=1')
      assert.strictEqual(overlapped.size, 1)
    })

    it('returns empty set for 1-column grid', () => {
      const grid = createEmptyGrid({ cols: 1, rows: 3 })
      const overlapped = getFocusModeOverlappedSlots(grid, 0)
      assert.strictEqual(overlapped.size, 0)
    })

    it('returns empty set for 1-row grid', () => {
      const grid = createEmptyGrid({ cols: 3, rows: 1 })
      const overlapped = getFocusModeOverlappedSlots(grid, 0)
      assert.strictEqual(overlapped.size, 0)
    })

    it('returns empty set for invalid index', () => {
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      assert.strictEqual(getFocusModeOverlappedSlots(grid, -1).size, 0)
      assert.strictEqual(getFocusModeOverlappedSlots(grid, 99).size, 0)
    })
  })

  describe('getFocusModePlacement', () => {
    it('returns 2-col 2-row span for top-left cell', () => {
      const p = getFocusModePlacement(3, 3, 0) // col=0, row=0
      assert.strictEqual(p.gridColumn, '1 / 3')
      assert.strictEqual(p.gridRow, '1 / 3')
    })

    it('clamps span to grid bounds at bottom-right', () => {
      // 2x2 grid, idx=3 (col=1, row=1)
      const p = getFocusModePlacement(2, 2, 3)
      assert.strictEqual(p.gridColumn, '2 / 3') // only 1 col
      assert.strictEqual(p.gridRow, '2 / 3')    // only 1 row
    })

    it('spans 2 cols and clamps row at bottom edge', () => {
      // 3x2 grid, idx=3 (col=0, row=1) — last row
      const p = getFocusModePlacement(3, 2, 3)
      assert.strictEqual(p.gridColumn, '1 / 3')
      assert.strictEqual(p.gridRow, '2 / 3') // clamped
    })

    it('middle cell in 3x3 grid spans full 2x2', () => {
      // idx=4 (col=1, row=1) in 3x3
      const p = getFocusModePlacement(3, 3, 4)
      assert.strictEqual(p.gridColumn, '2 / 4')
      assert.strictEqual(p.gridRow, '2 / 4')
    })
  })
})
