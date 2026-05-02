/** Debugger — core types and defaults */

// --- Status Enums ---

export type DebuggerRunStatus =
  | 'intake'
  | 'clarifying'
  | 'planning'
  | 'confirmed'
  | 'worker_running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ClarificationStatus = 'pending' | 'answered'

export type FixPlanStatus = 'draft' | 'confirmed' | 'rejected'

export type Severity = 'high' | 'medium' | 'low'

// --- Data Models ---

export interface DebuggerRun {
  id: string
  bugReportId: string | null
  source: 'testing-assistant' | 'bugreport' | 'manual'
  severity: Severity
  description: string
  status: DebuggerRunStatus
  retryCount: number
  startedAt: number
  finishedAt: number | null
  projectPath: string
  workspaceId: string | null
}

export interface Clarification {
  id: string
  runId: string
  question: string
  options: string[] | null
  answer: string | null
  status: ClarificationStatus
  createdAt: number
  resolvedAt: number | null
}

export interface FixPlan {
  id: string
  runId: string
  hypothesis: string
  confidenceLevel: 'sure' | 'likely' | 'uncertain'
  planMd: string
  testExtension: string
  riskAssessment: string
  effort: 'trivial' | 'small' | 'medium' | 'large'
  status: FixPlanStatus
  userConfirmed: boolean
  createdAt: number
}

export interface FindingsIntake {
  symptom: string
  reproduction: string
  severity: Severity
  suspectedCause: string | null
  affectedAreas: string[]
  source: 'testing-assistant' | 'bugreport' | 'manual'
  bugReportId?: string
}

// --- Config ---

export interface DebuggerConfig {
  enabled: boolean
  maxRetries: number
  qualityGate: 'strict' | 'permissive'
  walkthroughDefaultOffer: boolean
}

export const DEBUGGER_DEFAULTS: Readonly<DebuggerConfig> = Object.freeze({
  enabled: false,
  maxRetries: 2,
  qualityGate: 'strict',
  walkthroughDefaultOffer: true,
})
