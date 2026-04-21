import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { StatusLineMonitor } from '../../src/main/monitoring/statusline-monitor'

describe('StatusLineMonitor', () => {
  let tmpDir: string
  let monitor: StatusLineMonitor

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-test-'))
    monitor = new StatusLineMonitor(tmpDir)
  })

  afterEach(() => {
    monitor.stop()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates watch directory if not exists', () => {
    const subDir = path.join(tmpDir, 'sub', 'nested')
    const m = new StatusLineMonitor(subDir)
    m.start()
    assert.ok(fs.existsSync(subDir))
    m.stop()
  })

  it('reads existing files on start', () => {
    const usage = { usedPercentage: 42, totalInputTokens: 1000, totalOutputTokens: 500, contextWindowSize: 200000, modelId: 'claude-opus-4' }
    fs.writeFileSync(path.join(tmpDir, 'session-abc.json'), JSON.stringify(usage))

    monitor.start()
    const cached = monitor.get('session-abc')
    assert.ok(cached)
    assert.equal(cached.usedPercentage, 42)
    assert.equal(cached.totalInputTokens, 1000)
    assert.equal(cached.modelId, 'claude-opus-4')
  })

  it('returns undefined for unknown session', () => {
    monitor.start()
    assert.equal(monitor.get('nonexistent'), undefined)
  })

  it('getAll returns all cached usages', () => {
    fs.writeFileSync(path.join(tmpDir, 's1.json'), JSON.stringify({ usedPercentage: 10 }))
    fs.writeFileSync(path.join(tmpDir, 's2.json'), JSON.stringify({ usedPercentage: 20 }))

    monitor.start()
    const all = monitor.getAll()
    assert.equal(all.size, 2)
    assert.equal(all.get('s1')?.usedPercentage, 10)
    assert.equal(all.get('s2')?.usedPercentage, 20)
  })

  it('emits usage-updated on file change', () => {
    monitor.start()

    let result: { sessionId: string; usage: any } | null = null
    monitor.on('usage-updated', (sessionId, usage) => { result = { sessionId, usage } })

    fs.writeFileSync(path.join(tmpDir, 'live-session.json'), JSON.stringify({ usedPercentage: 55 }))

    // Drive the handler directly — fs.watch timing on macOS is non-deterministic
    ;(monitor as any).handleFileChange('live-session.json')

    assert.ok(result)
    assert.equal(result!.sessionId, 'live-session')
    assert.equal(result!.usage.usedPercentage, 55)
  })

  it('emits usage-warning when threshold exceeded', () => {
    fs.writeFileSync(path.join(tmpDir, 'warn.json'), JSON.stringify({ usedPercentage: 85 }))

    let warned = false
    monitor.on('usage-warning', (sessionId) => {
      if (sessionId === 'warn') warned = true
    })

    monitor.start()
    assert.ok(warned)
  })

  it('does not re-emit warning for same session', () => {
    fs.writeFileSync(path.join(tmpDir, 'w2.json'), JSON.stringify({ usedPercentage: 90 }))

    let count = 0
    monitor.on('usage-warning', () => count++)

    monitor.start()
    assert.equal(count, 1)

    // Simulate file update (same high usage)
    fs.writeFileSync(path.join(tmpDir, 'w2.json'), JSON.stringify({ usedPercentage: 92 }))
    // Read it manually to trigger
    ;(monitor as any).handleFileChange('w2.json')
    assert.equal(count, 1) // still 1, no re-emit
  })

  it('remove deletes cache entry and file', () => {
    fs.writeFileSync(path.join(tmpDir, 'del.json'), JSON.stringify({ usedPercentage: 30 }))
    monitor.start()
    assert.ok(monitor.get('del'))

    monitor.remove('del')
    assert.equal(monitor.get('del'), undefined)
    assert.ok(!fs.existsSync(path.join(tmpDir, 'del.json')))
  })

  it('ignores non-JSON files', () => {
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'hello')
    monitor.start()
    assert.equal(monitor.getAll().size, 0)
  })

  it('ignores malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.json'), 'not json{{{')
    monitor.start()
    assert.equal(monitor.get('bad'), undefined)
  })

  it('ignores JSON without usedPercentage', () => {
    fs.writeFileSync(path.join(tmpDir, 'empty.json'), JSON.stringify({ foo: 'bar' }))
    monitor.start()
    assert.equal(monitor.get('empty'), undefined)
  })

  it('handles snake_case field names', () => {
    fs.writeFileSync(path.join(tmpDir, 'snake.json'), JSON.stringify({
      used_percentage: 65,
      total_input_tokens: 2000,
      total_output_tokens: 800,
      context_window_size: 200000,
      model_id: 'claude-sonnet-4',
    }))

    monitor.start()
    const usage = monitor.get('snake')
    assert.ok(usage)
    assert.equal(usage.usedPercentage, 65)
    assert.equal(usage.totalInputTokens, 2000)
    assert.equal(usage.modelId, 'claude-sonnet-4')
  })

  it('stop clears cache and watcher', () => {
    fs.writeFileSync(path.join(tmpDir, 'x.json'), JSON.stringify({ usedPercentage: 10 }))
    monitor.start()
    assert.equal(monitor.getAll().size, 1)

    monitor.stop()
    assert.equal(monitor.getAll().size, 0)
  })
})
