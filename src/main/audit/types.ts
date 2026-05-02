// src/main/audit/types.ts — Audit full types (Welle 4)

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AuditCategory = 'security' | 'code-quality' | 'documentation' | 'architecture' | 'cognitive-debt'
export type AuditVerdict = 'release' | 'release-after-fix' | 'blocked'
export type AuditStatus = 'pending' | 'reading-diff' | 'code-review' | 'security-audit' | 'adr-check' | 'cognitive-debt' | 'reporting' | 'completed' | 'failed'
export type AuditScope = 'welle' | 'komplett' | 'modul'

export interface AuditFinding {
  id: string
  runId: string
  severity: AuditSeverity
  category: AuditCategory
  filePath: string | null
  lineNumber: number | null
  description: string
  recommendation: string
}

export interface CognitiveDebtNote {
  id: string
  runId: string
  area: string
  suggestion: string
  lineCount: number | null
}

export interface ReleaseRecommendation {
  runId: string
  verdict: AuditVerdict
  rationale: string
  highCount: number
  mediumCount: number
  lowCount: number
}

export interface AuditRun {
  id: string
  scope: AuditScope
  scopeDetail: string | null
  startedAt: number
  finishedAt: number | null
  status: AuditStatus
  projectPath: string
  workspaceId: string | null
}

export interface AuditConfig {
  enabled: boolean
  scopeDefault: AuditScope
  owaspDepth: 'spotcheck' | 'full'
  cognitiveDebtThreshold: number
  blockOnHighSeverity: boolean
}

export const AUDIT_DEFAULTS: Readonly<AuditConfig> = Object.freeze({
  enabled: false,
  scopeDefault: 'welle',
  owaspDepth: 'full',
  cognitiveDebtThreshold: 5,
  blockOnHighSeverity: true,
})
