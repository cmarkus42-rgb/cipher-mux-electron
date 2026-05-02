/**
 * BtShutterManager — spawns the ab-shutter-bridge binary in --relay mode
 * and emits parsed JSON events for BT camera shutter remote buttons.
 *
 * Events:
 *   'button' → { button: 'big' | 'small', action: 'clear' | 'submit' }
 *   'status' → { status: 'connected' | 'disconnected' | 'error', error?: string }
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import * as readline from 'node:readline'

export interface BtShutterEvent {
  button: 'big' | 'small'
  action: 'clear' | 'submit'
}

export interface BtShutterStatus {
  status: 'connected' | 'disconnected' | 'error'
  error?: string
}

export interface BtShutterManagerConfig {
  binaryPath: string
  deviceFilter?: { vendorId: number; productId: number }
}

import * as path from 'node:path'

/** Resolve default binary path: packaged app → Resources/bin/, dev → assets/bin/ */
function getDefaultBinaryPath(): string {
  // In packaged app: process.resourcesPath = <app>/Contents/Resources
  // In dev: process.resourcesPath = <project>/node_modules/electron/dist/Electron.app/Contents/Resources
  const resourcePath = path.join(process.resourcesPath, 'bin', 'ab-shutter-bridge')
  // Dev fallback: check project assets
  const devPath = path.join(__dirname, '..', '..', '..', 'assets', 'bin', 'ab-shutter-bridge')
  try {
    require('node:fs').accessSync(resourcePath)
    return resourcePath
  } catch {
    return devPath
  }
}

export class BtShutterManager extends EventEmitter {
  private process: ChildProcess | null = null
  private config: BtShutterManagerConfig

  constructor(config?: Partial<BtShutterManagerConfig>) {
    super()
    this.config = {
      binaryPath: config?.binaryPath ?? getDefaultBinaryPath(),
      deviceFilter: config?.deviceFilter,
    }
  }

  start(): void {
    if (this.process) return

    // Kill any stale ab-shutter-bridge processes (e.g. from previous runs or
    // manual starts without --relay). Only one instance can seize the HID device,
    // so stale processes block our exclusive capture → volume keys leak to macOS.
    try {
      const { execFileSync } = require('child_process')
      const out = execFileSync('pgrep', ['-f', 'ab-shutter-bridge'], { encoding: 'utf-8' }).trim()
      for (const pid of out.split('\n').filter(Boolean)) {
        console.log(`[BtShutter] Killing stale bridge process PID ${pid}`)
        try { process.kill(Number(pid), 'SIGTERM') } catch { /* already gone */ }
      }
    } catch { /* pgrep returns non-zero if no matches — expected */ }

    const args = ['--relay']
    if (this.config.deviceFilter) {
      args.push(
        `0x${this.config.deviceFilter.vendorId.toString(16)}`,
        `0x${this.config.deviceFilter.productId.toString(16)}`,
      )
    }

    console.log(`[BtShutter] Starting: ${this.config.binaryPath} ${args.join(' ')}`)

    try {
      this.process = spawn(this.config.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const msg = (err as Error).message
      console.error('[BtShutter] Spawn failed:', msg)
      this.emit('status', { status: 'error', error: msg } satisfies BtShutterStatus)
      return
    }

    // Parse stdout line-by-line for JSON events
    const rl = readline.createInterface({ input: this.process.stdout! })
    rl.on('line', (line) => {
      try {
        const event = JSON.parse(line) as BtShutterEvent
        if (event.button && event.action) {
          console.log(`[BtShutter] Event: ${event.button} → ${event.action}`)
          this.emit('button', event)
        }
      } catch {
        // Non-JSON line — ignore
      }
    })

    // Log stderr (bridge diagnostic messages)
    const stderrRl = readline.createInterface({ input: this.process.stderr! })
    stderrRl.on('line', (line) => {
      console.log(`[BtShutter:bridge] ${line}`)
      // Detect "Listening..." as connected status
      if (line.includes('Listening')) {
        this.emit('status', { status: 'connected' } satisfies BtShutterStatus)
      }
    })

    this.process.on('error', (err) => {
      console.error('[BtShutter] Process error:', err.message)
      this.emit('status', { status: 'error', error: err.message } satisfies BtShutterStatus)
      this.process = null
    })

    this.process.on('exit', (code) => {
      console.log(`[BtShutter] Process exited with code ${code}`)
      this.emit('status', { status: 'disconnected' } satisfies BtShutterStatus)
      this.process = null
    })
  }

  stop(): void {
    if (!this.process) return
    console.log('[BtShutter] Stopping bridge process')
    this.process.kill('SIGTERM')
    this.process = null
    this.emit('status', { status: 'disconnected' } satisfies BtShutterStatus)
  }

  isRunning(): boolean {
    return this.process !== null
  }

  shutdown(): void {
    this.stop()
    this.removeAllListeners()
  }
}
