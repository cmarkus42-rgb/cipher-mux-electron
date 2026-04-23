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
}

/** Persisted grid state — stored in ConfigStore under ui.grid. */
export interface GridState {
  config: GridConfig
  /** Slot assignments indexed by position (col-major: slot[row * cols + col]). */
  slots: GridSlot[]
}

export type ThemeName = 'ivory' | 'dark'

export const DEFAULT_GRID_CONFIG: GridConfig = { cols: 2, rows: 2 }

/** Create an empty grid state with all slots unoccupied. */
export function createEmptyGrid(config: GridConfig = DEFAULT_GRID_CONFIG): GridState {
  const totalSlots = config.cols * config.rows
  const slots: GridSlot[] = Array.from({ length: totalSlots }, () => ({
    sessionId: null,
    rowSpan: 1,
  }))
  return { config, slots }
}

/** Find the index of the first empty slot, or -1 if grid is full. */
export function findFirstEmptySlot(state: GridState): number {
  return state.slots.findIndex((s) => s.sessionId === null)
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

import { SESSION_CELL_HEIGHT } from './constants'

/** Minimum cell width in pixels — prevents grid compression when window is narrow */
export const SESSION_CELL_MIN_WIDTH = 640

/** Compute CSS grid style for the session grid. */
export function computeGridStyle(cols: number, rows: number): { gridTemplateColumns: string; gridTemplateRows: string } {
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(${SESSION_CELL_MIN_WIDTH}px, 1fr))`,
    gridTemplateRows: `repeat(${rows}, ${SESSION_CELL_HEIGHT}px)`,
  }
}

/** Resize grid. Keeps existing sessions in their slots where possible. */
export function resizeGrid(state: GridState, newConfig: GridConfig): GridState {
  const newTotal = newConfig.cols * newConfig.rows
  const newSlots: GridSlot[] = Array.from({ length: newTotal }, (_, i) => {
    if (i < state.slots.length) return { ...state.slots[i] }
    return { sessionId: null, rowSpan: 1 }
  })
  // Sessions that fell off the grid need to be redistributed
  const overflow = state.slots.slice(newTotal).filter((s) => s.sessionId !== null)
  for (const orphan of overflow) {
    const emptyIdx = newSlots.findIndex((s) => s.sessionId === null)
    if (emptyIdx !== -1) {
      newSlots[emptyIdx] = { ...orphan }
    }
    // If no empty slot, session is dropped from grid (still alive in tmux)
  }
  return { config: newConfig, slots: newSlots }
}
