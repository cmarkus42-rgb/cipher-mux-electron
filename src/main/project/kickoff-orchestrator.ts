import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import type { SessionManager } from '../session/session-manager'
import type { AdapterRegistry } from '../agent/registry'
import type {
  KickoffRequest,
  KickoffHandle,
  KickoffCompletionPayload,
  KickoffCompletedEvent,
  KickoffCompleteReason,
} from '../../shared/types'
import { buildLauncherPrompt } from './launcher-prompt'
import { KickoffWatcher } from './kickoff-watcher'

export interface KickoffOrchestratorDeps {
  sessionManager: SessionManager
  adapterRegistry: AdapterRegistry
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

    // 3. Build the launcher prompt with adapter-specific suffix.
    const adapter = this.deps.adapterRegistry.getDefault()
    const prompt = buildLauncherPrompt({
      projectDir,
      requirementsRelPath,
      extraContext: req.extraContext,
      launcherSkillCmd: adapter.buildLauncherPromptFragment('de'),
    })

    // 4. Build launch command from adapter (structured, no shell injection).
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: this.deps.projectlauncherPath,
      sessionName: `Launcher: ${projectName}`,
    })
    const autoLaunchStr = `clear; ${[launchCmd.cmd, ...launchCmd.args].join(' ')}\n`

    const session = await this.deps.sessionManager.start({
      name: `Launcher: ${projectName}`,
      projectPath: this.deps.projectlauncherPath,
      autoLaunch: autoLaunchStr,
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
        }, 'marker')
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
  handleCompletion(
    payload: KickoffCompletionPayload,
    reason: KickoffCompleteReason = 'normal',
  ): void {
    if (!this.active) return
    const active = this.active
    this.cleanupActive()

    const effectiveName = payload.projectName || active.handle.projectName
    const effectivePath = payload.projectPath || active.handle.projectDir
    console.log(
      `[KickoffOrchestrator] kickoff-result reason=${reason} `
      + `project=${effectiveName} path=${effectivePath}`,
    )

    const interviewDelay = this.deps.interviewSendDelayMs ?? DEFAULT_INTERVIEW_SEND_DELAY_MS

    // Start the follow-up session using adapter launch command.
    const adapter = this.deps.adapterRegistry.getDefault()
    const followLaunchCmd = adapter.buildLaunchCommand({
      projectPath: active.handle.projectDir,
      sessionName: active.handle.projectName,
    })
    const followAutoLaunch = `clear; ${[followLaunchCmd.cmd, ...followLaunchCmd.args].join(' ')}\n`

    this.deps.sessionManager.start({
      name: active.handle.projectName,
      projectPath: active.handle.projectDir,
      autoLaunch: followAutoLaunch,
    }).then((followup) => {
      // Queue the launcher skill prompt after agent has booted.
      const launcherFragment = adapter.buildLauncherPromptFragment('de')
      const followUpCmd = launcherFragment || '/interview'
      setTimeout(() => {
        this.deps.sessionManager
          .sendKeys(followup.id, followUpCmd + '\n')
          .catch((err) => {
            console.error('[KickoffOrchestrator] follow-up sendKeys failed:', err)
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
        reason,
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

    // Pragmatic resilience: if /launch scaffolded the project but skipped the
    // exit gate (marker + MCP call), CLAUDE.md still exists in the target dir.
    // Treat that state as an implicit complete so the follow-up session opens
    // instead of leaving the user stranded at the launcher.
    const claudeMdPath = path.join(handle.projectDir, 'CLAUDE.md')
    const hasClaudeMd = fs.existsSync(claudeMdPath)

    if (hasClaudeMd) {
      console.warn(
        `[KickoffOrchestrator] Implicit complete via CLAUDE.md presence — `
        + `/launch skill skipped exit gate for project ${handle.projectName}`,
      )
      this.handleCompletion({
        projectPath: handle.projectDir,
        projectName: handle.projectName,
      }, 'implicit')
      return
    }

    console.error(
      `[KickoffOrchestrator] kickoff-result reason=hard-fail `
      + `project=${handle.projectName} path=${handle.projectDir}`,
    )
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
