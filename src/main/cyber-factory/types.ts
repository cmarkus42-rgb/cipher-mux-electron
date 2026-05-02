/** Cyber Factory — core types and defaults */

// ─── Status Enums ─────────────────────────────────────────

export type CyberFactoryRunStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type WelleStatus = 'pending' | 'running' | 'completed' | 'failed'

export type SubProjektStatus =
  | 'pending'
  | 'running'
  | 'stuck'
  | 'completed'
  | 'failed'
  | 'escalated'

export type EscalationLevel = 1 | 2 | 3 | 4 | 5

export type ModelChoice = 'haiku' | 'sonnet' | 'opus'

// ─── Model Routing ─────────────────────────────────────────

export interface ModelRoutingConfig {
  trivial: ModelChoice
  boilerplate: ModelChoice
  tests: ModelChoice
  docs: ModelChoice
  refactor: ModelChoice
  business_logic: ModelChoice
  bug_fix: ModelChoice
  architecture: ModelChoice
  high_risk_domain: ModelChoice
  audit_full: ModelChoice
  adversarial: ModelChoice
}

// ─── Stuck Detection ──────────────────────────────────────

export interface StuckDetectionConfig {
  heartbeatTimeoutMs: number
  outputPlateauMs: number
  minOutputCharsInPlateau: number
}

// ─── Cyber Factory Config ─────────────────────────────────

export interface CyberFactoryConfig {
  enabled: boolean
  maxParallelWorkers: number
  defaultRetries: number
  monitoringIntervalMs: number
  budgetMultiplier: number
  budgetEscalationThreshold: number
  budgetAutoPauseThreshold: number
  modelRouting: ModelRoutingConfig
  stuckDetection: StuckDetectionConfig
}

// ─── Run ──────────────────────────────────────────────────

export interface CyberFactoryRun {
  id: string
  detailSpecPath: string
  projectPath: string
  workspaceId: string | null
  status: CyberFactoryRunStatus
  startedAt: number
  finishedAt: number | null
  config: CyberFactoryConfig | null
}

// ─── Welle ────────────────────────────────────────────────

export interface Welle {
  id: string
  runId: string
  reihenfolge: number
  status: WelleStatus
  startedAt: number | null
  finishedAt: number | null
}

// ─── SubProjekt ───────────────────────────────────────────

export interface SubProjekt {
  id: string
  welleId: string
  name: string
  auftragPath: string | null
  model: ModelChoice | null
  tokenBudget: number | null
  status: SubProjektStatus
  tmuxSession: string | null
  sessionId: string | null
  currentPhase: string | null
  lastHeartbeat: number | null
}

// ─── Risk Review ──────────────────────────────────────────

export interface RiskReview {
  runId: string
  workerId: string
  date: string
  changedFiles: string[]
  deletedFiles: string[]
  newDependencies: string[]
  potentialBreakage: string[]
  offLimitsStatus: string
  testsStatus: string
  schemaChanges: string
  apiChanges: string
}

// ─── Diagnose Report ──────────────────────────────────────

export interface DiagnoseReport {
  runId: string
  timestamp: number
  runStatus: CyberFactoryRunStatus
  wellenStatus: WelleStatus[]
  workerStatus: SubProjektStatus[]
  escalationBacklog: EscalationLevel[]
}

// ─── Defaults ─────────────────────────────────────────────

export const CYBER_FACTORY_DEFAULTS: CyberFactoryConfig = {
  enabled: true,
  maxParallelWorkers: 5,
  defaultRetries: 2,
  monitoringIntervalMs: 300_000,
  budgetMultiplier: 1.0,
  budgetEscalationThreshold: 0.8,
  budgetAutoPauseThreshold: 0.95,
  modelRouting: {
    trivial: 'haiku',
    boilerplate: 'haiku',
    tests: 'haiku',
    docs: 'haiku',
    refactor: 'sonnet',
    business_logic: 'sonnet',
    bug_fix: 'sonnet',
    architecture: 'opus',
    high_risk_domain: 'opus',
    audit_full: 'opus',
    adversarial: 'sonnet',
  },
  stuckDetection: {
    heartbeatTimeoutMs: 7 * 60 * 1000,
    outputPlateauMs: 3 * 60 * 1000,
    minOutputCharsInPlateau: 100,
  },
}
