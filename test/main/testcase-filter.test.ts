import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  cycleFilterMode,
  applyStatusFilters,
} from '../../src/renderer/components/TestcaseView'
import type { StatusFilters, FilterMode } from '../../src/renderer/components/TestcaseView'
import type { TestcaseSection } from '../../src/main/notes/testcase-parser'

// ─── Helper ─────────────────────────────────────────────────

function makeSections(): TestcaseSection[] {
  return [
    {
      title: 'UI Tests',
      items: [
        { id: 'T-UI.1', description: 'Grid renders', status: 'pass', comment: '', lineIndex: 0 },
        { id: 'T-UI.2', description: 'Sidebar opens', status: 'fail', comment: '', lineIndex: 1 },
        { id: 'T-UI.3', description: 'Theme switch', status: 'open', comment: '', lineIndex: 2 },
      ],
    },
    {
      title: 'MCP Tests',
      items: [
        { id: 'T-MCP.1', description: 'Connection', status: 'pass', comment: '', lineIndex: 3 },
        { id: 'T-MCP.2', description: 'Auth', status: 'open', comment: '', lineIndex: 4 },
      ],
    },
  ]
}

const NEUTRAL: StatusFilters = { pass: 'neutral', fail: 'neutral', open: 'neutral' }

// ─── cycleFilterMode ────────────────────────────────────────

describe('cycleFilterMode', () => {
  it('cycles neutral → positive → negative → neutral', () => {
    assert.equal(cycleFilterMode('neutral'), 'positive')
    assert.equal(cycleFilterMode('positive'), 'negative')
    assert.equal(cycleFilterMode('negative'), 'neutral')
  })
})

// ─── applyStatusFilters ─────────────────────────────────────

describe('applyStatusFilters', () => {
  it('returns all items when no filters active', () => {
    const sections = makeSections()
    const result = applyStatusFilters(sections, NEUTRAL)
    assert.equal(result.length, 2)
    assert.equal(result[0].items.length, 3)
    assert.equal(result[1].items.length, 2)
  })

  // REQ-TCV-002: 1st click = positive (show only this status)
  it('positive pass: shows only pass items', () => {
    const result = applyStatusFilters(makeSections(), { ...NEUTRAL, pass: 'positive' })
    const allItems = result.flatMap(s => s.items)
    assert.equal(allItems.length, 2)
    assert.ok(allItems.every(i => i.status === 'pass'))
  })

  it('positive fail: shows only fail items', () => {
    const result = applyStatusFilters(makeSections(), { ...NEUTRAL, fail: 'positive' })
    const allItems = result.flatMap(s => s.items)
    assert.equal(allItems.length, 1)
    assert.equal(allItems[0].status, 'fail')
  })

  it('positive open: shows only open items', () => {
    const result = applyStatusFilters(makeSections(), { ...NEUTRAL, open: 'positive' })
    const allItems = result.flatMap(s => s.items)
    assert.equal(allItems.length, 2)
    assert.ok(allItems.every(i => i.status === 'open'))
  })

  // REQ-TCV-002: 2nd click = negative (exclude this status)
  it('negative pass: excludes pass items', () => {
    const result = applyStatusFilters(makeSections(), { ...NEUTRAL, pass: 'negative' })
    const allItems = result.flatMap(s => s.items)
    assert.equal(allItems.length, 3)
    assert.ok(allItems.every(i => i.status !== 'pass'))
  })

  it('negative fail: excludes fail items', () => {
    const result = applyStatusFilters(makeSections(), { ...NEUTRAL, fail: 'negative' })
    const allItems = result.flatMap(s => s.items)
    assert.equal(allItems.length, 4)
    assert.ok(allItems.every(i => i.status !== 'fail'))
  })

  // REQ-TCV-003: Multiple positive filters = OR
  it('positive pass + positive fail: shows pass OR fail (excludes open)', () => {
    const result = applyStatusFilters(makeSections(), { pass: 'positive', fail: 'positive', open: 'neutral' })
    const allItems = result.flatMap(s => s.items)
    assert.equal(allItems.length, 3)
    assert.ok(allItems.every(i => i.status === 'pass' || i.status === 'fail'))
  })

  // REQ-TCV-003: Multiple negative filters = combined exclusion
  it('negative pass + negative fail: shows only open', () => {
    const result = applyStatusFilters(makeSections(), { pass: 'negative', fail: 'negative', open: 'neutral' })
    const allItems = result.flatMap(s => s.items)
    assert.equal(allItems.length, 2)
    assert.ok(allItems.every(i => i.status === 'open'))
  })

  // REQ-TCV-003: Mixed positive + negative
  it('positive pass + negative open: shows only pass (open excluded)', () => {
    const result = applyStatusFilters(makeSections(), { pass: 'positive', fail: 'neutral', open: 'negative' })
    const allItems = result.flatMap(s => s.items)
    assert.equal(allItems.length, 2)
    assert.ok(allItems.every(i => i.status === 'pass'))
  })

  // Edge: all filters negative = nothing shown
  it('all negative: returns empty', () => {
    const result = applyStatusFilters(makeSections(), { pass: 'negative', fail: 'negative', open: 'negative' })
    assert.equal(result.length, 0)
  })

  // Edge: sections with no matching items are removed
  it('removes empty sections after filtering', () => {
    const sections: TestcaseSection[] = [
      {
        title: 'Only Pass',
        items: [{ id: 'T-1', description: 'A', status: 'pass', comment: '', lineIndex: 0 }],
      },
      {
        title: 'Only Fail',
        items: [{ id: 'T-2', description: 'B', status: 'fail', comment: '', lineIndex: 1 }],
      },
    ]
    const result = applyStatusFilters(sections, { ...NEUTRAL, fail: 'positive' })
    assert.equal(result.length, 1)
    assert.equal(result[0].title, 'Only Fail')
  })

  // Edge: empty sections input
  it('handles empty sections', () => {
    const result = applyStatusFilters([], { ...NEUTRAL, pass: 'positive' })
    assert.equal(result.length, 0)
  })
})
