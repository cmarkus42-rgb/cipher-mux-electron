// src/renderer/app.tsx
import { useState, useCallback, useEffect, useMemo } from 'preact/hooks'
import type { ProjectInfo } from '../shared/types'
import { useSessions } from './hooks/useSessions'
import { useContextUsage } from './hooks/useContextUsage'
import { useProjects } from './hooks/useProjects'
import { useGrid } from './hooks/useGrid'
import { useTheme } from './hooks/useTheme'
import { useShortcuts } from './hooks/useShortcuts'
import { SessionGrid } from './components/SessionGrid'
import { SidebarPanel } from './components/SidebarPanel'
import { ProjectPopup } from './components/ProjectPopup'
import { RecoveryDialog } from './components/RecoveryDialog'
import { BugreportDialog } from './components/BugreportDialog'
import { InfoSettingsView } from './components/InfoSettingsView'
import { StatusBar } from './components/StatusBar'
import { SessionDialog } from './components/SessionDialog'
import { WorkspacePopup } from './components/WorkspacePopup'

export function App() {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [bugreportVisible, setBugreportVisible] = useState(false)
  const [infoVisible, setInfoVisible] = useState(false)
  const [infoInitialTab, setInfoInitialTab] = useState<'shortcuts' | 'features' | 'settings' | undefined>(undefined)
  const [workspacesPopupVisible, setWorkspacesPopupVisible] = useState(false)

  // Project popup state
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupTargetSessionId, setPopupTargetSessionId] = useState<string | null>(null)
  const [popupTargetSlotIndex, setPopupTargetSlotIndex] = useState<number | null>(null)

  const { sessions, startSession, stopSession } = useSessions()
  const contextUsages = useContextUsage()
  const { projects, scanning, rescan } = useProjects()
  const { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand, applyMerges } = useGrid()
  const { theme, setTheme, toggleTheme } = useTheme()

  // Global keyboard shortcuts
  const shortcutEntries = useMemo(() => [
    {
      combo: 'Cmd+B',
      label: 'bugreport dialog öffnen',
      category: 'Aktionen' as const,
      action: () => setBugreportVisible(true),
    },
    {
      combo: 'Escape',
      label: 'dialog / overlay schließen',
      category: 'Navigation' as const,
      action: () => {
        setBugreportVisible(false)
        setInfoVisible(false)
        setPopupVisible(false)
        setSessionDialogVisible(false)
        setWorkspacesPopupVisible(false)
      },
    },
  ], [])
  useShortcuts(shortcutEntries)

  const focusedSessionName = useMemo(() => {
    if (!focusedSessionId) return null
    const session = sessions.find(s => s.id === focusedSessionId)
    return session?.name ?? null
  }, [focusedSessionId, sessions])

  const [orchestratorSessionId, setOrchestratorSessionId] = useState<string | null>(null)
  const [mpoSessionId, setMpoSessionId] = useState<string | null>(null)

  // Compute grid session IDs for sidebar
  const gridSessionIds = grid.slots.filter(s => s.sessionId).map(s => s.sessionId!)

  // Check if sidebar has content (for LED indicator)
  const sidebarHasContent = !!orchestratorSessionId || !!mpoSessionId ||
    sessions.some(s => s.status === 'active' && !gridSessionIds.includes(s.id))

  // Resize window when panels open/close so sessions don't compress
  useEffect(() => {
    const panelWidth = sidebarVisible && sidebarHasContent ? 280 : 0
    const api = (window as any).cipherMux
    api.window.fitGrid(grid.config.cols, grid.config.rows, panelWidth)
  }, [sidebarVisible, sidebarHasContent, grid.config.cols, grid.config.rows])

  // Place orchestrator in grid slot 0
  const placeOrchestrator = useCallback((sessionId: string) => {
    setOrchestratorSessionId(sessionId)
    // Always put orchestrator in slot 0 (top-left)
    setSessionAtSlot(0, sessionId)
  }, [setSessionAtSlot])

  const placeMpo = useCallback((sessionId: string) => {
    setMpoSessionId((prev) => {
      if (prev === sessionId) return prev // already placed
      addSession(sessionId)
      return sessionId
    })
  }, [addSession])

  // Check orchestrator status on mount
  useEffect(() => {
    const api = (window as any).cipherMux
    api.orchestrator.status().then((s: { running: boolean; sessionId?: string }) => {
      if (s.running && s.sessionId) placeOrchestrator(s.sessionId)
    })
    const unsub = api.orchestrator.onStarted((data: any) => {
      const sid = data?.sessionId ?? data?.id
      if (sid) placeOrchestrator(sid)
    })
    return () => unsub()
  }, [placeOrchestrator])

  // Check MPO status on mount
  useEffect(() => {
    const api = (window as any).cipherMux
    api.mpo.status().then((s: { running: boolean; sessionId?: string }) => {
      if (s.running && s.sessionId) placeMpo(s.sessionId)
    })
    const unsub = api.mpo.onStarted((data: any) => {
      const sid = data?.sessionId ?? data?.id
      if (sid) placeMpo(sid)
    })
    return () => unsub()
  }, [placeMpo])

  // Handle kickoff started — add launcher session to grid
  const handleKickoffStarted = useCallback((launcherSessionId: string) => {
    addSession(launcherSessionId)
    setFocusedSessionId(launcherSessionId)
  }, [addSession])

  // Listen for kickoff completion
  useEffect(() => {
    const api = (window as any).cipherMux
    const unsub = api.projects.onCompleted((data: any) => {
      if (data?.status === 'complete' && data.event?.followupSessionId) {
        addSession(data.event.followupSessionId)
        setFocusedSessionId(data.event.followupSessionId)
        rescan().catch(() => {})
      } else if (data?.status === 'timeout') {
        console.warn('[App] Kickoff timed out for project:', data.handle?.projectName)
      } else if (data?.status === 'error') {
        console.error('[App] Kickoff error:', data.error)
      }
    })
    return () => unsub()
  }, [addSession, rescan])

  // Handle visible-add from MCP mux_create_session with visible:true
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.sessions?.onVisibleAdd) return
    const unsub = api.sessions.onVisibleAdd(async (data: { sessionId: string }) => {
      // Wait for session to appear in sessions list (race condition with IPC)
      let retries = 0
      while (retries < 10) {
        const sessions = await api.sessions.list()
        if (sessions.some((s: any) => s.id === data.sessionId)) {
          addSession(data.sessionId)
          setFocusedSessionId(data.sessionId)
          return
        }
        await new Promise(r => setTimeout(r, 200))
        retries++
      }
      console.warn('[app] visible-add: session not found after retries:', data.sessionId)
    })
    return () => unsub()
  }, [addSession])

  // Open project popup from launcher cell
  const handleLaunch = useCallback((slotIndex: number) => {
    setPopupTargetSessionId(null)
    setPopupTargetSlotIndex(slotIndex)
    setPopupVisible(true)
  }, [])

  // Session dialog state
  const [sessionDialogVisible, setSessionDialogVisible] = useState(false)
  const [sessionDialogSlotIndex, setSessionDialogSlotIndex] = useState<number | null>(null)

  const handleOpenSession = useCallback((slotIndex: number) => {
    setSessionDialogSlotIndex(slotIndex)
    setSessionDialogVisible(true)
  }, [])

  const handleSessionStart = useCallback(async (dirPath: string) => {
    setSessionDialogVisible(false)
    try {
      const name = dirPath ? dirPath.split('/').filter(Boolean).pop() ?? 'session' : 'session'
      const session = await startSession({
        name,
        projectPath: dirPath,
      })
      if (sessionDialogSlotIndex !== null) {
        setSessionAtSlot(sessionDialogSlotIndex, session.id)
      } else {
        addSession(session.id)
      }
      setFocusedSessionId(session.id)
    } catch (err) {
      console.error('[App] Failed to open session:', err)
    }
  }, [startSession, setSessionAtSlot, addSession, sessionDialogSlotIndex])

  // Open project popup for switching existing session's project
  const handleSwitchProject = useCallback((sessionId: string) => {
    setPopupTargetSessionId(sessionId)
    setPopupTargetSlotIndex(null)
    setPopupVisible(true)
  }, [])

  // Handle project selection from popup
  const handleProjectSelect = useCallback(async (project: ProjectInfo, targetSessionId: string | null) => {
    setPopupVisible(false)
    try {
      if (targetSessionId) {
        // Switching project for existing session — stop old, start new in same slot
        const slotIdx = grid.slots.findIndex((s) => s.sessionId === targetSessionId)
        await stopSession(targetSessionId)
        const session = await startSession({
          name: project.name,
          projectPath: project.path,
          autoLaunch: 'clear; claude --dangerously-skip-permissions\n',
        })
        if (slotIdx >= 0) {
          setSessionAtSlot(slotIdx, session.id)
        } else {
          addSession(session.id)
        }
        setFocusedSessionId(session.id)
      } else {
        // New session from launcher cell
        const session = await startSession({
          name: project.name,
          projectPath: project.path,
          autoLaunch: 'clear; claude --dangerously-skip-permissions\n',
        })
        if (popupTargetSlotIndex !== null) {
          setSessionAtSlot(popupTargetSlotIndex, session.id)
        } else {
          addSession(session.id)
        }
        setFocusedSessionId(session.id)
      }
      // Ensure the project's parent dir is in scan paths so it appears in future listings
      const parentDir = project.path.replace(/\/[^/]+\/?$/, '')
      if (parentDir) {
        const appCfg = await (window as any).cipherMux.config.get('app') ?? {}
        const scanPaths: string[] = appCfg.scanPaths ?? []
        if (!scanPaths.includes(parentDir)) {
          await (window as any).cipherMux.config.set('app', {
            ...appCfg,
            scanPaths: [...scanPaths, parentDir],
          })
          rescan().catch(() => {})
        }
      }
    } catch (err) {
      console.error('[App] Failed to start/switch session:', err)
    }
  }, [grid.slots, startSession, stopSession, addSession, setSessionAtSlot, popupTargetSlotIndex, rescan])

  const handleCloseSession = useCallback(async (sessionId: string) => {
    await stopSession(sessionId)
    removeSession(sessionId)
    if (focusedSessionId === sessionId) {
      const remaining = grid.slots.find((s) => s.sessionId && s.sessionId !== sessionId)
      setFocusedSessionId(remaining?.sessionId ?? null)
    }
  }, [stopSession, removeSession, focusedSessionId, grid.slots])

  const handleShell = useCallback(async (_sessionId: string, projectPath: string | null) => {
    if (!projectPath) return
    try {
      const session = await startSession({
        name: 'Shell',
        projectPath,
      })
      addSession(session.id)
      setFocusedSessionId(session.id)
    } catch (err) {
      console.error('[App] Failed to open shell:', err)
    }
  }, [startSession, addSession])

  const handleAddToGrid = useCallback((sessionId: string) => {
    const freeIdx = grid.slots.findIndex(s => !s.sessionId)
    if (freeIdx >= 0) {
      addSession(sessionId)
      setFocusedSessionId(sessionId)
    } else {
      // Grid full — for now just log. GridPlacementPopup added in Task 14
      console.warn('[app] grid full, cannot place session', sessionId)
    }
  }, [grid.slots, addSession])

  const handleResize = useCallback((cols: number, rows: number) => {
    resize({ cols, rows })
  }, [resize])

  const handleToggleWorkspaces = useCallback(() => {
    setWorkspacesPopupVisible((v) => !v)
  }, [])

  const handleWorkspaceApply = useCallback(async (workspaceId: string) => {
    try {
      const api = (window as any).cipherMux
      // Load workspace to get grid dimensions + merges
      const workspaces = await api.workspaces.list()
      const ws = workspaces.find((w: any) => w.id === workspaceId)
      if (ws) {
        // Resize grid first (renderer-side)
        resize({ cols: ws.cols, rows: ws.rows })
        // Apply workspace merges as rowSpans
        if (ws.merges && Object.keys(ws.merges).length > 0) {
          applyMerges(ws.cols, ws.rows, ws.merges)
        }
      }
      // Apply workspace (spawns sessions in main process)
      const result = await api.workspaces.apply(workspaceId)
      if (result?.warnings?.length) {
        console.warn('[App] Workspace apply warnings:', result.warnings)
      }
      // Place spawned sessions into their grid slots
      if (result?.sessions?.length) {
        for (const { cellIndex, sessionId } of result.sessions) {
          setSessionAtSlot(cellIndex, sessionId)
        }
        // Focus the first spawned session
        setFocusedSessionId(result.sessions[0].sessionId)
      }
    } catch (err) {
      console.error('[App] Failed to apply workspace:', err)
    }
    setWorkspacesPopupVisible(false)
  }, [resize, applyMerges, setSessionAtSlot])

  const handleWorkspaceOpenSettings = useCallback((tab: 'personas' | 'workspaces') => {
    setWorkspacesPopupVisible(false)
    ;(window as any).cipherMux.window.openWorkspaces(tab)
  }, [])

  const handleOrchestratorToggle = useCallback(async () => {
    const api = (window as any).cipherMux
    try {
      const status = await api.orchestrator.status()
      if (status.running && status.sessionId) {
        // Running — stop it
        await api.orchestrator.stop()
        removeSession(status.sessionId)
        setOrchestratorSessionId(null)
      } else {
        // Not running — clear stale state and start fresh
        if (orchestratorSessionId) {
          removeSession(orchestratorSessionId)
          setOrchestratorSessionId(null)
        }
        const session = await api.orchestrator.start()
        const sid = session?.sessionId ?? session?.id
        if (sid) placeOrchestrator(sid)
      }
    } catch (err) {
      console.error('[App] orchestrator toggle failed:', err)
      setOrchestratorSessionId(null)
    }
  }, [orchestratorSessionId, removeSession, placeOrchestrator])

  const handleMpoToggle = useCallback(async () => {
    const api = (window as any).cipherMux
    try {
      const status = await api.mpo.status()
      if (status.running && status.sessionId) {
        // Running — stop it
        await api.mpo.stop()
        removeSession(status.sessionId)
        setMpoSessionId(null)
      } else {
        // Not running — clear stale state and start fresh
        if (mpoSessionId) {
          removeSession(mpoSessionId)
          setMpoSessionId(null)
        }
        await api.mpo.start()
        // placement handled by onStarted listener
      }
    } catch (err) {
      console.error('[App] MPO toggle failed:', err)
      setMpoSessionId(null)
    }
  }, [mpoSessionId, removeSession])

  return (
    <div class="app-shell">
      {/* drag region */}
      <div class="drag-region">
        <span class="title">cipher-mux</span>
      </div>

      {/* body: grid + chatroom */}
      <div class="app-body">
        <SessionGrid
          grid={grid}
          sessions={sessions}
          contextUsages={contextUsages}
          focusedSessionId={focusedSessionId}
          theme={theme}
          orchestratorSessionId={orchestratorSessionId}
          onFocusSession={setFocusedSessionId}
          onCloseSession={handleCloseSession}
          onSwitchProject={handleSwitchProject}
          onToggleExpand={toggleExpand}
          onShell={handleShell}
          onLaunch={handleLaunch}
          onOpenSession={handleOpenSession}
          onSwap={swap}
        />
        <SidebarPanel
          visible={sidebarVisible && sidebarHasContent}
          orchestratorActive={!!orchestratorSessionId}
          mpoActive={!!mpoSessionId}
          sessions={sessions}
          gridSessionIds={gridSessionIds}
          contextUsages={contextUsages}
          onAddToGrid={handleAddToGrid}
        />
      </div>

      {/* statusbar */}
      <StatusBar
        theme={theme}
        sidebarVisible={sidebarVisible}
        sidebarHasContent={sidebarHasContent}
        onToggleSidebar={() => setSidebarVisible(v => !v)}
        orchestratorRunning={!!orchestratorSessionId}
        mpoRunning={!!mpoSessionId}
        workspacesPopupVisible={workspacesPopupVisible}
        onMpo={handleMpoToggle}
        gridCols={grid.config.cols}
        gridRows={grid.config.rows}
        focusedSessionId={focusedSessionId}
        focusedSessionName={focusedSessionName}
        onOrchestrator={handleOrchestratorToggle}
        onBugreport={() => setBugreportVisible(true)}
        onToggleTheme={toggleTheme}
        onToggleWorkspaces={handleToggleWorkspaces}
        onInfo={() => { setInfoInitialTab(undefined); setInfoVisible(true) }}
        onThemeSettings={() => { setInfoInitialTab('settings'); setInfoVisible(true) }}
        onGridResize={handleResize}
      />

      {/* workspace popup */}
      <WorkspacePopup
        visible={workspacesPopupVisible}
        onClose={() => setWorkspacesPopupVisible(false)}
        onApply={handleWorkspaceApply}
        onOpenSettings={handleWorkspaceOpenSettings}
      />

      {/* dialogs */}
      <ProjectPopup
        visible={popupVisible}
        projects={projects}
        scanning={scanning}
        targetSessionId={popupTargetSessionId}
        onSelect={handleProjectSelect}
        onKickoffStarted={handleKickoffStarted}
        onRescan={rescan}
        onClose={() => setPopupVisible(false)}
      />
      <RecoveryDialog onDone={() => {}} onAdopt={addSession} />
      <SessionDialog
        visible={sessionDialogVisible}
        onStart={handleSessionStart}
        onClose={() => setSessionDialogVisible(false)}
      />
      <BugreportDialog
        visible={bugreportVisible}
        onClose={() => setBugreportVisible(false)}
      />
      {infoVisible && (
        <div class="modal-overlay" onClick={() => setInfoVisible(false)}>
          <div class="modal-panel" style={{ width: '600px' }} onClick={(e) => e.stopPropagation()}>
            <InfoSettingsView
              onRescan={rescan}
              scanning={scanning}
              theme={theme}
              onSetTheme={setTheme}
              initialTab={infoInitialTab}
            />
          </div>
        </div>
      )}
    </div>
  )
}
