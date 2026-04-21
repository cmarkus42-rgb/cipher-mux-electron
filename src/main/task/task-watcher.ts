import type { EventEmitter } from 'events'
import type { TaskManager } from './task-manager'
import type { Task } from '../../shared/types'
import { TASK_STALL_TIMEOUT_MS, TASK_WATCH_INTERVAL_MS } from '../../shared/constants'

export interface TaskWatcherOpts {
  taskManager: TaskManager
  sessionManager: EventEmitter & { stop(id: string): Promise<void> }
  tmuxManager: EventEmitter
  watchInterval?: number
  defaultStallTimeout?: number
}

export class TaskWatcher {
  private taskManager: TaskManager
  private sessionManager: EventEmitter & { stop(id: string): Promise<void> }
  private tmuxManager: EventEmitter
  private watchInterval: number
  private defaultStallTimeout: number
  private timer: ReturnType<typeof setInterval> | null = null
  private lastOutputTimestamps = new Map<string, number>()
  private outputHandler: ((paneId: string, data: string) => void) | null = null

  constructor(opts: TaskWatcherOpts) {
    this.taskManager = opts.taskManager
    this.sessionManager = opts.sessionManager
    this.tmuxManager = opts.tmuxManager
    this.watchInterval = opts.watchInterval ?? TASK_WATCH_INTERVAL_MS
    this.defaultStallTimeout = opts.defaultStallTimeout ?? TASK_STALL_TIMEOUT_MS
  }

  /** Start monitoring: attach tmux output listener and begin periodic checks. */
  start(): void {
    // Track last output timestamp per session (paneId maps to sessionId via task.sessionId)
    this.outputHandler = (paneId: string, _data: string) => {
      this.lastOutputTimestamps.set(paneId, Date.now())
    }
    this.tmuxManager.on('output', this.outputHandler)

    this.timer = setInterval(() => this.check(), this.watchInterval)
    // Allow process to exit even if the interval is still active
    if (this.timer.unref) {
      this.timer.unref()
    }
  }

  /** Stop monitoring: clear interval and remove tmux output listener. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.outputHandler !== null) {
      this.tmuxManager.off('output', this.outputHandler)
      this.outputHandler = null
    }
  }

  /** Return the last output timestamp for a given sessionId (or paneId). */
  getLastOutputTimestamp(sessionId: string): number | undefined {
    return this.lastOutputTimestamps.get(sessionId)
  }

  private check(): void {
    const activeTasks = this.taskManager.list({ state: ['running', 'dispatched'] })
    const now = Date.now()

    for (const task of activeTasks) {
      const stallTimeout = task.policy?.stallTimeout ?? this.defaultStallTimeout

      // stallTimeout === -1 means "never stall" — skip this task
      if (stallTimeout === -1) continue

      // Determine how long the task has been silent.
      // Prefer the last tmux output timestamp for the session if available,
      // otherwise fall back to task.updatedAt.
      const lastActivity = task.sessionId !== null
        ? (this.lastOutputTimestamps.get(task.sessionId) ?? task.updatedAt)
        : task.updatedAt

      const silentMs = now - lastActivity

      if (silentMs >= stallTimeout) {
        this.handleStall(task)
      }
    }
  }

  private handleStall(task: Task): void {
    // Move task to stalled state
    this.taskManager.markStalled(task.id)

    if (task.retryCount < task.maxRetries) {
      // Stop the associated session (fire-and-forget), then re-queue for retry
      const stopSession = task.sessionId !== null
        ? this.sessionManager.stop(task.sessionId)
        : Promise.resolve()

      stopSession
        .catch(() => { /* ignore stop errors — session may already be dead */ })
        .finally(() => {
          this.taskManager.retry(task.id)
        })
    } else {
      // No retries left — mark as permanently failed
      this.taskManager.markFailed(task.id, {
        error: `Task stalled after ${task.maxRetries} retries`,
      })
    }
  }
}
