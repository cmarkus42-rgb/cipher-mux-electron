import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { VerificationRunner, type VerificationResult } from '../../../src/main/debugger/verification-runner'

describe('VerificationRunner', () => {
  const runner = new VerificationRunner()

  it('parseTestOutput detects all-pass', () => {
    const output = 'tests 15\nsuites 3\npass 15\nfail 0\nduration_ms 1200'
    const result = runner.parseTestOutput(output)
    assert.equal(result.allPassed, true)
    assert.equal(result.totalTests, 15)
    assert.equal(result.failures, 0)
  })

  it('parseTestOutput detects failures', () => {
    const output = 'tests 10\npass 8\nfail 2'
    const result = runner.parseTestOutput(output)
    assert.equal(result.allPassed, false)
    assert.equal(result.failures, 2)
  })

  it('parseTestOutput handles missing numbers gracefully', () => {
    const result = runner.parseTestOutput('some garbage output')
    assert.equal(result.allPassed, false)
    assert.equal(result.totalTests, 0)
    assert.equal(result.failures, 0)
    assert.ok(result.rawOutput.includes('garbage'))
  })

  it('assessPhaseTransition blocks on failure in strict mode', () => {
    const fail: VerificationResult = { allPassed: false, totalTests: 10, failures: 2, rawOutput: '' }
    assert.equal(runner.assessPhaseTransition(fail, 'strict'), false)
  })

  it('assessPhaseTransition allows on pass in strict mode', () => {
    const pass: VerificationResult = { allPassed: true, totalTests: 10, failures: 0, rawOutput: '' }
    assert.equal(runner.assessPhaseTransition(pass, 'strict'), true)
  })
})
