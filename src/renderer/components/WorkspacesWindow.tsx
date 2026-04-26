// src/renderer/components/WorkspacesWindow.tsx
// Standalone window for Workspaces + Companion + Tags management
import { useState, useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../hooks/useTheme'
import { CompanionTab } from './CompanionTab'
import { WorkspacesTab } from './WorkspacesTab'
import { TagManager } from './TagManager'
import '../styles/workspaces.css'

type TabId = 'workspaces' | 'companion' | 'tags'

const TAB_LABELS: Record<TabId, string> = {
  workspaces: 'workspacesWindow.workspaces',
  companion: 'Companion',
  tags: 'workspacesWindow.tags',
}

export function WorkspacesWindow() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<TabId>('workspaces')

  // Read initial tab from URL hash
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash === 'companion' || hash === 'workspaces' || hash === 'tags') {
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
          {(['workspaces', 'companion', 'tags'] as TabId[]).map((tab) => (
            <button
              key={tab}
              class={`ws-window__tab ${activeTab === tab ? 'ws-window__tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'companion' ? 'Companion' : t(TAB_LABELS[tab])}
            </button>
          ))}
        </div>
      </div>
      <div class="ws-window__body">
        {activeTab === 'workspaces' && <WorkspacesTab />}
        {activeTab === 'companion' && <CompanionTab />}
        {activeTab === 'tags' && <TagManager />}
      </div>
    </div>
  )
}
