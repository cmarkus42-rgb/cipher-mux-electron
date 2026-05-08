import fs from 'fs'
import path from 'path'
import type { TaskSource, TaskEmitter } from '../task-source'

export class BugreportTaskSource implements TaskSource {
  readonly name = 'bugreport'

  private readonly watchPath: string
  private watcher: fs.FSWatcher | null = null
  private seenFiles = new Set<string>()

  constructor(watchPath: string) {
    this.watchPath = watchPath
  }

  start(emit: TaskEmitter): void {
    this._emit = emit
    fs.mkdirSync(this.watchPath, { recursive: true })
    this.scanDir(emit)

    this.watcher = fs.watch(this.watchPath, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return
      setTimeout(() => {
        this.ingestFile(filename, emit)
      }, 100)
    })
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  /** Re-scan directory for new .md files. Useful when fs.watch misses events. */
  rescan(): void {
    if (this._emit) this.scanDir(this._emit)
  }

  private _emit: TaskEmitter | null = null

  private scanDir(emit: TaskEmitter): void {
    let entries: string[]
    try {
      entries = fs.readdirSync(this.watchPath)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        this.ingestFile(entry, emit)
      }
    }
  }

  private ingestFile(filename: string, emit: TaskEmitter): void {
    if (this.seenFiles.has(filename)) return
    this.seenFiles.add(filename)

    const filePath = path.join(this.watchPath, filename)
    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch {
      return
    }

    const title = filename.replace(/\.md$/, '')

    emit({
      title,
      description: content,
      source: 'bugreport',
      policy: {
        maxRetries: 2,
        hooks: {
          afterRun: 'npm test',
        },
      },
    })
  }
}
