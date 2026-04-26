// src/renderer/hooks/useGrid.ts
import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { GridState, GridConfig } from '../../shared/grid-types'
import {
  createEmptyGrid,
  assignSessionToGrid,
  removeSessionFromGrid,
  swapSlots,
  resizeGrid,
  findFirstEmptySlot,
} from '../../shared/grid-types'
import { MAX_GRID_COLS } from '../../shared/constants'
import { GRID_SAVE_DEBOUNCE_MS } from '../../shared/constants'

const api = () => (window as any).cipherMux

export function useGrid(panelWidth = 0) {
  const [grid, setGrid] = useState<GridState>(createEmptyGrid())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelWidthRef = useRef(panelWidth)
  panelWidthRef.current = panelWidth

  const persist = useCallback((next: GridState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api().config.saveGrid(next).catch((err: unknown) =>
        console.error('[useGrid] persist failed:', err),
      )
    }, GRID_SAVE_DEBOUNCE_MS)
  }, [])

  // Load persisted grid on mount
  useEffect(() => {
    let mounted = true
    api().config.get('ui').then((ui: any) => {
      if (!mounted) return
      if (ui?.grid?.config && ui.grid.slots) {
        setGrid(ui.grid)
        api().window.fitGrid(ui.grid.config.cols, ui.grid.config.rows, panelWidthRef.current).catch(() => {})
      } else {
        // Fit window to default grid
        api().window.fitGrid(grid.config.cols, grid.config.rows, panelWidthRef.current).catch(() => {})
      }
    }).catch(() => {})
    return () => {
      mounted = false
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const addSession = useCallback((sessionId: string) => {
    setGrid((prev) => {
      // Skip if session is already in the grid (idempotent)
      if (prev.slots.some((s) => s.sessionId === sessionId)) return prev
      // No free slot — don't auto-expand; session stays as background session
      if (findFirstEmptySlot(prev) === -1) {
        console.log('[useGrid] addSession: no free slot, skipping grid placement for', sessionId)
        return prev
      }
      const { state } = assignSessionToGrid(prev, sessionId)
      persist(state)
      api().window.fitGrid(state.config.cols, state.config.rows, panelWidthRef.current).catch(() => {})
      return state
    })
  }, [persist])

  const removeSession = useCallback((sessionId: string) => {
    setGrid((prev) => {
      const next = removeSessionFromGrid(prev, sessionId)
      persist(next)
      // Re-fit window in case grid can shrink
      api().window.fitGrid(next.config.cols, next.config.rows, panelWidthRef.current).catch(() => {})
      return next
    })
  }, [persist])

  const swap = useCallback((idxA: number, idxB: number) => {
    setGrid((prev) => {
      const next = swapSlots(prev, idxA, idxB)
      persist(next)
      return next
    })
  }, [persist])

  const resize = useCallback((newConfig: GridConfig) => {
    setGrid((prev) => {
      const next = resizeGrid(prev, newConfig)
      persist(next)
      // Resize window to fit new grid
      api().window.fitGrid(newConfig.cols, newConfig.rows, panelWidthRef.current).catch(() => {})
      return next
    })
  }, [persist])

  const setSessionAtSlot = useCallback((slotIndex: number, sessionId: string | null) => {
    setGrid((prev) => {
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], sessionId }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const toggleExpand = useCallback((sessionId: string) => {
    setGrid((prev) => {
      const idx = prev.slots.findIndex((s) => s.sessionId === sessionId)
      if (idx === -1) return prev
      const currentSpan = prev.slots[idx].rowSpan
      const newSpan = currentSpan > 1 ? 1 : prev.config.rows
      const newSlots = [...prev.slots]
      newSlots[idx] = { ...newSlots[idx], rowSpan: newSpan }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  /** Apply workspace merges as rowSpans. merges is Record<"col:row", true>. */
  const applyMerges = useCallback((cols: number, rows: number, merges: Record<string, true>) => {
    setGrid((prev) => {
      const newSlots = prev.slots.map((s) => ({ ...s, rowSpan: 1 }))
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col
          if (idx >= newSlots.length) continue
          // Count consecutive merges downward
          let span = 1
          let r = row
          while (merges[`${col}:${r}`]) {
            span++
            r++
          }
          newSlots[idx] = { ...newSlots[idx], rowSpan: span }
          // Mark merged-into slots as hidden (rowSpan 0 is not used, they just keep rowSpan 1
          // but won't render because the parent cell spans over them via CSS grid)
        }
      }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const setSlotType = useCallback((slotIndex: number, type: 'session' | 'notes') => {
    setGrid((prev) => {
      // Max one notes cell validation
      if (type === 'notes' && prev.slots.some((s, i) => s.type === 'notes' && i !== slotIndex)) {
        console.warn('[useGrid] Only one notes cell allowed')
        return prev
      }
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], type, sessionId: null }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const clearSlotType = useCallback((slotIndex: number) => {
    setGrid((prev) => {
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], type: 'session', sessionId: null }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const toggleExpandSlot = useCallback((slotIndex: number) => {
    setGrid((prev) => {
      if (slotIndex < 0 || slotIndex >= prev.slots.length) return prev
      const currentSpan = prev.slots[slotIndex].rowSpan
      const newSpan = currentSpan > 1 ? 1 : prev.config.rows
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], rowSpan: newSpan }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  /** Restore a full grid state (e.g. from session recovery). */
  const restoreGrid = useCallback((state: GridState) => {
    setGrid(state)
    persist(state)
    api().window.fitGrid(state.config.cols, state.config.rows, panelWidthRef.current).catch(() => {})
  }, [persist])

  return { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand, applyMerges, setSlotType, clearSlotType, toggleExpandSlot, restoreGrid }
}
