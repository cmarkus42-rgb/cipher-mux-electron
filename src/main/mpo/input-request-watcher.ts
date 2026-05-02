import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import type { InputRequest, InputRequestsFile, InputRequestUpdate } from '../../shared/types'

/**
 * Watches a JSON file written by the Cyber Factory
 * for input requests. Emits events when requests change and supports
 * answering requests via atomic write-back.
 */
export class InputRequestWatcher extends EventEmitter {
  private filePath: string
  private requests: InputRequest[] = []
  private watcher: fs.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(filePath: string) {
    super()
    this.filePath = filePath
    this.loadFile()
  }

  /** Start watching the file for changes. */
  start(): void {
    if (this.watcher) return

    // Ensure parent directory exists for fs.watch
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    try {
      this.watcher = fs.watch(dir, (_eventType, filename) => {
        if (filename === path.basename(this.filePath)) {
          this.debouncedReload()
        }
      })
    } catch {
      // Directory may not be watchable — silent fail
    }
  }

  /** Stop watching. */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  /** Get current list of requests. */
  getRequests(): InputRequest[] {
    return this.requests
  }

  /** Count open (unanswered) requests. */
  openCount(): number {
    return this.requests.filter((r) => r.status === 'open').length
  }

  /**
   * Answer a request and write back to the JSON file atomically.
   * Uses tmp + rename pattern for safe concurrent access.
   */
  answerRequest(id: string, answer: string): void {
    // Re-read to get freshest state
    this.loadFile()

    const req = this.requests.find((r) => r.id === id)
    if (!req) return

    req.status = 'answered'
    if (req.type === 'bubble') {
      req.answer = answer
    }
    req.answeredAt = new Date().toISOString()

    const data: InputRequestsFile = {
      requests: this.requests,
      lastUpdated: new Date().toISOString(),
    }

    this.writeFileAtomic(data)
  }

  /**
   * Create a new input request and append it to the file.
   */
  createRequest(request: InputRequest): void {
    const data = this.readFile()
    data.requests.push(request)
    data.lastUpdated = new Date().toISOString()
    this.writeFileAtomic(data)
  }

  /**
   * Atomic write: write to .tmp file then rename.
   */
  private writeFileAtomic(data: InputRequestsFile): void {
    const tmpPath = this.filePath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, this.filePath)
  }

  /**
   * Read the current file state (fresh from disk).
   */
  private readFile(): InputRequestsFile {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { requests: [], lastUpdated: new Date().toISOString() }
      }
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const data: InputRequestsFile = JSON.parse(raw)
      return { requests: Array.isArray(data.requests) ? data.requests : [], lastUpdated: data.lastUpdated ?? new Date().toISOString() }
    } catch {
      return { requests: [], lastUpdated: new Date().toISOString() }
    }
  }

  private debouncedReload(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.reload()
    }, 300)
  }

  private reload(): void {
    const oldRequests = this.requests
    this.loadFile()

    // Emit granular updates
    const oldIds = new Set(oldRequests.map((r) => r.id))
    const newIds = new Set(this.requests.map((r) => r.id))

    for (const req of this.requests) {
      if (!oldIds.has(req.id)) {
        this.emit('request-update', { action: 'added', request: req } as InputRequestUpdate)
      } else {
        const oldReq = oldRequests.find((r) => r.id === req.id)
        if (oldReq && oldReq.status !== req.status) {
          this.emit('request-update', { action: 'updated', request: req } as InputRequestUpdate)
        }
      }
    }

    for (const old of oldRequests) {
      if (!newIds.has(old.id)) {
        this.emit('request-update', { action: 'removed', request: old } as InputRequestUpdate)
      }
    }

    this.emit('requests-changed', this.requests)
  }

  private loadFile(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.requests = []
        return
      }
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const data: InputRequestsFile = JSON.parse(raw)
      this.requests = Array.isArray(data.requests) ? data.requests : []
    } catch {
      this.requests = []
    }
  }
}
