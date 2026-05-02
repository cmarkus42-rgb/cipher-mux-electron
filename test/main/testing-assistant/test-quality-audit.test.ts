import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { auditTestQuality } from '../../../src/main/testing-assistant/test-quality-audit'

describe('test-quality-audit', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tqa-'))
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('classifies behavioral test correctly', () => {
    fs.writeFileSync(path.join(tmpDir, 'test', 'math.test.ts'),
      `describe('add', () => {
        it('returns the sum of two numbers', () => {
          assert.equal(add(1, 2), 3)
          assert.equal(add(-1, 1), 0)
        })
      })`)
    const report = auditTestQuality({ projectPath: tmpDir }, 'run-1')
    assert.equal(report.behavioralCount, 1)
    assert.equal(report.implementationCount, 0)
  })

  it('classifies mock-heavy test as implementation', () => {
    fs.writeFileSync(path.join(tmpDir, 'test', 'service.test.ts'),
      `describe('UserService', () => {
        it('calls the repository method', () => {
          const spy = jest.spyOn(repo, 'findById')
          service.getUser(1)
          expect(spy).toHaveBeenCalledWith(1)
          expect(spy.mock.calls.length).toBe(1)
          expect(spy.mock.results[0]).toBeDefined()
        })
      })`)
    const report = auditTestQuality({ projectPath: tmpDir }, 'run-1')
    assert.equal(report.implementationCount, 1)
    assert.ok(report.problematicTests.length > 0)
  })

  it('returns zeros when no test dir exists', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tqa-empty-'))
    const report = auditTestQuality({ projectPath: emptyDir }, 'run-1')
    assert.equal(report.behavioralCount, 0)
    assert.equal(report.implementationCount, 0)
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })
})
