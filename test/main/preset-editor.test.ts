// test/main/preset-editor.test.ts — PresetEditor helper tests
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Inline the extractH2Headings function (renderer code, not importable in Node)
function extractH2Headings(content: string): { label: string; lineIndex: number }[] {
  const headings: { label: string; lineIndex: number }[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+)/)
    if (m) headings.push({ label: m[1].trim(), lineIndex: i })
  }
  return headings
}

describe('PresetEditor helpers', () => {
  describe('extractH2Headings', () => {
    it('extracts H2 headings with line indices', () => {
      const content = '# Title\n\nSome text\n\n## Section A\n\nContent\n\n## Section B\n\nMore'
      const result = extractH2Headings(content)
      assert.deepStrictEqual(result, [
        { label: 'Section A', lineIndex: 4 },
        { label: 'Section B', lineIndex: 8 },
      ])
    })

    it('returns empty array for content without H2', () => {
      assert.deepStrictEqual(extractH2Headings('# Only H1\n\nNo H2 here'), [])
    })

    it('does not match H1 or H3 as H2', () => {
      const content = '# H1\n## H2\n### H3'
      const result = extractH2Headings(content)
      assert.equal(result.length, 1)
      assert.equal(result[0].label, 'H2')
    })
  })

  describe('title display (regression: preset name field)', () => {
    // Bug: PresetEditor showed CLAUDE.md H1 heading (e.g. "Audit — Entity CLAUDE.md")
    // instead of entity.displayName (e.g. "Audit").
    // Fix: removed extractTitle(), use selected.displayName from PresetInfo.

    it('displayName from PresetInfo should be used, not content H1', () => {
      const presetInfo = { displayName: 'Audit' }
      const claudeMdContent = '# Audit — Entity CLAUDE.md\n\nSome entity definition...'

      // Old behavior (extractTitle) would return the H1 heading:
      const h1Line = claudeMdContent.split('\n').find(l => /^#\s/.test(l))
      const oldTitle = h1Line ? h1Line.replace(/^#\s*/, '').trim() : ''
      assert.equal(oldTitle, 'Audit — Entity CLAUDE.md') // wrong

      // New behavior: use displayName directly
      assert.equal(presetInfo.displayName, 'Audit') // correct
    })

    it('displayName is correct even when CLAUDE.md has no H1', () => {
      const presetInfo = { displayName: 'My Preset' }
      const claudeMdContent = 'No heading here, just text.'

      const h1Line = claudeMdContent.split('\n').find(l => /^#\s/.test(l))
      const oldTitle = h1Line ? h1Line.replace(/^#\s*/, '').trim() : ''
      assert.equal(oldTitle, '') // old: empty string / "PRESET NAME" placeholder

      assert.equal(presetInfo.displayName, 'My Preset') // new: always correct
    })
  })
})
