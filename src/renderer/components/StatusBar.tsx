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
  sidebarHasContent: boolean
  onToggleSidebar: () => void
  orchestratorRunning: boolean
  mpoRunning: boolean
  companionRunning: boolean
  refinementRunning: boolean
  auditRunning: boolean
  workspacesPopupVisible: boolean
  gridCols: number
  gridRows: number
  focusedSessionId: string | null
  focusedSessionName: string | null
  onOrchestrator: () => void
  onMpo: () => void
  onCompanion: () => void
  onRefinement: () => void
  onAudit: () => void
  onBugreport: () => void
  onToggleTheme: () => void
  onToggleWorkspaces: () => void
  onInfo: () => void
  onThemeSettings: () => void
  onGridResize: (cols: number, rows: number) => void
}

export function StatusBar({
  theme, sidebarVisible, sidebarHasContent, onToggleSidebar, orchestratorRunning,
  gridCols, gridRows, focusedSessionId, focusedSessionName,
  onOrchestrator, onMpo, onCompanion, onRefinement, onAudit, onBugreport, onToggleTheme, onInfo, onThemeSettings,
  onGridResize, mpoRunning, companionRunning, refinementRunning, auditRunning, workspacesPopupVisible, onToggleWorkspaces,
}: StatusBarProps) {
  const { t } = useTranslation()
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
          {t('statusBar.workspaces')}
        </button>
        <button
          class={`status-bar__btn status-bar__btn--session${companionRunning ? ' status-bar__btn--active' : ''}`}
          onClick={onCompanion}
        >
          <span class="status-bar__dot status-bar__dot--companion" />{t('statusBar.companion')}
        </button>
        <button
          class={`status-bar__btn status-bar__btn--session${refinementRunning ? ' status-bar__btn--active' : ''}`}
          onClick={onRefinement}
        >
          <span class="status-bar__dot status-bar__dot--refinement" />{t('statusBar.refinement')}
        </button>
        <button
          class={`status-bar__btn status-bar__btn--session${orchestratorRunning ? ' status-bar__btn--active' : ''}`}
          onClick={onOrchestrator}
        >
          <span class="status-bar__dot status-bar__dot--orchestrator" />{t('statusBar.orchestrator')}
        </button>
        <button
          class={`status-bar__btn status-bar__btn--session${mpoRunning ? ' status-bar__btn--active' : ''}`}
          onClick={onMpo}
        >
          <span class="status-bar__dot status-bar__dot--mpo" />{t('statusBar.mpo')}
        </button>
        <button
          class={`status-bar__btn status-bar__btn--session${auditRunning ? ' status-bar__btn--active' : ''}`}
          onClick={onAudit}
        >
          <span class="status-bar__dot status-bar__dot--audit" />{t('statusBar.audit')}
        </button>
        <button class="status-bar__btn" onClick={onBugreport}>{t('statusBar.bugreport')}</button>
        <button
          class={`status-bar__btn${sidebarVisible ? ' status-bar__btn--active' : ''}`}
          onClick={onToggleSidebar}
          title={t('statusBar.sidebarToggle')}
        >
          {sidebarHasContent && <span class="status-bar__led" />}
          {t('statusBar.sidebar')}
        </button>
        <button class="status-bar__btn status-bar__btn--active" onClick={onThemeSettings}>
          {themeDisplayName(theme)}
        </button>
        <button class="status-bar__btn" onClick={onInfo}>{t('statusBar.info')}</button>
      </div>
      <span class="status-bar__version">{APP_VERSION}</span>
    </div>
  )
}
