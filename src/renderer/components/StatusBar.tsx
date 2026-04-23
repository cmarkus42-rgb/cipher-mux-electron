// src/renderer/components/StatusBar.tsx
import type { ThemeName } from '../../shared/grid-types'
import { APP_VERSION } from '../../shared/constants'
import { GridControls } from './GridControls'
import { VoiceControl } from './VoiceControl'
import themesManifest from '../themes.json'

const themesList = themesManifest.themes

/** Resolve ThemeName to human-readable display name. */
function themeDisplayName(id: ThemeName): string {
  const entry = themesList.find((t) => t.id === id)
  return entry?.name ?? id
}

interface StatusBarProps {
  theme: ThemeName
  chatroomVisible: boolean
  requestsVisible: boolean
  requestsOpenCount: number
  orchestratorRunning: boolean
  mpoRunning: boolean
  workspacesPopupVisible: boolean
  gridCols: number
  gridRows: number
  focusedSessionId: string | null
  focusedSessionName: string | null
  onOrchestrator: () => void
  onMpo: () => void
  onBugreport: () => void
  onToggleChatroom: () => void
  onToggleRequests: () => void
  onToggleTheme: () => void
  onToggleWorkspaces: () => void
  onInfo: () => void
  onGridResize: (cols: number, rows: number) => void
}

export function StatusBar({
  theme, chatroomVisible, requestsVisible, requestsOpenCount, orchestratorRunning,
  gridCols, gridRows, focusedSessionId, focusedSessionName,
  onOrchestrator, onMpo, onBugreport, onToggleChatroom, onToggleRequests, onToggleTheme, onInfo,
  onGridResize, mpoRunning, workspacesPopupVisible, onToggleWorkspaces,
}: StatusBarProps) {
  return (
    <div class="status-bar">
      <div class="status-bar__actions">
        <VoiceControl
          focusedSessionId={focusedSessionId}
          focusedSessionName={focusedSessionName}
          inline
        />
        <span class="status-bar__sep">|</span>
        <GridControls cols={gridCols} rows={gridRows} onResize={onGridResize} inline />
        <span class="status-bar__sep">|</span>
        <button
          class={`status-bar__btn${workspacesPopupVisible ? ' status-bar__btn--active' : ''}`}
          onClick={onToggleWorkspaces}
        >
          workspaces
        </button>
        <button
          class={`status-bar__btn status-bar__btn--session${orchestratorRunning ? ' status-bar__btn--active' : ''}`}
          onClick={onOrchestrator}
        >
          <span class="status-bar__dot status-bar__dot--orchestrator" />orchestrator
        </button>
        <button
          class={`status-bar__btn status-bar__btn--session${mpoRunning ? ' status-bar__btn--active' : ''}`}
          onClick={onMpo}
        >
          <span class="status-bar__dot status-bar__dot--mpo" />mpo
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
        <button class="status-bar__btn status-bar__btn--active" onClick={onInfo}>
          {themeDisplayName(theme)}
        </button>
        <button class="status-bar__btn" onClick={onInfo}>info</button>
      </div>
      <span class="status-bar__version">{APP_VERSION}</span>
    </div>
  )
}
