import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { AppConfig, Character } from '../../shared/types'
import { createEmptyGrid } from '../../shared/grid-types'
import { deepMerge } from '../util/deep-merge'
import { BRAND } from '../../shared/brand'
import { A11Y_DEFAULTS } from '../a11y/a11y-config'
import { BUILTIN_PERSONAS, SEED_CUSTOM_PERSONAS, SEED_WORKSPACES } from '../../shared/persona-types'
import { SEED_CHARACTERS, DEFAULT_CHARACTER_ID, assignCharacterColor } from '../character/character-defaults'
import { DEBUGGER_DEFAULTS } from '../debugger/types'
import { TESTING_ASSISTANT_DEFAULTS } from '../testing-assistant/types'
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
  defaultWorkspaceId: null,
  activeCharacterId: DEFAULT_CHARACTER_ID,
  globalActivePersonaId: null,
  characters: [...SEED_CHARACTERS],
  globalRules: '',
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
  llm: {
    ollamaHost: '127.0.0.1',
    ollamaPort: 11434,
    ollamaModel: 'gemma4:26b',
    bugreportEnrichBackend: 'cloud' as const,
  },
  ui: {
    chatroomVisible: false,
    theme: 'cipher-ivory' as const,
    grid: createEmptyGrid(),
    language: 'en' as const,
  },
  windows: {
    main: { x: 0, y: 0, width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT },
  },
  btShutter: {
    enabled: false,
  },
  refinement: {
    enabled: true,
    hardwiredOutputFormat: 'cyber-factory' as const,
    reAuditDepth: 'standard' as const,
    ossLicenseSondierungEnabled: true,
  },
  ideation_partner: {
    enabled: true,
    brainBaseDir: `${os.homedir()}/.config/cipher-mux/ideations`,
    skillsDir: `${os.homedir()}/.config/cipher-mux/skills/ideation`,
    subAgentUnsicherheitspflicht: true,
  },
  cyber_factory: {
    enabled: true,
    maxParallelWorkers: 5,
    defaultRetries: 2,
    monitoringIntervalMs: 300000,
    budgetMultiplier: 1.0,
    budgetEscalationThreshold: 0.8,
    budgetAutoPauseThreshold: 0.95,
    modelRouting: {
      trivial: 'haiku', boilerplate: 'haiku', tests: 'haiku', docs: 'haiku',
      refactor: 'sonnet', business_logic: 'sonnet', bug_fix: 'sonnet',
      architecture: 'opus', high_risk_domain: 'opus', audit_full: 'opus', adversarial: 'sonnet',
    },
    stuckDetection: {
      heartbeatTimeoutMs: 420000, outputPlateauMs: 180000, minOutputCharsInPlateau: 100,
    },
  },
  debugger: { ...DEBUGGER_DEFAULTS, enabled: true },
  testing_assistant: {
    enabled: true,
    adversarialDepth: 'standard' as const,
    owaspChecks: true,
    offLimitsAudit: true,
    testQualityAudit: true,
    autoHandoffOnSeverityHigh: true,
  },
  audit_config: {
    enabled: true,
    scopeDefault: 'welle' as const,
    owaspDepth: 'full' as const,
    cognitiveDebtThreshold: 5,
    blockOnHighSeverity: true,
  },
  bugreport_preset: {
    provider: 'haiku' as const,
  },
  experimental: {
    refinement_v2: true,
    ideation_partner: true,
    cyber_factory: true,
    testing_assistant: true,
    audit_full: true,
  },
  memory: {
    enabled: true,
    ftsEnabled: true,
    retentionDays: 365,
    sessionScopeAutoDelete: true,
    archiveOnWorkspaceDelete: true,
  },
  entitySortOrders: {} as Record<string, number>,
  entityHidden: {} as Record<string, boolean>,
  entityPersonaOverrides: {} as Record<string, string>,
  voiceSubmitMode: 'auto' as const,
  sidebarDetached: false,
  sidebarWindowBounds: null as { x: number; y: number; width: number; height: number } | null,
  sidebarCollapsed: {} as Record<string, boolean>,
  a11y: { ...A11Y_DEFAULTS },
  presetMigrationDone: false,
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'cipher-mux-config.json')
}

function migrateConfig(config: AppConfig): AppConfig {
  let changed = false

  // Remove Worker built-in persona (removed in v0.9.1)
  if (config.personas) {
    const before = config.personas.length
    config.personas = config.personas.filter((p: any) => p.id !== 'worker') as AppConfig['personas']
    if (config.personas.length !== before) changed = true
  }

  // Add missing seed characters (Welle 1a: 6 personas from Pack spec)
  if (config.characters) {
    const existingIds = new Set(config.characters.map(c => c.id))
    for (const seed of SEED_CHARACTERS) {
      if (!existingIds.has(seed.id)) {
        config.characters.push({ ...seed })
        changed = true
      }
    }
    // Migrate: assign colors to characters that don't have one yet
    const usedColors: string[] = config.characters.filter(c => c.color).map(c => c.color)
    for (const c of config.characters) {
      if (!c.color) {
        const seed = SEED_CHARACTERS.find(s => s.id === c.id)
        c.color = seed?.color ?? assignCharacterColor(usedColors)
        usedColors.push(c.color)
        changed = true
      }
    }
  }

  if (changed) saveConfig(config)
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
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
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
