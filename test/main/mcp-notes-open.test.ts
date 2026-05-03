/**
 * Tests for the mux_notes_open MCP tool contract.
 * We test the tool handler logic directly (noteManager + windowManager stubs).
 */
import { describe, it, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { IPC } from '../../src/shared/ipc-channels'

// Minimal NoteInfo for testing
function makeNoteInfo(id: string, title = 'Test Note') {
  return { id, title, tags: [], scope: 'global', relativePath: `${id}.md`, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }
}

// Simulate the mux_notes_open tool handler logic extracted from mcp-tools.ts
async function handleNotesOpen(
  args: { id: string; highlight?: boolean },
  ctx: {
    noteManager: { read: (id: string) => Promise<{ info: any; body: string } | null> } | null
    windowManager: { sentMessages: Array<{ channel: string; data: unknown }>; sendToMainWindow(channel: string, data: unknown): void } | null
  },
) {
  if (!ctx.noteManager) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
  }
  const result = await ctx.noteManager.read(args.id)
  if (!result) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Note not found: ${args.id}` }) }], isError: true }
  }
  if (!ctx.windowManager) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
  }
  ctx.windowManager.sendToMainWindow(IPC.NOTES_OPEN, { note: result.info })
  if (args.highlight) {
    ctx.windowManager.sendToMainWindow(IPC.UI_HIGHLIGHT, {
      target: `side-note-${args.id}`,
      duration: 3000,
      style: 'glow',
    })
  }
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: true, id: result.info.id, title: result.info.title }) }],
  }
}

describe('mux_notes_open — tool handler contract', () => {
  let sentMessages: Array<{ channel: string; data: unknown }>
  let noteStore: Map<string, { info: any; body: string }>
  let ctx: Parameters<typeof handleNotesOpen>[1]

  beforeEach(() => {
    sentMessages = []
    noteStore = new Map()
    ctx = {
      noteManager: {
        read: async (id: string) => noteStore.get(id) ?? null,
      },
      windowManager: {
        sentMessages,
        sendToMainWindow(channel: string, data: unknown) {
          sentMessages.push({ channel, data })
        },
      },
    }
  })

  it('returns error when NoteManager is not available', async () => {
    ctx.noteManager = null
    const result = await handleNotesOpen({ id: '01ABC' }, ctx)
    assert.equal(result.isError, true)
    const body = JSON.parse(result.content[0].text)
    assert.ok(body.error.includes('NoteManager'))
  })

  it('returns error when note does not exist', async () => {
    const result = await handleNotesOpen({ id: 'NONEXISTENT' }, ctx)
    assert.equal(result.isError, true)
    const body = JSON.parse(result.content[0].text)
    assert.ok(body.error.includes('Note not found'))
  })

  it('sends NOTES_OPEN IPC when note exists', async () => {
    const info = makeNoteInfo('01NOTE')
    noteStore.set('01NOTE', { info, body: '# Test' })

    const result = await handleNotesOpen({ id: '01NOTE' }, ctx)
    const body = JSON.parse(result.content[0].text)
    assert.equal(body.ok, true)
    assert.equal(body.id, '01NOTE')
    assert.equal(body.title, 'Test Note')

    assert.equal(sentMessages.length, 1)
    assert.equal(sentMessages[0].channel, IPC.NOTES_OPEN)
    assert.deepEqual((sentMessages[0].data as any).note.id, '01NOTE')
  })

  it('sends UI_HIGHLIGHT when highlight=true', async () => {
    const info = makeNoteInfo('01HIGH')
    noteStore.set('01HIGH', { info, body: '# Highlighted' })

    const result = await handleNotesOpen({ id: '01HIGH', highlight: true }, ctx)
    const body = JSON.parse(result.content[0].text)
    assert.equal(body.ok, true)

    assert.equal(sentMessages.length, 2)
    assert.equal(sentMessages[0].channel, IPC.NOTES_OPEN)
    assert.equal(sentMessages[1].channel, IPC.UI_HIGHLIGHT)
    assert.equal((sentMessages[1].data as any).target, 'side-note-01HIGH')
    assert.equal((sentMessages[1].data as any).duration, 3000)
  })

  it('does NOT send UI_HIGHLIGHT when highlight is omitted', async () => {
    const info = makeNoteInfo('01NOHL')
    noteStore.set('01NOHL', { info, body: '# No HL' })

    await handleNotesOpen({ id: '01NOHL' }, ctx)
    assert.equal(sentMessages.length, 1)
    assert.equal(sentMessages[0].channel, IPC.NOTES_OPEN)
  })

  it('returns error when WindowManager is not available', async () => {
    const info = makeNoteInfo('01WM')
    noteStore.set('01WM', { info, body: '# WM' })
    ctx.windowManager = null

    const result = await handleNotesOpen({ id: '01WM' }, ctx)
    assert.equal(result.isError, true)
    const body = JSON.parse(result.content[0].text)
    assert.ok(body.error.includes('WindowManager'))
  })
})
