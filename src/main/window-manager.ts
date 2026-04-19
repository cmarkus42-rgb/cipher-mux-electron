import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import {
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_GRID_COLS,
  CHATROOM_PANEL_WIDTH,
} from '../shared/constants'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null

  createMainWindow(): BrowserWindow {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    const width = Math.min(DEFAULT_WINDOW_WIDTH, screenWidth)
    const height = Math.min(DEFAULT_WINDOW_HEIGHT, screenHeight)

    // Calculate min width from grid: cols × 640px cell + chatroom + padding
    const cellWidth = 640
    const gridPadding = 20 // 6px padding + gaps + borders
    const minW = DEFAULT_GRID_COLS * cellWidth + CHATROOM_PANEL_WIDTH + gridPadding

    this.mainWindow = new BrowserWindow({
      width,
      height,
      minWidth: minW,
      minHeight: 600,
      resizable: false,
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

    // Forward renderer console to main process for debugging
    this.mainWindow.webContents.on('console-message', (_event, level, message) => {
      const prefix = ['[renderer:verbose]','[renderer:info]','[renderer:warn]','[renderer:error]'][level] || '[renderer]'
      console.log(`${prefix} ${message}`)
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
}
