// src/renderer/components/SessionCell.tsx
import { useCallback } from 'preact/hooks'
import { useTerminal } from '../hooks/useTerminal'
import type { SessionInfo, ContextUsage } from '../../shared/types'
import type { ThemeName } from '../../shared/grid-types'

interface SessionCellProps {
  session: SessionInfo
  contextUsage?: ContextUsage
  focused: boolean
  isOrchestrator: boolean
  theme: ThemeName
  onFocus: (sessionId: string) => void
  onClose: (sessionId: string) => void
  onSwitchProject: (sessionId: string) => void
  onDragStart: (sessionId: string) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function SessionCell({
  session, contextUsage, focused, isOrchestrator, theme,
  onFocus, onClose, onSwitchProject, onDragStart, onDragOver, onDrop,
}: SessionCellProps) {
  const { terminalRef } = useTerminal(session.id, theme)
  const pct = contextUsage?.usedPercentage ?? 0

  const handleClick = useCallback(() => onFocus(session.id), [session.id, onFocus])
  const handleClose = useCallback((e: Event) => {
    e.stopPropagation()
    onClose(session.id)
  }, [session.id, onClose])
  const handleSwitch = useCallback((e: Event) => {
    e.stopPropagation()
    onSwitchProject(session.id)
  }, [session.id, onSwitchProject])

  const ctxClass = pct >= 85 ? 'ctx-error' : pct >= 60 ? 'ctx-warn' : 'ctx-ok'
  const dotClass = pct >= 85 ? 'neon-dot--error' : pct >= 60 ? 'neon-dot--warn' : 'neon-dot--ok'
  const cellClass = [
    'session-cell',
    focused && 'session-cell--focused',
    isOrchestrator && 'session-cell--orchestrator',
  ].filter(Boolean).join(' ')

  return (
    <div
      class={cellClass}
      onClick={handleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        class="cell-header"
        draggable
        onDragStart={() => onDragStart(session.id)}
      >
        <div class="cell-header__left">
          <span class={`neon-dot ${dotClass}`} />
          <span class="cell-name">{session.name}</span>
          <span class="cell-sep">·</span>
          <span class={`cell-ctx ${ctxClass}`}>{pct}%</span>
        </div>
        <div class="cell-header__right">
          {!isOrchestrator && (
            <button class="cell-btn" onClick={handleSwitch} title="projekt wechseln">⇄</button>
          )}
          <button class="cell-btn" onClick={handleClose} title="session schließen">✕</button>
        </div>
      </div>
      <div class="cell-terminal" ref={terminalRef} />
    </div>
  )
}
