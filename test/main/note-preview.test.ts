// test/main/note-preview.test.ts
// Tests for NoteInfo.preview extraction in NoteManager.

import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'note-preview-test-'))
}

describe('NoteManager preview extraction', () => {
  let tmpDir: string
  let mgr: NoteManager

  beforeEach(async () => {
    tmpDir = await makeTempDir()
    mgr = new NoteManager(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('extracts first body line as preview', async () => {
    await mgr.create('Test Note', '# Test Note\n\nThis is the first paragraph.\n\nSecond paragraph.')
    const list = await mgr.list()
    assert.equal(list.length, 1)
    assert.equal(list[0].preview, 'This is the first paragraph.')
  })

  it('skips heading lines for preview', async () => {
    await mgr.create('Multi Heading', '# Title\n\n## Section\n\nActual content here.')
    const list = await mgr.list()
    assert.equal(list[0].preview, 'Actual content here.')
  })

  it('skips horizontal rules for preview', async () => {
    await mgr.create('With HR', '# Title\n\n---\n\nContent after rule.')
    const list = await mgr.list()
    assert.equal(list[0].preview, 'Content after rule.')
  })

  it('truncates long lines to 80 chars with ellipsis', async () => {
    const longLine = 'A'.repeat(120)
    await mgr.create('Long', `# Long\n\n${longLine}`)
    const list = await mgr.list()
    assert.equal(list[0].preview, 'A'.repeat(80) + '...')
  })

  it('returns undefined preview for notes with only headings', async () => {
    await mgr.create('Headings Only', '# Title\n\n## Section\n\n### Sub')
    const list = await mgr.list()
    assert.equal(list[0].preview, undefined)
  })

  it('returns undefined preview for empty body', async () => {
    await mgr.create('Empty', '')
    const list = await mgr.list()
    assert.equal(list[0].preview, undefined)
  })

  it('preserves preview through read()', async () => {
    const note = await mgr.create('Read Test', '# Read Test\n\nPreview line here.')
    const content = await mgr.read(note.id)
    assert.ok(content)
    assert.equal(content.info.preview, 'Preview line here.')
  })
})
