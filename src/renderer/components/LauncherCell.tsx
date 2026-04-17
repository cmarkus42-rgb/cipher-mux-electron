// src/renderer/components/LauncherCell.tsx

interface LauncherCellProps {
  onLaunch: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function LauncherCell({ onLaunch, onDragOver, onDrop }: LauncherCellProps) {
  return (
    <div
      class="launcher-cell"
      onClick={onLaunch}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div class="launcher-circle"><span>+</span></div>
      <span class="launcher-label">projekt auswählen</span>
    </div>
  )
}
