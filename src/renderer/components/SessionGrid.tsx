// src/renderer/components/SessionGrid.tsx
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { SessionInfo, ContextUsage, EntityId } from '../../shared/types'
import { computeGridStyle, getCoveredSlots, getFocusModePlacement, findNavigationTarget } from '../../shared/grid-types'
import type { GridState, ThemeName } from '../../shared/grid-types'
import { SessionCell } from './SessionCell'
import { LauncherCell } from './LauncherCell'
import type { PathStartOpts } from './LauncherCell'
import { NotesCell } from './NotesCell'
import { useScrollHandler } from '../hooks/useScrollHandler'
import { getTerminal } from '../terminal-registry'
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
  onDetach?: (sessionId: string) => void
  onDetachNote?: (slotIndex: number) => void
  onFocusMode?: (sessionId: string) => void
  onFocusModeBySlot?: (slotIndex: number) => void
  focusModeSlot?: number | null
  focusModeOverlapped?: Set<number>
  onStartEntity: (entityId: EntityId, slotIndex: number) => Promise<void>
  onResumeEntity: (entityId: EntityId, slotIndex: number) => Promise<void>
  onFocusEntity: (entityId: EntityId) => void
  onStartPath: (path: string, opts: PathStartOpts, slotIndex: number) => void
  onOpenNotes: (slotIndex: number) => void
  onOpenNote: (note: any, slotIndex: number) => void
  onCloseNotes: (slotIndex: number) => void
  onOpenNoteIdsChange: (slotIndex: number, noteIds: string[]) => void
  onToggleExpandSlot: (slotIndex: number) => void
  onSwap: (idxA: number, idxB: number) => void
  onDropSession: (sessionId: string, slotIndex: number) => void
  onDropNoteOnEmpty: (note: any, slotIndex: number) => void
  onDropNoteOnSession: (note: any, sessionId: string) => void
  topicMap?: Record<string, string>
}



export function SessionGrid({
  grid, sessions, contextUsages, focusedSessionId, theme,
  orchestratorSessionId, activeWorkspaceId, entityStatus,
  voiceTargetSessionId, voicePinned, voiceState, isSpeaking, onToggleVoicePin,
  workspaceLoading,
  onFocusSession, onCloseSession,
  onSwitchProject, onToggleExpand, onShell, onFork, onSendToBackground, onDetach, onDetachNote, onFocusMode, onFocusModeBySlot,
  focusModeSlot, focusModeOverlapped,
  onStartEntity, onResumeEntity, onFocusEntity, onStartPath,
  onOpenNotes, onOpenNote, onCloseNotes, onOpenNoteIdsChange, onToggleExpandSlot, onSwap,
  onDropSession, onDropNoteOnEmpty, onDropNoteOnSession,
  topicMap,
}: SessionGridProps) {
  useScrollHandler(grid)

  // Grid navigation via voice commands
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.terminal?.onGridNav) return
    // Build set of session IDs actually visible in the grid
    const visibleSessionIds = new Set(sessions.map(s => s.id))
    const unsub = api.terminal.onGridNav((data: { direction: string }) => {
      const dir = data.direction as 'up' | 'down' | 'left' | 'right'
      const target = findNavigationTarget(grid, focusedSessionId, dir)
      if (target && visibleSessionIds.has(target)) {
        onFocusSession(target)
      }
    })
    return () => unsub()
  }, [grid, focusedSessionId, onFocusSession, sessions])

  // Voice clipboard commands (copy/paste)
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.terminal?.onVoiceClipboard) return
    const unsub = api.terminal.onVoiceClipboard((data: { action: 'copy' | 'paste' }) => {
      if (!focusedSessionId) return
      if (data.action === 'copy') {
        const term = getTerminal(focusedSessionId)
        if (term?.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection()).catch(() => {})
        }
      } else if (data.action === 'paste') {
        navigator.clipboard.readText().then(text => {
          if (text) {
            api.sessions.sendKeys(focusedSessionId, text).catch(() => {})
          }
        }).catch(() => {})
      }
    })
    return () => unsub()
  }, [focusedSessionId])

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
        const api = (window as any).cipherMux
        const paths: string[] = []
        for (let i = 0; i < files.length; i++) {
          // Use webUtils.getPathForFile via preload (contextIsolation-safe)
          const p = api.getFilePath ? api.getFilePath(files[i]) : files[i].path
          if (p) paths.push(p)
        }
        if (paths.length > 0 && paths[0]) {
          const escaped = shellEscapePaths(paths)
          // REQ-DND-005: focus the session first
          onFocusSession(slot.sessionId)
          // Send escaped paths as text — no Enter (user keeps control)
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

  const covered = getCoveredSlots(grid)

  // Compute focus mode placement CSS if active
  const focusPlacement = focusModeSlot != null && focusModeSlot >= 0
    ? getFocusModePlacement(cols, rows, focusModeSlot)
    : null

  return (
    <div class="session-grid-area">
      <div class={`session-grid${focusModeSlot != null ? ' session-grid--focus-mode' : ''}`} style={gridStyle} onDragEnd={handleDragEnd}>
        {grid.slots.map((slot, idx) => {
          // Skip cells covered by a rowSpan above
          if (covered.has(idx)) return null

          // Hide cells overlapped by focus mode
          const isOverlapped = focusModeOverlapped?.has(idx)
          if (isOverlapped) return null

          const isFocusModeTarget = focusModeSlot === idx
          const focusStyle: Record<string, string> = isFocusModeTarget && focusPlacement
            ? { gridColumn: focusPlacement.gridColumn, gridRow: focusPlacement.gridRow }
            : {}

          // Notes cell
          if (slot.type === 'notes') {
            return (
              <NotesCell
                key={slot.notesId || `notes-${idx}`}
                rowSpan={isFocusModeTarget ? 1 : slot.rowSpan}
                maxRows={rows}
                activeWorkspaceId={activeWorkspaceId}
                slotIndex={idx}
                slotCol={idx % cols}
                slotRow={Math.floor(idx / cols)}
                initialNoteIds={slot.openNoteIds}
                onOpenNoteIdsChange={(ids: string[]) => onOpenNoteIdsChange(idx, ids)}
                onClose={() => onCloseNotes(idx)}
                onToggleExpand={() => onToggleExpandSlot(idx)}
                onDetach={onDetachNote ? () => onDetachNote(idx) : undefined}
                onFocusMode={onFocusModeBySlot ? () => onFocusModeBySlot(idx) : undefined}
                focusModeStyle={isFocusModeTarget ? focusStyle : undefined}
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
                rowSpan={isFocusModeTarget ? 1 : slot.rowSpan}
                maxRows={rows}
                slotCol={idx % cols}
                slotRow={Math.floor(idx / cols)}
                focusModeStyle={isFocusModeTarget ? focusStyle : undefined}
                onFocus={onFocusSession}
                onClose={onCloseSession}
                onSwitchProject={onSwitchProject}
                onToggleExpand={onToggleExpand}
                onShell={onShell}
                onFork={onFork}
                onSendToBackground={onSendToBackground}
                onDetach={onDetach}
                onFocusMode={onFocusMode}
                topic={topicMap?.[session.id]}
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
