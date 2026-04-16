import { app, BrowserWindow, globalShortcut } from 'electron'
import { WindowManager } from './window-manager'
import { IpcHub } from './ipc-hub'
import { patchEnvPath } from './util/exec-util'

// macOS GUI apps inherit a minimal PATH — patch in /opt/homebrew/bin etc.
// before any child_process spawns (tmux, claude, etc.)
patchEnvPath()

// Single instance lock
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let windowManager: WindowManager
let ipcHub: IpcHub

app.whenReady().then(() => {
  windowManager = new WindowManager()
  ipcHub = new IpcHub(windowManager)
  ipcHub.init()

  windowManager.createMainWindow()

  // Cmd+Alt+I toggles DevTools
  globalShortcut.register('CommandOrControl+Alt+I', () => {
    const win = windowManager.getMainWindow()
    if (win) {
      win.webContents.toggleDevTools()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow()
    }
  })
})

app.on('second-instance', () => {
  const win = windowManager?.getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('window-all-closed', () => {
  // On macOS, keep app running when all windows close
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  if (ipcHub) {
    await ipcHub.destroy()
  }
})
