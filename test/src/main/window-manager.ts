import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import {
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
} from '../shared/constants'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null

  createMainWindow(): BrowserWindow {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    const width = Math.min(DEFAULT_WINDOW_WIDTH, screenWidth)
    const height = Math.min(DEFAULT_WINDOW_HEIGHT, screenHeight)

    this.mainWindow = new BrowserWindow({
      width,
      height,
      minWidth: 800,
      minHeight: 600,
      title: 'cipher-mux',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#1A1A1D',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    // Load renderer
    if (process.env.VITE_DEV_SERVER_URL) {
      this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

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
