// src/renderer/hooks/useGrid.ts
import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { GridState, GridConfig } from '../../shared/grid-types'
import {
  createEmptyGrid,
  assignSessionToGrid,
  removeSessionFromGrid,
  swapSlots,
  resizeGrid,
} from '../../shared/grid-types'
import { GRID_SAVE_DEBOUNCE_MS } from '../../shared/constants'

const api = () => (window as any).cipherMux

export function useGrid() {
  const [grid, setGrid] = useState<GridState>(createEmptyGrid())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    api().config.get('ui').then((ui: any) => {
      if (ui?.grid?.config && ui.grid.slots) {
        setGrid(ui.grid)
        api().window.fitGrid(ui.grid.config.cols, ui.grid.config.rows).catch(() => {})
      } else {
        // Fit window to default grid
        api().window.fitGrid(grid.config.cols, grid.config.rows).catch(() => {})
      }
    }).catch(() => {})
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const addSession = useCallback((sessionId: string) => {
    setGrid((prev) => {
      const { state } = assignSessionToGrid(prev, sessionId)
      persist(state)
      return state
    })
  }, [persist])

  const removeSession = useCallback((sessionId: string) => {
    setGrid((prev) => {
      const next = removeSessionFromGrid(prev, sessionId)
      persist(next)
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
      api().window.fitGrid(newConfig.cols, newConfig.rows).catch(() => {})
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

  return { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand }
}
