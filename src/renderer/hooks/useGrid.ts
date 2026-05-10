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
  nextRowSpan,
} from '../../shared/grid-types'
import { MAX_GRID_COLS } from '../../shared/constants'
import { GRID_SAVE_DEBOUNCE_MS } from '../../shared/constants'

const api = () => (window as any).cipherMux

export function useGrid(panelWidth = 0) {
  const [grid, setGrid] = useState<GridState>(createEmptyGrid())
  const [detachedIds, setDetachedIds] = useState<Set<string>>(new Set())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelWidthRef = useRef(panelWidth)
  panelWidthRef.current = panelWidth
  // Guard: if restoreGrid was called (e.g. by keepWorking restore) before the
  // async mount-load resolves, skip the mount-load's setGrid to prevent
  // overwriting the restored state with stale config data.
  const restoreCalledRef = useRef(false)

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
      if (restoreCalledRef.current) return // restoreGrid already applied — don't overwrite
      if (ui?.grid?.config && ui.grid.slots) {
        const expected = ui.grid.config.cols * ui.grid.config.rows
        let loadedGrid = ui.grid as GridState
        // Fix RT-X1: Rebuild slots if count doesn't match config dimensions
        if (loadedGrid.slots.length !== expected) {
          const rebuilt: GridState['slots'] = Array.from({ length: expected }, (_, i) =>
            loadedGrid.slots[i] ?? { sessionId: null, rowSpan: 1, type: 'session' as const },
          )
          loadedGrid = { config: loadedGrid.config, slots: rebuilt }
          console.warn(`[useGrid] slots.length (${ui.grid.slots.length}) != expected (${expected}), rebuilt`)
        }
        setGrid(loadedGrid)
        api().window.fitGrid(loadedGrid.config.cols, loadedGrid.config.rows, panelWidthRef.current).catch(() => {})
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
      if (slotIndex < 0 || slotIndex >= prev.slots.length) return prev
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
      const newSpan = nextRowSpan(currentSpan, prev.config.rows)
      if (newSpan === currentSpan) return prev
      const newSlots = [...prev.slots]
      newSlots[idx] = { ...newSlots[idx], rowSpan: newSpan }
      // Eject sessions from slots that become covered by the new span
      const col = idx % prev.config.cols
      const row = Math.floor(idx / prev.config.cols)
      for (let r = 1; r < newSpan && row + r < prev.config.rows; r++) {
        const coveredIdx = (row + r) * prev.config.cols + col
        if (coveredIdx < newSlots.length && newSlots[coveredIdx].sessionId) {
          newSlots[coveredIdx] = { ...newSlots[coveredIdx], sessionId: null, rowSpan: 1 }
        }
      }
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
          // Eject sessions from slots that become covered by the span
          for (let cr = 1; cr < span && row + cr < rows; cr++) {
            const coveredIdx = (row + cr) * cols + col
            if (coveredIdx < newSlots.length && newSlots[coveredIdx].sessionId) {
              newSlots[coveredIdx] = { ...newSlots[coveredIdx], sessionId: null, rowSpan: 1 }
            }
          }
        }
      }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const setSlotType = useCallback((slotIndex: number, type: 'session' | 'notes') => {
    setGrid((prev) => {
      const newSlots = [...prev.slots]
      const notesId = type === 'notes' ? `notes-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : undefined
      newSlots[slotIndex] = { ...newSlots[slotIndex], type, sessionId: null, notesId }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const clearSlotType = useCallback((slotIndex: number) => {
    setGrid((prev) => {
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], type: 'session', sessionId: null, notesId: undefined, openNoteIds: undefined }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const setSlotOpenNoteIds = useCallback((slotIndex: number, openNoteIds: string[]) => {
    setGrid((prev) => {
      if (slotIndex < 0 || slotIndex >= prev.slots.length) return prev
      const slot = prev.slots[slotIndex]
      // Only update notes cells; skip if IDs haven't changed
      if (slot.type !== 'notes') return prev
      const existing = slot.openNoteIds ?? []
      if (existing.length === openNoteIds.length && existing.every((id, i) => id === openNoteIds[i])) return prev
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], openNoteIds }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const toggleExpandSlot = useCallback((slotIndex: number) => {
    setGrid((prev) => {
      if (slotIndex < 0 || slotIndex >= prev.slots.length) return prev
      const currentSpan = prev.slots[slotIndex].rowSpan
      const newSpan = nextRowSpan(currentSpan, prev.config.rows)
      if (newSpan === currentSpan) return prev
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], rowSpan: newSpan }
      // Eject sessions from slots that become covered by the new span
      const col = slotIndex % prev.config.cols
      const row = Math.floor(slotIndex / prev.config.cols)
      for (let r = 1; r < newSpan && row + r < prev.config.rows; r++) {
        const coveredIdx = (row + r) * prev.config.cols + col
        if (coveredIdx < newSlots.length && newSlots[coveredIdx].sessionId) {
          newSlots[coveredIdx] = { ...newSlots[coveredIdx], sessionId: null, rowSpan: 1 }
        }
      }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  /** Restore a full grid state (e.g. from session recovery). */
  const restoreGrid = useCallback((state: GridState) => {
    restoreCalledRef.current = true
    setGrid(state)
    persist(state)
    api().window.fitGrid(state.config.cols, state.config.rows, panelWidthRef.current).catch(() => {})
  }, [persist])

  /** Detach a session/note from the grid: clear its slot and track it as detached. */
  const detachFromGrid = useCallback((entityId: string) => {
    setGrid((prev) => {
      const idx = prev.slots.findIndex((s) => s.sessionId === entityId)
      if (idx === -1) return prev
      const newSlots = [...prev.slots]
      newSlots[idx] = { ...newSlots[idx], sessionId: null }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
    setDetachedIds((prev) => {
      const next = new Set(prev)
      next.add(entityId)
      return next
    })
  }, [persist])

  /** Dock a detached session back — optionally place it in a specific slot. */
  const dockToGrid = useCallback((entityId: string, slotIndex?: number) => {
    setDetachedIds((prev) => {
      if (!prev.has(entityId)) return prev
      const next = new Set(prev)
      next.delete(entityId)
      return next
    })
    if (slotIndex !== undefined) {
      setGrid((prev) => {
        const newSlots = [...prev.slots]
        if (slotIndex >= 0 && slotIndex < newSlots.length) {
          newSlots[slotIndex] = { ...newSlots[slotIndex], sessionId: entityId }
        }
        const next = { ...prev, slots: newSlots }
        persist(next)
        return next
      })
    }
  }, [persist])

  /** Sync detachedIds from the main process detach registry. Also clear grid slots for detached sessions. */
  const syncDetachedIds = useCallback((entries: Array<{ type: string; entityId: string }>) => {
    const ids = new Set(entries.map((e) => e.entityId))
    setDetachedIds(ids)
    // Clear grid slots for detached sessions to avoid dual-presence
    if (ids.size > 0) {
      setGrid((prev) => {
        let changed = false
        const newSlots = prev.slots.map((slot) => {
          if (slot.sessionId && ids.has(slot.sessionId)) {
            changed = true
            return { ...slot, sessionId: null }
          }
          return slot
        })
        if (!changed) return prev
        const next = { ...prev, slots: newSlots }
        persist(next)
        return next
      })
    }
  }, [persist])

  /** RT-X1 fix: clear slots that reference sessions not in the given set. Resets rowSpan to 1. */
  const cleanupDeadSessions = useCallback((activeSessionIds: Set<string>) => {
    setGrid((prev) => {
      let changed = false
      const newSlots = prev.slots.map((slot) => {
        if (slot.sessionId && !activeSessionIds.has(slot.sessionId)) {
          changed = true
          return { ...slot, sessionId: null, rowSpan: 1 }
        }
        return slot
      })
      if (!changed) return prev
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  return { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand, applyMerges, setSlotType, clearSlotType, setSlotOpenNoteIds, toggleExpandSlot, restoreGrid, cleanupDeadSessions, detachedIds, detachFromGrid, dockToGrid, syncDetachedIds }
}
