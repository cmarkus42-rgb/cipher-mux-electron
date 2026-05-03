// src/renderer/components/SessionGrid.tsx
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { SessionInfo, ContextUsage, EntityId } from '../../shared/types'
import { computeGridStyle } from '../../shared/grid-types'
import type { GridState, ThemeName } from '../../shared/grid-types'
import { SessionCell } from './SessionCell'
import { LauncherCell } from './LauncherCell'
import type { PathStartOpts } from './LauncherCell'
import { NotesCell } from './NotesCell'
import { useScrollHandler } from '../hooks/useScrollHandler'
import { shellEscapePaths } from '../../shared/shell-escape'

interface SessionGridProps {
  grid: GridState
  sessions: SessionInfo[]
  contextUsages: Record<string, ContextUsage>
  focusedSessionId: string | null
  theme: ThemeName
  orchestratorSessionId: string | null
  activeWorkspaceId: string | null
  entityStatus: Record<string, boolean>
  voiceTargetSessionId: string | null
  voicePinned: boolean
  voiceState: string
  isSpeaking: boolean
  onToggleVoicePin: (sessionId: string) => void
  workspaceLoading: boolean
  onFocusSession: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onSwitchProject: (sessionId: string) => void
  onToggleExpand: (sessionId: string) => void
  onShell: (sessionId: string, projectPath: string | null) => void
  onFork: (sessionId: string) => void
  onSendToBackground: (sessionId: string) => void
  onFocusMode?: (sessionId: string) => void
  onStartEntity: (entityId: EntityId, slotIndex: number) => Promise<void>
  onResumeEntity: (entityId: EntityId, slotIndex: number) => Promise<void>
  onFocusEntity: (entityId: EntityId) => void
  onStartPath: (path: string, opts: PathStartOpts, slotIndex: number) => void
  onOpenNotes: (slotIndex: number) => void
  onOpenNote: (note: any, slotIndex: number) => void
  onCloseNotes: (slotIndex: number) => void
  onToggleExpandSlot: (slotIndex: number) => void
  onSwap: (idxA: number, idxB: number) => void
  onDropSession: (sessionId: string, slotIndex: number) => void
  onDropNoteOnEmpty: (note: any, slotIndex: number) => void
  onDropNoteOnSession: (note: any, sessionId: string) => void
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
  orchestratorSessionId, activeWorkspaceId, entityStatus,
  voiceTargetSessionId, voicePinned, voiceState, isSpeaking, onToggleVoicePin,
  workspaceLoading,
  onFocusSession, onCloseSession,
  onSwitchProject, onToggleExpand, onShell, onFork, onSendToBackground, onFocusMode,
  onStartEntity, onResumeEntity, onFocusEntity, onStartPath,
  onOpenNotes, onOpenNote, onCloseNotes, onToggleExpandSlot, onSwap,
  onDropSession, onDropNoteOnEmpty, onDropNoteOnSession,
}: SessionGridProps) {
  useScrollHandler(grid)

  // Grid navigation via voice commands
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.terminal?.onGridNav) return
    // Build set of session IDs actually visible in the grid
    const visibleSessionIds = new Set(sessions.map(s => s.id))
    const unsub = api.terminal.onGridNav((data: { direction: string }) => {
      const { cols, rows } = grid.config
      // Find current focused slot — must be a visible session
      const currentIdx = grid.slots.findIndex(s => s.sessionId === focusedSessionId && visibleSessionIds.has(s.sessionId ?? ''))
      if (currentIdx < 0) return
      const col = currentIdx % cols
      const row = Math.floor(currentIdx / cols)
      let targetCol = col
      let targetRow = row
      switch (data.direction) {
        case 'up':    targetRow = Math.max(0, row - 1); break
        case 'down':  targetRow = Math.min(rows - 1, row + 1); break
        case 'left':  targetCol = Math.max(0, col - 1); break
        case 'right': targetCol = Math.min(cols - 1, col + 1); break
      }
      const targetIdx = targetRow * cols + targetCol
      const targetSession = grid.slots[targetIdx]?.sessionId
      // Only navigate to sessions that are actually visible in the grid
      if (targetSession && targetSession !== focusedSessionId && visibleSessionIds.has(targetSession)) {
        onFocusSession(targetSession)
      }
    })
    return () => unsub()
  }, [grid, focusedSessionId, onFocusSession, sessions])

  // Use a ref instead of state to avoid stale-closure race: the drop event
  // can fire before Preact completes the re-render triggered by setDragSourceIdx,
  // causing the old handleDrop closure (with null) to execute instead of the swap.
  const dragSourceRef = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const { cols, rows } = grid.config

  const handleDragStart = useCallback((slotIdx: number) => {
    dragSourceRef.current = slotIdx
  }, [])

  const handleDragOver = useCallback((targetIdx: number, e: DragEvent) => {
    e.preventDefault()
    setDragOverIdx(targetIdx)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverIdx(null)
  }, [])

  const handleDrop = useCallback((targetIdx: number, e: DragEvent) => {
    e.preventDefault()
    setDragOverIdx(null)

    // Check for sidebar drag data first
    const cipherType = e.dataTransfer?.getData('application/x-cipher-type')

    if (cipherType === 'session') {
      const sessionId = e.dataTransfer?.getData('application/x-cipher-session-id')
      if (sessionId) {
        // Session from sidebar → place in grid slot
        // If target slot has a session, the old one goes to background (handled by onDropSession)
        onDropSession(sessionId, targetIdx)
        return
      }
    }

    if (cipherType === 'note') {
      const noteJson = e.dataTransfer?.getData('application/x-cipher-note')
      if (noteJson) {
        try {
          const note = JSON.parse(noteJson)
          const slot = grid.slots[targetIdx]
          if (slot?.sessionId) {
            // Note on occupied cell → send note content to session
            onDropNoteOnSession(note, slot.sessionId)
          } else {
            // Note on empty cell → open NotesCell with this note
            onDropNoteOnEmpty(note, targetIdx)
          }
        } catch { /* ignore parse error */ }
        return
      }
    }

    // File drop from Finder/desktop — insert shell-escaped paths into session terminal
    const files = e.dataTransfer?.files
    if (files && files.length > 0 && !cipherType) {
      const slot = grid.slots[targetIdx]
      if (slot?.sessionId) {
        const paths: string[] = []
        for (let i = 0; i < files.length; i++) {
          paths.push(files[i].path)
        }
        if (paths.length > 0 && paths[0]) {
          const escaped = shellEscapePaths(paths)
          // REQ-DND-005: focus the session first
          onFocusSession(slot.sessionId)
          // Send escaped paths as text — no Enter (user keeps control)
          const api = (window as any).cipherMux
          api.terminal.write(slot.sessionId, escaped)
        }
      }
      return
    }

    // Default: grid-internal swap
    const sourceIdx = dragSourceRef.current
    if (sourceIdx !== null && sourceIdx !== targetIdx) {
      onSwap(sourceIdx, targetIdx)
    }
    dragSourceRef.current = null
  }, [onSwap, onDropSession, onDropNoteOnEmpty, onDropNoteOnSession, onFocusSession, grid.slots])

  const handleDragEnd = useCallback(() => {
    dragSourceRef.current = null
    setDragOverIdx(null)
  }, [])

  const gridStyle = computeGridStyle(cols, rows)

  const covered = getCoveredSlots(grid.slots, cols, rows)

  return (
    <div class="session-grid-area">
      <div class="session-grid" style={gridStyle} onDragEnd={handleDragEnd}>
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
                onDragOver={(e: DragEvent) => handleDragOver(idx, e)}
                onDragLeave={handleDragLeave}
                onDrop={(e: DragEvent) => handleDrop(idx, e)}
                dragOver={dragOverIdx === idx}
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
                isVoiceTarget={session.id === voiceTargetSessionId}
                isVoicePinned={voicePinned && session.id === voiceTargetSessionId}
                voiceState={session.id === voiceTargetSessionId ? voiceState : 'idle'}
                isSpeaking={session.id === voiceTargetSessionId && isSpeaking}
                onToggleVoicePin={onToggleVoicePin}
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
                onFocusMode={onFocusMode}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e: DragEvent) => handleDragOver(idx, e)}
                onDragLeave={handleDragLeave}
                onDrop={(e: DragEvent) => handleDrop(idx, e)}
                dragOver={dragOverIdx === idx}
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
              onResumeEntity={(entityId) => onResumeEntity(entityId, idx)}
              onFocusEntity={onFocusEntity}
              onStartPath={(path, opts) => onStartPath(path, opts, idx)}
              onOpenNotes={() => onOpenNotes(idx)}
              onOpenNote={(note) => onOpenNote(note, idx)}
              entityStatus={entityStatus}
              activeWorkspaceId={activeWorkspaceId}
              workspaceLoading={workspaceLoading}
              onDragOver={(e: DragEvent) => handleDragOver(idx, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e: DragEvent) => handleDrop(idx, e)}
              dragOver={dragOverIdx === idx}
            />
          )
        })}
      </div>
    </div>
  )
}
