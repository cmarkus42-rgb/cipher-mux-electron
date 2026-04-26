// src/renderer/components/GridPlacementPopup.tsx
import { useTranslation } from 'react-i18next'
import { MIN_GRID_COLS, MAX_GRID_COLS, MIN_GRID_ROWS, MAX_GRID_ROWS } from '../../shared/constants'
import type { GridSlot } from '../../shared/grid-types'

interface GridPlacementPopupProps {
  visible: boolean
  gridSlots: GridSlot[]
  cols: number
  rows: number
  sessions: Array<{ id: string; name: string }>
  onSelect: (slotIndex: number) => void
  onCancel: () => void
  onResize?: (cols: number, rows: number) => void
}

export function GridPlacementPopup({
  visible, gridSlots, cols, rows, sessions, onSelect, onCancel, onResize,
}: GridPlacementPopupProps) {
  const { t } = useTranslation()
  if (!visible) return null

  const getSlotLabel = (slot: GridSlot): string => {
    if (slot.type === 'notes') return 'Notes'
    if (!slot.sessionId) return t('gridPlacement.empty')
    return sessions.find((s) => s.id === slot.sessionId)?.name ?? '?'
  }

  const isEmpty = (slot: GridSlot): boolean =>
    slot.type !== 'notes' && !slot.sessionId

  return (
    <div class="grid-placement-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div class="grid-placement-popup">
        <div class="grid-placement-popup__header">
          <div class="grid-placement-popup__title">{t('gridPlacement.title')}</div>
          <button
            class="grid-placement-popup__cancel"
            onClick={onCancel}
            title={t('gridPlacement.cancel')}
          >
            {/* CSS-Art X icon */}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>

        {/* Grid resize controls */}
        {onResize && (
          <div class="grid-placement-popup__resize">
            <span class="grid-placement-popup__resize-label">{t('gridControls.columns')}</span>
            <button
              class="grid-placement-popup__resize-btn"
              onClick={() => onResize(Math.max(MIN_GRID_COLS, cols - 1), rows)}
              disabled={cols <= MIN_GRID_COLS}
            >
              {/* CSS-Art left arrow */}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="7,1 3,5 7,9" />
              </svg>
            </button>
            <span class="grid-placement-popup__resize-val">{cols}</span>
            <button
              class="grid-placement-popup__resize-btn"
              onClick={() => onResize(Math.min(MAX_GRID_COLS, cols + 1), rows)}
              disabled={cols >= MAX_GRID_COLS}
            >
              {/* CSS-Art right arrow */}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="3,1 7,5 3,9" />
              </svg>
            </button>
            <span class="grid-placement-popup__resize-sep">|</span>
            <span class="grid-placement-popup__resize-label">{t('gridControls.rows')}</span>
            <button
              class="grid-placement-popup__resize-btn"
              onClick={() => onResize(cols, Math.max(MIN_GRID_ROWS, rows - 1))}
              disabled={rows <= MIN_GRID_ROWS}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="7,1 3,5 7,9" />
              </svg>
            </button>
            <span class="grid-placement-popup__resize-val">{rows}</span>
            <button
              class="grid-placement-popup__resize-btn"
              onClick={() => onResize(cols, Math.min(MAX_GRID_ROWS, rows + 1))}
              disabled={rows >= MAX_GRID_ROWS}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="3,1 7,5 3,9" />
              </svg>
            </button>
          </div>
        )}

        <div class="grid-placement-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {gridSlots.map((slot, idx) => {
            if (slot.rowSpan === 0) return null
            const empty = isEmpty(slot)
            const isNotes = slot.type === 'notes'
            return (
              <div
                key={idx}
                class={`grid-placement-cell${!empty ? ' grid-placement-cell--occupied' : ''}${isNotes ? ' grid-placement-cell--notes' : ''}`}
                style={slot.rowSpan > 1 ? { gridRow: `span ${slot.rowSpan}` } : undefined}
                onClick={() => !isNotes ? onSelect(idx) : undefined}
                title={empty ? t('gridPlacement.emptySlot') : (isNotes ? 'Notes' : t('gridPlacement.replaceTitle', { name: getSlotLabel(slot) }))}
              >
                <span class="grid-placement-cell__label">
                  {getSlotLabel(slot)}
                </span>
              </div>
            )
          })}
        </div>

        <div class="grid-placement-popup__footer">
          <button class="grid-placement-popup__cancel-btn" onClick={onCancel}>
            {t('gridPlacement.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
