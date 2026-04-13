import { ipcMain } from 'electron'
import { WindowManager } from './window-manager'
import { SessionManager } from './session/session-manager'
import { TmuxManager } from './tmux/tmux-manager'
import { configStore } from './config/config-store'
import { IPC } from '../shared/ipc-channels'
import type { StartSessionOpts } from '../shared/types'

/**
 * IPC Hub — Central router for all IPC channels.
 * Connects renderer requests to main process services.
 */
export class IpcHub {
  private tmux: TmuxManager
  private sessionManager: SessionManager

  constructor(private windowManager: WindowManager) {
    this.tmux = new TmuxManager()
    this.sessionManager = new SessionManager(this.tmux)
  }

  init(): void {
    this.registerSessionChannels()
    this.registerTerminalChannels()
    this.registerMessageChannels()
    this.registerProjectChannels()
    this.registerContextChannels()
    this.registerConfigChannels()
    this.registerBugreportChannels()
    this.setupEventForwarding()
  }

  getTmuxManager(): TmuxManager {
    return this.tmux
  }

  getSessionManager(): SessionManager {
    return this.sessionManager
  }

  // ─── Event Forwarding to Renderer ──────────────────────
  private setupEventForwarding(): void {
    this.sessionManager.on('session-changed', (session) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_CHANGED, session)
    })

    this.sessionManager.on('session-stopped', (session) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_STOPPED, session)
    })

    this.tmux.on('output', (paneId: string, data: string) => {
      this.windowManager.sendToMainWindow(IPC.TERMINAL_DATA, { paneId, data })
    })
  }

  // ─── Sessions ──────────────────────────────────────────
  private registerSessionChannels(): void {
    ipcMain.handle(IPC.SESSIONS_LIST, async () => {
      return this.sessionManager.list()
    })

    ipcMain.handle(IPC.SESSIONS_START, async (_e, opts: StartSessionOpts) => {
      return this.sessionManager.start(opts)
    })

    ipcMain.handle(IPC.SESSIONS_STOP, async (_e, { sessionId }: { sessionId: string }) => {
      await this.sessionManager.stop(sessionId)
      return { ok: true }
    })

    ipcMain.handle(IPC.SESSIONS_RECOVER, async () => {
      return this.sessionManager.recover()
    })
  }

  // ─── Terminal ──────────────────────────────────────────
  private registerTerminalChannels(): void {
    ipcMain.on(IPC.TERMINAL_WRITE, (_e, { paneId, data }: { paneId: string; data: string }) => {
      this.sessionManager.sendKeys(paneId, data).catch((err) => {
        console.error('terminal write error:', err)
      })
    })

    ipcMain.on(IPC.TERMINAL_RESIZE, (_e, { paneId, cols, rows }: { paneId: string; cols: number; rows: number }) => {
      this.sessionManager.resize(paneId, cols, rows).catch((err) => {
        console.error('terminal resize error:', err)
      })
    })

    ipcMain.handle(IPC.TERMINAL_SPLIT, async (_e, { paneId, direction }: { paneId: string; direction: string }) => {
      const session = this.sessionManager.get(paneId)
      if (!session) return { error: 'Session not found' }
      const target = session.tmuxPane ?? session.tmuxSession
      const newPaneId = await this.tmux.splitPane(target, direction as 'horizontal' | 'vertical')
      return { paneId: newPaneId }
    })

    ipcMain.handle(IPC.TERMINAL_CAPTURE, async (_e, { paneId, lines }: { paneId: string; lines?: number }) => {
      return this.sessionManager.capture(paneId, lines)
    })
  }

  // ─── Messages ──────────────────────────────────────────
  private registerMessageChannels(): void {
    // Will be connected to MessageBus (Phase 3)
    ipcMain.handle(IPC.MESSAGES_SEND, async (_e, _msg) => {
      return { error: 'Not implemented' }
    })

    ipcMain.handle(IPC.MESSAGES_LIST, async (_e, _opts) => {
      return []
    })

    ipcMain.handle(IPC.MESSAGES_UNREAD, async () => {
      return 0
    })

    ipcMain.handle(IPC.MESSAGES_MARK_READ, async (_e, _opts) => {
      return { ok: true }
    })
  }

  // ─── Projects ──────────────────────────────────────────
  private registerProjectChannels(): void {
    // Will be connected to ProjectScanner (Phase 4)
    ipcMain.handle(IPC.PROJECTS_LIST, async () => {
      return []
    })

    ipcMain.handle(IPC.PROJECTS_SCAN, async () => {
      return []
    })

    ipcMain.handle(IPC.PROJECTS_KICKOFF, async (_e, _opts) => {
      return { error: 'Not implemented' }
    })
  }

  // ─── Context ───────────────────────────────────────────
  private registerContextChannels(): void {
    ipcMain.handle(IPC.CONTEXT_GET, async (_e, _opts) => {
      return null
    })

    ipcMain.handle(IPC.CONTEXT_ALL, async () => {
      return {}
    })
  }

  // ─── Config ────────────────────────────────────────────
  private registerConfigChannels(): void {
    ipcMain.handle(IPC.CONFIG_GET, async (_e, { key }: { key: string }) => {
      return configStore.get(key as keyof typeof configStore extends never ? never : any)
    })

    ipcMain.handle(IPC.CONFIG_SET, async (_e, { key, value }: { key: string; value: unknown }) => {
      configStore.set(key as any, value as any)
      return { ok: true }
    })

    ipcMain.handle(IPC.CONFIG_SAVE_LAYOUT, async (_e, layout) => {
      configStore.set('ui', { ...configStore.get('ui'), layout })
      return { ok: true }
    })
  }

  // ─── Bugreport ─────────────────────────────────────────
  private registerBugreportChannels(): void {
    ipcMain.handle(IPC.BUGREPORT_COLLECT, async () => {
      return { error: 'Not implemented' }
    })

    ipcMain.handle(IPC.BUGREPORT_EXPORT, async (_e, _opts) => {
      return { error: 'Not implemented' }
    })
  }

  async destroy(): Promise<void> {
    await this.sessionManager.destroy()
  }
}
