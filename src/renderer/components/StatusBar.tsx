// src/renderer/components/StatusBar.tsx
import type { ThemeName } from '../../shared/grid-types'
import { APP_VERSION } from '../../shared/constants'

interface StatusBarProps {
  theme: ThemeName
  chatroomVisible: boolean
  orchestratorRunning: boolean
  onOrchestrator: () => void
  onBugreport: () => void
  onToggleChatroom: () => void
  onToggleTheme: () => void
  onInfo: () => void
}

export function StatusBar({
  theme, chatroomVisible, orchestratorRunning,
  onOrchestrator, onBugreport, onToggleChatroom, onToggleTheme, onInfo,
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
        <button class="status-bar__btn status-bar__btn--active" onClick={onToggleTheme}>
          theme: {theme}
        </button>
        <button class="status-bar__btn" onClick={onInfo}>info</button>
      </div>
    </div>
  )
}
