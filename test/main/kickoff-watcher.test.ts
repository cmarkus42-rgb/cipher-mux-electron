import { describe, it, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { KickoffWatcher } from '../../src/main/project/kickoff-watcher'

describe('KickoffWatcher', () => {
  let tmpDir: string
  const watchers: KickoffWatcher[] = []

  afterEach(() => {
    for (const w of watchers) w.stop()
    watchers.length = 0
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('fires onMarker when the marker file is created', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-watcher-'))

    const events: string[] = []
    const w = new KickoffWatcher({
      projectDir: tmpDir,
      timeoutMs: 60_000,
      pollIntervalMs: 50,
      onMarker: () => events.push('marker'),
      onTimeout: () => events.push('timeout'),
    })
    watchers.push(w)
    w.start()

    // Create the marker after a short delay.
    setTimeout(() => {
      fs.writeFileSync(path.join(tmpDir, '.kickoff-complete'), '', 'utf-8')
    }, 100)

    await new Promise((r) => setTimeout(r, 300))
    assert.deepEqual(events, ['marker'])
  })

  it('fires onTimeout if no marker appears in time', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-watcher-timeout-'))

    const events: string[] = []
    const w = new KickoffWatcher({
      projectDir: tmpDir,
      timeoutMs: 150,
      pollIntervalMs: 50,
      onMarker: () => events.push('marker'),
      onTimeout: () => events.push('timeout'),
    })
    watchers.push(w)
    w.start()

    await new Promise((r) => setTimeout(r, 300))
    assert.deepEqual(events, ['timeout'])
  })

  it('fires onMarker at most once', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-watcher-once-'))

    let markerCount = 0
    const w = new KickoffWatcher({
      projectDir: tmpDir,
      timeoutMs: 60_000,
      pollIntervalMs: 20,
      onMarker: () => { markerCount++ },
      onTimeout: () => {},
    })
    watchers.push(w)
    w.start()

    fs.writeFileSync(path.join(tmpDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 100))
    // Touch again — we want to prove the callback doesn't fire again.
    fs.writeFileSync(path.join(tmpDir, '.kickoff-complete'), 'x', 'utf-8')
    await new Promise((r) => setTimeout(r, 100))

    assert.equal(markerCount, 1)
  })

  it('stop() stops both timer and watcher', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-watcher-stop-'))

    let fired = false
    const w = new KickoffWatcher({
      projectDir: tmpDir,
      timeoutMs: 100,
      pollIntervalMs: 20,
      onMarker: () => { fired = true },
      onTimeout: () => { fired = true },
    })
    watchers.push(w)
    w.start()
    w.stop()

    fs.writeFileSync(path.join(tmpDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 250))

    assert.equal(fired, false)
  })
})
