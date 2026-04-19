// src/renderer/components/LauncherCell.tsx

interface LauncherCellProps {
  onLaunch: () => void
  onOpenSession: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function LauncherCell({ onLaunch, onOpenSession, onDragOver, onDrop }: LauncherCellProps) {
  return (
    <div
      class="launcher-cell"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div class="launcher-circle"><span>+</span></div>
      <div class="launcher-buttons">
        <button class="btn btn--sm" onClick={onLaunch}>projekt auswählen</button>
        <button class="btn btn--sm" onClick={onOpenSession}>session öffnen</button>
      </div>
    </div>
  )
}
