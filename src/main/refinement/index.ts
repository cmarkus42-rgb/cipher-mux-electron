// src/main/refinement/index.ts — Re-exports for refinement module

export { auditRequirements, REQUIRED_FIELDS, NFR_CATEGORIES } from './re-audit'
export type { AuditDepth, AuditFinding, AuditResult } from './re-audit'

export { classifyPurpose } from './purpose-check'
export type { UsagePurpose, PurposeResult } from './purpose-check'

export { generateReqIds, formatReqIdMarkdown, formatDetailSpec, validateReqIds } from './req-id-builder'
export type { Requirement, ReqIdEntry } from './req-id-builder'
