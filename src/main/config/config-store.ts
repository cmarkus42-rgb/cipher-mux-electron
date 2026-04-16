import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AppConfig } from '../../shared/types'
import {
  DEFAULT_SCAN_PATHS,
  DEFAULT_SCAN_DEPTH,
  DEFAULT_PROJECT_DIR,
  MAX_SESSIONS,
  MESSAGE_RETENTION_DAYS,
  MCP_DEFAULT_PORT,
  MCP_DEFAULT_HOST,
  ORCHESTRATOR_DIR,
  ORCHESTRATOR_MAX_RETRIES,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
} from '../../shared/constants'

const defaults: AppConfig = {
  app: {
    scanPaths: DEFAULT_SCAN_PATHS,
    scanDepth: DEFAULT_SCAN_DEPTH,
    defaultProjectDir: DEFAULT_PROJECT_DIR,
    maxSessions: MAX_SESSIONS,
    messageRetentionDays: MESSAGE_RETENTION_DAYS,
  },
  mcp: {
    port: MCP_DEFAULT_PORT,
    host: MCP_DEFAULT_HOST,
    apiKey: '',
  },
  orchestrator: {
    dir: ORCHESTRATOR_DIR,
    maxRetries: ORCHESTRATOR_MAX_RETRIES,
  },
  ui: {
    chatroomVisible: false,
    activeView: 'cockpit',
    layout: {
      root: null,
      activePaneId: null,
    },
  },
  windows: {
    main: { x: 0, y: 0, width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT },
  },
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'cipher-mux-config.json')
}

function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return { ...defaults }
  }
}

function saveConfig(config: AppConfig): void {
  const dir = path.dirname(getConfigPath())
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

let cached: AppConfig | null = null

function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig()
  }
  return cached
}

export const configStore = {
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return getConfig()[key]
  },

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    const config = getConfig()
    config[key] = value
    cached = config
    saveConfig(config)
  },

  getAll(): AppConfig {
    return { ...getConfig() }
  },

  reset(): void {
    cached = { ...defaults }
    saveConfig(cached)
  },
}
