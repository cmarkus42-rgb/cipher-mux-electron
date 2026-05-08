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
import type { PathStartOpts } from './components/LauncherCell'
import { WorkspacePopup } from './components/WorkspacePopup'
import { GridPlacementPopup } from './components/GridPlacementPopup'
import { HighlightOverlay } from './components/HighlightOverlay'
import { useGlobalTtsPlayback } from './hooks/useGlobalTtsPlayback'
import { useA11ySettings } from './a11y/hooks/useA11ySettings'
import { FocusMode } from './a11y/FocusMode'
import { useFocusTrap } from './a11y/useFocusTrap'
import { getFocusModeOverlappedSlots, getCoveredSlots } from '../shared/grid-types'
import { useSetupWizard } from './hooks/useSetupWizard'
import { SetupWizard } from './components/SetupWizard'
import { UpdateDialog } from './components/UpdateDialog'

export function App() {
  const { t } = useTranslation()
  const setupWizard = useSetupWizard()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarDetached, setSidebarDetached] = useState(false)
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [bugreportVisible, setBugreportVisible] = useState(false)
  const [infoVisible, setInfoVisible] = useState(false)
  const [infoInitialTab, setInfoInitialTab] = useState<string | undefined>(undefined)
  const [themeEditorActive, setThemeEditorActive] = useState(false)
  const [workspacesPopupVisible, setWorkspacesPopupVisible] = useState(false)
  const [placementPopup, setPlacementPopup] = useState<{ sessionId: string } | { note: any } | null>(null)
  const [pendingLauncherSlot, setPendingLauncherSlot] = useState<number | null>(null)

  const { sessions, startSession, stopSession, refresh: refreshSessions } = useSessions()
  const contextUsages = useContextUsage()
  const { rescan } = useProjects()
  const panelWidthRef = useRef(0)
  // Track entityIds being started by handleStartEntity to prevent race with onStarted events.
  // Uses entityId (known BEFORE the await) instead of sessionId (known only AFTER) — this
  // closes the race window where the IPC event arrives before the await resolves (RT-X2).
  const inFlightEntityStarts = useRef(new Set<string>())
  const { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand, applyMerges, setSlotType, clearSlotType, toggleExpandSlot, restoreGrid, cleanupDeadSessions } = useGrid(panelWidthRef.current)
  // Always-current grid ref for placeEntity to check against (avoids stale closure in event handlers)
  const gridRef = useRef(grid)
  gridRef.current = grid
  const { theme, setTheme, toggleTheme, customThemes, activeCustomThemeId, selectCustomTheme, saveCustomTheme, deleteCustomTheme } = useTheme()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [voiceComState, setVoiceComState] = useState('idle')
  const [voiceState, setVoiceState] = useState('idle')
  const [voiceTargetSessionId, setVoiceTargetSessionId] = useState<string | null>(null)
  const [voicePinned, setVoicePinned] = useState(false)

  // Listen for voice state changes (FSM + COM)
  useEffect(() => {
    const api = (window as any).cipherMux
    const unsubs: Array<() => void> = []
    if (api?.voice?.onState) {
      unsubs.push(api.voice.onState((state: string) => setVoiceState(state)))
    }
    if (api?.voice?.onComState) {
      unsubs.push(api.voice.onComState((state: string) => setVoiceComState(state)))
    }
    return () => unsubs.forEach(u => u())
  }, [])

  // Listen for voice target / pin changes (for session-header indicators)
  useEffect(() => {
    const api = (window as any).cipherMux
    const unsubs: Array<() => void> = []
    if (api?.voice?.onActiveSession) {
      unsubs.push(api.voice.onActiveSession((data: { sessionId: string | null }) => {
        setVoiceTargetSessionId(data.sessionId)
      }))
    }
    if (api?.voice?.onPinStatus) {
      unsubs.push(api.voice.onPinStatus((data: { pinned: boolean; sessionId: string | null }) => {
        setVoicePinned(data.pinned)
      }))
    }
    return () => unsubs.forEach(u => u())
  }, [])

  // Listen for update availability notifications
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.update?.onAvailable) return
    const unsub = api.update.onAvailable((info: any) => setUpdateInfo(info))
    return unsub
  }, [])

  // After grid re-render from project switch, dispatch launcher-open to the now-mounted LauncherCell
  useEffect(() => {
    if (pendingLauncherSlot !== null) {
      window.dispatchEvent(new CustomEvent('launcher-open', { detail: { slotIndex: pendingLauncherSlot } }))
      setPendingLauncherSlot(null)
    }
  }, [pendingLauncherSlot])

  const { isSpeaking, stopSpeech } = useGlobalTtsPlayback()
  const handleA11yThemeChange = useCallback((cvdTheme: string | null) => {
    if (cvdTheme) {
      setTheme(cvdTheme as any)
    }
    // Deselect case is handled in InfoSettingsView where the base theme is tracked
  }, [setTheme])
  const { settings: a11ySettings, toggleFocusMode } = useA11ySettings(handleA11yThemeChange)
  const modalFocusTrapRef = useFocusTrap<HTMLDivElement>(infoVisible)

  // Focus Mode: track which slot is in focus mode (null = off)
  const [focusModeSlot, setFocusModeSlot] = useState<number | null>(null)
  const focusModeOverlapped = useMemo(() => {
    if (focusModeSlot === null) return new Set<number>()
    return getFocusModeOverlappedSlots(grid, focusModeSlot)
  }, [focusModeSlot, grid])

  const handleFocusMode = useCallback((sessionId: string) => {
    const idx = grid.slots.findIndex(s => s.sessionId === sessionId)
    if (idx === -1) return
    setFocusModeSlot(prev => prev === idx ? null : idx)
  }, [grid])

  const exitFocusMode = useCallback(() => {
    setFocusModeSlot(null)
  }, [])

  // Auto-exit focus mode when the focused session is removed from grid
  useEffect(() => {
    if (focusModeSlot === null) return
    const slot = grid.slots[focusModeSlot]
    if (!slot?.sessionId) setFocusModeSlot(null)
  }, [grid.slots, focusModeSlot])

  // Grid navigation: move focus to adjacent cell in the given direction
  const navigateGrid = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const { config, slots } = gridRef.current
    const { cols, rows } = config
    const covered = getCoveredSlots(gridRef.current)

    // Find current slot index of focused session
    let currentIdx = slots.findIndex(s => s.sessionId === focusedSessionId)
    if (currentIdx === -1) {
      // No focused session — focus first occupied slot
      const first = slots.findIndex((s, i) => (s.sessionId || s.type === 'notes') && !covered.has(i))
      if (first >= 0) {
        const sid = slots[first].sessionId
        if (sid) setFocusedSessionId(sid)
      }
      return
    }

    const currentCol = currentIdx % cols
    const currentRow = Math.floor(currentIdx / cols)

    let targetCol = currentCol
    let targetRow = currentRow
    switch (direction) {
      case 'up': targetRow = currentRow - 1; break
      case 'down': targetRow = currentRow + 1; break
      case 'left': targetCol = currentCol - 1; break
      case 'right': targetCol = currentCol + 1; break
    }

    // Wrap around
    if (targetCol < 0) targetCol = cols - 1
    if (targetCol >= cols) targetCol = 0
    if (targetRow < 0) targetRow = rows - 1
    if (targetRow >= rows) targetRow = 0

    const targetIdx = targetRow * cols + targetCol
    // If target is covered by a rowSpan, find the parent cell
    if (covered.has(targetIdx)) {
      // Walk upward to find the parent
      for (let r = targetRow - 1; r >= 0; r--) {
        const parentIdx = r * cols + targetCol
        if (!covered.has(parentIdx) && slots[parentIdx].sessionId) {
          setFocusedSessionId(slots[parentIdx].sessionId!)
          return
        }
      }
    }

    const targetSlot = slots[targetIdx]
    if (targetSlot?.sessionId) {
      setFocusedSessionId(targetSlot.sessionId)
    }
  }, [focusedSessionId, setFocusedSessionId])

  // Global keyboard shortcuts
  const shortcutEntries = useMemo(() => [
    {
      combo: 'Cmd+B',
      label: t('app.shortcut.bugreport'),
      category: 'Aktionen' as const,
      action: () => { setInfoInitialTab('settings'); setInfoVisible(true); setBugreportVisible(true); (window as any).cipherMux?.voice?.stop?.() },
    },
    {
      combo: 'Cmd+Shift+?',
      label: t('app.shortcut.showShortcuts'),
      category: 'Aktionen' as const,
      action: () => { setInfoInitialTab('shortcuts'); setInfoVisible(true) },
    },
    {
      combo: 'Cmd+Shift+F',
      label: 'Focus Mode',
      category: 'Aktionen' as const,
      action: () => {
        if (focusModeSlot !== null) {
          setFocusModeSlot(null)
        } else if (focusedSessionId) {
          handleFocusMode(focusedSessionId)
        }
      },
    },
    {
      combo: 'Cmd+N',
      label: t('unified.title'),
      category: 'Aktionen' as const,
      action: () => {
        // Find first empty launcher cell and trigger its popup via custom event
        const firstEmpty = grid.slots.findIndex(s => !s.sessionId && s.type !== 'notes')
        if (firstEmpty >= 0) {
          window.dispatchEvent(new CustomEvent('launcher-open', { detail: { slotIndex: firstEmpty } }))
        }
      },
    },
    {
      combo: 'Cmd+Shift+W',
      label: t('app.shortcut.gridUp'),
      category: 'Navigation' as const,
      action: () => navigateGrid('up'),
    },
    {
      combo: 'Cmd+Shift+A',
      label: t('app.shortcut.gridLeft'),
      category: 'Navigation' as const,
      action: () => navigateGrid('left'),
    },
    {
      combo: 'Cmd+Shift+S',
      label: t('app.shortcut.gridDown'),
      category: 'Navigation' as const,
      action: () => navigateGrid('down'),
    },
    {
      combo: 'Cmd+Shift+D',
      label: t('app.shortcut.gridRight'),
      category: 'Navigation' as const,
      action: () => navigateGrid('right'),
    },
    {
      combo: 'Escape',
      label: t('app.shortcut.closeOverlay'),
      category: 'Navigation' as const,
      action: () => {
        // Priority 0: exit focus mode
        if (focusModeSlot !== null) {
          setFocusModeSlot(null)
          return
        }
        // Priority 1: close overlays
        const anyOverlayOpen = bugreportVisible || infoVisible ||
          workspacesPopupVisible || !!placementPopup
        if (anyOverlayOpen) {
          setBugreportVisible(false)
          setInfoVisible(false)
          setWorkspacesPopupVisible(false)
          setPlacementPopup(null)
          return
        }
        // Priority 2: TTS barge-in — stop playing speech
        if (isSpeaking) {
          stopSpeech()
          return
        }
        // Nothing to do — let event propagate
        return false
      },
    },
  ], [t, bugreportVisible, infoVisible, workspacesPopupVisible, placementPopup, grid.slots, isSpeaking, stopSpeech, focusModeSlot, focusedSessionId, handleFocusMode, navigateGrid])
  useShortcuts(shortcutEntries)

  const focusedSessionName = useMemo(() => {
    if (!focusedSessionId) return null
    const session = sessions.find(s => s.id === focusedSessionId)
    return session?.name ?? null
  }, [focusedSessionId, sessions])

  const [orchestratorSessionId, setOrchestratorSessionId] = useState<string | null>(null)
  const [cyberFactorySessionId, setCyberFactorySessionId] = useState<string | null>(null)
  const [companionSessionId, setCompanionSessionId] = useState<string | null>(null)
  const [refinementSessionId, setRefinementSessionId] = useState<string | null>(null)
  const [voiceRelaySessionId, setVoiceRelaySessionId] = useState<string | null>(null)
  const [auditSessionId, setAuditSessionId] = useState<string | null>(null)

  // RT-X1 fix: after initial session list load, clean up grid slots referencing dead sessions.
  // Runs once after a short delay to let recovery/restore complete first.
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const handleOpenNoteInGridRef = useRef<((note: any) => void) | null>(null)
  const initialCleanupDone = useRef(false)
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Fetch session list directly from IPC — sessionsRef.current may be stale
      // because refreshSessions() triggers an async state update that hasn't
      // rendered yet when we reach cleanupDeadSessions below.
      let activeIds: Set<string>
      try {
        const list = await (window as any).cipherMux?.sessions?.list()
        activeIds = new Set((list || []).map((s: any) => s.id))
        refreshSessions()
      } catch {
        activeIds = new Set(sessionsRef.current.map(s => s.id))
      }
      initialCleanupDone.current = true
      cleanupDeadSessions(activeIds)
    }, 6000) // Wait 6s for recovery dialog and keepWorking restore to complete
    return () => clearTimeout(timer)
  }, [cleanupDeadSessions, refreshSessions])

  // A.2 fix: reactively clean up grid slots when sessions die during runtime.
  // Only runs after the initial 3s grace period to avoid interfering with recovery.
  useEffect(() => {
    if (!initialCleanupDone.current) return
    const activeIds = new Set(sessions.map(s => s.id))
    cleanupDeadSessions(activeIds)
  }, [sessions, cleanupDeadSessions])

  const gridSessionIds = grid.slots.filter(s => s.sessionId).map(s => s.sessionId!)

  const sidebarHasContent = !!orchestratorSessionId || !!cyberFactorySessionId ||
    sessions.some(s => s.status === 'active' && !gridSessionIds.includes(s.id)) ||
    grid.slots.some(s => s.type === 'notes')

  const computedPanelWidth = sidebarVisible && !sidebarDetached ? 280 : 0
  panelWidthRef.current = computedPanelWidth

  useEffect(() => {
    const pw = sidebarVisible && !sidebarDetached ? 280 : 0
    const api = (window as any).cipherMux
    api.window.fitGrid(grid.config.cols, grid.config.rows, pw)
  }, [sidebarVisible, sidebarDetached, grid.config.cols, grid.config.rows])

  // A.3 fix: clear entity session IDs when their sessions no longer exist.
  // This prevents orphaned entities from blocking preset starts.
  useEffect(() => {
    if (!initialCleanupDone.current) return
    const activeIds = new Set(sessions.map(s => s.id))
    if (orchestratorSessionId && !activeIds.has(orchestratorSessionId)) setOrchestratorSessionId(null)
    if (cyberFactorySessionId && !activeIds.has(cyberFactorySessionId)) setCyberFactorySessionId(null)
    if (companionSessionId && !activeIds.has(companionSessionId)) setCompanionSessionId(null)
    if (refinementSessionId && !activeIds.has(refinementSessionId)) setRefinementSessionId(null)
    if (voiceRelaySessionId && !activeIds.has(voiceRelaySessionId)) setVoiceRelaySessionId(null)
    if (auditSessionId && !activeIds.has(auditSessionId)) setAuditSessionId(null)
  }, [sessions, orchestratorSessionId, cyberFactorySessionId, companionSessionId, refinementSessionId, voiceRelaySessionId, auditSessionId])

  // Entity status map for unified dialog — computed dynamically from active sessions
  // so that ANY entity (including dynamic ones like watchdog, projectlauncher, etc.)
  // is recognised as running, not just the 6 hardcoded ones.
  const entityStatus = useMemo<Record<string, boolean>>(() => {
    const status: Record<string, boolean> = {}
    for (const s of sessions) {
      if (s.entityId && s.status === 'active') status[s.entityId] = true
    }
    return status
  }, [sessions])

  const placeOrchestrator = useCallback((sessionId: string) => {
    setOrchestratorSessionId(sessionId)
    setSessionAtSlot(0, sessionId)
  }, [setSessionAtSlot])

  const placeCyberFactory = useCallback((sessionId: string) => {
    setCyberFactorySessionId((prev) => {
      if (prev === sessionId) return prev
      // Try auto-placement first; only show popup if grid is full
      if (gridRef.current.slots.some(s => s.sessionId === sessionId)) {
        // Already placed (e.g. by handleStartEntity)
      } else if (gridRef.current.slots.some(s => !s.sessionId && s.type === 'session')) {
        addSession(sessionId)
      } else {
        setPlacementPopup({ sessionId })
      }
      return sessionId
    })
  }, [addSession])

  const placeEntity = useCallback((sessionId: string) => {
    // RT-X2 fix: check current grid state via ref (not stale closure).
    // If session was already placed by handleStartEntity, skip the popup.
    if (gridRef.current.slots.some(s => s.sessionId === sessionId)) return
    // Auto-place into empty slot if available; only show popup when grid is full
    if (gridRef.current.slots.some(s => !s.sessionId && s.type === 'session')) {
      addSession(sessionId)
    } else {
      setPlacementPopup({ sessionId })
    }
  }, [addSession])

  // Check orchestrator status on mount
  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    api.orchestrator.status().then((s: { running: boolean; sessionId?: string }) => {
      if (!mounted) return
      if (s.running && s.sessionId) placeOrchestrator(s.sessionId)
    })
    const unsub = api.orchestrator.onStarted((data: any) => {
      if (inFlightEntityStarts.current.has('orchestrator')) {
        inFlightEntityStarts.current.delete('orchestrator')
        return
      }
      const sid = data?.sessionId ?? data?.id
      if (sid) placeOrchestrator(sid)
    })
    return () => { mounted = false; unsub() }
  }, [placeOrchestrator])

  // Check Cyber Factory status on mount
  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    api.cyberFactory.status().then((s: { running: boolean; sessionId?: string }) => {
      if (!mounted) return
      if (s.running && s.sessionId) placeCyberFactory(s.sessionId)
    })
    const unsub = api.cyberFactory.onStarted((data: any) => {
      if (inFlightEntityStarts.current.has('cyber-factory')) {
        inFlightEntityStarts.current.delete('cyber-factory')
        return
      }
      const sid = data?.sessionId ?? data?.id
      if (sid) placeCyberFactory(sid)
    })
    return () => { mounted = false; unsub() }
  }, [placeCyberFactory])

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
    const unsub = api.sessions.onVisibleAdd(async (data: { sessionId: string; slotIndex?: number }) => {
      let retries = 0
      while (retries < 10) {
        const sessions = await api.sessions.list()
        if (sessions.some((s: any) => s.id === data.sessionId)) {
          if (typeof data.slotIndex === 'number' && data.slotIndex >= 0) {
            setSessionAtSlot(data.slotIndex, data.sessionId)
          } else {
            addSession(data.sessionId)
          }
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

  // ── Keep Working restore helper ──
  const keepWorkingApplied = useRef(false)
  const applyKeepWorkingRestore = useCallback((data: {
    gridConfig: { cols: number; rows: number }
    slots: Array<{ sessionId: string | null; slotIndex: number }>
  }) => {
    const total = data.gridConfig.cols * data.gridConfig.rows
    const newSlots = Array.from({ length: total }, () => ({
      sessionId: null as string | null,
      rowSpan: 1,
      type: 'session' as const,
    }))
    for (const { sessionId, slotIndex } of data.slots) {
      if (slotIndex >= 0 && slotIndex < total) {
        newSlots[slotIndex] = { sessionId, rowSpan: 1, type: 'session' }
      }
    }
    restoreGrid({ config: data.gridConfig, slots: newSlots })
    const first = data.slots.find(s => s.sessionId)
    if (first?.sessionId) setFocusedSessionId(first.sessionId)
    keepWorkingApplied.current = true
    setWorkspaceLoading(false)
    refreshSessions()
  }, [restoreGrid, refreshSessions])

  // ── Keep Working: poll-based restore on mount ──
  // The push event (KEEP_WORKING_RESTORE) may arrive before this listener is
  // registered, and a single pull may return null if the main process init chain
  // hasn't completed yet. Poll until we get data or timeout.
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.gridControl?.pullKeepWorkingRestore) return
    if (keepWorkingApplied.current) return // already restored (push beat us)
    let cancelled = false
    const startTime = Date.now()
    const POLL_TIMEOUT = 10_000
    const POLL_INTERVAL = 500
    const poll = () => {
      if (cancelled || keepWorkingApplied.current) return
      api.gridControl.pullKeepWorkingRestore().then((data: any) => {
        if (cancelled || keepWorkingApplied.current) return
        if (data) {
          console.log('[app] keepWorking: poll-based restore received', data.slots?.length, 'sessions')
          applyKeepWorkingRestore(data)
        } else if (Date.now() - startTime < POLL_TIMEOUT) {
          setTimeout(poll, POLL_INTERVAL)
        } else {
          console.log('[app] keepWorking: poll timed out — no restore data received')
        }
      }).catch(() => {
        if (!cancelled && !keepWorkingApplied.current && Date.now() - startTime < POLL_TIMEOUT) {
          setTimeout(poll, POLL_INTERVAL)
        }
      })
    }
    poll()
    return () => { cancelled = true }
  }, [applyKeepWorkingRestore])

  // ── Grid Control (MCP App-Control) ──
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.gridControl) return
    const unsubs: Array<() => void> = []

    if (api.gridControl.onGridResize) {
      unsubs.push(api.gridControl.onGridResize((data: { cols: number; rows: number }) => {
        resize({ cols: data.cols, rows: data.rows })
      }))
    }
    if (api.gridControl.onGridPlace) {
      unsubs.push(api.gridControl.onGridPlace((data: { sessionId: string; col: number; row: number }) => {
        const cols = gridRef.current.config.cols
        const targetIdx = data.row * cols + data.col
        // RT-10 fix: clear session from old slot before placing in new one
        removeSession(data.sessionId)
        setSessionAtSlot(targetIdx, data.sessionId)
      }))
    }
    if (api.gridControl.onSessionFocus) {
      unsubs.push(api.gridControl.onSessionFocus((data: { sessionId: string }) => {
        // If session is in background, bring it to grid
        const inGrid = gridRef.current.slots.some(s => s.sessionId === data.sessionId)
        if (!inGrid) {
          addSession(data.sessionId)
        }
        setFocusedSessionId(data.sessionId)
      }))
    }
    if (api.gridControl.onSessionEject) {
      unsubs.push(api.gridControl.onSessionEject((data: { sessionId: string }) => {
        removeSession(data.sessionId)
        // Clear focus if ejected session was focused (prevents STT routing to background)
        setFocusedSessionId((prev: string | null) => {
          if (prev === data.sessionId) {
            const remaining = gridRef.current.slots.find(s => s.sessionId && s.sessionId !== data.sessionId)
            return remaining?.sessionId ?? null
          }
          return prev
        })
      }))
    }
    if (api.gridControl.onSidebarToggle) {
      unsubs.push(api.gridControl.onSidebarToggle((data: { visible?: boolean }) => {
        if (data.visible !== undefined) {
          setSidebarVisible(data.visible)
        } else {
          setSidebarVisible(v => !v)
        }
      }))
    }
    // Push-based Keep Working restore (backup — pull-based is primary)
    if (api.gridControl.onKeepWorkingRestore) {
      unsubs.push(api.gridControl.onKeepWorkingRestore((data: any) => {
        console.log('[app] keepWorking: push-based restore received')
        applyKeepWorkingRestore(data)
      }))
    }
    // MCP mux_notes_open — open a note in the grid
    if (api.gridControl.onNotesOpen) {
      unsubs.push(api.gridControl.onNotesOpen((data: { note: any }) => {
        handleOpenNoteInGridRef.current?.(data.note)
      }))
    }

    return () => unsubs.forEach(fn => fn())
  }, [resize, setSessionAtSlot, addSession, removeSession, applyKeepWorkingRestore])

  const handleOpenNotes = useCallback((slotIndex: number) => {
    setSlotType(slotIndex, 'notes')
    setSidebarVisible(true)
  }, [setSlotType])

  const handleCloseNotes = useCallback((slotIndex: number) => {
    clearSlotType(slotIndex)
  }, [clearSlotType])

  const handleSwitchProject = useCallback((sessionId: string) => {
    const slotIdx = grid.slots.findIndex(s => s.sessionId === sessionId)
    if (slotIdx >= 0) {
      // Remove session from slot to show launcher, then open its popup after re-render
      removeSession(sessionId)
      setPendingLauncherSlot(slotIdx)
    }
  }, [grid.slots, removeSession])

  const handleSendToBackground = useCallback((sessionId: string) => {
    removeSession(sessionId)
    if (focusedSessionId === sessionId) {
      const remaining = grid.slots.find((s) => s.sessionId && s.sessionId !== sessionId)
      setFocusedSessionId(remaining?.sessionId ?? null)
    }
  }, [removeSession, focusedSessionId, grid.slots])

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
      if (session.entityId === 'cyber-factory') setCyberFactorySessionId(session.id)
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
    if ('note' in placementPopup) {
      // Note placement: open NotesCell at chosen slot, then load the note
      const noteToOpen = placementPopup.note
      setSlotType(slotIndex, 'notes')
      setPlacementPopup(null)
      let attempts = 0
      const tryOpen = () => {
        const reg = (window as any).__notesCellRegistry as Record<number, (n: any) => void> | undefined
        const openFn = reg?.[slotIndex]
        if (openFn) {
          openFn(noteToOpen)
        } else if (attempts < 10) {
          attempts++
          setTimeout(tryOpen, 100)
        }
      }
      setTimeout(tryOpen, 50)
    } else {
      // A.5 fix: remove session from any existing slot before placing in new one
      removeSession(placementPopup.sessionId)
      setSessionAtSlot(slotIndex, placementPopup.sessionId)
      setFocusedSessionId(placementPopup.sessionId)
      setPlacementPopup(null)
    }
  }, [placementPopup, setSessionAtSlot, setSlotType, removeSession])

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

  // Sidebar window X-button = close completely (sidebar hidden, not docked)
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.sidebar?.onClosed) return
    const unsub = api.sidebar.onClosed(() => {
      setSidebarDetached(false)
      setSidebarVisible(false)
    })
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

  const [workspaceLoading, setWorkspaceLoading] = useState(true)

  const handleWorkspaceApply = useCallback(async (workspaceId: string) => {
    setWorkspaceLoading(true)
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
    } finally {
      setWorkspaceLoading(false)
    }
    setWorkspacesPopupVisible(false)
  }, [resize, applyMerges, setSessionAtSlot])

  // Called when RecoveryDialog finishes — auto-load default workspace only if no sessions exist yet
  const handleRecoveryDone = useCallback(async () => {
    try {
      // Keep Working already restored sessions — skip default workspace loading
      if (keepWorkingApplied.current) {
        setWorkspaceLoading(false)
        return
      }

      // Race-guard: keepWorking poll may not have fired yet — check pull API directly
      const api = (window as any).cipherMux
      if (api.gridControl?.pullKeepWorkingRestore) {
        const kwData = await api.gridControl.pullKeepWorkingRestore()
        if (kwData) {
          console.log('[App] keepWorking restore caught in handleRecoveryDone (race-guard)')
          applyKeepWorkingRestore(kwData)
          return
        }
      }

      // Only auto-load default workspace when no sessions are active
      // (i.e., fresh start with no recovery). If sessions were recovered,
      // they are already placed and we must not overwrite them.
      if (sessionsRef.current.length > 0) {
        setWorkspaceLoading(false)
        return
      }

      const defaultWsId: string | null = await api.config.get('defaultWorkspaceId')
      if (defaultWsId) {
        console.log(`[App] Auto-loading default workspace: ${defaultWsId}`)
        handleWorkspaceApply(defaultWsId)
      } else {
        setWorkspaceLoading(false)
      }
    } catch (err) {
      console.warn('[App] Failed to auto-load default workspace:', err)
      setWorkspaceLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleWorkspaceApply, applyKeepWorkingRestore])

  const handleWorkspaceOpenSettings = useCallback((tab: 'personas' | 'workspaces') => {
    setWorkspacesPopupVisible(false)
    ;(window as any).cipherMux.window.openWorkspaces(tab)
  }, [])

  // ─── Unified Dialog: Entity Start/Focus ───���─────────────

  const getEntitySessionId = useCallback((entityId: EntityId): string | null => {
    switch (entityId) {
      case 'orchestrator': return orchestratorSessionId
      case 'cyber-factory': return cyberFactorySessionId
      case 'companion': return companionSessionId
      case 'refinement': return refinementSessionId
      case 'voice-relay': return voiceRelaySessionId
      case 'audit': return auditSessionId
      default: return null
    }
  }, [orchestratorSessionId, cyberFactorySessionId, companionSessionId, refinementSessionId, voiceRelaySessionId, auditSessionId])

  const handleStartEntity = useCallback(async (entityId: EntityId, slotIndex: number) => {
    const api = (window as any).cipherMux
    // Mark entity as in-flight BEFORE the await — closes the race window where
    // the onStarted IPC event arrives before the await resolves (RT-X2 fix).
    inFlightEntityStarts.current.add(entityId)
    try {
      if (entityId === 'orchestrator') {
        const session = await api.orchestrator.start()
        const sid = session?.sessionId ?? session?.id
        if (sid) {
          setOrchestratorSessionId(sid)
          setSessionAtSlot(slotIndex, sid)
          setFocusedSessionId(sid)
        }
        return
      }
      if (entityId === 'cyber-factory') {
        const session = await api.cyberFactory.start()
        const sid = session?.sessionId ?? session?.id
        if (sid) {
          setCyberFactorySessionId(sid)
          setSessionAtSlot(slotIndex, sid)
          setFocusedSessionId(sid)
        }
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
        setSessionAtSlot(slotIndex, sid)
        setFocusedSessionId(sid)
      }
    } finally {
      // RT-X2: always clean up in-flight marker. The event handler may have
      // already deleted it, but Set.delete is idempotent.
      inFlightEntityStarts.current.delete(entityId)
    }
  }, [setSessionAtSlot])

  const handleResumeEntity = useCallback(async (entityId: EntityId, slotIndex: number) => {
    const api = (window as any).cipherMux
    inFlightEntityStarts.current.add(entityId)
    try {
      const session = await api.entity.resume(entityId)
      const sid = session?.id
      if (sid) {
        switch (entityId) {
          case 'orchestrator': setOrchestratorSessionId(sid); break
          case 'cyber-factory': setCyberFactorySessionId(sid); break
          case 'companion': setCompanionSessionId(sid); break
          case 'refinement': setRefinementSessionId(sid); break
          case 'voice-relay': setVoiceRelaySessionId(sid); break
          case 'audit': setAuditSessionId(sid); break
        }
        setSessionAtSlot(slotIndex, sid)
        setFocusedSessionId(sid)
      }
    } finally {
      inFlightEntityStarts.current.delete(entityId)
    }
  }, [setSessionAtSlot])

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

  const handlePathStart = useCallback(async (dirPath: string, opts: PathStartOpts, slotIndex: number) => {
    try {
      const name = dirPath.split('/').filter(Boolean).pop() ?? 'session'
      // Shell-escape the path for cd (single-quote with escaped inner quotes)
      const escaped = dirPath.replace(/'/g, "'\\''")
      let autoLaunch: string | undefined
      if (!opts.shellOnly) {
        const parts = [`cd '${escaped}' && clear; claude`]
        if (opts.skipPermissions) parts.push('--dangerously-skip-permissions')
        if (opts.resume) parts.push('--resume')
        if (opts.fork) parts.push('--fork')
        autoLaunch = parts.join(' ') + '\n'
      } else {
        // Shell-only: ensure cwd is correct even without claude
        autoLaunch = `cd '${escaped}' && clear\n`
      }
      const session = await startSession({
        name,
        projectPath: dirPath,
        autoLaunch,
      })
      setSessionAtSlot(slotIndex, session.id)
      setFocusedSessionId(session.id)
    } catch (err) {
      console.error('[App] Failed to start session:', err)
    }
  }, [startSession, setSessionAtSlot])

  const handleOpenNote = useCallback((note: any, slotIndex: number) => {
    setSlotType(slotIndex, 'notes')
    setSidebarVisible(true)
    // Retry until NotesCell mounts and registers in the per-slot registry
    let attempts = 0
    const tryOpen = () => {
      const reg = (window as any).__notesCellRegistry as Record<number, (n: any) => void> | undefined
      const openFn = reg?.[slotIndex]
      if (openFn) {
        openFn(note)
      } else if (attempts < 10) {
        attempts++
        setTimeout(tryOpen, 100)
      }
    }
    setTimeout(tryOpen, 50)
  }, [setSlotType])

  const handleOpenNoteInGrid = useCallback((note: any) => {
    // Find first existing NotesCell slot
    const existingIdx = grid.slots.findIndex(s => s.type === 'notes')
    if (existingIdx >= 0) {
      const reg = (window as any).__notesCellRegistry as Record<number, (n: any) => void> | undefined
      const openFn = reg?.[existingIdx]
      if (openFn) openFn(note)
    } else {
      // No NotesCell — show GridPlacementPopup for user to pick a slot
      setPlacementPopup({ note })
    }
  }, [grid.slots])
  handleOpenNoteInGridRef.current = handleOpenNoteInGrid

  // ─── Drag & Drop from Sidebar to Grid (C.6) ───────────
  const handleDropSession = useCallback((sessionId: string, slotIndex: number) => {
    // If slot is occupied, send old session to background
    const currentSlot = grid.slots[slotIndex]
    if (currentSlot?.sessionId) {
      removeSession(currentSlot.sessionId)
    }
    // Remove dragged session from any existing slot first
    removeSession(sessionId)
    setSessionAtSlot(slotIndex, sessionId)
    setFocusedSessionId(sessionId)
  }, [grid.slots, removeSession, setSessionAtSlot])

  const handleDropNoteOnEmpty = useCallback((note: any, slotIndex: number) => {
    setSlotType(slotIndex, 'notes')
    setSidebarVisible(true)
    // Retry until NotesCell mounts and registers in the per-slot registry
    let attempts = 0
    const tryOpen = () => {
      const reg = (window as any).__notesCellRegistry as Record<number, (n: any) => void> | undefined
      const openFn = reg?.[slotIndex]
      if (openFn) {
        openFn(note)
      } else if (attempts < 10) {
        attempts++
        setTimeout(tryOpen, 100)
      }
    }
    setTimeout(tryOpen, 50)
  }, [setSlotType])

  const handleToggleVoicePin = useCallback((sessionId: string) => {
    const api = (window as any).cipherMux
    api.voice?.pinSession?.(sessionId)
  }, [])

  const handleDropNoteOnSession = useCallback(async (note: any, sessionId: string) => {
    const api = (window as any).cipherMux
    // Fetch full note content (drag data only has NoteInfo, no body)
    let body = ''
    try {
      const full = await api.notes.read(note.id)
      body = full?.body ?? ''
    } catch { /* ignore */ }
    const text = `Hier, guck dir das an:\n${note.title || 'Untitled'}\n\n${body}`
    api.terminal.write(sessionId, text)
  }, [])

  // Listen for entity-started events
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api.entity?.onStarted) return
    const unsub = api.entity.onStarted((data: { entityId: string; session: any }) => {
      const sid = data.session?.id
      if (!sid) return
      // Skip if this entity was started from the renderer via handleStartEntity (RT-X2 fix).
      // Check by entityId (available before the await) instead of sessionId (only after).
      if (inFlightEntityStarts.current.has(data.entityId)) {
        inFlightEntityStarts.current.delete(data.entityId)
        return
      }
      // Skip if session is already placed in the grid
      const alreadyPlaced = grid.slots.some(s => s.sessionId === sid)
      if (alreadyPlaced) return
      if (data.entityId === 'companion' && !companionSessionId) {
        setCompanionSessionId(sid); placeEntity(sid)
      } else if (data.entityId === 'refinement' && !refinementSessionId) {
        setRefinementSessionId(sid); placeEntity(sid)
      } else if (data.entityId === 'voice-relay' && !voiceRelaySessionId) {
        // Voice-relay runs as background session only (no grid placement)
        setVoiceRelaySessionId(sid)
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
    const entities: Array<{ id: EntityId; setter: (sid: string) => void; background?: boolean }> = [
      { id: 'companion', setter: (sid) => setCompanionSessionId(sid) },
      { id: 'refinement', setter: (sid) => setRefinementSessionId(sid) },
      { id: 'voice-relay', setter: (sid) => setVoiceRelaySessionId(sid), background: true },
      { id: 'audit', setter: (sid) => setAuditSessionId(sid) },
    ]
    for (const { id, setter, background } of entities) {
      api.entity.status(id).then((s: { running: boolean; sessionId?: string }) => {
        if (!mounted) return
        if (s.running && s.sessionId) {
          setter(s.sessionId)
          if (!background) placeEntity(s.sessionId)
        }
      })
    }
    return () => { mounted = false }
  }, [placeEntity])

  // Listen for MCP UI_OPEN events
  useEffect(() => {
    const a = (window as any).cipherMux
    if (!a?.ui?.onOpen) return
    const unsub = a.ui.onOpen((data: { target: string; action?: string; context?: Record<string, unknown> }) => {
      const action = (data.action as 'open' | 'close' | 'toggle') ?? 'toggle'
      switch (data.target) {
        case 'workspace-popup':
          if (action === 'close') setWorkspacesPopupVisible(false)
          else if (action === 'open') setWorkspacesPopupVisible(true)
          else setWorkspacesPopupVisible(prev => !prev)
          break
        case 'info-dialog': {
          const tab = data.context?.tab as string | undefined
          if (action === 'close') {
            setInfoVisible(false)
          } else if (action === 'open') {
            setInfoInitialTab(tab)
            setInfoVisible(true)
          } else {
            // toggle
            setInfoVisible(prev => {
              if (!prev) setInfoInitialTab(tab)
              return !prev
            })
          }
          break
        }
        case 'launcher-popup': {
          const cell = (data.context?.cell as string) ?? '0-0'
          const [col, row] = cell.split('-').map(Number)
          const slotIndex = (row || 0) * grid.config.cols + (col || 0)
          if (action === 'close') {
            window.dispatchEvent(new CustomEvent('launcher-close', { detail: { slotIndex } }))
          } else {
            window.dispatchEvent(new CustomEvent('launcher-open', { detail: { slotIndex } }))
          }
          break
        }
        case 'note': {
          const noteId = data.context?.noteId as string
          if (noteId && action !== 'close') {
            setSidebarVisible(true)
            // Open note in NotesCell via handleOpenNoteInGrid pattern
            handleOpenNoteInGridRef.current?.({ id: noteId } as any)
          }
          break
        }
      }

      // scrollTo support: after opening, scroll to element
      if (data.context?.scrollTo && action !== 'close') {
        setTimeout(() => {
          const el = document.querySelector(data.context!.scrollTo as string)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 200) // Allow popup to render first
      }
    })
    return () => unsub()
  }, [grid.config.cols])

  // Listen for MCP THEME_SET events
  useEffect(() => {
    const a = (window as any).cipherMux
    if (!a?.ui?.onThemeSet) return
    const unsub = a.ui.onThemeSet((data: { theme: string }) => {
      if (data.theme) {
        setTheme(data.theme as any)
      }
    })
    return () => unsub()
  }, [setTheme])

  return (
    <div class="app-shell">
      <HighlightOverlay />
      {setupWizard.visible && (
        <SetupWizard
          dependencies={setupWizard.dependencies}
          onInstallAll={setupWizard.installAll}
          onSkip={setupWizard.skip}
          installing={setupWizard.installing}
          currentStep={setupWizard.currentStep}
          progress={setupWizard.progress}
          done={setupWizard.done}
          error={setupWizard.error}
        />
      )}
      <div class="drag-region">
        <span class="title">cipher-mux</span>
      </div>

      <div class="app-body">
        {workspaceLoading && (
          <div class="workspace-loading-overlay">
            <span class="workspace-loading-spinner" />
            <span>{t('app.workspaceLoading')}</span>
          </div>
        )}
        <SessionGrid
          grid={grid}
          sessions={sessions}
          contextUsages={contextUsages}
          focusedSessionId={focusedSessionId}
          theme={theme}
          orchestratorSessionId={orchestratorSessionId}
          activeWorkspaceId={activeWorkspaceId}
          entityStatus={entityStatus}
          voiceTargetSessionId={voiceTargetSessionId}
          voicePinned={voicePinned}
          voiceState={voiceState}
          isSpeaking={isSpeaking}
          onToggleVoicePin={handleToggleVoicePin}
          workspaceLoading={workspaceLoading}
          onFocusSession={setFocusedSessionId}
          onCloseSession={handleCloseSession}
          onSwitchProject={handleSwitchProject}
          onToggleExpand={toggleExpand}
          onShell={handleShell}
          onFork={handleFork}
          onSendToBackground={handleSendToBackground}
          onFocusMode={handleFocusMode}
          focusModeSlot={focusModeSlot}
          focusModeOverlapped={focusModeOverlapped}
          onStartEntity={handleStartEntity}
          onResumeEntity={handleResumeEntity}
          onFocusEntity={handleFocusEntity}
          onStartPath={handlePathStart}
          onOpenNotes={handleOpenNotes}
          onOpenNote={handleOpenNote}
          onCloseNotes={handleCloseNotes}
          onToggleExpandSlot={toggleExpandSlot}
          onSwap={swap}
          onDropSession={handleDropSession}
          onDropNoteOnEmpty={handleDropNoteOnEmpty}
          onDropNoteOnSession={handleDropNoteOnSession}
        />
        {!sidebarDetached && (
          <SidebarPanel
            visible={sidebarVisible}
            orchestratorActive={!!orchestratorSessionId}
            cyberFactoryActive={!!cyberFactorySessionId}
            sessions={sessions}
            gridSessionIds={gridSessionIds}
            contextUsages={contextUsages}
            onAddToGrid={handleAddToGrid}
            onKillSession={stopSession}
            onDetach={handleSidebarDetach}
            activeWorkspaceId={activeWorkspaceId}
            hasNotesCell={grid.slots.some(s => s.type === 'notes')}
            onOpenNoteInGrid={handleOpenNoteInGrid}
            voiceComState={voiceComState}
          />
        )}
      </div>

      <FocusMode
        enabled={focusModeSlot !== null}
        sessionName={focusModeSlot !== null ? (sessions.find(s => s.id === grid.slots[focusModeSlot]?.sessionId)?.name ?? null) : null}
        contextPct={focusModeSlot !== null ? (contextUsages[grid.slots[focusModeSlot]?.sessionId ?? '']?.usedPercentage ?? 0) : 0}
        onDeactivate={exitFocusMode}
      />

      <StatusBar
        theme={theme}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => {
          if (sidebarDetached) {
            const api = (window as any).cipherMux
            api.sidebar.dock()
            setSidebarDetached(false)
            setSidebarVisible(true)
          } else {
            setSidebarVisible(v => !v)
          }
        }}
        workspacesPopupVisible={workspacesPopupVisible}
        gridCols={grid.config.cols}
        gridRows={grid.config.rows}
        focusedSessionId={focusedSessionId}
        focusedSessionName={focusedSessionName}
        sessions={sessions}
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
      <RecoveryDialog onDone={handleRecoveryDone} onAdopt={addSession} onRecovered={handleRecovered} />
      <BugreportDialog
        visible={bugreportVisible}
        onClose={() => setBugreportVisible(false)}
      />
      {updateInfo && (
        <UpdateDialog
          version={updateInfo.version}
          currentVersion={updateInfo.currentVersion}
          releaseUrl={updateInfo.releaseUrl}
          downloadUrl={updateInfo.downloadUrl}
          releaseNotes={updateInfo.releaseNotes}
          onDismiss={() => {
            window.cipherMux.update.dismiss(updateInfo.version)
            setUpdateInfo(null)
          }}
          onDownload={() => {
            const url = updateInfo.downloadUrl ?? updateInfo.releaseUrl
            window.open(url, '_blank')
            setUpdateInfo(null)
          }}
        />
      )}
      {/* ARIA live region for context warnings (REQ-A11Y-007) */}
      <div class="a11y-live-region" aria-live="assertive" role="alert">
        {focusedSessionId && (contextUsages[focusedSessionId]?.usedPercentage ?? 0) >= 80
          ? `Warnung: Context-Nutzung bei ${contextUsages[focusedSessionId]?.usedPercentage}%`
          : ''}
      </div>
      <div class="a11y-live-region" aria-live="polite" role="status" id="a11y-session-status" />

      {infoVisible && (
        <div
          class={`modal-overlay${themeEditorActive ? ' modal-overlay--transparent' : ''}`}
          onClick={() => { setInfoVisible(false); setThemeEditorActive(false) }}
          role="dialog"
          aria-label="Einstellungen"
          aria-modal="true"
        >
          <div class="modal-panel" style={{ width: '600px' }} onClick={(e) => e.stopPropagation()} ref={modalFocusTrapRef}>
            <InfoSettingsView
              theme={theme}
              onSetTheme={setTheme}
              initialTab={infoInitialTab}
              onThemeEditorToggle={setThemeEditorActive}
              customThemes={customThemes}
              activeCustomThemeId={activeCustomThemeId}
              onSelectCustomTheme={selectCustomTheme}
              onSaveCustomTheme={saveCustomTheme}
              onDeleteCustomTheme={deleteCustomTheme}
              onOpenBugreport={() => { setBugreportVisible(true); (window as any).cipherMux?.voice?.stop?.() }}
              registeredShortcuts={shortcutEntries}
            />
          </div>
        </div>
      )}
    </div>
  )
}
