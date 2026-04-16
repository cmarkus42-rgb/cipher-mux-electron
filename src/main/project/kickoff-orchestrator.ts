import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import type { SessionManager } from '../session/session-manager'
import type {
  KickoffRequest,
  KickoffHandle,
  KickoffCompletionPayload,
  KickoffCompletedEvent,
} from '../../shared/types'
import { buildLauncherPrompt } from './launcher-prompt'
import { KickoffWatcher } from './kickoff-watcher'

export interface KickoffOrchestratorDeps {
  sessionManager: SessionManager
  projectlauncherPath: string
  /** Timeout for kickoff completion signal. */
  timeoutMs: number
  /** Marker-file poll interval. Default 2000ms. */
  pollIntervalMs?: number
  /** Delay before sending launcher prompt (default 5000ms, test override). */
  promptSendDelayMs?: number
  /** Delay before sending /interview to follow-up session (default 5000ms, test override). */
  interviewSendDelayMs?: number
}

interface ActiveKickoff {
  handle: KickoffHandle
  watcher: KickoffWatcher
  promptSendTimer: NodeJS.Timeout | null
}

const DEFAULT_PROMPT_SEND_DELAY_MS = 5_000
const DEFAULT_INTERVIEW_SEND_DELAY_MS = 5_000

const AUTOLAUNCH_CLAUDE = 'clear; claude --dangerously-skip-permissions\n'

export class KickoffOrchestrator extends EventEmitter {
  private active: ActiveKickoff | null = null

  constructor(private deps: KickoffOrchestratorDeps) {
    super()
  }

  async start(req: KickoffRequest): Promise<KickoffHandle> {
    if (this.active) {
      throw new Error('A kickoff is already in progress')
    }

    // 1. Validate project directory.
    const projectDir = path.resolve(req.projectDir)
    if (!fs.existsSync(projectDir)) {
      throw new Error(`Project directory does not exist: ${projectDir}`)
    }
    const projStat = fs.statSync(projectDir)
    if (!projStat.isDirectory()) {
      throw new Error(`Project path is not a directory: ${projectDir}`)
    }

    // 2. Handle optional requirements file (copy, preserve extension).
    let requirementsRelPath: string | undefined
    if (req.requirementsFile) {
      const src = path.resolve(req.requirementsFile)
      if (!fs.existsSync(src)) {
        throw new Error(`Requirements file not found: ${src}`)
      }
      const docsDir = path.join(projectDir, 'docs')
      fs.mkdirSync(docsDir, { recursive: true })
      const ext = path.extname(src) // includes leading dot, may be empty
      const destName = `requirements${ext}`
      const dest = path.join(docsDir, destName)
      fs.copyFileSync(src, dest)
      requirementsRelPath = path.join('docs', destName)
    }

    const projectName = path.basename(projectDir)

    // 3. Build the launcher prompt.
    const prompt = buildLauncherPrompt({
      projectDir,
      requirementsRelPath,
      extraContext: req.extraContext,
    })

    // 4. Start the launcher tmux session in projectlauncherPath.
    const session = await this.deps.sessionManager.start({
      name: `Launcher: ${projectName}`,
      projectPath: this.deps.projectlauncherPath,
      autoLaunch: AUTOLAUNCH_CLAUDE,
    })

    const handle: KickoffHandle = {
      launcherSessionId: session.id,
      projectDir,
      projectName,
    }

    // 5. Schedule the prompt send after claude has had time to boot.
    const promptDelay = this.deps.promptSendDelayMs ?? DEFAULT_PROMPT_SEND_DELAY_MS
    const promptSendTimer = setTimeout(() => {
      this.deps.sessionManager
        .sendKeys(session.id, prompt + '\n')
        .catch((err) => {
          console.error('[KickoffOrchestrator] sendKeys failed:', err)
        })
    }, promptDelay)

    // 6. Watch for completion via marker-file + timeout.
    const watcher = new KickoffWatcher({
      projectDir,
      timeoutMs: this.deps.timeoutMs,
      pollIntervalMs: this.deps.pollIntervalMs,
      onMarker: () => {
        this.handleCompletion({
          projectPath: projectDir,
          projectName,
        })
      },
      onTimeout: () => {
        this.handleTimeout()
      },
    })
    watcher.start()

    this.active = { handle, watcher, promptSendTimer }

    return handle
  }

  /**
   * Called by the kickoff_complete MCP tool handler. Idempotent — if the
   * watcher's marker-file already fired, this call is ignored.
   */
  handleCompletion(payload: KickoffCompletionPayload): void {
    if (!this.active) return
    const active = this.active
    this.cleanupActive()

    const interviewDelay = this.deps.interviewSendDelayMs ?? DEFAULT_INTERVIEW_SEND_DELAY_MS

    // Start the follow-up session in the project dir.
    this.deps.sessionManager.start({
      name: active.handle.projectName,
      projectPath: active.handle.projectDir,
      autoLaunch: AUTOLAUNCH_CLAUDE,
    }).then((followup) => {
      // Queue the /interview prompt after claude has booted.
      setTimeout(() => {
        this.deps.sessionManager
          .sendKeys(followup.id, '/interview\n')
          .catch((err) => {
            console.error('[KickoffOrchestrator] /interview sendKeys failed:', err)
          })
      }, interviewDelay)

      const event: KickoffCompletedEvent = {
        handle: active.handle,
        payload: {
          projectPath: payload.projectPath || active.handle.projectDir,
          projectName: payload.projectName || active.handle.projectName,
          detectedStack: payload.detectedStack,
        },
        followupSessionId: followup.id,
      }
      this.emit('kickoff-complete', event)
    }).catch((err) => {
      console.error('[KickoffOrchestrator] follow-up session start failed:', err)
      this.emit('kickoff-error', { handle: active.handle, error: err })
    })
  }

  private handleTimeout(): void {
    if (!this.active) return
    const handle = this.active.handle
    this.cleanupActive()
    this.emit('kickoff-timeout', { handle })
  }

  private cleanupActive(): void {
    if (!this.active) return
    this.active.watcher.stop()
    if (this.active.promptSendTimer) {
      clearTimeout(this.active.promptSendTimer)
    }
    this.active = null
  }

  destroy(): void {
    this.cleanupActive()
    this.removeAllListeners()
  }
}
