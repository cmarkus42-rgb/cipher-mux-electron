// src/main/testing-assistant/types.ts — Testing Assistant core types and defaults

export type TestingRunStatus =
  | 'pending'
  | 'running_tests'
  | 'quality_audit'
  | 'adversarial'
  | 'owasp'
  | 'off_limits'
  | 'reporting'
  | 'handoff'
  | 'completed'
  | 'failed'

export type FindingSeverity = 'high' | 'medium' | 'low'

export type FindingCategory =
  | 'test-failure'
  | 'implementation-test'
  | 'adversarial'
  | 'owasp'
  | 'off-limits'
  | 'setup-error'

export interface TestingRun {
  id: string
  cyberFactoryRunId: string | null
  welleId: string | null
  status: TestingRunStatus
  startedAt: number
  finishedAt: number | null
  projectPath: string
  workspaceId: string | null
  testCommand: string | null
}

export interface Finding {
  id: string
  runId: string
  severity: FindingSeverity
  category: FindingCategory
  filePath: string | null
  lineNumber: number | null
  description: string
  reproduction: string | null
  suggestion: string | null
}

export interface TestSuiteResult {
  runId: string
  total: number
  passed: number
  failed: number
  rawOutput: string
}

export interface TestQualityReport {
  runId: string
  behavioralCount: number
  implementationCount: number
  problematicTests: string[]
}

export interface TestingAssistantConfig {
  enabled: boolean
  adversarialDepth: 'shallow' | 'standard' | 'deep'
  owaspChecks: boolean
  offLimitsAudit: boolean
  testQualityAudit: boolean
  autoHandoffOnSeverityHigh: boolean
}

export const TESTING_ASSISTANT_DEFAULTS: Readonly<TestingAssistantConfig> = Object.freeze({
  enabled: false,
  adversarialDepth: 'standard',
  owaspChecks: true,
  offLimitsAudit: true,
  testQualityAudit: true,
  autoHandoffOnSeverityHigh: true,
})
