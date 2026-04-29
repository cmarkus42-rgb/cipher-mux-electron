// src/renderer/components/LauncherCell.tsx
import { useState, useCallback, useEffect } from 'preact/hooks'
import { EntityPickerPopup } from './EntityPickerPopup'
import type { PathStartOpts } from './EntityPickerPopup'
import type { EntityId } from '../../shared/types'

export type { PathStartOpts }

// ─── Types ───────────────────────────────────────────────

interface LauncherCellProps {
  slotIndex: number
  slotCol?: number
  slotRow?: number
  onStartEntity: (entityId: EntityId) => Promise<void>
  onResumeEntity: (entityId: EntityId) => Promise<void>
  onFocusEntity: (entityId: EntityId) => void
  onStartPath: (path: string, opts: PathStartOpts) => void
  onOpenNotes: () => void
  onOpenNote: (note: any) => void
  entityStatus: Record<string, boolean>
  activeWorkspaceId: string | null
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
  dragOver?: boolean
}

export function LauncherCell({
  slotIndex, slotCol, slotRow, onStartEntity, onResumeEntity, onFocusEntity,
  onStartPath, onOpenNotes, onOpenNote, entityStatus,
  activeWorkspaceId, onDragOver, onDragLeave, onDrop, dragOver,
}: LauncherCellProps) {
  const [popupOpen, setPopupOpen] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  // Listen for Cmd+N launcher-open event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.slotIndex === slotIndex) {
        setPopupOpen(true)
      }
    }
    window.addEventListener('launcher-open', handler)
    return () => window.removeEventListener('launcher-open', handler)
  }, [slotIndex])

  // Reset starting state when popup opens
  useEffect(() => {
    if (popupOpen) {
      setStarting(null)
    }
  }, [popupOpen])

  const handleOpen = useCallback(() => {
    setPopupOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setPopupOpen(false)
  }, [])

  const handleSelectPreset = useCallback(async (entityId: EntityId, running: boolean) => {
    if (running) {
      onFocusEntity(entityId)
      setPopupOpen(false)
      return
    }
    setStarting(entityId)
    try {
      await onStartEntity(entityId)
      setPopupOpen(false)
    } catch (err) {
      console.error(`[LauncherCell] Failed to start ${entityId}:`, err)
    } finally {
      setStarting(null)
    }
  }, [onStartEntity, onFocusEntity])

  const handleResumePreset = useCallback(async (entityId: EntityId) => {
    setStarting(entityId)
    try {
      await onResumeEntity(entityId)
      setPopupOpen(false)
    } catch (err) {
      console.error(`[LauncherCell] Failed to resume ${entityId}:`, err)
    } finally {
      setStarting(null)
    }
  }, [onResumeEntity])

  const handleSelectPath = useCallback((path: string, opts: PathStartOpts) => {
    onStartPath(path, opts)
    setPopupOpen(false)
  }, [onStartPath])

  const handleSelectNote = useCallback((note: any) => {
    onOpenNote(note)
    setPopupOpen(false)
  }, [onOpenNote])

  const handleNewNote = useCallback(() => {
    onOpenNotes()
    setPopupOpen(false)
  }, [onOpenNotes])

  return (
    <div
      class={`launcher-cell${dragOver ? ' launcher-cell--drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-highlight={slotCol != null && slotRow != null ? `cell-${slotCol}-${slotRow}` : undefined}
    >
      <div class="launcher-cell__trigger" onClick={handleOpen}>
        <div class="launcher-circle"><span>+</span></div>
      </div>
      {popupOpen && (
        <EntityPickerPopup
          onSelectPreset={handleSelectPreset}
          onResumePreset={handleResumePreset}
          onSelectPath={handleSelectPath}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
          onClose={handleClose}
          entityStatus={entityStatus}
          startingEntity={starting}
        />
      )}
    </div>
  )
}
