// src/renderer/components/SessionGrid.tsx
import { useState, useCallback } from 'preact/hooks'
import type { SessionInfo, ContextUsage } from '../../shared/types'
import type { GridState, ThemeName } from '../../shared/grid-types'
import { SessionCell } from './SessionCell'
import { LauncherCell } from './LauncherCell'
import { GridControls } from './GridControls'

interface SessionGridProps {
  grid: GridState
  sessions: SessionInfo[]
  contextUsages: Record<string, ContextUsage>
  focusedSessionId: string | null
  theme: ThemeName
  orchestratorSessionId: string | null
  onFocusSession: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onSwitchProject: (sessionId: string) => void
  onToggleExpand: (sessionId: string) => void
  onLaunch: (slotIndex: number) => void
  onOpenSession: (slotIndex: number) => void
  onResize: (cols: number, rows: number) => void
  onSwap: (idxA: number, idxB: number) => void
}

/**
 * Build a set of slot indices that are "covered" by a cell above them
 * that has rowSpan > 1. Grid is row-major: index = row * cols + col.
 */
function getCoveredSlots(slots: GridState['slots'], cols: number, rows: number): Set<number> {
  const covered = new Set<number>()
  for (let idx = 0; idx < slots.length; idx++) {
    const span = slots[idx].rowSpan
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

export function SessionGrid({
  grid, sessions, contextUsages, focusedSessionId, theme,
  orchestratorSessionId, onFocusSession, onCloseSession,
  onSwitchProject, onToggleExpand, onLaunch, onOpenSession, onResize, onSwap,
}: SessionGridProps) {
  const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null)
  const { cols, rows } = grid.config

  const handleDragStart = useCallback((slotIdx: number) => {
    setDragSourceIdx(slotIdx)
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((targetIdx: number) => {
    if (dragSourceIdx !== null && dragSourceIdx !== targetIdx) {
      onSwap(dragSourceIdx, targetIdx)
    }
    setDragSourceIdx(null)
  }, [dragSourceIdx, onSwap])

  const gridStyle = {
    gridTemplateColumns: `repeat(${cols}, 640px)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
  }

  const covered = getCoveredSlots(grid.slots, cols, rows)

  return (
    <div class="session-grid-area">
      <div class="session-grid" style={gridStyle}>
        {grid.slots.map((slot, idx) => {
          // Skip cells covered by a rowSpan above
          if (covered.has(idx)) return null

          const session = slot.sessionId
            ? sessions.find((s) => s.id === slot.sessionId)
            : null

          if (session) {
            return (
              <SessionCell
                key={slot.sessionId}
                session={session}
                contextUsage={contextUsages[session.id]}
                focused={session.id === focusedSessionId}
                isOrchestrator={session.id === orchestratorSessionId}
                theme={theme}
                rowSpan={slot.rowSpan}
                maxRows={rows}
                onFocus={onFocusSession}
                onClose={onCloseSession}
                onSwitchProject={onSwitchProject}
                onToggleExpand={onToggleExpand}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
              />
            )
          }

          return (
            <LauncherCell
              key={`launcher-${idx}`}
              onLaunch={() => onLaunch(idx)}
              onOpenSession={() => onOpenSession(idx)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(idx)}
            />
          )
        })}
      </div>
      <GridControls cols={cols} rows={rows} onResize={onResize} />
    </div>
  )
}
