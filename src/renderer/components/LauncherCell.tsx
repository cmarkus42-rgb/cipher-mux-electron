// src/renderer/components/LauncherCell.tsx
import { useTranslation } from 'react-i18next'

interface LauncherCellProps {
  onLaunch: () => void
  onOpenSession: () => void
  onOpenNotes: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function LauncherCell({ onLaunch, onOpenSession, onOpenNotes, onDragOver, onDrop }: LauncherCellProps) {
  const { t } = useTranslation()
  return (
    <div
      class="launcher-cell"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div class="launcher-circle"><span>+</span></div>
      <div class="launcher-buttons">
        <button class="btn btn--sm" onClick={onLaunch}>{t('launcher.project')}</button>
        <button class="btn btn--sm" onClick={onOpenSession}>{t('launcher.session')}</button>
        <button class="btn btn--sm" onClick={onOpenNotes}>{t('launcher.notes')}</button>
      </div>
    </div>
  )
}
