// src/renderer/app.tsx
import { useState, useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { RecoveryResult, EntityId } from '../shared/types'
import { useSessions } from './hooks/useSessions'
import { useContextUsage } from './hooks/useContextUsage'
import { useProjects } from './hooks/useProjects'
import { useGrid } from './hooks/useGrid'
import { useTheme } from './hooks/useTheme'
import { useShortcuts } from './hooks/useShortcuts'
import { SessionGrid } from './components/SessionGrid'
import { SidebarPanel } from './components/SidebarPanel'
import { RecoveryDialog } from './components/RecoveryDialog'
import { BugreportDialog } from './components/BugreportDialog'
import { InfoSettingsView } from './components/InfoSettingsView'
import { StatusBar } from './components/StatusBar'
import { UnifiedSessionDialog } from './components/UnifiedSessionDialog'
import type { PathStartOpts } from './components/UnifiedSessionDialog'
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
  const [themeEditorActive, setThemeEditorActive] = useState(false)
  const [workspacesPopupVisible, setWorkspacesPopupVisible] = useState(false)
  const [placementPopup, setPlacementPopup] = useState<{ sessionId: string } | null>(null)

  // Unified session dialog
  const [unifiedDialogVisible, setUnifiedDialogVisible] = useState(false)
  const [unifiedDialogSlotIndex, setUnifiedDialogSlotIndex] = useState<number | null>(null)

  const { sessions, startSession, stopSession, refresh: refreshSessions } = useSessions()
  const contextUsages = useContextUsage()
  const { scanning, rescan } = useProjects()
  const panelWidthRef = useRef(0)
  const { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand, applyMerges, setSlotType, clearSlotType, toggleExpandSlot, restoreGrid } = useGrid(panelWidthRef.current)
  const { theme, setTheme, toggleTheme, customThemes, activeCustomThemeId, selectCustomTheme, saveCustomTheme, deleteCustomTheme } = useTheme()
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
      combo: 'Cmd+N',
      label: t('unified.title'),
      category: 'Aktionen' as const,
      action: () => { setUnifiedDialogSlotIndex(null); setUnifiedDialogVisible(true) },
    },
    {
      combo: 'Escape',
      label: t('app.shortcut.closeOverlay'),
      category: 'Navigation' as const,
      action: () => {
        const anyOverlayOpen = bugreportVisible || infoVisible ||
          unifiedDialogVisible || workspacesPopupVisible || !!placementPopup
        if (!anyOverlayOpen) return false
        setBugreportVisible(false)
        setInfoVisible(false)
        setUnifiedDialogVisible(false)
        setWorkspacesPopupVisible(false)
        setPlacementPopup(null)
      },
    },
  ], [t, bugreportVisible, infoVisible, unifiedDialogVisible, workspacesPopupVisible, placementPopup])
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
  const [voiceRelaySessionId, setVoiceRelaySessionId] = useState<string | null>(null)
  const [auditSessionId, setAuditSessionId] = useState<string | null>(null)

  const gridSessionIds = grid.slots.filter(s => s.sessionId).map(s => s.sessionId!)

  const sidebarHasContent = !!orchestratorSessionId || !!mpoSessionId ||
    sessions.some(s => s.status === 'active' && !gridSessionIds.includes(s.id)) ||
    grid.slots.some(s => s.type === 'notes')

  const computedPanelWidth = sidebarVisible && !sidebarDetached ? 280 : 0
  panelWidthRef.current = computedPanelWidth

  useEffect(() => {
    const pw = sidebarVisible && !sidebarDetached ? 280 : 0
    const api = (window as any).cipherMux
    api.window.fitGrid(grid.config.cols, grid.config.rows, pw)
  }, [sidebarVisible, sidebarDetached, grid.config.cols, grid.config.rows])

  // Entity status map for unified dialog
  const entityStatus = useMemo<Record<string, boolean>>(() => ({
    orchestrator: !!orchestratorSessionId,
    mpo: !!mpoSessionId,
    companion: !!companionSessionId,
    refinement: !!refinementSessionId,
    'voice-relay': !!voiceRelaySessionId,
    audit: !!auditSessionId,
  }), [orchestratorSessionId, mpoSessionId, companionSessionId, refinementSessionId, voiceRelaySessionId, auditSessionId])

  const placeOrchestrator = useCallback((sessionId: string) => {
    setOrchestratorSessionId(sessionId)
    setSessionAtSlot(0, sessionId)
  }, [setSessionAtSlot])

  const placeMpo = useCallback((sessionId: string) => {
    setMpoSessionId((prev) => {
      if (prev === sessionId) return prev
      setPlacementPopup({ sessionId })
      return sessionId
    })
  }, [addSession, grid.slots])

  const placeEntity = useCallback((sessionId: string) => {
    setPlacementPopup({ sessionId })
  }, [])

  // Check orchestrator status on mount
  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    api.orchestrator.status().then((s: { running: boolean; sessionId?: string }) => {
      if (!mounted) return
      if (s.running && s.sessionId) placeOrchestrator(s.sessionId)
    })
    const unsub = api.orchestrator.onStarted((data: any) => {
      const sid = data?.sessionId ?? data?.id
      if (sid) placeOrchestrator(sid)
    })
    return () => { mounted = false; unsub() }
  }, [placeOrchestrator])

  // Check MPO status on mount
  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    api.mpo.status().then((s: { running: boolean; sessionId?: string }) => {
      if (!mounted) return
      if (s.running && s.sessionId) placeMpo(s.sessionId)
    })
    const unsub = api.mpo.onStarted((data: any) => {
      const sid = data?.sessionId ?? data?.id
      if (sid) placeMpo(sid)
    })
    return () => { mounted = false; unsub() }
  }, [placeMpo])

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

  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.sessions?.onVisibleAdd) return
    const unsub = api.sessions.onVisibleAdd(async (data: { sessionId: string }) => {
      let retries = 0
      while (retries < 10) {
        const sessions = await api.sessions.list()
        if (sessions.some((s: any) => s.id === data.sessionId)) {
          addSession(data.sessionId)
          setFocusedSessionId(data.sessionId)
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

  const handleLaunch = useCallback((slotIndex: number) => {
    setUnifiedDialogSlotIndex(slotIndex)
    setUnifiedDialogVisible(true)
  }, [])

  const handleOpenSession = useCallback((slotIndex: number) => {
    setUnifiedDialogSlotIndex(slotIndex)
    setUnifiedDialogVisible(true)
  }, [])

  const handleOpenNotes = useCallback((slotIndex: number) => {
    setSlotType(slotIndex, 'notes')
    setSidebarVisible(true)
  }, [setSlotType])

  const handleCloseNotes = useCallback((slotIndex: number) => {
    clearSlotType(slotIndex)
  }, [clearSlotType])

  const handleSwitchProject = useCallback((sessionId: string) => {
    const slotIdx = grid.slots.findIndex(s => s.sessionId === sessionId)
    setUnifiedDialogSlotIndex(slotIdx >= 0 ? slotIdx : null)
    setUnifiedDialogVisible(true)
  }, [grid.slots])

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
      const session = await startSession({ name: 'Shell', projectPath })
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
      setPlacementPopup({ sessionId: newSession.id })
      setFocusedSessionId(newSession.id)
    } catch (err: any) {
      console.error('[App] Fork failed:', err?.message || err)
    }
  }, [grid.slots, addSession])

  const handleAddToGrid = useCallback((sessionId: string) => {
    setPlacementPopup({ sessionId })
  }, [])

  const handleRecovered = useCallback((result: RecoveryResult) => {
    if (result.gridState) {
      restoreGrid(result.gridState as any)
    } else {
      for (const session of result.recovered) {
        addSession(session.id)
      }
    }
    for (const session of result.recovered) {
      if (session.entityId === 'orchestrator') setOrchestratorSessionId(session.id)
      if (session.entityId === 'mpo') setMpoSessionId(session.id)
      if (session.entityId === 'companion') setCompanionSessionId(session.id)
      if (session.entityId === 'refinement') setRefinementSessionId(session.id)
      if (session.entityId === 'voice-relay') setVoiceRelaySessionId(session.id)
      if (session.entityId === 'audit') setAuditSessionId(session.id)
    }
    if (result.recovered.length > 0) {
      setFocusedSessionId(result.recovered[0].id)
    }
  }, [restoreGrid, addSession])

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

  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    api.sidebar?.isDetached?.().then((detached: boolean) => {
      if (!mounted) return
      if (detached) { setSidebarDetached(true); api.sidebar.detach() }
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.sidebar?.onReattached) return
    const unsub = api.sidebar.onReattached(() => { setSidebarDetached(false) })
    return () => unsub()
  }, [])

  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    api.workspaces.active().then((id: string | null) => {
      if (!mounted) return
      setActiveWorkspaceId(id)
    })
    return () => { mounted = false }
  }, [])

  const handleToggleWorkspaces = useCallback(() => {
    setWorkspacesPopupVisible((v) => !v)
  }, [])

  const handleWorkspaceApply = useCallback(async (workspaceId: string) => {
    try {
      const api = (window as any).cipherMux
      const workspaces = await api.workspaces.list()
      const ws = workspaces.find((w: any) => w.id === workspaceId)
      if (ws) {
        resize({ cols: ws.cols, rows: ws.rows })
        if (ws.merges && Object.keys(ws.merges).length > 0) {
          applyMerges(ws.cols, ws.rows, ws.merges)
        }
      }
      const result = await api.workspaces.apply(workspaceId)
      setActiveWorkspaceId(workspaceId)
      if (result?.warnings?.length) {
        console.warn('[App] Workspace apply warnings:', result.warnings)
      }
      if (result?.sessions?.length) {
        for (const { cellIndex, sessionId } of result.sessions) {
          setSessionAtSlot(cellIndex, sessionId)
        }
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

  // ─── Unified Dialog: Entity Start/Focus ───���─────────────

  const getEntitySessionId = useCallback((entityId: EntityId): string | null => {
    switch (entityId) {
      case 'orchestrator': return orchestratorSessionId
      case 'mpo': return mpoSessionId
      case 'companion': return companionSessionId
      case 'refinement': return refinementSessionId
      case 'voice-relay': return voiceRelaySessionId
      case 'audit': return auditSessionId
      default: return null
    }
  }, [orchestratorSessionId, mpoSessionId, companionSessionId, refinementSessionId, voiceRelaySessionId, auditSessionId])

  const handleStartEntity = useCallback(async (entityId: EntityId) => {
    const api = (window as any).cipherMux
    if (entityId === 'orchestrator') {
      const session = await api.orchestrator.start()
      const sid = session?.sessionId ?? session?.id
      if (sid) placeOrchestrator(sid)
      return
    }
    if (entityId === 'mpo') {
      await api.mpo.start()
      return
    }
    const session = await api.entity.start(entityId)
    const sid = session?.id
    if (sid) {
      switch (entityId) {
        case 'companion': setCompanionSessionId(sid); break
        case 'refinement': setRefinementSessionId(sid); break
        case 'voice-relay': setVoiceRelaySessionId(sid); break
        case 'audit': setAuditSessionId(sid); break
      }
      placeEntity(sid)
    }
  }, [placeOrchestrator, placeEntity])

  const handleFocusEntity = useCallback((entityId: EntityId) => {
    const sid = getEntitySessionId(entityId)
    if (!sid) return
    const inGrid = grid.slots.some(s => s.sessionId === sid)
    if (inGrid) {
      setFocusedSessionId(sid)
    } else {
      placeEntity(sid)
      setFocusedSessionId(sid)
    }
  }, [getEntitySessionId, grid.slots, placeEntity])

  const handleUnifiedPathStart = useCallback(async (dirPath: string, opts: PathStartOpts) => {
    try {
      const name = dirPath.split('/').filter(Boolean).pop() ?? 'session'
      let autoLaunch: string | undefined
      if (!opts.shellOnly) {
        const parts = ['clear; claude']
        if (opts.skipPermissions) parts.push('--dangerously-skip-permissions')
        if (opts.resume) parts.push('--resume')
        if (opts.fork) parts.push('--fork')
        autoLaunch = parts.join(' ') + '\n'
      }
      const session = await startSession({
        name,
        projectPath: dirPath,
        autoLaunch,
        resume: opts.resume,
      })
      if (unifiedDialogSlotIndex !== null) {
        setSessionAtSlot(unifiedDialogSlotIndex, session.id)
      } else {
        setPlacementPopup({ sessionId: session.id })
      }
      setFocusedSessionId(session.id)
    } catch (err) {
      console.error('[App] Failed to start session:', err)
    }
  }, [startSession, addSession, setSessionAtSlot, unifiedDialogSlotIndex])

  // Listen for entity-started events
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.entity?.onStarted) return
    const unsub = api.entity.onStarted((data: { entityId: string; session: any }) => {
      const sid = data.session?.id
      if (!sid) return
      if (data.entityId === 'companion' && !companionSessionId) {
        setCompanionSessionId(sid); placeEntity(sid)
      } else if (data.entityId === 'refinement' && !refinementSessionId) {
        setRefinementSessionId(sid); placeEntity(sid)
      } else if (data.entityId === 'voice-relay' && !voiceRelaySessionId) {
        setVoiceRelaySessionId(sid); placeEntity(sid)
      } else if (data.entityId === 'audit' && !auditSessionId) {
        setAuditSessionId(sid); placeEntity(sid)
      }
    })
    return () => unsub()
  }, [companionSessionId, refinementSessionId, voiceRelaySessionId, auditSessionId, placeEntity])

  // Check entity status on mount
  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    if (!api.entity?.status) return
    const entities: Array<{ id: EntityId; setter: (sid: string) => void }> = [
      { id: 'companion', setter: (sid) => setCompanionSessionId(sid) },
      { id: 'refinement', setter: (sid) => setRefinementSessionId(sid) },
      { id: 'voice-relay', setter: (sid) => setVoiceRelaySessionId(sid) },
      { id: 'audit', setter: (sid) => setAuditSessionId(sid) },
    ]
    for (const { id, setter } of entities) {
      api.entity.status(id).then((s: { running: boolean; sessionId?: string }) => {
        if (!mounted) return
        if (s.running && s.sessionId) { setter(s.sessionId); placeEntity(s.sessionId) }
      })
    }
    return () => { mounted = false }
  }, [placeEntity])

  return (
    <div class="app-shell">
      <div class="drag-region">
        <span class="title">cipher-mux</span>
      </div>

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
        />
        {!sidebarDetached && (
          <SidebarPanel
            visible={sidebarVisible}
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

      <StatusBar
        theme={theme}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(v => !v)}
        workspacesPopupVisible={workspacesPopupVisible}
        gridCols={grid.config.cols}
        gridRows={grid.config.rows}
        focusedSessionId={focusedSessionId}
        focusedSessionName={focusedSessionName}
        onNewSession={() => { setUnifiedDialogSlotIndex(null); setUnifiedDialogVisible(true) }}
        onBugreport={() => setBugreportVisible(true)}
        onToggleTheme={toggleTheme}
        onToggleWorkspaces={handleToggleWorkspaces}
        onInfo={() => { setInfoInitialTab(undefined); setInfoVisible(true) }}
        onThemeSettings={() => { setInfoInitialTab('settings'); setInfoVisible(true) }}
        onGridResize={handleResize}
      />

      <WorkspacePopup
        visible={workspacesPopupVisible}
        onClose={() => setWorkspacesPopupVisible(false)}
        onApply={handleWorkspaceApply}
        onOpenSettings={handleWorkspaceOpenSettings}
        currentGrid={grid}
        sessions={sessions}
      />

      <GridPlacementPopup
        visible={!!placementPopup}
        gridSlots={grid.slots}
        cols={grid.config.cols}
        rows={grid.config.rows}
        sessions={sessions}
        onSelect={handlePlacementSelect}
        onCancel={() => setPlacementPopup(null)}
        onResize={handleResize}
      />
      <RecoveryDialog onDone={() => {}} onAdopt={addSession} onRecovered={handleRecovered} />
      <UnifiedSessionDialog
        visible={unifiedDialogVisible}
        onClose={() => setUnifiedDialogVisible(false)}
        onStartEntity={handleStartEntity}
        onFocusEntity={handleFocusEntity}
        onStartPath={handleUnifiedPathStart}
        entityStatus={entityStatus}
      />
      <BugreportDialog
        visible={bugreportVisible}
        onClose={() => setBugreportVisible(false)}
      />
      {infoVisible && (
        <div class={`modal-overlay${themeEditorActive ? ' modal-overlay--transparent' : ''}`} onClick={() => { setInfoVisible(false); setThemeEditorActive(false) }}>
          <div class="modal-panel" style={{ width: '600px' }} onClick={(e) => e.stopPropagation()}>
            <InfoSettingsView
              onRescan={rescan}
              scanning={scanning}
              theme={theme}
              onSetTheme={setTheme}
              initialTab={infoInitialTab}
              onThemeEditorToggle={setThemeEditorActive}
              customThemes={customThemes}
              activeCustomThemeId={activeCustomThemeId}
              onSelectCustomTheme={selectCustomTheme}
              onSaveCustomTheme={saveCustomTheme}
              onDeleteCustomTheme={deleteCustomTheme}
            />
          </div>
        </div>
      )}
    </div>
  )
}
