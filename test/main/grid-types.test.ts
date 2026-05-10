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
  findNavigationTarget,
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

    it('row template uses flexible row height', () => {
      const style = computeGridStyle(2, 3)
      // Must use flexible 1fr rows so all rows fill available space (no clipping)
      assert.ok(
        style.gridTemplateRows.includes('1fr'),
        `Row template should use flexible 1fr height, got: ${style.gridTemplateRows}`,
      )
    })

    it('row template is consistent regardless of row count', () => {
      const style2 = computeGridStyle(2, 2)
      const style3 = computeGridStyle(2, 3)
      assert.strictEqual(
        style2.gridTemplateRows, 'repeat(2, minmax(0, 1fr))',
        `2-row grid should use flexible rows, got: ${style2.gridTemplateRows}`,
      )
      assert.strictEqual(
        style3.gridTemplateRows, 'repeat(3, minmax(0, 1fr))',
        `3-row grid should use flexible rows, got: ${style3.gridTemplateRows}`,
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

  describe('getFocusModeOverlappedSlots (2x2)', () => {
    it('overlaps 3 neighbor slots for top-left focus in 4x2 grid', () => {
      // 4x2 grid, focus slot 0 (row=0, col=0) → 2x2 anchor at (0,0)
      // Overlapped: slot 1 (0,1), slot 4 (1,0), slot 5 (1,1)
      const grid = createEmptyGrid({ cols: 4, rows: 2 })
      grid.slots[0].sessionId = 'ses-1'
      const overlapped = getFocusModeOverlappedSlots(grid, 0)
      assert.strictEqual(overlapped.size, 3)
      assert.ok(overlapped.has(1), 'right neighbor')
      assert.ok(overlapped.has(4), 'below neighbor')
      assert.ok(overlapped.has(5), 'diagonal neighbor')
      assert.ok(!overlapped.has(0), 'focus slot itself not overlapped')
    })

    it('clamps anchor when focus is at right edge', () => {
      // 4x2 grid, focus slot 3 (row=0, col=3) → anchor clamps to col=2
      // 2x2 block: (0,2)-(0,3)-(1,2)-(1,3) → overlapped: 2, 6, 7
      const grid = createEmptyGrid({ cols: 4, rows: 2 })
      grid.slots[3].sessionId = 'ses-1'
      const overlapped = getFocusModeOverlappedSlots(grid, 3)
      assert.strictEqual(overlapped.size, 3)
      assert.ok(overlapped.has(2), 'left of focus (anchor col)')
      assert.ok(overlapped.has(6), 'below anchor')
      assert.ok(overlapped.has(7), 'below focus')
      assert.ok(!overlapped.has(3), 'focus slot itself not overlapped')
    })

    it('clamps anchor when focus is at bottom edge', () => {
      // 3x3 grid, focus slot 6 (row=2, col=0) → anchor clamps to row=1
      // 2x2 block: (1,0)-(1,1)-(2,0)-(2,1) → overlapped: 3, 4, 7
      const grid = createEmptyGrid({ cols: 3, rows: 3 })
      grid.slots[6].sessionId = 'ses-1'
      const overlapped = getFocusModeOverlappedSlots(grid, 6)
      assert.strictEqual(overlapped.size, 3)
      assert.ok(overlapped.has(3), 'anchor row, same col')
      assert.ok(overlapped.has(4), 'anchor row, col+1')
      assert.ok(overlapped.has(7), 'focus row, col+1')
      assert.ok(!overlapped.has(6), 'focus slot itself not overlapped')
    })

    it('clamps anchor at bottom-right corner', () => {
      // 4x2 grid, focus slot 7 (row=1, col=3) → anchor (0,2)
      // 2x2 block: (0,2)-(0,3)-(1,2)-(1,3) → overlapped: 2, 3, 6
      const grid = createEmptyGrid({ cols: 4, rows: 2 })
      grid.slots[7].sessionId = 'ses-1'
      const overlapped = getFocusModeOverlappedSlots(grid, 7)
      assert.strictEqual(overlapped.size, 3)
      assert.ok(overlapped.has(2))
      assert.ok(overlapped.has(3))
      assert.ok(overlapped.has(6))
      assert.ok(!overlapped.has(7))
    })

    it('overlaps all 3 others in exact 2x2 grid', () => {
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[0].sessionId = 'ses-1'
      const overlapped = getFocusModeOverlappedSlots(grid, 0)
      assert.strictEqual(overlapped.size, 3)
      assert.ok(overlapped.has(1))
      assert.ok(overlapped.has(2))
      assert.ok(overlapped.has(3))
    })

    it('returns empty set for 1x1 grid (too small for 2x2)', () => {
      const grid = createEmptyGrid({ cols: 1, rows: 1 })
      const overlapped = getFocusModeOverlappedSlots(grid, 0)
      assert.strictEqual(overlapped.size, 0)
    })

    it('falls back to full-row for 1-row grid (Nx1)', () => {
      // 3x1 grid: can't do 2x2, falls back to single-row fullscreen
      const grid = createEmptyGrid({ cols: 3, rows: 1 })
      grid.slots[1].sessionId = 'ses-1'
      const overlapped = getFocusModeOverlappedSlots(grid, 1)
      assert.strictEqual(overlapped.size, 2)
      assert.ok(overlapped.has(0))
      assert.ok(overlapped.has(2))
    })

    it('falls back to full-column for 1-col grid (1xN)', () => {
      // 1x3 grid: can't do 2x2, falls back to single-col fullscreen
      const grid = createEmptyGrid({ cols: 1, rows: 3 })
      grid.slots[1].sessionId = 'ses-1'
      const overlapped = getFocusModeOverlappedSlots(grid, 1)
      assert.strictEqual(overlapped.size, 2)
      assert.ok(overlapped.has(0))
      assert.ok(overlapped.has(2))
    })

    it('returns empty set for invalid index', () => {
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      assert.strictEqual(getFocusModeOverlappedSlots(grid, -1).size, 0)
      assert.strictEqual(getFocusModeOverlappedSlots(grid, 99).size, 0)
    })

    it('focus in middle of 4x3 grid overlaps correct 2x2 block', () => {
      // 4x3, focus slot 5 (row=1, col=1) → anchor (1,1)
      // 2x2 block: (1,1)-(1,2)-(2,1)-(2,2) → overlapped: 6, 9, 10
      const grid = createEmptyGrid({ cols: 4, rows: 3 })
      grid.slots[5].sessionId = 'ses-1'
      const overlapped = getFocusModeOverlappedSlots(grid, 5)
      assert.strictEqual(overlapped.size, 3)
      assert.ok(overlapped.has(6), 'right neighbor (1,2)')
      assert.ok(overlapped.has(9), 'below (2,1)')
      assert.ok(overlapped.has(10), 'diagonal (2,2)')
    })
  })

  describe('findNavigationTarget', () => {
    it('navigates right to next session', () => {
      const grid = createEmptyGrid({ cols: 3, rows: 1 })
      grid.slots[0].sessionId = 'ses-A'
      grid.slots[1].sessionId = 'ses-B'
      const target = findNavigationTarget(grid, 'ses-A', 'right')
      assert.strictEqual(target, 'ses-B')
    })

    it('skips notes cell when navigating right', () => {
      // 3x1: [ses-A] [notes] [ses-B]
      const grid = createEmptyGrid({ cols: 3, rows: 1 })
      grid.slots[0].sessionId = 'ses-A'
      grid.slots[1] = { sessionId: null, rowSpan: 1, type: 'notes', notesId: 'n1' }
      grid.slots[2].sessionId = 'ses-B'
      const target = findNavigationTarget(grid, 'ses-A', 'right')
      assert.strictEqual(target, 'ses-B', 'should skip notes cell at slot 1')
    })

    it('skips notes cell when navigating left', () => {
      // 3x1: [ses-A] [notes] [ses-B]
      const grid = createEmptyGrid({ cols: 3, rows: 1 })
      grid.slots[0].sessionId = 'ses-A'
      grid.slots[1] = { sessionId: null, rowSpan: 1, type: 'notes', notesId: 'n1' }
      grid.slots[2].sessionId = 'ses-B'
      const target = findNavigationTarget(grid, 'ses-B', 'left')
      assert.strictEqual(target, 'ses-A', 'should skip notes cell at slot 1')
    })

    it('skips multiple notes cells', () => {
      // 4x1: [ses-A] [notes] [notes] [ses-B]
      const grid = createEmptyGrid({ cols: 4, rows: 1 })
      grid.slots[0].sessionId = 'ses-A'
      grid.slots[1] = { sessionId: null, rowSpan: 1, type: 'notes', notesId: 'n1' }
      grid.slots[2] = { sessionId: null, rowSpan: 1, type: 'notes', notesId: 'n2' }
      grid.slots[3].sessionId = 'ses-B'
      const target = findNavigationTarget(grid, 'ses-A', 'right')
      assert.strictEqual(target, 'ses-B', 'should skip two notes cells')
    })

    it('skips empty slots too', () => {
      // 3x1: [ses-A] [empty] [ses-B]
      const grid = createEmptyGrid({ cols: 3, rows: 1 })
      grid.slots[0].sessionId = 'ses-A'
      grid.slots[2].sessionId = 'ses-B'
      const target = findNavigationTarget(grid, 'ses-A', 'right')
      assert.strictEqual(target, 'ses-B', 'should skip empty cell at slot 1')
    })

    it('wraps around when skipping notes at edge', () => {
      // 3x1: [ses-A] [ses-B] [notes]
      const grid = createEmptyGrid({ cols: 3, rows: 1 })
      grid.slots[0].sessionId = 'ses-A'
      grid.slots[1].sessionId = 'ses-B'
      grid.slots[2] = { sessionId: null, rowSpan: 1, type: 'notes', notesId: 'n1' }
      const target = findNavigationTarget(grid, 'ses-B', 'right')
      assert.strictEqual(target, 'ses-A', 'should wrap and find ses-A')
    })

    it('returns null when only notes cells remain (no session to navigate to)', () => {
      // 3x1: [ses-A] [notes] [notes]
      const grid = createEmptyGrid({ cols: 3, rows: 1 })
      grid.slots[0].sessionId = 'ses-A'
      grid.slots[1] = { sessionId: null, rowSpan: 1, type: 'notes', notesId: 'n1' }
      grid.slots[2] = { sessionId: null, rowSpan: 1, type: 'notes', notesId: 'n2' }
      const target = findNavigationTarget(grid, 'ses-A', 'right')
      assert.strictEqual(target, null, 'no other session to navigate to')
    })

    it('navigates vertically skipping notes', () => {
      // 2x2: [ses-A] [empty]
      //       [notes] [ses-B]
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[0].sessionId = 'ses-A'
      grid.slots[2] = { sessionId: null, rowSpan: 1, type: 'notes', notesId: 'n1' }
      grid.slots[3].sessionId = 'ses-B'
      // down from ses-A (col 0) → notes at slot 2 → wrap to row 0 col 0 = self → null
      const target = findNavigationTarget(grid, 'ses-A', 'down')
      assert.strictEqual(target, null, 'only notes below in same column, should return null')
    })

    it('handles covered slots from rowSpan', () => {
      // 2x2: [ses-A(span2)] [ses-B]
      //       [covered]       [ses-C]
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[0] = { sessionId: 'ses-A', rowSpan: 2, type: 'session' }
      grid.slots[1].sessionId = 'ses-B'
      grid.slots[3].sessionId = 'ses-C'
      // right from ses-A (col 0) → ses-B at slot 1
      const target = findNavigationTarget(grid, 'ses-A', 'right')
      assert.strictEqual(target, 'ses-B')
    })

    it('navigates to parent of covered slot', () => {
      // 2x2: [ses-A(span2)] [ses-B]
      //       [covered]       [ses-C]
      const grid = createEmptyGrid({ cols: 2, rows: 2 })
      grid.slots[0] = { sessionId: 'ses-A', rowSpan: 2, type: 'session' }
      grid.slots[1].sessionId = 'ses-B'
      grid.slots[3].sessionId = 'ses-C'
      // left from ses-C (row1, col1) → covered at slot 2 → parent ses-A at slot 0
      const target = findNavigationTarget(grid, 'ses-C', 'left')
      assert.strictEqual(target, 'ses-A', 'should find parent of covered slot')
    })

    it('returns null for unknown currentSessionId', () => {
      const grid = createEmptyGrid({ cols: 2, rows: 1 })
      grid.slots[0].sessionId = 'ses-A'
      const target = findNavigationTarget(grid, 'unknown', 'right')
      assert.strictEqual(target, null)
    })
  })

  describe('getFocusModePlacement (2x2)', () => {
    it('spans 2 cols and 2 rows from anchor in 4x2 grid', () => {
      // Focus slot 0 (row=0, col=0) → anchor (0,0)
      const p = getFocusModePlacement(4, 2, 0)
      assert.strictEqual(p.gridColumn, '1 / 3')
      assert.strictEqual(p.gridRow, '1 / 3')
    })

    it('clamps to right edge', () => {
      // 4x2, focus slot 3 (row=0, col=3) → anchor col clamps to 2
      const p = getFocusModePlacement(4, 2, 3)
      assert.strictEqual(p.gridColumn, '3 / 5')
      assert.strictEqual(p.gridRow, '1 / 3')
    })

    it('clamps to bottom edge', () => {
      // 3x3, focus slot 6 (row=2, col=0) → anchor row clamps to 1
      const p = getFocusModePlacement(3, 3, 6)
      assert.strictEqual(p.gridColumn, '1 / 3')
      assert.strictEqual(p.gridRow, '2 / 4')
    })

    it('spans full grid for exact 2x2', () => {
      const p = getFocusModePlacement(2, 2, 0)
      assert.strictEqual(p.gridColumn, '1 / 3')
      assert.strictEqual(p.gridRow, '1 / 3')
    })

    it('falls back to full-row for 1-row grid', () => {
      // 3x1: only 1 row → gridRow = 1/2, gridColumn spans all
      const p = getFocusModePlacement(3, 1, 1)
      assert.strictEqual(p.gridColumn, '1 / 4')
      assert.strictEqual(p.gridRow, '1 / 2')
    })

    it('falls back to full-column for 1-col grid', () => {
      // 1x3: only 1 col → gridColumn = 1/2, gridRow spans all
      const p = getFocusModePlacement(1, 3, 1)
      assert.strictEqual(p.gridColumn, '1 / 2')
      assert.strictEqual(p.gridRow, '1 / 4')
    })

    it('clamps bottom-right corner correctly', () => {
      // 4x3, focus slot 11 (row=2, col=3) → anchor (1,2)
      const p = getFocusModePlacement(4, 3, 11)
      assert.strictEqual(p.gridColumn, '3 / 5')
      assert.strictEqual(p.gridRow, '2 / 4')
    })
  })
})
