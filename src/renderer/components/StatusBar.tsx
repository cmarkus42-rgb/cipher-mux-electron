// src/renderer/components/StatusBar.tsx
import type { ThemeName } from '../../shared/grid-types'
import { APP_VERSION } from '../../shared/constants'
import { GridControls } from './GridControls'
import { VoiceControl } from './VoiceControl'

interface StatusBarProps {
  theme: ThemeName
  chatroomVisible: boolean
  requestsVisible: boolean
  requestsOpenCount: number
  orchestratorRunning: boolean
  gridCols: number
  gridRows: number
  focusedSessionId: string | null
  focusedSessionName: string | null
  onOrchestrator: () => void
  onBugreport: () => void
  onToggleChatroom: () => void
  onToggleRequests: () => void
  onToggleTheme: () => void
  onInfo: () => void
  onGridResize: (cols: number, rows: number) => void
}

export function StatusBar({
  theme, chatroomVisible, requestsVisible, requestsOpenCount, orchestratorRunning,
  gridCols, gridRows, focusedSessionId, focusedSessionName,
  onOrchestrator, onBugreport, onToggleChatroom, onToggleRequests, onToggleTheme, onInfo,
  onGridResize,
}: StatusBarProps) {
  return (
    <div class="status-bar">
      <div class="status-bar__actions">
        <VoiceControl
          focusedSessionId={focusedSessionId}
          focusedSessionName={focusedSessionName}
          inline
        />
        <span class="status-bar__sep">│</span>
        <GridControls cols={gridCols} rows={gridRows} onResize={onGridResize} inline />
        <span class="status-bar__sep">│</span>
        <button
          class={`status-bar__btn${orchestratorRunning ? ' status-bar__btn--active' : ''}`}
          onClick={onOrchestrator}
        >
          orchestrator
        </button>
        <button class="status-bar__btn" onClick={onBugreport}>bugreport</button>
        <button
          class={`status-bar__btn${chatroomVisible ? ' status-bar__btn--active' : ''}`}
          onClick={onToggleChatroom}
        >
          chatroom
        </button>
        <button
          class={`status-bar__btn${requestsVisible ? ' status-bar__btn--active' : ''}`}
          onClick={onToggleRequests}
        >
          requests
          {requestsOpenCount > 0 && (
            <span class="status-bar__badge">{requestsOpenCount}</span>
          )}
        </button>
        <button class="status-bar__btn status-bar__btn--active" onClick={onToggleTheme}>
          theme: {theme}
        </button>
        <button class="status-bar__btn" onClick={onInfo}>info</button>
      </div>
      <span class="status-bar__version">{APP_VERSION}</span>
    </div>
  )
}
