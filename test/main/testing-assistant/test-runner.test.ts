import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseTestOutput } from '../../../src/main/testing-assistant/test-runner'

describe('test-runner/parseTestOutput', () => {
  it('parses node:test format', () => {
    const raw = '# tests 42\n# pass 40\n# fail 2\n# duration_ms 1234'
    const result = parseTestOutput(raw)
    assert.equal(result.total, 42)
    assert.equal(result.passed, 40)
    assert.equal(result.failed, 2)
  })

  it('parses Vitest format', () => {
    const raw = 'Tests  95 passed | 3 failed | 98 total'
    const result = parseTestOutput(raw)
    assert.equal(result.total, 98)
    assert.equal(result.passed, 95)
    assert.equal(result.failed, 3)
  })

  it('returns zeros for unrecognized format', () => {
    const result = parseTestOutput('no test info here')
    assert.equal(result.total, 0)
    assert.equal(result.passed, 0)
    assert.equal(result.failed, 0)
  })
})
