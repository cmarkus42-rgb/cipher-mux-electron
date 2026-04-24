import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import {
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  CHATROOM_PANEL_WIDTH,
  SESSION_CELL_HEIGHT,
} from '../shared/constants'
import { IPC } from '../shared/ipc-channels'

/** Optional grid dimensions passed to createMainWindow for initial sizing. */
export interface WindowGridHint {
  cols: number
  rows: number
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private workspacesWindow: BrowserWindow | null = null
  private sidebarWindow: BrowserWindow | null = null

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

  openWorkspacesWindow(initialTab?: 'workspaces' | 'personas'): void {
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
      this.sidebarWindow.focus()
      return
    }

    this.sidebarWindow = new BrowserWindow({
      width: 320,
      height: 600,
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
    })

    if (process.env.VITE_DEV_SERVER_URL) {
      this.sidebarWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?view=sidebar`)
    } else {
      this.sidebarWindow.loadFile(
        path.join(__dirname, '../../renderer/index.html'),
        { search: 'view=sidebar' },
      )
    }

    this.sidebarWindow.on('closed', () => {
      this.sidebarWindow = null
      // Notify main window that sidebar reattached
      this.sendToMainWindow(IPC.SIDEBAR_REATTACHED, {})
    })
  }

  closeSidebarWindow(): void {
    if (this.sidebarWindow && !this.sidebarWindow.isDestroyed()) {
      this.sidebarWindow.close()
    }
  }
}
