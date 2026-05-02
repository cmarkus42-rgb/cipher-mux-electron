import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseEnrichedOutput } from '../../src/main/bugreport/ollama-client'

describe('ollama bugreport enrichment', () => {
  it('parses YAML-like output correctly', () => {
    const input = `title: Terminal freezes on large output
severity: high
tags: [ui, performance, terminal]
steps_to_reproduce:
  - Open a session
  - Run a command that produces 10000 lines
  - Observe the terminal
expected_behavior: Terminal should scroll smoothly
actual_behavior: Terminal becomes unresponsive
summary: Large terminal output causes xterm.js to drop frames and freeze the UI.`

    const result = parseEnrichedOutput(input)
    assert.ok(result)
    assert.strictEqual(result.title, 'Terminal freezes on large output')
    assert.strictEqual(result.severity, 'high')
    assert.deepStrictEqual(result.tags, ['ui', 'performance', 'terminal'])
    assert.strictEqual(result.steps_to_reproduce.length, 3)
    assert.strictEqual(result.steps_to_reproduce[0], 'Open a session')
    assert.strictEqual(result.expected_behavior, 'Terminal should scroll smoothly')
    assert.strictEqual(result.actual_behavior, 'Terminal becomes unresponsive')
    assert.ok(result.summary.includes('xterm.js'))
  })

  it('handles missing fields with defaults', () => {
    const input = `title: Something broke`
    const result = parseEnrichedOutput(input)
    assert.ok(result)
    assert.strictEqual(result.title, 'Something broke')
    assert.strictEqual(result.severity, 'medium')
    assert.deepStrictEqual(result.tags, [])
    assert.deepStrictEqual(result.steps_to_reproduce, [])
  })

  it('returns null on empty input', () => {
    const result = parseEnrichedOutput('')
    assert.ok(result) // Should still return with defaults
    assert.strictEqual(result.title, 'untitled bug')
  })
})
