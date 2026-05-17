/**
 * ProfileLoader — reads/writes DeviceProfile JSON files from the bt-remotes directory.
 * On first use, copies default profiles (AB Shutter, Satechi R2) if they don't exist.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { DeviceProfile } from './bt-remote-types'

const DEFAULT_PROFILES_DIR = path.join(__dirname, 'default-profiles')

export class ProfileLoader {
  private profileDir: string

  constructor(profileDir: string) {
    this.profileDir = profileDir
  }

  /** Ensure profile dir exists and seed defaults if missing */
  init(): void {
    fs.mkdirSync(this.profileDir, { recursive: true })
    this.seedDefaults()
  }

  /** Load all profiles from disk */
  loadAll(): DeviceProfile[] {
    if (!fs.existsSync(this.profileDir)) return []
    const files = fs.readdirSync(this.profileDir).filter(f => f.endsWith('.json'))
    const profiles: DeviceProfile[] = []
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.profileDir, file), 'utf-8')
        const profile = JSON.parse(raw) as DeviceProfile
        if (profile.vendorId && profile.productId && profile.buttons) {
          profiles.push(profile)
        }
      } catch (err) {
        console.error(`[ProfileLoader] Failed to load ${file}:`, (err as Error).message)
      }
    }
    return profiles
  }

  /** Find profile matching a device vid:pid */
  findByDevice(vid: string, pid: string): DeviceProfile | undefined {
    const profiles = this.loadAll()
    return profiles.find(p => normalizeHex(p.vendorId) === normalizeHex(vid)
                            && normalizeHex(p.productId) === normalizeHex(pid))
  }

  /** Save a profile (overwrites existing file for same device) */
  save(profile: DeviceProfile): void {
    fs.mkdirSync(this.profileDir, { recursive: true })
    const fileName = profileFileName(profile)
    fs.writeFileSync(path.join(this.profileDir, fileName), JSON.stringify(profile, null, 2) + '\n')
  }

  /** Update mapping for a specific button in a profile */
  updateMapping(vid: string, pid: string, buttonId: string, action: string): boolean {
    const profile = this.findByDevice(vid, pid)
    if (!profile) return false
    profile.mapping[buttonId] = action
    this.save(profile)
    return true
  }

  /** Copy default profiles if user has none */
  private seedDefaults(): void {
    let defaultDir: string
    try {
      // Check paths in order: __dirname (dev), extraResources (packaged), cwd fallback
      const candidates = [
        DEFAULT_PROFILES_DIR,
        path.join(process.resourcesPath, 'bt-remote-profiles'),
        path.join(process.cwd(), 'src', 'main', 'bluetooth', 'default-profiles'),
      ]
      const found = candidates.find(p => fs.existsSync(p))
      if (found) {
        defaultDir = found
      } else {
        return
      }
    } catch {
      return
    }

    const defaults = fs.readdirSync(defaultDir).filter(f => f.endsWith('.json'))
    for (const file of defaults) {
      const target = path.join(this.profileDir, file)
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(defaultDir, file), target)
        console.log(`[ProfileLoader] Seeded default profile: ${file}`)
      }
    }
  }
}

/** Normalize hex string for comparison: "0x1915" → "1915", "1915" → "1915" */
export function normalizeHex(hex: string): string {
  return hex.toLowerCase().replace(/^0x/, '')
}

/** Generate a stable filename from profile */
function profileFileName(profile: DeviceProfile): string {
  const name = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
  return `${name}.json`
}
