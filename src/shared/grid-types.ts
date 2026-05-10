/** Grid layout data model for the session grid. */

export interface GridConfig {
  /** Number of columns (1–5). */
  cols: number
  /** Number of rows (1–3). */
  rows: number
}

export interface GridSlot {
  /** Session ID occupying this slot, or null for an empty (launcher) cell. */
  sessionId: string | null
  /** Vertical span (1–3). Width is always 1 column. */
  rowSpan: number
  /** Cell type: 'session' for terminal sessions, 'notes' for the embedded notes editor. */
  type: 'session' | 'notes'
  /** Stable identity for notes cells — survives grid swaps so Preact doesn't remount. */
  notesId?: string
  /** IDs of notes currently open as tabs in this notes cell (persisted for keep-working restore). */
  openNoteIds?: string[]
}

/** Persisted grid state — stored in ConfigStore under ui.grid. */
export interface GridState {
  config: GridConfig
  /** Slot assignments indexed by position (col-major: slot[row * cols + col]). */
  slots: GridSlot[]
}

export type ThemeName =
  | 'cipher-ivory' | 'cipher-dark'
  | 'blueprint' | 'warm-paper'
  | 'gruvbox-dark' | 'nord'
  | 'synthwave' | 'matrix'
  | 'brutalist' | 'high-contrast'
  | 'cvd-deuteranopia' | 'cvd-tritanopia' | 'cvd-achromatopsia'

export const LEGACY_THEME_ALIASES: Record<string, ThemeName> = {
  'ivory': 'cipher-ivory',
  'dark': 'cipher-dark',
}

export const DEFAULT_THEME: ThemeName = 'cipher-ivory'

export const DEFAULT_GRID_CONFIG: GridConfig = { cols: 2, rows: 2 }

/** Create an empty grid state with all slots unoccupied. */
export function createEmptyGrid(config: GridConfig = DEFAULT_GRID_CONFIG): GridState {
  const totalSlots = config.cols * config.rows
  const slots: GridSlot[] = Array.from({ length: totalSlots }, () => ({
    sessionId: null,
    rowSpan: 1,
    type: 'session' as const,
  }))
  return { config, slots }
}

/** Build a set of slot indices covered by cells with rowSpan > 1. */
export function getCoveredSlots(state: GridState): Set<number> {
  const { cols, rows } = state.config
  const covered = new Set<number>()
  for (let idx = 0; idx < state.slots.length; idx++) {
    const span = state.slots[idx].rowSpan
    if (span > 1) {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      for (let r = 1; r < span && row + r < rows; r++) {
        covered.add((row + r) * cols + col)
      }
    }
  }
  return covered
}

/** Find the index of the first empty slot, or -1 if grid is full. */
export function findFirstEmptySlot(state: GridState): number {
  const covered = getCoveredSlots(state)
  return state.slots.findIndex((s, i) => s.sessionId === null && s.type !== 'notes' && !covered.has(i))
}

/** Assign a session to the first empty slot. Returns the slot index or -1 if full. */
export function assignSessionToGrid(
  state: GridState,
  sessionId: string,
): { state: GridState; slotIndex: number } {
  const idx = findFirstEmptySlot(state)
  if (idx === -1) return { state, slotIndex: -1 }
  const newSlots = [...state.slots]
  newSlots[idx] = { ...newSlots[idx], sessionId }
  return { state: { ...state, slots: newSlots }, slotIndex: idx }
}

/** Remove a session from the grid by clearing its slot. */
export function removeSessionFromGrid(state: GridState, sessionId: string): GridState {
  const newSlots = state.slots.map((s) =>
    s.sessionId === sessionId ? { ...s, sessionId: null } : s,
  )
  return { ...state, slots: newSlots }
}

/** Swap two slots by index. */
export function swapSlots(state: GridState, idxA: number, idxB: number): GridState {
  const newSlots = [...state.slots]
  const temp = newSlots[idxA]
  newSlots[idxA] = newSlots[idxB]
  newSlots[idxB] = temp
  return { ...state, slots: newSlots }
}

/** Compute the next rowSpan in the rotation cycle.
 *  1 row → no change. 2 rows → 1↔2. 3 rows → 1→2→3→1. */
export function nextRowSpan(currentSpan: number, maxRows: number): number {
  if (maxRows <= 1) return currentSpan
  return (currentSpan % maxRows) + 1
}

/** Compute the 2x2 anchor position for focus mode.
 *  The anchor is the top-left corner of the 2x2 block containing focusSlotIdx.
 *  Clamps to grid edges so the block never overflows. */
function getFocusAnchor(cols: number, rows: number, focusSlotIdx: number): { anchorCol: number; anchorRow: number } {
  const focusCol = focusSlotIdx % cols
  const focusRow = Math.floor(focusSlotIdx / cols)
  const anchorCol = Math.min(focusCol, cols - 2)
  const anchorRow = Math.min(focusRow, rows - 2)
  return { anchorCol: Math.max(0, anchorCol), anchorRow: Math.max(0, anchorRow) }
}

/** Maximum number of simultaneous focus slots: floor(cols / 2) when rows >= 2, else 1. */
export function getMaxFocusSlots(cols: number, rows: number): number {
  if (cols <= 1 && rows <= 1) return 0
  if (rows < 2 || cols < 2) return 1
  return Math.floor(cols / 2)
}

/** Return the set of 4 (or fewer) slot indices that a 2x2 focus block covers,
 *  including the focus slot itself. For 1-row/1-col grids returns all slots. */
export function getFocusBlockIndices(cols: number, rows: number, focusSlotIdx: number): Set<number> {
  const block = new Set<number>()
  if (cols <= 1 && rows <= 1) { block.add(focusSlotIdx); return block }
  if (cols <= 1 || rows <= 1) {
    for (let i = 0; i < cols * rows; i++) block.add(i)
    return block
  }
  const { anchorCol, anchorRow } = getFocusAnchor(cols, rows, focusSlotIdx)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      block.add((anchorRow + r) * cols + (anchorCol + c))
    }
  }
  return block
}

/** Check whether a new focus slot can be added without overlapping existing focus blocks. */
export function canAddFocusSlot(
  cols: number, rows: number,
  existingFocusSlots: Set<number>, newSlotIdx: number,
): boolean {
  if (existingFocusSlots.size >= getMaxFocusSlots(cols, rows)) return false
  const newBlock = getFocusBlockIndices(cols, rows, newSlotIdx)
  for (const existing of existingFocusSlots) {
    const existingBlock = getFocusBlockIndices(cols, rows, existing)
    for (const idx of newBlock) {
      if (existingBlock.has(idx)) return false
    }
  }
  return true
}

/** Compute overlapped slots for multiple focus slots.
 *  Returns the set of indices hidden by focus blocks, excluding the focus slots themselves. */
export function getMultiFocusOverlappedSlots(state: GridState, focusSlots: Set<number>): Set<number> {
  const overlapped = new Set<number>()
  if (focusSlots.size === 0) return overlapped
  for (const focusIdx of focusSlots) {
    const block = getFocusBlockIndices(state.config.cols, state.config.rows, focusIdx)
    for (const idx of block) {
      if (!focusSlots.has(idx)) overlapped.add(idx)
    }
  }
  return overlapped
}

/** Compute which slot indices are overlapped when a cell enters focus mode (2x2).
 *  Returns the set of indices that should be hidden, excluding the focus slot itself.
 *  Fallback: 1-row or 1-col grids get full-row/full-col overlap. 1x1 → empty set.
 *  @deprecated Use getMultiFocusOverlappedSlots for multi-focus support. */
export function getFocusModeOverlappedSlots(state: GridState, focusSlotIdx: number): Set<number> {
  const overlapped = new Set<number>()
  const { cols, rows } = state.config
  if (focusSlotIdx < 0 || focusSlotIdx >= state.slots.length) return overlapped

  // 1x1: no room
  if (cols <= 1 && rows <= 1) return overlapped

  // Fallback: 1-row or 1-col → full-row/full-col (all except focus)
  if (cols <= 1 || rows <= 1) {
    for (let i = 0; i < state.slots.length; i++) {
      if (i !== focusSlotIdx) overlapped.add(i)
    }
    return overlapped
  }

  // 2x2 block
  const { anchorCol, anchorRow } = getFocusAnchor(cols, rows, focusSlotIdx)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const idx = (anchorRow + r) * cols + (anchorCol + c)
      if (idx !== focusSlotIdx) overlapped.add(idx)
    }
  }
  return overlapped
}

/** Compute CSS grid placement for a focus-mode cell (2x2 block).
 *  Fallback: 1-row or 1-col grids span the full row/column. */
export function getFocusModePlacement(cols: number, rows: number, focusSlotIdx: number): { gridColumn: string; gridRow: string } {
  // Fallback: single dimension → span all
  if (cols <= 1 || rows <= 1) {
    return {
      gridColumn: `1 / ${cols + 1}`,
      gridRow: `1 / ${rows + 1}`,
    }
  }

  const { anchorCol, anchorRow } = getFocusAnchor(cols, rows, focusSlotIdx)
  return {
    gridColumn: `${anchorCol + 1} / ${anchorCol + 3}`,
    gridRow: `${anchorRow + 1} / ${anchorRow + 3}`,
  }
}

/** Find the next session to navigate to from the current session in a given direction.
 *  Skips notes cells, empty slots, and covered slots (rowSpan).
 *  Wraps around grid edges. Returns null if no other session reachable. */
export function findNavigationTarget(
  state: GridState,
  currentSessionId: string | null,
  direction: 'up' | 'down' | 'left' | 'right',
): string | null {
  const { cols, rows } = state.config
  const { slots } = state
  const covered = getCoveredSlots(state)
  const total = cols * rows

  const currentIdx = slots.findIndex(s => s.sessionId === currentSessionId)
  if (currentIdx === -1) return null

  let col = currentIdx % cols
  let row = Math.floor(currentIdx / cols)

  for (let attempt = 0; attempt < total; attempt++) {
    switch (direction) {
      case 'up': row = (row - 1 + rows) % rows; break
      case 'down': row = (row + 1) % rows; break
      case 'left': col = (col - 1 + cols) % cols; break
      case 'right': col = (col + 1) % cols; break
    }
    const idx = row * cols + col

    // If covered by rowSpan, walk upward to find parent
    if (covered.has(idx)) {
      for (let r = row - 1; r >= 0; r--) {
        const parentIdx = r * cols + col
        if (!covered.has(parentIdx) && slots[parentIdx].sessionId) {
          const sid = slots[parentIdx].sessionId!
          return sid === currentSessionId ? null : sid
        }
      }
      continue
    }

    const slot = slots[idx]
    if (slot?.sessionId && slot.sessionId !== currentSessionId) {
      return slot.sessionId
    }
    // If we wrapped back to self, no target found
    if (idx === currentIdx) return null
  }
  return null
}

import { SESSION_CELL_HEIGHT } from './constants'

/** Minimum cell width in pixels — prevents grid compression when window is narrow */
export const SESSION_CELL_MIN_WIDTH = 640

/** Compute CSS grid style for the session grid. */
export function computeGridStyle(cols: number, rows: number): { gridTemplateColumns: string; gridTemplateRows: string } {
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(${SESSION_CELL_MIN_WIDTH}px, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  }
}

/** Resize grid. Sessions stay at their (row, col) position. Overflow goes to background. */
export function resizeGrid(state: GridState, newConfig: GridConfig): GridState {
  const newTotal = newConfig.cols * newConfig.rows
  const oldCols = state.config.cols
  const newSlots: GridSlot[] = Array.from({ length: newTotal }, () => ({
    sessionId: null,
    rowSpan: 1,
    type: 'session' as const,
  }))
  // Map slots by grid position (row, col) — not linear index.
  // Sessions outside the new bounds silently become background sessions.
  for (let row = 0; row < newConfig.rows; row++) {
    for (let col = 0; col < newConfig.cols; col++) {
      if (row < state.config.rows && col < oldCols) {
        const oldIdx = row * oldCols + col
        const newIdx = row * newConfig.cols + col
        newSlots[newIdx] = { ...state.slots[oldIdx] }
      }
    }
  }
  return { config: newConfig, slots: newSlots }
}
