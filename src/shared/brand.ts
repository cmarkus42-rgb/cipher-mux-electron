/**
 * Brand profile loader — externalizes environment-specific paths and defaults.
 *
 * The app name "cipher-mux" is intentionally kept across all profiles. What
 * differs between profiles are paths, defaults, and content configuration —
 * NOT the brand name. This is a deliberate decision so that IPC channels,
 * preload API, and package identity remain stable.
 *
 * Profile resolution: BUILD_PROFILE env → profile.<name>.yaml in project root.
 * Falls back to community defaults if the file is missing (no crash).
 *
 * Pattern inspired by VS Code's product.json + defaults approach.
 */

import * as fs from 'fs'
import * as path from 'path'

/** Typed brand configuration. Extend this interface for new brand values. */
export interface BrandConfig {
  /** Application name — always "cipher-mux" across all profiles. */
  readonly appName: string
  /** Directories to scan for Claude Code projects. Empty = ask user on first run. */
  readonly scanPaths: readonly string[]
  /** Default project directory for new sessions. */
  readonly defaultProjectDir: string
  /** Orchestrator config/state directory. */
  readonly orchestratorDir: string
  /** Cyber Factory config/state directory. */
  readonly cyberFactoryDir: string
  /** Directory for statusLine context JSON files. */
  readonly statusLineDir: string
  /** Path to the projectlauncher working directory. Empty = feature disabled. */
  readonly projectLauncherDir: string
  /** Quality baseline project for launcher prompts. Empty = omitted from prompt. */
  readonly qualityBaselineDir: string
  /** IPC channel prefix — always "cipher-mux". */
  readonly ipcPrefix: string
}

const COMMUNITY_DEFAULTS: BrandConfig = {
  appName: 'cipher-mux',
  scanPaths: [],
  defaultProjectDir: '',
  orchestratorDir: '~/.config/cipher-mux/orchestrator',
  cyberFactoryDir: '~/.config/cipher-mux/cyber-factory',
  statusLineDir: '/tmp/cipher-mux/context',
  projectLauncherDir: '',
  qualityBaselineDir: '',
  ipcPrefix: 'cipher-mux',
}

/**
 * Parse a simple YAML profile file. Supports flat scalars and single-level
 * string arrays (indented `- value` lines). No external YAML library needed.
 */
function parseSimpleYaml(content: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  let currentKey: string | null = null

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd()

    // Skip comments and empty lines
    if (!line || line.startsWith('#')) {
      currentKey = null
      continue
    }

    // Array item: "  - value"
    if (/^\s+-\s+/.test(line) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim()
      const arr = result[currentKey]
      if (Array.isArray(arr)) {
        arr.push(value)
      }
      continue
    }

    // Key-value: "key: value" or "key:"
    const match = line.match(/^(\w+):\s*(.*)$/)
    if (match) {
      const [, key, rawVal] = match
      const val = rawVal.replace(/^["']|["']$/g, '').trim()

      if (val === '[]') {
        result[key] = []
        currentKey = null
      } else if (val === '' || val === undefined) {
        // Might be start of array block
        result[key] = []
        currentKey = key
      } else {
        result[key] = val
        currentKey = null
      }
    }
  }

  return result
}

/** Load and validate a profile from a YAML file path. Returns community defaults on error. */
export function loadProfile(filePath: string): BrandConfig {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const parsed = parseSimpleYaml(content)

    return {
      appName: typeof parsed.appName === 'string' ? parsed.appName : COMMUNITY_DEFAULTS.appName,
      scanPaths: Array.isArray(parsed.scanPaths) ? parsed.scanPaths : COMMUNITY_DEFAULTS.scanPaths,
      defaultProjectDir: typeof parsed.defaultProjectDir === 'string' ? parsed.defaultProjectDir : COMMUNITY_DEFAULTS.defaultProjectDir,
      orchestratorDir: typeof parsed.orchestratorDir === 'string' ? parsed.orchestratorDir : COMMUNITY_DEFAULTS.orchestratorDir,
      cyberFactoryDir: typeof parsed.cyberFactoryDir === 'string' ? parsed.cyberFactoryDir : COMMUNITY_DEFAULTS.cyberFactoryDir,
      statusLineDir: typeof parsed.statusLineDir === 'string' ? parsed.statusLineDir : COMMUNITY_DEFAULTS.statusLineDir,
      projectLauncherDir: typeof parsed.projectLauncherDir === 'string' ? parsed.projectLauncherDir : COMMUNITY_DEFAULTS.projectLauncherDir,
      qualityBaselineDir: typeof parsed.qualityBaselineDir === 'string' ? parsed.qualityBaselineDir : COMMUNITY_DEFAULTS.qualityBaselineDir,
      ipcPrefix: typeof parsed.ipcPrefix === 'string' ? parsed.ipcPrefix : COMMUNITY_DEFAULTS.ipcPrefix,
    }
  } catch {
    return { ...COMMUNITY_DEFAULTS }
  }
}

/** Resolve the profile file path based on BUILD_PROFILE env var. */
function resolveProfilePath(): string {
  const profileName = process.env.BUILD_PROFILE || 'community'
  // Walk up from this file to find project root (where profile files live)
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, `profile.${profileName}.yaml`)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fallback: project root based on typical build output structure
  const projectRoot = path.resolve(__dirname, '..', '..', '..')
  return path.join(projectRoot, `profile.${profileName}.yaml`)
}

/**
 * The active BRAND configuration singleton.
 * Resolved once at module load from BUILD_PROFILE env var.
 */
export const BRAND: BrandConfig = loadProfile(resolveProfilePath())
