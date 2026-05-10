import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import {
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  CHATROOM_PANEL_WIDTH,
  SESSION_CELL_HEIGHT,
} from '../shared/constants'
import { IPC } from '../shared/ipc-channels'
import type { DetachedWindowEntry } from '../shared/types'
import { configStore } from './config/config-store'

/** Optional grid dimensions passed to createMainWindow for initial sizing. */
export interface WindowGridHint {
  cols: number
  rows: number
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private workspacesWindow: BrowserWindow | null = null
  private sidebarWindow: BrowserWindow | null = null
  private detachedWindows: Map<string, { window: BrowserWindow; entry: DetachedWindowEntry }> = new Map()
  private dockInitiated: Set<string> = new Set()

  createMainWindow(gridHint?: WindowGridHint): BrowserWindow {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    const cols = gridHint?.cols ?? DEFAULT_GRID_COLS
    const rows = gridHint?.rows ?? DEFAULT_GRID_ROWS

    // Calculate width from grid: cols × cell + chatroom + padding
    // Cells are minmax(640px, 1fr) — use 664px target to give ~83 terminal cols
    const targetCellWidth = 664
    const gridPadding = 20 // 6px padding + gaps + borders
    const gridWidth = cols * targetCellWidth + CHATROOM_PANEL_WIDTH + gridPadding

    // Height: fixed cell height × rows + chrome (same formula as WINDOW_FIT_GRID)
    const chromeHeight = 38 + 28 // drag region + status bar
    const gridVerticalPadding = 12 // 6px padding top+bottom on .session-grid-area
    const gridGaps = (rows - 1) * 4 // 4px gap between rows
    const gridHeight = rows * SESSION_CELL_HEIGHT + chromeHeight + gridVerticalPadding + gridGaps

    const width = Math.min(gridWidth, screenWidth)
    const height = Math.min(gridHeight, screenHeight)

    this.mainWindow = new BrowserWindow({
      width,
      height,
      minWidth: gridWidth,
      minHeight: 600,
      title: 'cipher-mux',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#1A1A1D',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    // Open DevTools in dev mode
    if (process.env.VITE_DEV_SERVER_URL) {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' })
    }

    // Load renderer
    if (process.env.VITE_DEV_SERVER_URL) {
      this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
    }

    // Block manual resize — size is controlled programmatically by fitGrid
    this.mainWindow.on('will-resize', (e) => { e.preventDefault() })

    // Forward renderer console to main process for debugging
    // Wrapped in try/catch to survive EPIPE when stdout pipe is broken
    this.mainWindow.webContents.on('console-message', (_event, level, message) => {
      try {
        const prefix = ['[renderer:verbose]','[renderer:info]','[renderer:warn]','[renderer:error]'][level] || '[renderer]'
        console.log(`${prefix} ${message}`)
      } catch { /* EPIPE — stdout gone, ignore silently */ }
    })

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    return this.mainWindow
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  sendToMainWindow(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  /** Send to all open windows (main, sidebar, workspaces, detached). */
  sendToAllWindows(channel: string, data: unknown): void {
    for (const win of [this.mainWindow, this.sidebarWindow, this.workspacesWindow]) {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
    for (const { window: win } of Array.from(this.detachedWindows.values())) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
  }

  openWorkspacesWindow(initialTab?: 'workspaces' | 'personas' | 'companion' | 'tags'): void {
    // Focus existing window if already open
    if (this.workspacesWindow && !this.workspacesWindow.isDestroyed()) {
      this.workspacesWindow.focus()
      return
    }

    this.workspacesWindow = new BrowserWindow({
      width: 960,
      height: 720,
      minWidth: 800,
      minHeight: 500,
      title: 'cipher-mux · Workspaces',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#1A1A1D',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    const hash = initialTab ? `#${initialTab}` : ''

    if (process.env.VITE_DEV_SERVER_URL) {
      this.workspacesWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?view=workspaces${hash}`)
    } else {
      this.workspacesWindow.loadFile(
        path.join(__dirname, '../../renderer/index.html'),
        { search: 'view=workspaces', hash: initialTab ?? '' },
      )
    }

    this.workspacesWindow.on('closed', () => {
      this.workspacesWindow = null
    })
  }

  openSidebarWindow(): void {
    // Focus existing window if already open
    if (this.sidebarWindow && !this.sidebarWindow.isDestroyed()) {
      this.sidebarWindow.show()
      this.sidebarWindow.focus()
      return
    }

    // Restore saved bounds or use defaults
    const saved = configStore.get('sidebarWindowBounds') as { x?: number; y?: number; width?: number; height?: number } | undefined
    const width = saved?.width && saved.width >= 250 ? saved.width : 320
    const height = saved?.height && saved.height >= 300 ? saved.height : 600

    const opts: Electron.BrowserWindowConstructorOptions = {
      width,
      height,
      minWidth: 250,
      minHeight: 300,
      title: 'cipher-mux · Sidebar',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#1A1A1D',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    }
    if (saved?.x != null && saved?.y != null) {
      opts.x = saved.x
      opts.y = saved.y
    }

    this.sidebarWindow = new BrowserWindow(opts)

    if (process.env.VITE_DEV_SERVER_URL) {
      this.sidebarWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?view=sidebar`)
    } else {
      this.sidebarWindow.loadFile(
        path.join(__dirname, '../../renderer/index.html'),
        { search: 'view=sidebar' },
      )
    }

    // Save bounds on move/resize
    const saveBounds = () => {
      if (this.sidebarWindow && !this.sidebarWindow.isDestroyed()) {
        configStore.set('sidebarWindowBounds', this.sidebarWindow.getBounds())
      }
    }
    this.sidebarWindow.on('resized', saveBounds)
    this.sidebarWindow.on('moved', saveBounds)

    // X-button = close completely (hide sidebar, do NOT reintegrate)
    this.sidebarWindow.on('close', () => {
      saveBounds()
      // Notify main window that sidebar is gone (hidden, not docked)
      this.sendToMainWindow(IPC.SIDEBAR_CLOSED, {})
    })

    this.sidebarWindow.on('closed', () => {
      this.sidebarWindow = null
    })
  }

  /** Toggle sidebar window visibility (show/hide without destroying). */
  toggleSidebarWindow(): boolean {
    if (!this.sidebarWindow || this.sidebarWindow.isDestroyed()) return false
    if (this.sidebarWindow.isVisible()) {
      this.sidebarWindow.hide()
      return false
    } else {
      this.sidebarWindow.show()
      this.sidebarWindow.focus()
      return true
    }
  }

  /** Dock sidebar back into main window (reintegrate). */
  dockSidebarWindow(): void {
    if (this.sidebarWindow && !this.sidebarWindow.isDestroyed()) {
      this.sidebarWindow.close()
    }
    configStore.set('sidebarDetached', false)
    this.sendToMainWindow(IPC.SIDEBAR_REATTACHED, {})
  }

  closeSidebarWindow(): void {
    if (this.sidebarWindow && !this.sidebarWindow.isDestroyed()) {
      this.sidebarWindow.close()
    }
  }

  // ─── Detached Windows ──────────────────────────────────────

  openDetachedWindow(
    type: 'session' | 'note',
    entityId: string,
    bounds?: Partial<Electron.Rectangle>,
  ): BrowserWindow {
    // Focus existing window if already detached
    const existing = this.detachedWindows.get(entityId)
    if (existing && !existing.window.isDestroyed()) {
      existing.window.focus()
      return existing.window
    }

    // Restore saved bounds or use defaults
    const savedAll = (configStore.get('detachedWindowBounds') as Record<string, Electron.Rectangle> | undefined) ?? {}
    const saved = savedAll[entityId]
    const width = bounds?.width ?? saved?.width ?? 800
    const height = bounds?.height ?? saved?.height ?? 600

    const opts: Electron.BrowserWindowConstructorOptions = {
      width,
      height,
      minWidth: 400,
      minHeight: 300,
      title: `cipher-mux · ${type === 'session' ? 'Session' : 'Notes'} · ${entityId}`,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#1A1A1D',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    }

    const x = bounds?.x ?? saved?.x
    const y = bounds?.y ?? saved?.y
    if (x != null && y != null) {
      opts.x = x
      opts.y = y
    }

    const win = new BrowserWindow(opts)

    const viewParam = type === 'session' ? 'session' : 'note'
    if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(`${process.env.VITE_DEV_SERVER_URL}?view=${viewParam}&id=${encodeURIComponent(entityId)}`)
    } else {
      win.loadFile(
        path.join(__dirname, '../../renderer/index.html'),
        { search: `view=${viewParam}&id=${encodeURIComponent(entityId)}` },
      )
    }

    const entry: DetachedWindowEntry = {
      type,
      entityId,
      bounds: win.getBounds(),
    }
    this.detachedWindows.set(entityId, { window: win, entry })

    // Save bounds on move/resize
    const saveBounds = () => {
      if (!win.isDestroyed()) {
        const b = win.getBounds()
        entry.bounds = b
        const all = (configStore.get('detachedWindowBounds') as Record<string, Electron.Rectangle> | undefined) ?? {}
        all[entityId] = b
        configStore.set('detachedWindowBounds', all)
      }
    }
    win.on('resized', saveBounds)
    win.on('moved', saveBounds)

    win.on('close', () => {
      saveBounds()
    })

    win.on('closed', () => {
      const wasDock = this.dockInitiated.delete(entityId)
      this.detachedWindows.delete(entityId)
      // Notify main window so renderer can update detachedIds
      // (covers both X-button close and programmatic close via dock)
      this.sendToMainWindow(IPC.DETACH_STATE_CHANGED, {
        entries: this.getDetachedEntries(),
        // dockedEntityId tells renderer to show placement popup (dock-button).
        // X-close omits it — session just goes to background.
        ...(wasDock ? { dockedEntityId: entityId } : {}),
      })
    })

    return win
  }

  /** Mark an entity as being docked (not just X-closed). Called before closeDetachedWindow. */
  markDockInitiated(entityId: string): void {
    this.dockInitiated.add(entityId)
  }

  closeDetachedWindow(entityId: string): void {
    const existing = this.detachedWindows.get(entityId)
    if (existing && !existing.window.isDestroyed()) {
      existing.window.close()
    }
  }

  getDetachedWindow(entityId: string): BrowserWindow | null {
    const existing = this.detachedWindows.get(entityId)
    if (existing && !existing.window.isDestroyed()) {
      return existing.window
    }
    return null
  }

  getDetachedEntries(): DetachedWindowEntry[] {
    return Array.from(this.detachedWindows.values()).map(({ entry }) => entry)
  }

  isDetached(entityId: string): boolean {
    const existing = this.detachedWindows.get(entityId)
    return !!existing && !existing.window.isDestroyed()
  }

  /**
   * Restore detached windows from a saved snapshot (called on app start).
   * Takes a validator function to skip stale entries (deleted notes, killed sessions).
   */
  restoreDetachedWindows(
    entries: Array<{ type: 'session' | 'note'; entityId: string; bounds: { x: number; y: number; width: number; height: number } }>,
    isValid: (entry: { type: 'session' | 'note'; entityId: string }) => boolean,
  ): void {
    for (const entry of entries) {
      if (!isValid(entry)) {
        console.log(`[WindowManager] skipping stale detached window: ${entry.type}/${entry.entityId}`)
        continue
      }
      this.openDetachedWindow(entry.type, entry.entityId, entry.bounds)
    }
  }
}
