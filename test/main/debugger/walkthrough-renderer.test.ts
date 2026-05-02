import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { WalkthroughRenderer, type WalkthroughEntry } from '../../../src/main/debugger/walkthrough-renderer'

describe('WalkthroughRenderer', () => {
  const renderer = new WalkthroughRenderer()

  it('renders single-file walkthrough', () => {
    const entries: WalkthroughEntry[] = [
      { filePath: 'src/main/foo.ts', lineRange: '10-25', explanation: 'Added null check before access' },
    ]
    const md = renderer.render(entries, 'Fix null pointer crash')
    assert.ok(md.includes('# Linear Walkthrough'))
    assert.ok(md.includes('Fix null pointer crash'))
    assert.ok(md.includes('`src/main/foo.ts`'))
    assert.ok(md.includes('10-25'))
    assert.ok(md.includes('Added null check'))
  })

  it('renders multi-file walkthrough in order', () => {
    const entries: WalkthroughEntry[] = [
      { filePath: 'a.ts', lineRange: '1-5', explanation: 'First' },
      { filePath: 'b.ts', lineRange: '10-20', explanation: 'Second' },
      { filePath: 'c.ts', lineRange: '3-3', explanation: 'Third' },
    ]
    const md = renderer.render(entries, 'Multi-fix')
    const aIdx = md.indexOf('a.ts')
    const bIdx = md.indexOf('b.ts')
    const cIdx = md.indexOf('c.ts')
    assert.ok(aIdx < bIdx)
    assert.ok(bIdx < cIdx)
  })

  it('renders empty entries gracefully', () => {
    const md = renderer.render([], 'Nothing changed')
    assert.ok(md.includes('Keine Aenderungen'))
  })
})
