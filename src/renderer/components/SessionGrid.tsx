// src/renderer/components/SessionGrid.tsx
import { useState, useCallback } from 'preact/hooks'
import type { SessionInfo, ContextUsage, EntityId } from '../../shared/types'
import { computeGridStyle } from '../../shared/grid-types'
import type { GridState, ThemeName } from '../../shared/grid-types'
import { SessionCell } from './SessionCell'
import { LauncherCell } from './LauncherCell'
import type { PathStartOpts } from './LauncherCell'
import { NotesCell } from './NotesCell'

interface SessionGridProps {
  grid: GridState
  sessions: SessionInfo[]
  contextUsages: Record<string, ContextUsage>
  focusedSessionId: string | null
  theme: ThemeName
  orchestratorSessionId: string | null
  activeWorkspaceId: string | null
  entityStatus: Record<string, boolean>
  onFocusSession: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onSwitchProject: (sessionId: string) => void
  onToggleExpand: (sessionId: string) => void
  onShell: (sessionId: string, projectPath: string | null) => void
  onFork: (sessionId: string) => void
  onSendToBackground: (sessionId: string) => void
  onStartEntity: (entityId: EntityId, slotIndex: number) => Promise<void>
  onFocusEntity: (entityId: EntityId) => void
  onStartPath: (path: string, opts: PathStartOpts, slotIndex: number) => void
  onOpenNotes: (slotIndex: number) => void
  onOpenNote: (note: any, slotIndex: number) => void
  onCloseNotes: (slotIndex: number) => void
  onToggleExpandSlot: (slotIndex: number) => void
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
  orchestratorSessionId, activeWorkspaceId, entityStatus, onFocusSession, onCloseSession,
  onSwitchProject, onToggleExpand, onShell, onFork, onSendToBackground,
  onStartEntity, onFocusEntity, onStartPath,
  onOpenNotes, onOpenNote, onCloseNotes, onToggleExpandSlot, onSwap,
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

  const gridStyle = computeGridStyle(cols, rows)

  const covered = getCoveredSlots(grid.slots, cols, rows)

  return (
    <div class="session-grid-area">
      <div class="session-grid" style={gridStyle}>
        {grid.slots.map((slot, idx) => {
          // Skip cells covered by a rowSpan above
          if (covered.has(idx)) return null

          // Notes cell
          if (slot.type === 'notes') {
            return (
              <NotesCell
                key={`notes-${idx}`}
                rowSpan={slot.rowSpan}
                maxRows={rows}
                activeWorkspaceId={activeWorkspaceId}
                slotCol={idx % cols}
                slotRow={Math.floor(idx / cols)}
                onClose={() => onCloseNotes(idx)}
                onToggleExpand={() => onToggleExpandSlot(idx)}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
              />
            )
          }

          // Session cell
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
                slotCol={idx % cols}
                slotRow={Math.floor(idx / cols)}
                onFocus={onFocusSession}
                onClose={onCloseSession}
                onSwitchProject={onSwitchProject}
                onToggleExpand={onToggleExpand}
                onShell={onShell}
                onFork={onFork}
                onSendToBackground={onSendToBackground}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
              />
            )
          }

          return (
            <LauncherCell
              key={`launcher-${idx}`}
              slotIndex={idx}
              slotCol={idx % cols}
              slotRow={Math.floor(idx / cols)}
              onStartEntity={(entityId) => onStartEntity(entityId, idx)}
              onFocusEntity={onFocusEntity}
              onStartPath={(path, opts) => onStartPath(path, opts, idx)}
              onOpenNotes={() => onOpenNotes(idx)}
              onOpenNote={(note) => onOpenNote(note, idx)}
              entityStatus={entityStatus}
              activeWorkspaceId={activeWorkspaceId}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(idx)}
            />
          )
        })}
      </div>
    </div>
  )
}
