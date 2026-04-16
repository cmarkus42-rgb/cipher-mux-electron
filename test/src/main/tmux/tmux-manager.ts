import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { TmuxParser, TmuxEvent } from './tmux-parser'
import { OutputBatcher } from './output-batcher'
import { runCommand } from '../util/exec-util'

export interface TmuxSessionInfo {
  id: string
  name: string
  width: number
  height: number
  created: number
}

export interface TmuxManagerEvents {
  output: (paneId: string, data: string) => void
  'sessions-changed': () => void
  'session-changed': (sessionId: string, name: string) => void
  exit: (reason: string) => void
  error: (err: Error) => void
}

/**
 * TmuxManager — Manages a tmux Control Mode connection.
 *
 * Uses `tmux -C` to get structured events from tmux, and sends
 * commands back through stdin. All terminal output is batched
 * at 16ms intervals before being emitted.
 */
export class TmuxManager extends EventEmitter {
  private controlProcess: ChildProcess | null = null
  private parser: TmuxParser
  private batcher: OutputBatcher
  private connected = false
  private pendingCommands: Map<number, {
    resolve: (result: string) => void
    reject: (err: Error) => void
    buffer: string[]
  }> = new Map()

  constructor() {
    super()
    this.parser = new TmuxParser()
    this.batcher = new OutputBatcher((paneId, data) => {
      this.emit('output', paneId, data)
    })

    this.parser.onEvent((event: TmuxEvent) => {
      this.handleEvent(event)
    })
  }

  /**
   * Connect to tmux in Control Mode.
   * If socketPath is provided, connects to an existing server.
   */
  async connect(socketPath?: string): Promise<void> {
    if (this.connected) return

    const args = ['-C']
    if (socketPath) {
      args.unshift('-L', socketPath)
    }
    args.push('new-session', '-d', '-s', 'cipher-mux-control', '-x', '200', '-y', '50')

    // Try to attach first, fall back to new session
    try {
      await this.startControlMode(['-C', ...(socketPath ? ['-L', socketPath] : []), 'attach-session', '-t', 'cipher-mux-control'])
    } catch {
      await this.startControlMode(args)
    }
  }

  private startControlMode(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.controlProcess = spawn('tmux', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'xterm-256color' },
      })

      let startupResolved = false

      this.controlProcess.stdout?.on('data', (chunk: Buffer) => {
        this.parser.feed(chunk.toString('utf-8'))
        if (!startupResolved) {
          startupResolved = true
          this.connected = true
          resolve()
        }
      })

      this.controlProcess.stderr?.on('data', (chunk: Buffer) => {
        const msg = chunk.toString('utf-8').trim()
        if (!startupResolved) {
          startupResolved = true
          reject(new Error(`tmux control mode failed: ${msg}`))
        } else {
          this.emit('error', new Error(`tmux stderr: ${msg}`))
        }
      })

      this.controlProcess.on('exit', (code) => {
        this.connected = false
        this.controlProcess = null
        if (!startupResolved) {
          startupResolved = true
          reject(new Error(`tmux exited with code ${code}`))
        }
      })

      this.controlProcess.on('error', (err) => {
        this.connected = false
        if (!startupResolved) {
          startupResolved = true
          reject(err)
        } else {
          this.emit('error', err)
        }
      })
    })
  }

  disconnect(): void {
    this.batcher.destroy()
    if (this.controlProcess) {
      this.controlProcess.kill()
      this.controlProcess = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  /**
   * Send a raw tmux command via control mode stdin.
   */
  private sendRaw(command: string): void {
    if (!this.controlProcess?.stdin?.writable) {
      throw new Error('tmux control mode not connected')
    }
    this.controlProcess.stdin.write(command + '\n')
  }

  /**
   * Execute a tmux command and wait for the response.
   * Returns the command output as a string.
   */
  async command(cmd: string): Promise<string> {
    // For now, simple fire-and-forget commands
    this.sendRaw(cmd)
    // TODO: implement proper begin/end response matching
    return ''
  }

  /**
   * Create a new tmux session (or window in the control session).
   */
  async createSession(name: string, opts?: {
    cwd?: string
    command?: string
    env?: Record<string, string>
    width?: number
    height?: number
  }): Promise<string> {
    const width = opts?.width ?? 200
    const height = opts?.height ?? 50
    const args = ['new-session', '-d', '-s', name, '-x', String(width), '-y', String(height), '-P', '-F', '#{session_id}']
    if (opts?.cwd) {
      args.push('-c', opts.cwd)
    }

    // Build env string for tmux
    let envPrefix = ''
    if (opts?.env) {
      for (const [key, val] of Object.entries(opts.env)) {
        envPrefix += `${key}=${val} `
      }
    }

    if (opts?.command) {
      args.push(envPrefix + opts.command)
    } else if (envPrefix) {
      args.push(`${envPrefix}$SHELL`)
    }

    const result = await runCommand('tmux', args)
    return result.trim() // Returns session ID like $1
  }

  /**
   * Kill a tmux session by name.
   */
  async killSession(name: string): Promise<void> {
    await runCommand('tmux', ['kill-session', '-t', name])
  }

  /**
   * List all tmux sessions.
   */
  async listSessions(): Promise<TmuxSessionInfo[]> {
    try {
      const output = await runCommand('tmux', [
        'list-sessions',
        '-F',
        '#{session_id}:#{session_name}:#{session_width}:#{session_height}:#{session_created}',
      ])
      return output.split('\n').filter(Boolean).map((line) => {
        const [id, name, width, height, created] = line.split(':')
        return {
          id,
          name,
          width: parseInt(width, 10),
          height: parseInt(height, 10),
          created: parseInt(created, 10),
        }
      })
    } catch {
      return []
    }
  }

  /**
   * Send keystrokes to a tmux pane.
   */
  async sendKeys(target: string, keys: string): Promise<void> {
    await runCommand('tmux', ['send-keys', '-t', target, keys])
  }

  /**
   * Split a pane in a tmux session.
   */
  async splitPane(target: string, direction: 'horizontal' | 'vertical'): Promise<string> {
    const flag = direction === 'horizontal' ? '-h' : '-v'
    const result = await runCommand('tmux', ['split-window', flag, '-t', target, '-P', '-F', '#{pane_id}'])
    return result.trim()
  }

  /**
   * Resize a tmux pane.
   */
  async resizePane(target: string, cols: number, rows: number): Promise<void> {
    await runCommand('tmux', ['resize-pane', '-t', target, '-x', String(cols), '-y', String(rows)])
  }

  /**
   * Capture pane content.
   */
  async capturePane(target: string, lines?: number): Promise<string> {
    const args = ['capture-pane', '-t', target, '-p']
    if (lines) {
      args.push('-S', String(-lines))
    }
    return runCommand('tmux', args)
  }

  private handleEvent(event: TmuxEvent): void {
    switch (event.type) {
      case 'output':
        this.batcher.push(event.paneId, event.data)
        break
      case 'begin':
        this.pendingCommands.set(event.number, {
          resolve: () => {},
          reject: () => {},
          buffer: [],
        })
        break
      case 'end': {
        const pending = this.pendingCommands.get(event.number)
        if (pending) {
          pending.resolve(pending.buffer.join('\n'))
          this.pendingCommands.delete(event.number)
        }
        break
      }
      case 'error': {
        const pendingErr = this.pendingCommands.get(event.number)
        if (pendingErr) {
          pendingErr.reject(new Error('tmux command error'))
          this.pendingCommands.delete(event.number)
        }
        break
      }
      case 'sessions-changed':
        this.emit('sessions-changed')
        break
      case 'session-changed':
        this.emit('session-changed', event.sessionId, event.name)
        break
      case 'exit':
        this.connected = false
        this.emit('exit', event.reason)
        break
    }
  }
}
