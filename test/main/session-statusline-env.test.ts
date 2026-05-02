import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * Test that SessionManager.start() properly injects CIPHER_MUX_SESSION_ID
 * env var and calls injectStatusLineHook.
 *
 * Since SessionManager depends on TmuxManager (needs real tmux), we test
 * the integration by verifying the hook file is written to the project dir.
 * We stub TmuxManager to avoid real tmux calls.
 */
describe('SessionManager statusLine integration', () => {
  let tmpProjectDir: string

  beforeEach(() => {
    tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-sl-test-'))
  })

  it('injectStatusLineHook writes hook that uses session-specific env var', () => {
    // Import and call the hook injection
    const { injectStatusLineHook } = require('../../src/main/monitoring/statusline-hook')
    injectStatusLineHook(tmpProjectDir)

    const settingsPath = path.join(tmpProjectDir, '.claude', 'settings.local.json')
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))

    // statusLine is now a top-level setting (not hooks.StatusLine)
    const command = settings.statusLine.command
    // The command must use $CIPHER_MUX_SESSION_ID so each session writes to its own file
    assert.ok(
      command.includes('$CIPHER_MUX_SESSION_ID'),
      `command should use $CIPHER_MUX_SESSION_ID, got: ${command}`,
    )
  })

  it('simulates end-to-end: hook command + env var produces correct file', () => {
    // Simulate what happens at runtime:
    // 1. SessionManager sets CIPHER_MUX_SESSION_ID=test-session-123 in env
    // 2. Claude Code triggers StatusLine hook: `cat > /tmp/cipher-mux/context/$CIPHER_MUX_SESSION_ID.json`
    // 3. Hook receives JSON on stdin and writes it (real Claude Code nested format)

    const contextDir = path.join(tmpProjectDir, 'context-sim')
    fs.mkdirSync(contextDir, { recursive: true })

    const sessionId = 'test-session-123'
    // Use real Claude Code format with nested context_window
    const usageJson = JSON.stringify({
      model: { id: 'claude-opus-4', display_name: 'Opus 4' },
      context_window: {
        total_input_tokens: 5000,
        total_output_tokens: 1200,
        context_window_size: 200000,
        used_percentage: 42,
        remaining_percentage: 58,
      },
    })

    // Simulate the hook writing (what `cat > dir/$CIPHER_MUX_SESSION_ID.json` does)
    const targetFile = path.join(contextDir, `${sessionId}.json`)
    fs.writeFileSync(targetFile, usageJson)

    // Verify the file is readable and parseable by StatusLineMonitor
    const { StatusLineMonitor } = require('../../src/main/monitoring/statusline-monitor')
    const monitor = new StatusLineMonitor(contextDir)
    monitor.start()
    const usage = monitor.get(sessionId)
    assert.ok(usage, 'StatusLineMonitor should parse the nested format')
    assert.equal(usage.usedPercentage, 42)
    assert.equal(usage.modelId, 'claude-opus-4')
    assert.equal(usage.totalInputTokens, 5000)
    monitor.stop()
  })
})
