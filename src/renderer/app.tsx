// src/renderer/app.tsx
import { useState, useCallback, useEffect } from 'preact/hooks'
import type { ProjectInfo } from '../shared/types'
import { useSessions } from './hooks/useSessions'
import { useMessages } from './hooks/useMessages'
import { useContextUsage } from './hooks/useContextUsage'
import { useProjects } from './hooks/useProjects'
import { useGrid } from './hooks/useGrid'
import { useTheme } from './hooks/useTheme'
import { SessionGrid } from './components/SessionGrid'
import { ChatroomPanel } from './components/ChatroomPanel'
import { ChatToggleButton } from './components/ChatToggleButton'
import { ProjectPopup } from './components/ProjectPopup'
import { RecoveryDialog } from './components/RecoveryDialog'
import { BugreportDialog } from './components/BugreportDialog'
import { InfoSettingsView } from './components/InfoSettingsView'
import { StatusBar } from './components/StatusBar'
import { SessionDialog } from './components/SessionDialog'

export function App() {
  const [chatroomVisible, setChatroomVisible] = useState(true)
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [bugreportVisible, setBugreportVisible] = useState(false)
  const [infoVisible, setInfoVisible] = useState(false)

  // Project popup state
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupTargetSessionId, setPopupTargetSessionId] = useState<string | null>(null)
  const [popupTargetSlotIndex, setPopupTargetSlotIndex] = useState<number | null>(null)

  const { sessions, startSession, stopSession } = useSessions()
  const { unreadCount } = useMessages()
  const contextUsages = useContextUsage()
  const { projects, scanning, rescan } = useProjects()
  const { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand } = useGrid()
  const { theme, toggleTheme } = useTheme()

  const [orchestratorSessionId, setOrchestratorSessionId] = useState<string | null>(null)

  // Place orchestrator in grid slot 0
  const placeOrchestrator = useCallback((sessionId: string) => {
    setOrchestratorSessionId(sessionId)
    // Always put orchestrator in slot 0 (top-left)
    setSessionAtSlot(0, sessionId)
  }, [setSessionAtSlot])

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

  const handleResize = useCallback((cols: number, rows: number) => {
    resize({ cols, rows })
  }, [resize])

  const handleOrchestratorToggle = useCallback(async () => {
    const api = (window as any).cipherMux
    try {
      if (orchestratorSessionId) {
        await api.orchestrator.stop()
        removeSession(orchestratorSessionId)
        setOrchestratorSessionId(null)
      } else {
        const session = await api.orchestrator.start()
        const sid = session?.sessionId ?? session?.id
        if (sid) placeOrchestrator(sid)
      }
    } catch (err) {
      console.error('[App] orchestrator toggle failed:', err)
    }
  }, [orchestratorSessionId, removeSession, placeOrchestrator])

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
          onLaunch={handleLaunch}
          onOpenSession={handleOpenSession}
          onResize={handleResize}
          onSwap={swap}
        />
        <ChatroomPanel visible={chatroomVisible} />
      </div>

      {/* floating chat toggle */}
      <ChatToggleButton
        visible={chatroomVisible}
        unreadCount={unreadCount}
        onToggle={() => setChatroomVisible((v) => !v)}
      />

      {/* statusbar */}
      <StatusBar
        theme={theme}
        chatroomVisible={chatroomVisible}
        orchestratorRunning={!!orchestratorSessionId}
        onOrchestrator={handleOrchestratorToggle}
        onBugreport={() => setBugreportVisible(true)}
        onToggleChatroom={() => setChatroomVisible((v) => !v)}
        onToggleTheme={toggleTheme}
        onInfo={() => setInfoVisible(true)}
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
      <RecoveryDialog onDone={() => {}} />
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
            />
          </div>
        </div>
      )}
    </div>
  )
}
