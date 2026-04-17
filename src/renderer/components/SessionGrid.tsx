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
  onLaunch: (slotIndex: number) => void
  onResize: (cols: number, rows: number) => void
  onSwap: (idxA: number, idxB: number) => void
}

export function SessionGrid({
  grid, sessions, contextUsages, focusedSessionId, theme,
  orchestratorSessionId, onFocusSession, onCloseSession,
  onSwitchProject, onLaunch, onResize, onSwap,
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
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
  }

  return (
    <div class="session-grid-area">
      <div class="session-grid" style={gridStyle}>
        {grid.slots.map((slot, idx) => {
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
                onFocus={onFocusSession}
                onClose={onCloseSession}
                onSwitchProject={onSwitchProject}
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
