// src/main/audit/types.ts — Audit data types (rudimentary, full in Welle 4)

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AuditCategory = 'security' | 'code-quality' | 'documentation' | 'architecture'
export type AuditVerdict = 'release' | 'release-after-fix' | 'blocked'
export type AuditStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface AuditFinding {
  id: string
  runId: string
  severity: AuditSeverity
  category: AuditCategory
  filePath: string
  lineNumber?: number
  description: string
  recommendation: string
}

export interface AuditRun {
  id: string
  scope: string
  started: string
  status: AuditStatus
  findings: AuditFinding[]
  verdict?: AuditVerdict
  rationale?: string
}
