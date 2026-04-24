import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AppConfig } from '../../shared/types'
import { createEmptyGrid } from '../../shared/grid-types'
import { deepMerge } from '../util/deep-merge'
import { BRAND } from '../../shared/brand'
import { BUILTIN_PERSONAS, SEED_CUSTOM_PERSONAS, SEED_WORKSPACES } from '../../shared/persona-types'
import {
  DEFAULT_SCAN_DEPTH,
  MAX_SESSIONS,
  MESSAGE_RETENTION_DAYS,
  KICKOFF_TIMEOUT_MIN_DEFAULT,
  MCP_DEFAULT_PORT,
  MCP_DEFAULT_HOST,
  ORCHESTRATOR_MAX_RETRIES,
  TASK_STALL_TIMEOUT_MS,
  TASK_WATCH_INTERVAL_MS,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
} from '../../shared/constants'

const defaults: AppConfig = {
  personas: [...BUILTIN_PERSONAS, ...SEED_CUSTOM_PERSONAS] as AppConfig['personas'],
  workspaces: [...SEED_WORKSPACES] as AppConfig['workspaces'],
  activeWorkspaceId: null,
  app: {
    scanPaths: [...BRAND.scanPaths],
    scanDepth: DEFAULT_SCAN_DEPTH,
    defaultProjectDir: BRAND.defaultProjectDir,
    maxSessions: MAX_SESSIONS,
    messageRetentionDays: MESSAGE_RETENTION_DAYS,
    projectlauncherPath: BRAND.projectLauncherDir,
    kickoffTimeoutMinutes: KICKOFF_TIMEOUT_MIN_DEFAULT,
  },
  mcp: {
    port: MCP_DEFAULT_PORT,
    host: MCP_DEFAULT_HOST,
    apiKey: '',
  },
  orchestrator: {
    dir: BRAND.orchestratorDir,
    maxRetries: ORCHESTRATOR_MAX_RETRIES,
    stallTimeout: TASK_STALL_TIMEOUT_MS,
    watchInterval: TASK_WATCH_INTERVAL_MS,
    defaultHooks: {},
    taskSources: {
      bugreport: {
        enabled: true,
        path: `~/.config/${BRAND.appName}/bugreports/outbox`,
      },
    },
  },
  agent: {
    skipPermissions: false,
  },
  ui: {
    chatroomVisible: false,
    theme: 'cipher-ivory' as const,
    grid: createEmptyGrid(),
  },
  windows: {
    main: { x: 0, y: 0, width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT },
  },
  sidebarDetached: false,
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'cipher-mux-config.json')
}

function migrateConfig(config: AppConfig): AppConfig {
  // Remove Worker built-in persona (removed in v0.9.1)
  if (config.personas) {
    const before = config.personas.length
    config.personas = config.personas.filter((p: any) => p.id !== 'worker') as AppConfig['personas']
    if (config.personas.length !== before) {
      saveConfig(config)
    }
  }
  return config
}

function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    if (!raw.trim()) return { ...defaults }
    return migrateConfig(deepMerge(defaults, JSON.parse(raw)))
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
