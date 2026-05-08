import { app, BrowserWindow, globalShortcut, Menu, session } from 'electron'
import { WindowManager } from './window-manager'
import type { WindowGridHint } from './window-manager'
import { IpcHub } from './ipc-hub'
import { configStore } from './config/config-store'
import { loadGlobalRulesOnStartup } from './config/global-rules'
import { migratePresetsIfNeeded } from './session/preset-migration'
import { patchEnvPath } from './util/exec-util'

// macOS GUI apps inherit a minimal PATH — patch in /opt/homebrew/bin etc.
// before any child_process spawns (tmux, claude, etc.)
patchEnvPath()

// Prevent BT shutter media-key events from leaking to macOS volume/media controls.
// Must be called before app.whenReady().
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling')

// Single instance lock — always enforce, only one cipher-mux instance at a time
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  console.warn('[main] Another cipher-mux instance is already running — quitting.')
  app.quit()
}

let windowManager: WindowManager
let ipcHub: IpcHub

app.whenReady().then(() => {
  // Grant microphone permission for voice bugreport interview
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(false)
  })

  // CSP via response headers — reliable for WASM in blob: workers
  // (HTML meta tag CSP is not inherited by blob: workers in Electron)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: file:; media-src 'self' data: blob:; worker-src 'self' blob:;",
        ],
      },
    })
  })

  windowManager = new WindowManager()
  ipcHub = new IpcHub(windowManager)
  ipcHub.init()

  // REQ-GLOBAL-001/003: Load global-rules.md at app start, warn if too large
  loadGlobalRulesOnStartup()
  migratePresetsIfNeeded()

  // Read saved grid config to compute initial window dimensions
  const savedUi = configStore.get('ui')
  const gridHint: WindowGridHint | undefined = savedUi?.grid?.config
    ? { cols: savedUi.grid.config.cols, rows: savedUi.grid.config.rows }
    : undefined
  windowManager.createMainWindow(gridHint)

  // Auto-restore detached sidebar window if it was detached before last quit
  if (configStore.get('sidebarDetached')) {
    windowManager.openSidebarWindow()
  }

  // Check for updates 30s after startup (non-blocking)
  const updateMode = configStore.get('update')?.mode ?? 'notify'
  if (updateMode !== 'disabled') {
    setTimeout(async () => {
      try {
        const { checkForUpdate } = await import('./updater/update-checker')
        const { IPC } = await import('../shared/ipc-channels')
        const info = await checkForUpdate()
        if (info) {
          const dismissed = configStore.get('update')?.dismissedVersion
          if (dismissed !== info.version) {
            windowManager.sendToMainWindow(IPC.UPDATE_AVAILABLE, info)
          }
        }
        configStore.set('update', {
          ...configStore.get('update'),
          lastCheck: new Date().toISOString(),
        })
      } catch { /* silent — update check is best-effort */ }
    }, 30_000)
  }

  // Custom menu: keep Edit shortcuts (copy/paste/undo) but strip default
  // zoom accelerators (Cmd+-, Cmd+=, Cmd+0) so they reach the renderer's
  // capture-phase keydown handler for our shortcut registry.
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CommandOrControl+Z', registerAccelerator: false, click: () => BrowserWindow.getFocusedWindow()?.webContents.undo() },
        { label: 'Redo', accelerator: 'Shift+CommandOrControl+Z', registerAccelerator: false, click: () => BrowserWindow.getFocusedWindow()?.webContents.redo() },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CommandOrControl+X', registerAccelerator: false, click: () => BrowserWindow.getFocusedWindow()?.webContents.cut() },
        { label: 'Copy', accelerator: 'CommandOrControl+C', registerAccelerator: false, click: () => BrowserWindow.getFocusedWindow()?.webContents.copy() },
        { label: 'Paste', accelerator: 'CommandOrControl+V', registerAccelerator: false, click: () => BrowserWindow.getFocusedWindow()?.webContents.paste() },
        { label: 'Select All', accelerator: 'CommandOrControl+A', registerAccelerator: false, click: () => BrowserWindow.getFocusedWindow()?.webContents.selectAll() },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CommandOrControl+Alt+I',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.toggleDevTools()
          },
        },
        { label: 'Reload', accelerator: 'CommandOrControl+R', registerAccelerator: false, click: () => BrowserWindow.getFocusedWindow()?.webContents.reload() },
        { label: 'Force Reload', accelerator: 'CommandOrControl+Shift+R', registerAccelerator: false, click: () => BrowserWindow.getFocusedWindow()?.webContents.reloadIgnoringCache() },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

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
