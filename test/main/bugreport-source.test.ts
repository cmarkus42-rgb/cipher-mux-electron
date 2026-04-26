import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { BugreportTaskSource } from '../../src/main/task/sources/bugreport-source'
import type { CreateTaskOpts } from '../../src/shared/types'

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('BugreportTaskSource', () => {
  let tmpDir: string

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugreport-source-test-'))
  })

  afterEach(() => {
    // Clean up any .md files written during a test
    for (const entry of fs.readdirSync(tmpDir)) {
      fs.rmSync(path.join(tmpDir, entry))
    }
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('has name "bugreport"', () => {
    const source = new BugreportTaskSource(tmpDir)
    assert.equal(source.name, 'bugreport')
  })

  it('picks up existing .md files on start', () => {
    const filePath = path.join(tmpDir, 'existing-bug.md')
    fs.writeFileSync(filePath, 'An existing bug report')

    const emitted: CreateTaskOpts[] = []
    const source = new BugreportTaskSource(tmpDir)
    source.start((opts) => emitted.push(opts))
    source.stop()

    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].title, 'existing-bug')
    assert.equal(emitted[0].description, 'An existing bug report')
    assert.equal(emitted[0].source, 'bugreport')
    assert.equal(emitted[0].policy?.maxRetries, 2)
    assert.equal(emitted[0].policy?.hooks?.afterRun, 'npm test')
  })

  it('detects new .md file written after start', async () => {
    const emitted: CreateTaskOpts[] = []
    const source = new BugreportTaskSource(tmpDir)
    source.start((opts) => emitted.push(opts))

    const filePath = path.join(tmpDir, 'new-bug.md')
    fs.writeFileSync(filePath, 'A new bug report')

    // Poll for the emitted event — macOS fs.watch in tmpdir can be very slow
    const deadline = Date.now() + 5000
    while (emitted.length === 0 && Date.now() < deadline) {
      await waitFor(200)
    }
    source.stop()

    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].title, 'new-bug')
    assert.equal(emitted[0].description, 'A new bug report')
    assert.equal(emitted[0].source, 'bugreport')
    assert.equal(emitted[0].policy?.maxRetries, 2)
    assert.equal(emitted[0].policy?.hooks?.afterRun, 'npm test')
  })

  it('ignores non-.md files', async () => {
    const emitted: CreateTaskOpts[] = []
    const source = new BugreportTaskSource(tmpDir)
    source.start((opts) => emitted.push(opts))

    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'not a bug report')
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{}')

    await waitFor(1500)
    source.stop()

    assert.equal(emitted.length, 0)
  })

  it('deduplicates same file', async () => {
    const filePath = path.join(tmpDir, 'dup-bug.md')
    fs.writeFileSync(filePath, 'First write')

    const emitted: CreateTaskOpts[] = []
    const source = new BugreportTaskSource(tmpDir)
    // scanExisting picks it up once
    source.start((opts) => emitted.push(opts))

    // Overwrite the same file — fs.watch may fire again
    fs.writeFileSync(filePath, 'Second write')

    await waitFor(1500)
    source.stop()

    // Should only have been emitted once (deduplication by filename)
    assert.equal(emitted.length, 1)
  })
})
