// src/main/testing-assistant/test-runner.ts
import { execFileSync } from 'child_process'
import type { TestSuiteResult } from './types'

export interface TestRunnerOpts {
  projectPath: string
  testCommand: string
  timeoutMs?: number
}

export interface TestRunnerResult {
  success: boolean
  suiteResult: TestSuiteResult | null
  error: string | null
}

/**
 * Parse common test runner output formats (Vitest, Jest, node:test).
 */
export function parseTestOutput(raw: string): { total: number; passed: number; failed: number } {
  // Vitest/Jest: "Tests  X passed | Y failed | Z total"
  const vitestMatch = raw.match(/Tests\s+(\d+)\s+passed\s*\|\s*(\d+)\s+failed\s*\|\s*(\d+)\s+total/i)
  if (vitestMatch) {
    return { passed: parseInt(vitestMatch[1]), failed: parseInt(vitestMatch[2]), total: parseInt(vitestMatch[3]) }
  }

  // node:test: "# tests N" + "# pass N" + "# fail N"
  const nodeTotal = raw.match(/# tests\s+(\d+)/)?.[1]
  const nodePass = raw.match(/# pass\s+(\d+)/)?.[1]
  const nodeFail = raw.match(/# fail\s+(\d+)/)?.[1]
  if (nodeTotal) {
    const total = parseInt(nodeTotal)
    const passed = nodePass ? parseInt(nodePass) : 0
    const failed = nodeFail ? parseInt(nodeFail) : 0
    return { total, passed, failed }
  }

  // Jest alternative: "Tests: X passed, Y failed, Z total"
  const jestMatch = raw.match(/Tests:\s+(\d+)\s+passed,?\s*(\d+)?\s*failed?,?\s*(\d+)\s+total/i)
  if (jestMatch) {
    return { passed: parseInt(jestMatch[1]), failed: parseInt(jestMatch[2] || '0'), total: parseInt(jestMatch[3]) }
  }

  // Fallback: count common pass/fail indicators
  const passLines = (raw.match(/\u2713|# pass|ok \d/gi) || []).length
  const failLines = (raw.match(/\u2717|# fail|not ok \d/gi) || []).length
  return { total: passLines + failLines, passed: passLines, failed: failLines }
}

/**
 * Execute the test suite for a project.
 */
export function runTestSuite(opts: TestRunnerOpts, runId: string): TestRunnerResult {
  const timeout = opts.timeoutMs ?? 120_000
  const shell = process.platform === 'win32' ? 'cmd' : '/bin/sh'
  const shellArgs = process.platform === 'win32' ? ['/c', opts.testCommand] : ['-c', opts.testCommand]

  try {
    const raw = execFileSync(shell, shellArgs, {
      cwd: opts.projectPath,
      timeout,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    })
    const counts = parseTestOutput(raw)
    return {
      success: counts.failed === 0,
      suiteResult: { runId, ...counts, rawOutput: raw.slice(0, 50_000) },
      error: null,
    }
  } catch (err: any) {
    const raw = (err.stdout || '') + '\n' + (err.stderr || '')
    const counts = parseTestOutput(raw)
    if (counts.total > 0) {
      return {
        success: false,
        suiteResult: { runId, ...counts, rawOutput: raw.slice(0, 50_000) },
        error: null,
      }
    }
    return { success: false, suiteResult: null, error: raw.slice(0, 5000) || err.message }
  }
}
