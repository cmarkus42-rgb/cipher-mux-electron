import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { chunkForPty, PTY_CHUNK_BYTES } from '../../src/main/tmux/tmux-manager'

// ─── Chunking for pty delivery ──────────────────────────────
//
// A TUI reading from a pty in raw mode cannot consume a large burst fast
// enough: it keeps whatever is still in the buffer at the end and drops the
// rest. Measured against a live Claude CLI — 604 of 5714 characters arrived,
// beginning lost, tail kept. The same payload reached a canonical-mode `cat`
// intact through the identical tmux path, so the loss is the reader, not the
// transport. Sending it in paced pieces delivered all 5696 characters.

describe('chunkForPty', () => {
  it('returns a single chunk for short text', () => {
    assert.deepEqual(chunkForPty('hallo', 400), ['hallo'])
  })

  it('returns nothing for empty text', () => {
    assert.deepEqual(chunkForPty('', 400), [])
  })

  it('reassembles to exactly the original', () => {
    const text = Array.from({ length: 200 }, (_, i) => `${i} ${'x'.repeat(60)}`).join('\n')
    const chunks = chunkForPty(text, 400)
    assert.ok(chunks.length > 1, 'long text should be split')
    assert.equal(chunks.join(''), text)
  })

  it('respects the byte budget per chunk', () => {
    const text = 'a'.repeat(5000)
    for (const chunk of chunkForPty(text, 400)) {
      assert.ok(Buffer.byteLength(chunk, 'utf-8') <= 400)
    }
  })

  // Umlauts are two bytes, emoji four. Slicing by JS string index would cut a
  // surrogate pair; slicing the raw buffer would cut a continuation byte.
  // Either way the payload arrives corrupted rather than merely late.
  it('never splits a multi-byte character', () => {
    const text = 'äöüß'.repeat(500)
    const chunks = chunkForPty(text, 50)
    assert.equal(chunks.join(''), text)
    for (const chunk of chunks) {
      assert.ok(!chunk.includes('�'), 'no replacement character may appear')
    }
  })

  it('keeps astral characters intact', () => {
    const text = '🙂'.repeat(200)
    const chunks = chunkForPty(text, 10)
    assert.equal(chunks.join(''), text)
    assert.equal(Buffer.from(chunks.join(''), 'utf-8').toString('utf-8'), text)
  })

  it('handles a chunk budget smaller than a single character', () => {
    const chunks = chunkForPty('🙂', 2)
    assert.equal(chunks.join(''), '🙂', 'a character that cannot fit must still be delivered whole')
  })

  it('splits realistic handoff-sized text into a sane number of pieces', () => {
    const text = 'x'.repeat(5658)
    const chunks = chunkForPty(text, PTY_CHUNK_BYTES)
    assert.equal(chunks.join(''), text)
    assert.ok(chunks.length >= 10, 'a 5.6k payload must not go out in one burst')
  })
})
