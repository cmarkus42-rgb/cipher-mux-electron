import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { resolveBugreport } from '../../src/main/bugreport/bugreport-resolve'

describe('resolveBugreport', () => {
  let baseDir: string
  let outboxDir: string
  let inboxDir: string

  const sampleReport = `---
id: BUG-2026-04-19-abc123
status: open
project: cipher-mux-electron
projectPath: /test/project
created: 2026-04-19T12:00:00.000Z
---

## Beschreibung

Terminal crashes on resize

## Diagnostik

- **App-Version:** 0.1.0
`

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'))
    outboxDir = path.join(baseDir, 'outbox')
    inboxDir = path.join(baseDir, 'inbox')
    fs.mkdirSync(outboxDir, { recursive: true })
    fs.mkdirSync(inboxDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true })
  })

  it('resolves a fixed bug: writes inbox, deletes outbox', async () => {
    fs.writeFileSync(path.join(outboxDir, 'BUG-2026-04-19-abc123.md'), sampleReport)

    const result = await resolveBugreport({
      bugId: 'BUG-2026-04-19-abc123',
      status: 'fixed',
      summary: 'Off-by-one in resize handler',
      branchName: 'fix/BUG-2026-04-19-abc123',
      filesChanged: ['src/main/tmux/tmux-manager.ts'],
    }, { outboxDir, inboxDir })

    assert.ok(result.ok)
    assert.ok(!fs.existsSync(path.join(outboxDir, 'BUG-2026-04-19-abc123.md')))
    const inbox = fs.readFileSync(path.join(inboxDir, 'BUG-2026-04-19-abc123.md'), 'utf-8')
    assert.ok(inbox.includes('status: fixed'))
    assert.ok(inbox.includes('Off-by-one in resize handler'))
    assert.ok(inbox.includes('fix/BUG-2026-04-19-abc123'))
    assert.ok(inbox.includes('src/main/tmux/tmux-manager.ts'))
    assert.ok(inbox.includes('resolved:'))
  })

  it('resolves a failed bug: writes inbox with failed status', async () => {
    fs.writeFileSync(path.join(outboxDir, 'BUG-2026-04-19-abc123.md'), sampleReport)

    const result = await resolveBugreport({
      bugId: 'BUG-2026-04-19-abc123',
      status: 'failed',
      summary: 'Could not reproduce the issue',
    }, { outboxDir, inboxDir })

    assert.ok(result.ok)
    const inbox = fs.readFileSync(path.join(inboxDir, 'BUG-2026-04-19-abc123.md'), 'utf-8')
    assert.ok(inbox.includes('status: failed'))
    assert.ok(inbox.includes('Could not reproduce'))
    assert.ok(!inbox.includes('branchName:'))
  })

  it('returns error when outbox file not found', async () => {
    const result = await resolveBugreport({
      bugId: 'BUG-nonexistent',
      status: 'fixed',
      summary: 'test',
    }, { outboxDir, inboxDir })

    assert.ok(!result.ok)
    assert.ok(result.error?.includes('not found'))
  })

  it('preserves original report content in inbox', async () => {
    fs.writeFileSync(path.join(outboxDir, 'BUG-2026-04-19-abc123.md'), sampleReport)

    await resolveBugreport({
      bugId: 'BUG-2026-04-19-abc123',
      status: 'fixed',
      summary: 'Fixed it',
      branchName: 'fix/BUG-2026-04-19-abc123',
    }, { outboxDir, inboxDir })

    const inbox = fs.readFileSync(path.join(inboxDir, 'BUG-2026-04-19-abc123.md'), 'utf-8')
    assert.ok(inbox.includes('Terminal crashes on resize'))
    assert.ok(inbox.includes('## Diagnostik'))
  })
})
