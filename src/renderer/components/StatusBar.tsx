// src/renderer/components/StatusBar.tsx
import type { ThemeName } from '../../shared/grid-types'
import { APP_VERSION } from '../../shared/constants'

interface StatusBarProps {
  theme: ThemeName
  chatroomVisible: boolean
  requestsVisible: boolean
  requestsOpenCount: number
  orchestratorRunning: boolean
  onOrchestrator: () => void
  onBugreport: () => void
  onToggleChatroom: () => void
  onToggleRequests: () => void
  onToggleTheme: () => void
  onInfo: () => void
}

export function StatusBar({
  theme, chatroomVisible, requestsVisible, requestsOpenCount, orchestratorRunning,
  onOrchestrator, onBugreport, onToggleChatroom, onToggleRequests, onToggleTheme, onInfo,
}: StatusBarProps) {
  return (
    <div class="status-bar">
      <span class="status-bar__version">{APP_VERSION}</span>
      <div class="status-bar__actions">
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
    </div>
  )
}
