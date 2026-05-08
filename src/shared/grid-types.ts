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

/** Compute which slot indices are overlapped when a cell enters focus mode (2x2).
 *  Returns the set of indices that should be hidden, excluding the focus slot itself.
 *  If the grid is too small for 2x2 (1 col or 1 row), returns empty set. */
export function getFocusModeOverlappedSlots(state: GridState, focusSlotIdx: number): Set<number> {
  const overlapped = new Set<number>()
  if (focusSlotIdx < 0 || focusSlotIdx >= state.slots.length) return overlapped

  // Full-screen: all slots except the focused one are overlapped
  for (let i = 0; i < state.slots.length; i++) {
    if (i !== focusSlotIdx) overlapped.add(i)
  }
  return overlapped
}

/** Compute CSS grid placement for a focus-mode cell (full grid).
 *  Returns gridColumn and gridRow CSS values spanning the entire grid. */
export function getFocusModePlacement(cols: number, rows: number, _focusSlotIdx: number): { gridColumn: string; gridRow: string } {
  return {
    gridColumn: `1 / ${cols + 1}`,
    gridRow: `1 / ${rows + 1}`,
  }
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
