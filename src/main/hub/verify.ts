/**
 * REQ-HUB-005 · mux_hub_verify — Smoke-test in the hub.
 *
 * - Installs dependencies, runs build and tests
 * - Stack detection for build/test commands
 * - Writes verify-log to migrations/<projectName>/
 * - Gate before release: readyForRelease only if all green
 */

import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { projectDir, projectMigrationsDir, dateSuffix } from './hub-paths'
import { updateStatus, getEntry } from './archiv-verweis'
import { getEnhancedPath } from '../util/exec-util'
import type { VerifyOptions, VerifyResult, StackInfo, RuntimeKind } from './types'

/**
 * Detect the project stack from manifest files.
 */
export function detectStack(projPath: string): StackInfo {
  // Node.js
  if (fs.existsSync(path.join(projPath, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(projPath, 'package.json'), 'utf-8'))
    const scripts = pkg.scripts ?? {}
    return {
      runtime: 'node',
      manifest: 'package.json',
      installCommand: fs.existsSync(path.join(projPath, 'package-lock.json')) ? 'npm ci' : 'npm install',
      buildCommand: scripts.build ? 'npm run build' : null,
      testCommand: scripts.test ? 'npm run test' : null,
    }
  }

  // Python
  if (fs.existsSync(path.join(projPath, 'pyproject.toml')) || fs.existsSync(path.join(projPath, 'requirements.txt'))) {
    const manifest = fs.existsSync(path.join(projPath, 'pyproject.toml')) ? 'pyproject.toml' : 'requirements.txt'
    return {
      runtime: 'python',
      manifest,
      installCommand: manifest === 'pyproject.toml' ? 'pip install -e .' : 'pip install -r requirements.txt',
      buildCommand: null,
      testCommand: 'pytest',
    }
  }

  // Rust
  if (fs.existsSync(path.join(projPath, 'Cargo.toml'))) {
    return {
      runtime: 'rust',
      manifest: 'Cargo.toml',
      installCommand: null,
      buildCommand: 'cargo build',
      testCommand: 'cargo test',
    }
  }

  // Go
  if (fs.existsSync(path.join(projPath, 'go.mod'))) {
    return {
      runtime: 'go',
      manifest: 'go.mod',
      installCommand: 'go mod download',
      buildCommand: 'go build ./...',
      testCommand: 'go test ./...',
    }
  }

  return {
    runtime: 'unknown',
    manifest: '',
    installCommand: null,
    buildCommand: null,
    testCommand: null,
  }
}

/**
 * Run a shell command and capture output.
 */
function runShellCommand(command: string, cwd: string, timeout = 300_000): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('/bin/sh', ['-c', command], {
      cwd,
      timeout,
      env: { ...process.env, PATH: getEnhancedPath() },
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      resolve({
        success: !err,
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() ?? '',
      })
    })
  })
}

/**
 * Parse test result counts from stdout (best-effort).
 */
function parseTestCounts(stdout: string, runtime: RuntimeKind): { passed: number; failed: number } {
  // Node.js test runner: "# tests 858" / "# pass 858" / "# fail 0"
  if (runtime === 'node') {
    const passMatch = stdout.match(/# pass\s+(\d+)/i) ?? stdout.match(/(\d+)\s+passing/i)
    const failMatch = stdout.match(/# fail\s+(\d+)/i) ?? stdout.match(/(\d+)\s+failing/i)
    return {
      passed: passMatch ? parseInt(passMatch[1], 10) : 0,
      failed: failMatch ? parseInt(failMatch[1], 10) : 0,
    }
  }

  // pytest: "5 passed, 2 failed"
  if (runtime === 'python') {
    const passMatch = stdout.match(/(\d+)\s+passed/)
    const failMatch = stdout.match(/(\d+)\s+failed/)
    return {
      passed: passMatch ? parseInt(passMatch[1], 10) : 0,
      failed: failMatch ? parseInt(failMatch[1], 10) : 0,
    }
  }

  // Rust: "test result: ok. 10 passed; 0 failed"
  if (runtime === 'rust') {
    const match = stdout.match(/(\d+)\s+passed;\s*(\d+)\s+failed/)
    return {
      passed: match ? parseInt(match[1], 10) : 0,
      failed: match ? parseInt(match[2], 10) : 0,
    }
  }

  // Go: "ok" lines vs "FAIL" lines
  if (runtime === 'go') {
    const okCount = (stdout.match(/^ok\s/gm) ?? []).length
    const failCount = (stdout.match(/^FAIL\s/gm) ?? []).length
    return { passed: okCount, failed: failCount }
  }

  return { passed: 0, failed: 0 }
}

/**
 * Write the verify log.
 */
function writeVerifyLog(
  projectName: string,
  stack: StackInfo,
  installResult: { success: boolean; stdout: string; stderr: string } | null,
  buildResult: { success: boolean; stdout: string; stderr: string } | null,
  testResult: { success: boolean; stdout: string; stderr: string } | null,
): string {
  const migDir = projectMigrationsDir(projectName)
  fs.mkdirSync(migDir, { recursive: true })

  const logPath = path.join(migDir, `verify-log-${dateSuffix()}.md`)
  const lines: string[] = [
    `# Verify-Log: ${projectName}`,
    '',
    `Datum: ${new Date().toISOString()}`,
    `Stack: ${stack.runtime} (${stack.manifest})`,
    '',
  ]

  if (installResult) {
    lines.push('## Install', '')
    lines.push(`Status: ${installResult.success ? 'OK' : 'FAILED'}`)
    lines.push(`Command: ${stack.installCommand}`)
    if (!installResult.success) {
      lines.push('', '```', installResult.stderr.slice(0, 2000), '```')
    }
    lines.push('')
  }

  if (buildResult) {
    lines.push('## Build', '')
    lines.push(`Status: ${buildResult.success ? 'OK' : 'FAILED'}`)
    lines.push(`Command: ${stack.buildCommand}`)
    if (!buildResult.success) {
      lines.push('', '```', buildResult.stderr.slice(0, 2000), '```')
    }
    lines.push('')
  }

  if (testResult) {
    lines.push('## Tests', '')
    lines.push(`Status: ${testResult.success ? 'OK' : 'FAILED'}`)
    lines.push(`Command: ${stack.testCommand}`)
    if (!testResult.success) {
      lines.push('', '```', (testResult.stderr || testResult.stdout).slice(0, 3000), '```')
    }
    lines.push('')
  }

  fs.writeFileSync(logPath, lines.join('\n'), 'utf-8')
  return logPath
}

/**
 * Run build and test verification in the hub project.
 */
export async function hubVerify(options: VerifyOptions): Promise<VerifyResult> {
  const { projectName, installDeps = true, runBuild = true, runTests = true } = options
  const projPath = projectDir(projectName)

  if (!fs.existsSync(projPath)) {
    throw new Error(`Projekt nicht im Hub gefunden: ${projPath}`)
  }

  const stack = detectStack(projPath)
  if (stack.runtime === 'unknown') {
    throw new Error('Stack nicht erkannt. Bitte Build-Befehl manuell angeben.')
  }

  let installResult: { success: boolean; stdout: string; stderr: string } | null = null
  let buildResult: { success: boolean; stdout: string; stderr: string } | null = null
  let testResult: { success: boolean; stdout: string; stderr: string } | null = null

  // Install
  if (installDeps && stack.installCommand) {
    installResult = await runShellCommand(stack.installCommand, projPath)
  }

  // Build
  if (runBuild && stack.buildCommand) {
    buildResult = await runShellCommand(stack.buildCommand, projPath)
  }

  // Tests
  if (runTests && stack.testCommand) {
    testResult = await runShellCommand(stack.testCommand, projPath, 600_000)
  }

  const testCounts = testResult
    ? parseTestCounts(testResult.stdout + testResult.stderr, stack.runtime)
    : { passed: 0, failed: 0 }

  const verifyLogPath = writeVerifyLog(projectName, stack, installResult, buildResult, testResult)

  const installSuccess = installResult ? installResult.success : null
  const buildSuccess = buildResult ? buildResult.success : null
  const testSuccess = testResult ? testResult.success : null

  const readyForRelease =
    (installSuccess === null || installSuccess) &&
    (buildSuccess === null || buildSuccess) &&
    (testSuccess === null || testSuccess)

  // Update status if all green
  if (readyForRelease) {
    await updateStatus(projectName, 'migriert-getestet')
  }

  return {
    installSuccess,
    buildSuccess,
    testSuccess,
    testsPassed: testCounts.passed,
    testsFailed: testCounts.failed,
    verifyLogPath,
    readyForRelease,
  }
}
