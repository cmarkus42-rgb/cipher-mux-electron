import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { NoteWatcher } from '../../src/main/notes/note-watcher'

describe('NoteWatcher', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-watcher-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('emits change event when .md file is modified', async () => {
    const filePath = path.join(tmpDir, 'test.md')
    fs.writeFileSync(filePath, 'initial')

    const changes: string[] = []
    const watcher = new NoteWatcher(tmpDir, (noteId) => changes.push(noteId))
    watcher.start()

    await new Promise(r => setTimeout(r, 100))
    fs.writeFileSync(filePath, 'updated')
    await new Promise(r => setTimeout(r, 700))

    watcher.stop()
    assert.ok(changes.length >= 1)
    assert.equal(changes[0], 'test')
  })

  it('ignores non-.md files', async () => {
    const changes: string[] = []
    const watcher = new NoteWatcher(tmpDir, (noteId) => changes.push(noteId))
    watcher.start()

    await new Promise(r => setTimeout(r, 100))
    fs.writeFileSync(path.join(tmpDir, 'test.json'), '{}')
    await new Promise(r => setTimeout(r, 700))

    watcher.stop()
    assert.equal(changes.length, 0)
  })

  it('deduplicates rapid changes to same file', async () => {
    const filePath = path.join(tmpDir, 'rapid.md')
    fs.writeFileSync(filePath, 'v1')

    const changes: string[] = []
    const watcher = new NoteWatcher(tmpDir, (noteId) => changes.push(noteId))
    watcher.start()

    await new Promise(r => setTimeout(r, 100))
    fs.writeFileSync(filePath, 'v2')
    fs.writeFileSync(filePath, 'v3')
    fs.writeFileSync(filePath, 'v4')
    await new Promise(r => setTimeout(r, 700))

    watcher.stop()
    assert.equal(changes.length, 1)
  })

  it('ignores changes suppressed by suppressNext', async () => {
    const filePath = path.join(tmpDir, 'internal.md')
    fs.writeFileSync(filePath, 'initial')

    const changes: string[] = []
    const watcher = new NoteWatcher(tmpDir, (noteId) => changes.push(noteId))
    watcher.start()

    await new Promise(r => setTimeout(r, 100))
    watcher.suppressNext('internal')
    fs.writeFileSync(filePath, 'internal-write')
    await new Promise(r => setTimeout(r, 700))

    watcher.stop()
    assert.equal(changes.length, 0)
  })
})
