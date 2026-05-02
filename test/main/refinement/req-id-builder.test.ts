import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateReqIds,
  formatReqIdMarkdown,
  formatDetailSpec,
  validateReqIds,
} from '../../../src/main/refinement/req-id-builder'

describe('generateReqIds', () => {
  it('generates sequential IDs per subsystem', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'First requirement' },
      { subsystem: 'S1', title: 'Second requirement' },
      { subsystem: 'S2', title: 'Other subsystem' },
    ])
    assert.equal(entries.length, 3)
    assert.equal(entries[0].id, 'REQ-S1-001')
    assert.equal(entries[1].id, 'REQ-S1-002')
    assert.equal(entries[2].id, 'REQ-S2-001')
  })

  it('respects custom startNumber', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'Req' },
    ], 10)
    assert.equal(entries[0].id, 'REQ-S1-010')
  })

  it('normalizes subsystem to uppercase max 4 chars', () => {
    const entries = generateReqIds([
      { subsystem: 'longname', title: 'Test' },
    ])
    assert.equal(entries[0].subsystem, 'LONG')
  })

  it('preserves acceptance criteria when provided', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'Test', acceptanceCriteria: ['crit1', 'crit2'] },
    ])
    assert.deepEqual(entries[0].acceptanceCriteria, ['crit1', 'crit2'])
  })

  it('generates default test path when not provided', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'My Feature' },
    ])
    assert.ok(entries[0].testPath.includes('s1/'))
    assert.ok(entries[0].testPath.includes('my-feature'))
    assert.ok(entries[0].testPath.endsWith('.test.ts'))
  })

  it('preserves custom test path', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'Test', testPath: 'custom/path.test.ts' },
    ])
    assert.equal(entries[0].testPath, 'custom/path.test.ts')
  })

  it('preserves off-limits when provided', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'Test', offLimits: 'no schema changes' },
    ])
    assert.equal(entries[0].offLimits, 'no schema changes')
  })

  it('sets offLimits to null when not provided', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'Test' },
    ])
    assert.equal(entries[0].offLimits, null)
  })
})

describe('formatReqIdMarkdown', () => {
  it('produces markdown with heading, criteria, and test path', () => {
    const md = formatReqIdMarkdown({
      id: 'REQ-S1-001',
      subsystem: 'S1',
      number: 1,
      title: 'My Feature',
      acceptanceCriteria: ['crit1', 'crit2'],
      testPath: 'tests/s1/my-feature.test.ts',
      offLimits: null,
    })
    assert.ok(md.includes('### REQ-S1-001'))
    assert.ok(md.includes('My Feature'))
    assert.ok(md.includes('- [ ] crit1'))
    assert.ok(md.includes('- [ ] crit2'))
    assert.ok(md.includes('`tests/s1/my-feature.test.ts`'))
    assert.ok(!md.includes('Off-Limits'))
  })

  it('includes off-limits when present', () => {
    const md = formatReqIdMarkdown({
      id: 'REQ-S1-001',
      subsystem: 'S1',
      number: 1,
      title: 'Test',
      acceptanceCriteria: ['crit1'],
      testPath: 'test.ts',
      offLimits: 'no schema changes',
    })
    assert.ok(md.includes('**Off-Limits:** no schema changes'))
  })

  it('adds placeholder when no acceptance criteria', () => {
    const md = formatReqIdMarkdown({
      id: 'REQ-S1-001',
      subsystem: 'S1',
      number: 1,
      title: 'Test',
      acceptanceCriteria: [],
      testPath: 'test.ts',
      offLimits: null,
    })
    assert.ok(md.includes('Akzeptanzkriterien ergaenzen'))
  })
})

describe('formatDetailSpec', () => {
  it('formats multiple entries with optional title', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'Feat A', acceptanceCriteria: ['crit'] },
      { subsystem: 'S1', title: 'Feat B', acceptanceCriteria: ['crit'] },
    ])
    const spec = formatDetailSpec(entries, 'Subsystem S1')
    assert.ok(spec.startsWith('## Subsystem S1'))
    assert.ok(spec.includes('REQ-S1-001'))
    assert.ok(spec.includes('REQ-S1-002'))
  })
})

describe('validateReqIds', () => {
  it('returns no errors for valid entries', () => {
    const entries = generateReqIds([
      { subsystem: 'S1', title: 'Test', acceptanceCriteria: ['crit'] },
    ])
    const errors = validateReqIds(entries)
    assert.equal(errors.length, 0)
  })

  it('detects duplicate IDs', () => {
    const entries = [
      { id: 'REQ-S1-001', subsystem: 'S1', number: 1, title: 'A', acceptanceCriteria: ['c'], testPath: 't', offLimits: null },
      { id: 'REQ-S1-001', subsystem: 'S1', number: 1, title: 'B', acceptanceCriteria: ['c'], testPath: 't', offLimits: null },
    ]
    const errors = validateReqIds(entries)
    assert.ok(errors.some(e => e.includes('Duplicate')))
  })

  it('detects empty titles', () => {
    const entries = [
      { id: 'REQ-S1-001', subsystem: 'S1', number: 1, title: '', acceptanceCriteria: ['c'], testPath: 't', offLimits: null },
    ]
    const errors = validateReqIds(entries)
    assert.ok(errors.some(e => e.includes('Empty title')))
  })

  it('detects missing acceptance criteria', () => {
    const entries = [
      { id: 'REQ-S1-001', subsystem: 'S1', number: 1, title: 'Test', acceptanceCriteria: [], testPath: 't', offLimits: null },
    ]
    const errors = validateReqIds(entries)
    assert.ok(errors.some(e => e.includes('No acceptance criteria')))
  })
})
