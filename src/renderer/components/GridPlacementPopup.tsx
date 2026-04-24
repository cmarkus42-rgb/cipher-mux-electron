// src/renderer/components/GridPlacementPopup.tsx
import { h } from 'preact'

interface GridPlacementPopupProps {
  visible: boolean
  gridSlots: Array<{ sessionId: string | null; rowSpan: number }>
  cols: number
  rows: number
  sessions: Array<{ id: string; name: string }>
  onSelect: (slotIndex: number) => void
  onCancel: () => void
}

export function GridPlacementPopup({
  visible, gridSlots, cols, rows, sessions, onSelect, onCancel,
}: GridPlacementPopupProps) {
  if (!visible) return null

  const getSessionName = (sessionId: string | null) => {
    if (!sessionId) return '(empty)'
    return sessions.find((s) => s.id === sessionId)?.name ?? '?'
  }

  return (
    <div class="grid-placement-overlay" onClick={onCancel}>
      <div class="grid-placement-popup" onClick={(e) => e.stopPropagation()}>
        <div class="grid-placement-popup__title">Place session — click a slot</div>
        <div class="grid-placement-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {gridSlots.map((slot, idx) => {
            if (slot.rowSpan === 0) return null
            return (
              <div
                key={idx}
                class={`grid-placement-cell${slot.sessionId ? ' grid-placement-cell--occupied' : ''}`}
                style={slot.rowSpan > 1 ? { gridRow: `span ${slot.rowSpan}` } : undefined}
                onClick={() => onSelect(idx)}
                title={slot.sessionId ? `Replace: ${getSessionName(slot.sessionId)}` : 'Empty slot'}
              >
                <span class="grid-placement-cell__label">
                  {getSessionName(slot.sessionId)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
