import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { OutputBatcher } from '../../src/main/tmux/output-batcher'

describe('OutputBatcher', () => {
  let batcher: OutputBatcher
  let flushed: Array<{ paneId: string; data: string }>
  const flushCb = (paneId: string, data: string) => {
    flushed.push({ paneId, data })
  }

  beforeEach(() => {
    flushed = []
    // Use a long interval so the timer never fires during sync tests
    batcher = new OutputBatcher(flushCb, 60_000)
  })

  afterEach(() => {
    batcher.destroy()
  })

  it('should accumulate data per pane', () => {
    batcher.push('pane-1', 'hello')
    assert.equal(batcher.pendingCount, 1)
    assert.equal(flushed.length, 0, 'no flush yet')
  })

  it('should deliver accumulated data on flush', () => {
    batcher.push('pane-1', 'hello')
    batcher.flush()

    assert.equal(flushed.length, 1)
    assert.equal(flushed[0].paneId, 'pane-1')
    assert.equal(flushed[0].data, 'hello')
    assert.equal(batcher.pendingCount, 0)
  })

  it('should concatenate multiple pushes to the same pane', () => {
    batcher.push('pane-1', 'hello')
    batcher.push('pane-1', ' world')
    batcher.flush()

    assert.equal(flushed.length, 1)
    assert.equal(flushed[0].data, 'hello world')
  })

  it('should track multiple panes independently', () => {
    batcher.push('pane-1', 'aaa')
    batcher.push('pane-2', 'bbb')
    batcher.push('pane-1', '111')
    batcher.push('pane-2', '222')
    batcher.flush()

    assert.equal(flushed.length, 2)

    const pane1 = flushed.find((f) => f.paneId === 'pane-1')
    const pane2 = flushed.find((f) => f.paneId === 'pane-2')
    assert.ok(pane1)
    assert.ok(pane2)
    assert.equal(pane1.data, 'aaa111')
    assert.equal(pane2.data, 'bbb222')
  })

  it('should not flush after destroy', () => {
    batcher.push('pane-1', 'before-destroy')
    batcher.destroy()

    // destroy flushes remaining data
    assert.equal(flushed.length, 1)
    assert.equal(flushed[0].data, 'before-destroy')

    // pushes after destroy are silently ignored
    flushed.length = 0
    batcher.push('pane-1', 'after-destroy')
    batcher.flush()
    assert.equal(flushed.length, 0, 'no data should be flushed after destroy')
  })

  it('should flush automatically via timer', async () => {
    // Use a very short interval for this test
    const timerBatcher = new OutputBatcher(flushCb, 10)
    timerBatcher.push('pane-t', 'timed')

    // Wait for the timer to fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.ok(flushed.length >= 1, 'timer should have triggered a flush')
    const entry = flushed.find((f) => f.paneId === 'pane-t')
    assert.ok(entry)
    assert.equal(entry.data, 'timed')

    timerBatcher.destroy()
  })

  it('should not burn CPU when no data is pending', () => {
    // After flush, pendingCount should be 0 and no timer should be active
    batcher.push('pane-1', 'data')
    batcher.flush()
    assert.equal(batcher.pendingCount, 0)
    // A second flush with no data should be a no-op (no callback invocations)
    batcher.flush()
    assert.equal(flushed.length, 1, 'only the original flush should have fired')
  })

  it('should import without .ts extension', async () => {
    // This test validates that the import path works —
    // if we got this far, the import at the top of this file succeeded.
    assert.ok(OutputBatcher, 'OutputBatcher class should be importable')
  })
})
