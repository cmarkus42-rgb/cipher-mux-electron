// src/renderer/components/SplitContainer.tsx
import { useRef, useCallback } from 'preact/hooks'
import type { LayoutNode, SessionInfo, ContextUsage } from '../../shared/types'
import { TerminalPane } from './TerminalPane'

interface SplitContainerProps {
  node: LayoutNode
  path: number[]
  sessions: SessionInfo[]
  contextUsages: Record<string, ContextUsage>
  activePaneId: string | null
  onUpdateRatio: (path: number[], ratio: number) => void
  onPaneClick: (sessionId: string) => void
}

export function SplitContainer({
  node,
  path,
  sessions,
  contextUsages,
  activePaneId,
  onUpdateRatio,
  onPaneClick,
}: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDividerMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      if (node.type !== 'split') return
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const isVertical = node.direction === 'vertical'

      const onMouseMove = (me: MouseEvent) => {
        const pos = isVertical ? me.clientX - rect.left : me.clientY - rect.top
        const total = isVertical ? rect.width : rect.height
        if (total === 0) return
        const ratio = pos / total
        onUpdateRatio(path, ratio)
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [node, path, onUpdateRatio],
  )

  // ── Pane leaf ──
  if (node.type === 'pane') {
    const session = sessions.find((s) => s.id === node.sessionId)
    const isActive = activePaneId === node.sessionId
    return (
      <div
        class={`split-pane${isActive ? ' split-pane--active' : ''}`}
        style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}
        onClick={() => onPaneClick(node.sessionId)}
      >
        {session ? (
          <TerminalPane
            sessionId={session.id}
            sessionName={session.name}
            contextUsage={contextUsages[session.id]?.usedPercentage}
          />
        ) : (
          <div class="empty-state">
            <div class="empty-state__title">Session ended</div>
            <div class="empty-state__text">This pane's session is no longer active.</div>
          </div>
        )}
      </div>
    )
  }

  // ── Split node ──
  const isVertical = node.direction === 'vertical'
  const [first, second] = node.children as [LayoutNode, LayoutNode]
  const ratioPercent = (node.ratio * 100).toFixed(2)

  return (
    <div
      ref={containerRef}
      class="split-container"
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* First child */}
      <div style={{ flexBasis: `${ratioPercent}%`, flexShrink: 0, flexGrow: 0, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
        <SplitContainer
          node={first}
          path={[...path, 0]}
          sessions={sessions}
          contextUsages={contextUsages}
          activePaneId={activePaneId}
          onUpdateRatio={onUpdateRatio}
          onPaneClick={onPaneClick}
        />
      </div>

      {/* Divider */}
      <div
        class={`split-divider split-divider--${isVertical ? 'vertical' : 'horizontal'}`}
        onMouseDown={handleDividerMouseDown}
      />

      {/* Second child */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
        <SplitContainer
          node={second}
          path={[...path, 1]}
          sessions={sessions}
          contextUsages={contextUsages}
          activePaneId={activePaneId}
          onUpdateRatio={onUpdateRatio}
          onPaneClick={onPaneClick}
        />
      </div>
    </div>
  )
}
