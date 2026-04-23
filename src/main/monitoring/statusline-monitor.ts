import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { CONTEXT_WARNING_THRESHOLD } from '../../shared/constants'
import { BRAND } from '../../shared/brand'
import type { ContextUsage } from '../../shared/types'

/**
 * StatusLineMonitor — Watches /tmp/cipher-mux/context/ for per-session
 * context usage JSON files written by Claude Code's statusLine hook.
 *
 * Each file is named <session-id>.json and contains a JSON object with
 * context usage data. The monitor parses these files and emits events.
 */
export class StatusLineMonitor extends EventEmitter {
  private watchDir: string
  private watcher: fs.FSWatcher | null = null
  private cache: Map<string, ContextUsage> = new Map()
  private warningEmitted: Set<string> = new Set()

  constructor(watchDir: string = BRAND.statusLineDir) {
    super()
    this.watchDir = watchDir
  }

  /**
   * Start watching the context directory.
   * Creates the directory if it doesn't exist.
   */
  start(): void {
    if (this.watcher) return

    // Ensure directory exists
    fs.mkdirSync(this.watchDir, { recursive: true })

    // Read existing files
    this.scanExisting()

    // Watch for changes
    try {
      this.watcher = fs.watch(this.watchDir, (eventType, filename) => {
        if (!filename || !filename.endsWith('.json')) return
        this.handleFileChange(filename)
      })

      this.watcher.on('error', (err) => {
        console.error('[StatusLineMonitor] watch error:', err)
      })
    } catch (err) {
      console.error('[StatusLineMonitor] failed to start watch:', err)
    }
  }

  /**
   * Stop watching and clear cache.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.cache.clear()
    this.warningEmitted.clear()
  }

  /**
   * Get cached context usage for a session.
   */
  get(sessionId: string): ContextUsage | undefined {
    return this.cache.get(sessionId)
  }

  /**
   * Get all cached context usages.
   */
  getAll(): Map<string, ContextUsage> {
    return new Map(this.cache)
  }

  /**
   * Remove a session from the cache (when session stops).
   */
  remove(sessionId: string): void {
    this.cache.delete(sessionId)
    this.warningEmitted.delete(sessionId)

    // Clean up the file
    const filePath = path.join(this.watchDir, `${sessionId}.json`)
    try {
      fs.unlinkSync(filePath)
    } catch {
      // file may not exist
    }
  }

  private scanExisting(): void {
    try {
      const files = fs.readdirSync(this.watchDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          this.handleFileChange(file)
        }
      }
    } catch {
      // directory may be empty or not readable
    }
  }

  private handleFileChange(filename: string): void {
    const sessionId = filename.replace('.json', '')
    const filePath = path.join(this.watchDir, filename)

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      const usage = this.parseUsage(data)

      if (!usage) return

      this.cache.set(sessionId, usage)
      this.emit('usage-updated', sessionId, usage)

      // Warning threshold
      if (usage.usedPercentage >= CONTEXT_WARNING_THRESHOLD && !this.warningEmitted.has(sessionId)) {
        this.warningEmitted.add(sessionId)
        this.emit('usage-warning', sessionId, usage)
      }

      // Reset warning if usage drops back (e.g. new conversation)
      if (usage.usedPercentage < CONTEXT_WARNING_THRESHOLD) {
        this.warningEmitted.delete(sessionId)
      }
    } catch {
      // File may be mid-write or invalid JSON — ignore
    }
  }

  /**
   * Parse a statusLine JSON payload into ContextUsage.
   * Defensive: returns null if data is malformed.
   */
  private parseUsage(data: unknown): ContextUsage | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>

    const usedPercentage = typeof d.usedPercentage === 'number' ? d.usedPercentage
      : typeof d.used_percentage === 'number' ? d.used_percentage
      : typeof d.percent === 'number' ? d.percent
      : null

    if (usedPercentage === null) return null

    return {
      usedPercentage,
      remainingPercentage: typeof d.remainingPercentage === 'number' ? d.remainingPercentage : 100 - usedPercentage,
      totalInputTokens: typeof d.totalInputTokens === 'number' ? d.totalInputTokens : (d.total_input_tokens as number) ?? 0,
      totalOutputTokens: typeof d.totalOutputTokens === 'number' ? d.totalOutputTokens : (d.total_output_tokens as number) ?? 0,
      contextWindowSize: typeof d.contextWindowSize === 'number' ? d.contextWindowSize : (d.context_window_size as number) ?? 0,
      modelId: typeof d.modelId === 'string' ? d.modelId : (d.model_id as string) ?? '',
      updatedAt: Date.now(),
    }
  }
}
