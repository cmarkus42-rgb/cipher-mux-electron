/**
 * BtRemoteManager — multi-device BT remote manager.
 *
 * Spawns the bt-remote-bridge binary in --multi mode, loads device profiles,
 * maps HID events to shortcuts, and emits synthetic keyboard events via
 * Electron's webContents.sendInputEvent.
 *
 * Replaces the single-device BtShutterManager.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import * as readline from 'node:readline'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { ProfileLoader, normalizeHex } from './profile-loader'
import type {
  DeviceProfile,
  BridgeHidEvent,
  BridgeDeviceEvent,
  BridgeLegacyEvent,
  ResolvedAction,
  DeviceStatus,
} from './bt-remote-types'

export interface BtRemoteManagerConfig {
  /** Override binary path (default: auto-detect) */
  binaryPath?: string
  /** Profile directory (default: ~/.config/cipher-mux/bt-remotes/) */
  profileDir: string
}

/**
 * Events emitted:
 *   'action'  → ResolvedAction (mapped button press)
 *   'device'  → DeviceStatus (connect/disconnect)
 *   'status'  → { status: 'running' | 'stopped' | 'error', error?: string }
 */
export class BtRemoteManager extends EventEmitter {
  private process: ChildProcess | null = null
  private profileLoader: ProfileLoader
  private profiles: DeviceProfile[] = []
  private connectedDevices: Map<string, DeviceStatus> = new Map()
  private config: BtRemoteManagerConfig
  private binaryPath: string

  constructor(config: BtRemoteManagerConfig) {
    super()
    this.config = config
    this.profileLoader = new ProfileLoader(config.profileDir)
    this.binaryPath = config.binaryPath ?? getDefaultBinaryPath()
  }

  start(): void {
    if (this.process) return

    // Init profiles
    this.profileLoader.init()
    this.profiles = this.profileLoader.loadAll()
    console.log(`[BtRemote] Loaded ${this.profiles.length} device profiles`)

    // Kill stale bridge processes
    this.killStaleProcesses()

    const args = ['--multi']
    console.log(`[BtRemote] Starting: ${this.binaryPath} ${args.join(' ')}`)

    try {
      this.process = spawn(this.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const msg = (err as Error).message
      console.error('[BtRemote] Spawn failed:', msg)
      this.emit('status', { status: 'error', error: msg })
      return
    }

    // Parse stdout line-by-line for JSON events
    const rl = readline.createInterface({ input: this.process.stdout! })
    rl.on('line', (line) => this.handleBridgeLine(line))

    // Log stderr
    const stderrRl = readline.createInterface({ input: this.process.stderr! })
    stderrRl.on('line', (line) => {
      console.log(`[BtRemote:bridge] ${line}`)
      if (line.includes('Listening')) {
        this.emit('status', { status: 'running' })
      }
    })

    this.process.on('error', (err) => {
      console.error('[BtRemote] Process error:', err.message)
      this.emit('status', { status: 'error', error: err.message })
      this.process = null
    })

    this.process.on('exit', (code) => {
      console.log(`[BtRemote] Process exited with code ${code}`)
      this.emit('status', { status: 'stopped' })
      this.process = null
    })
  }

  stop(): void {
    if (!this.process) return
    console.log('[BtRemote] Stopping bridge process')
    this.process.kill('SIGTERM')
    this.process = null
    this.connectedDevices.clear()
    this.emit('status', { status: 'stopped' })
  }

  shutdown(): void {
    this.stop()
    this.removeAllListeners()
  }

  isRunning(): boolean {
    return this.process !== null
  }

  getConnectedDevices(): DeviceStatus[] {
    return Array.from(this.connectedDevices.values())
  }

  getProfiles(): DeviceProfile[] {
    return this.profiles
  }

  /** Reload profiles from disk (e.g. after user edits mapping) */
  reloadProfiles(): void {
    this.profiles = this.profileLoader.loadAll()
  }

  /** Update mapping for a button and reload */
  updateMapping(vid: string, pid: string, buttonId: string, action: string): boolean {
    const ok = this.profileLoader.updateMapping(vid, pid, buttonId, action)
    if (ok) this.reloadProfiles()
    return ok
  }

  /** Resolve a HID event to an action using loaded profiles */
  resolveAction(event: BridgeHidEvent): ResolvedAction {
    const [vid, pid] = event.device.split(':')
    const profile = this.profiles.find(
      p => normalizeHex(p.vendorId) === vid && normalizeHex(p.productId) === pid,
    )

    if (!profile) {
      return { type: 'unmapped', buttonId: 'unknown', deviceId: event.device }
    }

    // Find button by usagePage + usage
    const button = profile.buttons.find(
      b => b.usagePage === event.usagePage && b.usage === event.usage,
    )

    if (!button) {
      return { type: 'unmapped', buttonId: 'unknown', deviceId: event.device }
    }

    const mapping = profile.mapping[button.id]
    if (!mapping || mapping === 'disabled') {
      return { type: 'disabled', buttonId: button.id, deviceId: event.device }
    }
    if (mapping === 'passthrough') {
      return { type: 'passthrough', buttonId: button.id, deviceId: event.device }
    }
    return { type: 'shortcut', combo: mapping, buttonId: button.id, deviceId: event.device }
  }

  private handleBridgeLine(line: string): void {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(line)
    } catch {
      return // non-JSON line
    }

    // Device event?
    if (parsed.event === 'connected' || parsed.event === 'disconnected') {
      this.handleDeviceEvent(parsed as unknown as BridgeDeviceEvent)
      return
    }

    // HID event?
    if (typeof parsed.usagePage === 'number' && typeof parsed.usage === 'number') {
      this.handleHidEvent(parsed as unknown as BridgeHidEvent)
      return
    }

    // Legacy relay event? (backwards compat for AB Shutter with old binary)
    if (typeof parsed.button === 'string' && typeof parsed.action === 'string') {
      this.handleLegacyEvent(parsed as unknown as BridgeLegacyEvent)
    }
  }

  private handleHidEvent(event: BridgeHidEvent): void {
    // Only process press events (value > 0), not releases
    if (event.value <= 0) return

    const action = this.resolveAction(event)
    console.log(`[BtRemote] ${event.device} → ${action.buttonId} → ${action.type}${action.combo ? ` (${action.combo})` : ''}`)
    this.emit('action', action)
  }

  private handleDeviceEvent(event: BridgeDeviceEvent): void {
    const [vid, pid] = event.device.split(':')
    const profile = this.profiles.find(
      p => normalizeHex(p.vendorId) === vid && normalizeHex(p.productId) === pid,
    )

    const status: DeviceStatus = {
      deviceId: event.device,
      profileName: profile?.name ?? event.name ?? 'Unknown',
      connected: event.event === 'connected',
    }

    if (event.event === 'connected') {
      this.connectedDevices.set(event.device, status)
    } else {
      this.connectedDevices.delete(event.device)
    }

    console.log(`[BtRemote] Device ${event.event}: ${status.profileName} (${event.device})`)
    this.emit('device', status)
  }

  private handleLegacyEvent(event: BridgeLegacyEvent): void {
    // Map legacy AB Shutter events to the new action format
    const buttonId = event.button === 'big' ? 'big' : 'small'
    const action: ResolvedAction = {
      type: 'disabled', // AB Shutter buttons handled via legacy sendKeys path
      buttonId,
      deviceId: 'legacy',
    }
    this.emit('action', action)
  }

  private killStaleProcesses(): void {
    try {
      const { execFileSync } = require('child_process')
      const out = execFileSync('pgrep', ['-f', 'bt-remote-bridge|ab-shutter-bridge'], {
        encoding: 'utf-8',
      }).trim()
      for (const pid of out.split('\n').filter(Boolean)) {
        console.log(`[BtRemote] Killing stale bridge process PID ${pid}`)
        try { process.kill(Number(pid), 'SIGTERM') } catch { /* already gone */ }
      }
    } catch { /* pgrep returns non-zero if no matches */ }
  }
}

/** Resolve binary path: packaged app → Resources/bin/, dev → assets/bin/ */
function getDefaultBinaryPath(): string {
  const names = ['bt-remote-bridge', 'ab-shutter-bridge']

  // Packaged app
  for (const name of names) {
    const p = path.join(process.resourcesPath, 'bin', name)
    try { fs.accessSync(p); return p } catch { /* not found */ }
  }

  // Dev mode
  try {
    const { app } = require('electron')
    for (const name of names) {
      const p = path.join(app.getAppPath(), 'assets', 'bin', name)
      try { fs.accessSync(p); return p } catch { /* not found */ }
    }
  } catch { /* no electron */ }

  // Fallback
  return path.join(__dirname, '..', '..', '..', 'assets', 'bin', 'bt-remote-bridge')
}

/**
 * Parse a shortcut combo string (e.g. "Cmd+Shift+W") into Electron input event modifiers.
 * Returns { keyCode, modifiers } for use with webContents.sendInputEvent.
 */
export function parseComboForElectron(combo: string): {
  keyCode: string
  modifiers: string[]
} {
  const parts = combo.split('+')
  const modifiers: string[] = []
  let keyCode = ''

  for (const part of parts) {
    const lower = part.toLowerCase().trim()
    if (lower === 'cmd' || lower === 'meta') modifiers.push('meta')
    else if (lower === 'shift') modifiers.push('shift')
    else if (lower === 'ctrl' || lower === 'control') modifiers.push('control')
    else if (lower === 'alt' || lower === 'option') modifiers.push('alt')
    else keyCode = part // last non-modifier part is the key
  }

  return { keyCode, modifiers }
}
