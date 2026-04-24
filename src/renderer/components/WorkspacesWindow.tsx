// src/renderer/components/WorkspacesWindow.tsx
// Standalone window for Workspaces + Personas management
import { useState, useEffect } from 'preact/hooks'
import { useTheme } from '../hooks/useTheme'
import { PersonasTab } from './PersonasTab'
import { WorkspacesTab } from './WorkspacesTab'
import '../styles/workspaces.css'

type TabId = 'workspaces' | 'personas'

export function WorkspacesWindow() {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<TabId>('workspaces')

  // Read initial tab from URL hash
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash === 'personas' || hash === 'workspaces') {
      setActiveTab(hash)
    }
  }, [])

  return (
    <div class="ws-window" data-theme={theme}>
      <div class="ws-window__head">
        <div class="ws-window__tabs">
          {(['workspaces', 'personas'] as TabId[]).map((tab) => (
            <button
              key={tab}
              class={`ws-window__tab ${activeTab === tab ? 'ws-window__tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div class="ws-window__body">
        {activeTab === 'workspaces' && <WorkspacesTab />}
        {activeTab === 'personas' && <PersonasTab />}
      </div>
    </div>
  )
}
