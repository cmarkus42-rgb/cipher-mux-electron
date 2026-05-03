// src/renderer/components/StatusBar.tsx
import type { ThemeName } from '../../shared/grid-types'
import { APP_VERSION } from '../../shared/constants'
import { GridControls } from './GridControls'
import { VoiceControl } from './VoiceControl'
import { useTranslation } from 'react-i18next'
import themesManifest from '../themes.json'

const themesList = themesManifest.themes

/** Resolve ThemeName to human-readable display name. */
function themeDisplayName(id: ThemeName): string {
  const entry = themesList.find((t) => t.id === id)
  return entry?.name ?? id
}

interface StatusBarProps {
  theme: ThemeName
  sidebarVisible: boolean

  onToggleSidebar: () => void
  workspacesPopupVisible: boolean
  gridCols: number
  gridRows: number
  focusedSessionId: string | null
  focusedSessionName: string | null
  sessions?: Array<{ id: string; name: string }>
  onToggleTheme: () => void
  onToggleWorkspaces: () => void
  onInfo: () => void
  onThemeSettings: () => void
  onGridResize: (cols: number, rows: number) => void
}

export function StatusBar({
  theme, sidebarVisible, onToggleSidebar,
  gridCols, gridRows, focusedSessionId, focusedSessionName, sessions,
  onToggleTheme, onInfo, onThemeSettings,
  onGridResize, workspacesPopupVisible, onToggleWorkspaces,
}: StatusBarProps) {
  const { t } = useTranslation()
  return (
    <div class="status-bar" role="toolbar" aria-label="Status-Leiste">
      <div class="status-bar__actions">
        <span data-highlight="sb-voice">
          <VoiceControl
            focusedSessionId={focusedSessionId}
            focusedSessionName={focusedSessionName}
            sessions={sessions}
            inline
          />
        </span>
        <span class="status-bar__sep" aria-hidden="true">|</span>
        <span data-highlight="sb-grid">
          <GridControls cols={gridCols} rows={gridRows} onResize={onGridResize} inline />
        </span>
        <span class="status-bar__sep" aria-hidden="true">|</span>
        <button
          class={`status-bar__btn${workspacesPopupVisible ? ' status-bar__btn--active' : ''}`}
          onClick={onToggleWorkspaces}
          data-highlight="sb-workspaces"
          aria-label="Workspaces anzeigen"
          aria-pressed={workspacesPopupVisible}
        >
          {t('statusBar.workspaces')}
        </button>
        <button
          class={`status-bar__btn${sidebarVisible ? ' status-bar__btn--active' : ''}`}
          onClick={onToggleSidebar}
          title={t('statusBar.sidebarToggle')}
          data-highlight="sb-sidebar"
          aria-label="Seitenleiste oeffnen/schliessen"
          aria-pressed={sidebarVisible}
        >
          {t('statusBar.sidebar')}
        </button>
        <button
          class="status-bar__btn status-bar__btn--active"
          onClick={onThemeSettings}
          data-highlight="sb-theme"
          aria-label={`Theme auswaehlen (aktuell: ${themeDisplayName(theme)})`}
        >
          {themeDisplayName(theme)}
        </button>
        <button class="status-bar__btn" onClick={onInfo} data-highlight="sb-info" aria-label="Einstellungen oeffnen">{t('statusBar.settings', 'Settings')}</button>
      </div>
      <span class="status-bar__version" aria-label={`Version ${APP_VERSION}`}>{APP_VERSION}</span>
    </div>
  )
}
