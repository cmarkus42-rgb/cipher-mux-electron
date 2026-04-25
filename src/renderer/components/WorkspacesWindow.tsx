// src/renderer/components/WorkspacesWindow.tsx
// Standalone window for Workspaces + Companion management
import { useState, useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../hooks/useTheme'
import { CompanionTab } from './CompanionTab'
import { WorkspacesTab } from './WorkspacesTab'
import '../styles/workspaces.css'

type TabId = 'workspaces' | 'companion'

export function WorkspacesWindow() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<TabId>('workspaces')

  // Read initial tab from URL hash
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash === 'companion' || hash === 'workspaces') {
      setActiveTab(hash)
    }
    // Legacy: treat #personas as #companion
    if (hash === 'personas') {
      setActiveTab('companion')
    }
  }, [])

  return (
    <div class="ws-window" data-theme={theme}>
      <div class="ws-window__head">
        <div class="ws-window__tabs">
          {(['workspaces', 'companion'] as TabId[]).map((tab) => (
            <button
              key={tab}
              class={`ws-window__tab ${activeTab === tab ? 'ws-window__tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'workspaces' ? t('workspacesWindow.workspaces') : 'Companion'}
            </button>
          ))}
        </div>
      </div>
      <div class="ws-window__body">
        {activeTab === 'workspaces' && <WorkspacesTab />}
        {activeTab === 'companion' && <CompanionTab />}
      </div>
    </div>
  )
}
