import * as fs from 'fs'
import * as path from 'path'

/**
 * KickoffWatcher — Watches for the `.kickoff-complete` marker file in a
 * project directory, with a hard timeout fallback.
 *
 * Uses fs.watch as primary trigger and a slow poll as Nextcloud-sync
 * safety net (fs.watch can be unreliable on networked file systems).
 */

const MARKER_FILENAME = '.kickoff-complete'

export interface KickoffWatcherOpts {
  projectDir: string
  timeoutMs: number
  /** Poll interval as a backup for fs.watch. Default 2000ms. */
  pollIntervalMs?: number
  onMarker: () => void
  onTimeout: () => void
}

export class KickoffWatcher {
  private fsWatcher: fs.FSWatcher | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private timeoutTimer: NodeJS.Timeout | null = null
  private fired = false

  constructor(private opts: KickoffWatcherOpts) {}

  start(): void {
    if (this.fired) return

    const markerPath = path.join(this.opts.projectDir, MARKER_FILENAME)

    // Check immediately — marker may already exist.
    if (fs.existsSync(markerPath)) {
      this.fireMarker()
      return
    }

    // fs.watch on the directory — fires for any child entry change.
    try {
      this.fsWatcher = fs.watch(this.opts.projectDir, () => {
        if (this.fired) return
        if (fs.existsSync(markerPath)) this.fireMarker()
      })
    } catch {
      // fs.watch may fail on some filesystems — rely on polling.
    }

    // Polling backup.
    const pollMs = this.opts.pollIntervalMs ?? 2000
    this.pollTimer = setInterval(() => {
      if (this.fired) return
      if (fs.existsSync(markerPath)) this.fireMarker()
    }, pollMs)

    // Timeout.
    this.timeoutTimer = setTimeout(() => {
      if (this.fired) return
      this.fireTimeout()
    }, this.opts.timeoutMs)
  }

  stop(): void {
    if (this.fsWatcher) {
      try { this.fsWatcher.close() } catch { /* ignore */ }
      this.fsWatcher = null
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }

  private fireMarker(): void {
    if (this.fired) return
    this.fired = true
    this.stop()
    this.opts.onMarker()
  }

  private fireTimeout(): void {
    if (this.fired) return
    this.fired = true
    this.stop()
    this.opts.onTimeout()
  }
}
