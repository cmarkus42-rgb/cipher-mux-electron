// src/renderer/app.tsx
import { useState, useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
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
import { GridPlacementPopup } from './components/GridPlacementPopup'

export function App() {
  const { t } = useTranslation()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarDetached, setSidebarDetached] = useState(false)
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [bugreportVisible, setBugreportVisible] = useState(false)
  const [infoVisible, setInfoVisible] = useState(false)
  const [infoInitialTab, setInfoInitialTab] = useState<'shortcuts' | 'features' | 'settings' | undefined>(undefined)
  const [workspacesPopupVisible, setWorkspacesPopupVisible] = useState(false)
  const [placementPopup, setPlacementPopup] = useState<{ sessionId: string } | null>(null)

  // Project popup state
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupTargetSessionId, setPopupTargetSessionId] = useState<string | null>(null)
  const [popupTargetSlotIndex, setPopupTargetSlotIndex] = useState<number | null>(null)

  const { sessions, startSession, stopSession, refresh: refreshSessions } = useSessions()
  const contextUsages = useContextUsage()
  const { projects, scanning, rescan } = useProjects()
  // panelWidth needs a ref so useGrid callbacks can access the latest value
  // without circular dependency (sidebarHasContent depends on grid which depends on useGrid)
  const panelWidthRef = useRef(0)
  const { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand, applyMerges, setSlotType, clearSlotType, toggleExpandSlot } = useGrid(panelWidthRef.current)
  const { theme, setTheme, toggleTheme } = useTheme()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

  // Global keyboard shortcuts
  const shortcutEntries = useMemo(() => [
    {
      combo: 'Cmd+B',
      label: t('app.shortcut.bugreport'),
      category: 'Aktionen' as const,
      action: () => setBugreportVisible(true),
    },
    {
      combo: 'Escape',
      label: t('app.shortcut.closeOverlay'),
      category: 'Navigation' as const,
      action: () => {
        setBugreportVisible(false)
        setInfoVisible(false)
        setPopupVisible(false)
        setSessionDialogVisible(false)
        setWorkspacesPopupVisible(false)
        setPlacementPopup(null)
      },
    },
  ], [t])
  useShortcuts(shortcutEntries)

  const focusedSessionName = useMemo(() => {
    if (!focusedSessionId) return null
    const session = sessions.find(s => s.id === focusedSessionId)
    return session?.name ?? null
  }, [focusedSessionId, sessions])

  const [orchestratorSessionId, setOrchestratorSessionId] = useState<string | null>(null)
  const [mpoSessionId, setMpoSessionId] = useState<string | null>(null)
  const [companionSessionId, setCompanionSessionId] = useState<string | null>(null)
  const [refinementSessionId, setRefinementSessionId] = useState<string | null>(null)

  // Compute grid session IDs for sidebar
  const gridSessionIds = grid.slots.filter(s => s.sessionId).map(s => s.sessionId!)

  // Check if sidebar has content (for LED indicator)
  const sidebarHasContent = !!orchestratorSessionId || !!mpoSessionId ||
    sessions.some(s => s.status === 'active' && !gridSessionIds.includes(s.id)) ||
    grid.slots.some(s => s.type === 'notes')

  // Keep panelWidth ref in sync for useGrid callbacks
  const computedPanelWidth = sidebarVisible && sidebarHasContent && !sidebarDetached ? 280 : 0
  panelWidthRef.current = computedPanelWidth

  // Resize window when panels open/close so sessions don't compress
  useEffect(() => {
    const pw = sidebarVisible && sidebarHasContent && !sidebarDetached ? 280 : 0
    const api = (window as any).cipherMux
    api.window.fitGrid(grid.config.cols, grid.config.rows, pw)
  }, [sidebarVisible, sidebarHasContent, sidebarDetached, grid.config.cols, grid.config.rows])

  // Place orchestrator in grid slot 0
  const placeOrchestrator = useCallback((sessionId: string) => {
    setOrchestratorSessionId(sessionId)
    // Always put orchestrator in slot 0 (top-left)
    setSessionAtSlot(0, sessionId)
  }, [setSessionAtSlot])

  const placeMpo = useCallback((sessionId: string) => {
    setMpoSessionId((prev) => {
      if (prev === sessionId) return prev // already placed
      const freeIdx = grid.slots.findIndex(s => !s.sessionId && s.type !== 'notes')
      if (freeIdx >= 0) {
        addSession(sessionId)
      } else {
        // Grid full — open placement popup so user can pick a slot
        setPlacementPopup({ sessionId })
      }
      return sessionId
    })
  }, [addSession, grid.slots])

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
          // Ensure useSessions state is current so sidebar shows background sessions
          // even if SESSION_CHANGED refresh hasn't completed yet
          refreshSessions()
          return
        }
        await new Promise(r => setTimeout(r, 200))
        retries++
      }
      console.warn('[app] visible-add: session not found after retries:', data.sessionId)
    })
    return () => unsub()
  }, [addSession, refreshSessions])

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

  const handleOpenNotes = useCallback((slotIndex: number) => {
    setSlotType(slotIndex, 'notes')
    setSidebarVisible(true)
  }, [setSlotType])

  const handleCloseNotes = useCallback((slotIndex: number) => {
    clearSlotType(slotIndex)
  }, [clearSlotType])

  const handleSessionStart = useCallback(async (dirPath: string, opts?: { resume?: boolean }) => {
    setSessionDialogVisible(false)
    try {
      const name = dirPath ? dirPath.split('/').filter(Boolean).pop() ?? 'session' : 'session'
      const session = await startSession({
        name,
        projectPath: dirPath,
        resume: opts?.resume,
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

  const handleFork = useCallback(async (sessionId: string) => {
    const api = (window as any).cipherMux
    try {
      const newSession = await api.sessions.fork(sessionId)
      const freeIdx = grid.slots.findIndex(s => !s.sessionId)
      if (freeIdx >= 0) {
        addSession(newSession.id)
      } else {
        setPlacementPopup({ sessionId: newSession.id })
      }
      setFocusedSessionId(newSession.id)
    } catch (err: any) {
      console.error('[App] Fork failed:', err?.message || err)
    }
  }, [grid.slots, addSession])

  const handleAddToGrid = useCallback((sessionId: string) => {
    const freeIdx = grid.slots.findIndex(s => !s.sessionId)
    if (freeIdx >= 0) {
      addSession(sessionId)
      setFocusedSessionId(sessionId)
    } else {
      // Grid full — open placement popup so user can pick a slot to replace
      setPlacementPopup({ sessionId })
    }
  }, [grid.slots, addSession])

  const handlePlacementSelect = useCallback((slotIndex: number) => {
    if (!placementPopup) return
    setSessionAtSlot(slotIndex, placementPopup.sessionId)
    setFocusedSessionId(placementPopup.sessionId)
    setPlacementPopup(null)
  }, [placementPopup, setSessionAtSlot])

  const handleResize = useCallback((cols: number, rows: number) => {
    resize({ cols, rows })
  }, [resize])

  const handleSidebarDetach = useCallback(async () => {
    const api = (window as any).cipherMux
    await api.sidebar.detach()
    setSidebarDetached(true)
  }, [])

  // Restore persisted sidebar detach state on mount
  useEffect(() => {
    const api = (window as any).cipherMux
    api.sidebar?.isDetached?.().then((detached: boolean) => {
      if (detached) {
        setSidebarDetached(true)
        api.sidebar.detach()
      }
    })
  }, [])

  // Listen for sidebar reattach (sidebar window closed)
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.sidebar?.onReattached) return
    const unsub = api.sidebar.onReattached(() => {
      setSidebarDetached(false)
    })
    return () => unsub()
  }, [])

  // Load active workspace ID on mount
  useEffect(() => {
    const api = (window as any).cipherMux
    api.workspaces.active().then((id: string | null) => {
      setActiveWorkspaceId(id)
    })
  }, [])

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
      setActiveWorkspaceId(workspaceId)
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

  // Generic entity placement — finds a free slot or opens placement popup
  const placeEntity = useCallback((sessionId: string) => {
    const freeIdx = grid.slots.findIndex(s => !s.sessionId && s.type !== 'notes')
    if (freeIdx >= 0) {
      addSession(sessionId)
    } else {
      setPlacementPopup({ sessionId })
    }
  }, [addSession, grid.slots])

  const handleCompanionToggle = useCallback(async () => {
    const api = (window as any).cipherMux
    try {
      const status = await api.entity.status('companion')
      if (status.running && status.sessionId) {
        await api.entity.stop('companion')
        removeSession(status.sessionId)
        setCompanionSessionId(null)
      } else {
        if (companionSessionId) {
          removeSession(companionSessionId)
          setCompanionSessionId(null)
        }
        const session = await api.entity.start('companion')
        const sid = session?.id
        if (sid) {
          setCompanionSessionId(sid)
          placeEntity(sid)
        }
      }
    } catch (err) {
      console.error('[App] Companion toggle failed:', err)
      setCompanionSessionId(null)
    }
  }, [companionSessionId, removeSession, placeEntity])

  const handleRefinementToggle = useCallback(async () => {
    const api = (window as any).cipherMux
    try {
      const status = await api.entity.status('refinement')
      if (status.running && status.sessionId) {
        await api.entity.stop('refinement')
        removeSession(status.sessionId)
        setRefinementSessionId(null)
      } else {
        if (refinementSessionId) {
          removeSession(refinementSessionId)
          setRefinementSessionId(null)
        }
        const session = await api.entity.start('refinement')
        const sid = session?.id
        if (sid) {
          setRefinementSessionId(sid)
          placeEntity(sid)
        }
      }
    } catch (err) {
      console.error('[App] Refinement toggle failed:', err)
      setRefinementSessionId(null)
    }
  }, [refinementSessionId, removeSession, placeEntity])

  // Listen for entity-started events (e.g. from other sources)
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.entity?.onStarted) return
    const unsub = api.entity.onStarted((data: { entityId: string; session: any }) => {
      const sid = data.session?.id
      if (!sid) return
      if (data.entityId === 'companion' && !companionSessionId) {
        setCompanionSessionId(sid)
        placeEntity(sid)
      } else if (data.entityId === 'refinement' && !refinementSessionId) {
        setRefinementSessionId(sid)
        placeEntity(sid)
      }
    })
    return () => unsub()
  }, [companionSessionId, refinementSessionId, placeEntity])

  // Check companion/refinement status on mount
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.entity?.status) return
    api.entity.status('companion').then((s: { running: boolean; sessionId?: string }) => {
      if (s.running && s.sessionId) {
        setCompanionSessionId(s.sessionId)
        placeEntity(s.sessionId)
      }
    })
    api.entity.status('refinement').then((s: { running: boolean; sessionId?: string }) => {
      if (s.running && s.sessionId) {
        setRefinementSessionId(s.sessionId)
        placeEntity(s.sessionId)
      }
    })
  }, [placeEntity])

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
          activeWorkspaceId={activeWorkspaceId}
          onFocusSession={setFocusedSessionId}
          onCloseSession={handleCloseSession}
          onSwitchProject={handleSwitchProject}
          onToggleExpand={toggleExpand}
          onShell={handleShell}
          onFork={handleFork}
          onLaunch={handleLaunch}
          onOpenSession={handleOpenSession}
          onOpenNotes={handleOpenNotes}
          onCloseNotes={handleCloseNotes}
          onToggleExpandSlot={toggleExpandSlot}
          onSwap={swap}
          onCompanion={handleCompanionToggle}
          onRefinement={handleRefinementToggle}
        />
        {!sidebarDetached && (
          <SidebarPanel
            visible={sidebarVisible && sidebarHasContent}
            orchestratorActive={!!orchestratorSessionId}
            mpoActive={!!mpoSessionId}
            sessions={sessions}
            gridSessionIds={gridSessionIds}
            contextUsages={contextUsages}
            onAddToGrid={handleAddToGrid}
            onKillSession={stopSession}
            onDetach={handleSidebarDetach}
            activeWorkspaceId={activeWorkspaceId}
            hasNotesCell={grid.slots.some(s => s.type === 'notes')}
          />
        )}
      </div>

      {/* statusbar */}
      <StatusBar
        theme={theme}
        sidebarVisible={sidebarVisible}
        sidebarHasContent={sidebarHasContent}
        onToggleSidebar={() => setSidebarVisible(v => !v)}
        orchestratorRunning={!!orchestratorSessionId}
        mpoRunning={!!mpoSessionId}
        companionRunning={!!companionSessionId}
        refinementRunning={!!refinementSessionId}
        workspacesPopupVisible={workspacesPopupVisible}
        onMpo={handleMpoToggle}
        onCompanion={handleCompanionToggle}
        onRefinement={handleRefinementToggle}
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
        currentGrid={grid}
        sessions={sessions}
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
      <GridPlacementPopup
        visible={!!placementPopup}
        gridSlots={grid.slots}
        cols={grid.config.cols}
        rows={grid.config.rows}
        sessions={sessions}
        onSelect={handlePlacementSelect}
        onCancel={() => setPlacementPopup(null)}
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
