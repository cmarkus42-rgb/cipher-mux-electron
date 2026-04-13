import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { checkDependencies } from '../../src/main/util/dependency-check'

describe('checkDependencies', () => {
  it('should detect tmux on this machine', async () => {
    const status = await checkDependencies()
    assert.equal(status.tmux.available, true, 'tmux should be available')
    assert.ok(status.tmux.version, 'tmux version should be set')
    assert.ok(status.tmux.version!.includes('tmux'), 'version should contain "tmux"')
  })

  it('should detect claude code CLI', async () => {
    const status = await checkDependencies()
    // Claude Code may or may not be installed — just check the shape
    assert.equal(typeof status.claudeCode.available, 'boolean')
    if (status.claudeCode.available) {
      assert.ok(status.claudeCode.version, 'version should be set when available')
    } else {
      assert.equal(status.claudeCode.version, null)
    }
  })
})
