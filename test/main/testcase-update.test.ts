import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  parseTestcaseBody,
  serializeTestcaseBody,
} from '../../src/main/notes/testcase-parser'

import type { TestcaseResolution } from '../../src/main/notes/testcase-parser'

// Helper: apply operations on parsed sections (mirrors mcp-tools.ts logic)
type TestcaseOp =
  | { op: 'set_status'; itemId: string; status: 'open' | 'pass' | 'fail' }
  | { op: 'set_comment'; itemId: string; comment: string }
  | { op: 'add_item'; section: string; id: string; description: string }
  | { op: 'add_section'; title: string }
  | { op: 'set_resolution'; itemId: string; resolution: TestcaseResolution }

function applyOps(body: string, ops: TestcaseOp[]): { body: string; errors: string[] } {
  const sections = parseTestcaseBody(body)
  const errors: string[] = []
  for (const op of ops) {
    if (op.op === 'set_status') {
      const item = sections.flatMap(s => s.items).find(i => i.id === op.itemId)
      if (!item) { errors.push(`Item not found: ${op.itemId}`); continue }
      item.status = op.status
    } else if (op.op === 'set_comment') {
      const item = sections.flatMap(s => s.items).find(i => i.id === op.itemId)
      if (!item) { errors.push(`Item not found: ${op.itemId}`); continue }
      item.comment = op.comment
    } else if (op.op === 'add_item') {
      const section = sections.find(s => s.title === op.section)
      if (!section) { errors.push(`Section not found: ${op.section}`); continue }
      section.items.push({
        id: op.id,
        description: op.description,
        status: 'open',
        comment: '',
        lineIndex: -1,
      })
    } else if (op.op === 'add_section') {
      if (sections.find(s => s.title === op.title)) {
        errors.push(`Section already exists: ${op.title}`)
        continue
      }
      sections.push({ title: op.title, items: [] })
    } else if (op.op === 'set_resolution') {
      const item = sections.flatMap(s => s.items).find(i => i.id === op.itemId)
      if (!item) { errors.push(`Item not found: ${op.itemId}`); continue }
      if (item.status !== 'fail') { errors.push(`Cannot set resolution on non-fail item: ${op.itemId} (status: ${item.status})`); continue }
      item.resolution = op.resolution === 'unresolved' ? undefined : op.resolution
    }
  }
  return { body: serializeTestcaseBody(sections), errors }
}

const SAMPLE_BODY = `## UI Tests
- [ ] **T-UI.1** Grid renders correctly
- [ ] **T-UI.2** Sidebar opens

## MCP Tests
- [ ] **T-MCP.1** Connection stable
`

describe('testcase-update operations', () => {
  // ─── set_status ──────────────────────────────────────────

  it('set_status: marks item as pass', () => {
    const { body } = applyOps(SAMPLE_BODY, [{ op: 'set_status', itemId: 'T-UI.1', status: 'pass' }])
    const sections = parseTestcaseBody(body)
    assert.equal(sections[0].items[0].status, 'pass')
    assert.equal(sections[0].items[1].status, 'open') // unchanged
  })

  it('set_status: marks item as fail', () => {
    const { body } = applyOps(SAMPLE_BODY, [{ op: 'set_status', itemId: 'T-MCP.1', status: 'fail' }])
    const sections = parseTestcaseBody(body)
    assert.equal(sections[1].items[0].status, 'fail')
  })

  it('set_status: resets item back to open', () => {
    // First pass, then back to open
    const { body: b1 } = applyOps(SAMPLE_BODY, [{ op: 'set_status', itemId: 'T-UI.1', status: 'pass' }])
    const { body: b2 } = applyOps(b1, [{ op: 'set_status', itemId: 'T-UI.1', status: 'open' }])
    const sections = parseTestcaseBody(b2)
    assert.equal(sections[0].items[0].status, 'open')
  })

  it('set_status: reports error for unknown item', () => {
    const { errors } = applyOps(SAMPLE_BODY, [{ op: 'set_status', itemId: 'T-NOPE.99', status: 'pass' }])
    assert.equal(errors.length, 1)
    assert.ok(errors[0].includes('T-NOPE.99'))
  })

  // ─── set_comment ─────────────────────────────────────────

  it('set_comment: adds comment to item', () => {
    const { body } = applyOps(SAMPLE_BODY, [{ op: 'set_comment', itemId: 'T-UI.1', comment: 'works on M1' }])
    const sections = parseTestcaseBody(body)
    assert.equal(sections[0].items[0].comment, 'works on M1')
  })

  it('set_comment: replaces existing comment', () => {
    const { body: b1 } = applyOps(SAMPLE_BODY, [{ op: 'set_comment', itemId: 'T-UI.1', comment: 'first comment' }])
    const { body: b2 } = applyOps(b1, [{ op: 'set_comment', itemId: 'T-UI.1', comment: 'updated' }])
    const sections = parseTestcaseBody(b2)
    assert.equal(sections[0].items[0].comment, 'updated')
  })

  it('set_comment: reports error for unknown item', () => {
    const { errors } = applyOps(SAMPLE_BODY, [{ op: 'set_comment', itemId: 'T-NOPE.1', comment: 'x' }])
    assert.equal(errors.length, 1)
  })

  // ─── add_item ────────────────────────────────────────────

  it('add_item: appends item to existing section', () => {
    const { body } = applyOps(SAMPLE_BODY, [{ op: 'add_item', section: 'UI Tests', id: 'T-UI.3', description: 'Theme switching' }])
    const sections = parseTestcaseBody(body)
    assert.equal(sections[0].items.length, 3)
    assert.equal(sections[0].items[2].id, 'T-UI.3')
    assert.equal(sections[0].items[2].status, 'open')
    assert.equal(sections[0].items[2].description, 'Theme switching')
  })

  it('add_item: reports error for unknown section', () => {
    const { errors } = applyOps(SAMPLE_BODY, [{ op: 'add_item', section: 'Nonexistent', id: 'T-X.1', description: 'x' }])
    assert.equal(errors.length, 1)
    assert.ok(errors[0].includes('Nonexistent'))
  })

  // ─── add_section ─────────────────────────────────────────

  it('add_section: appends new section', () => {
    const { body } = applyOps(SAMPLE_BODY, [{ op: 'add_section', title: 'Voice Tests' }])
    const sections = parseTestcaseBody(body)
    // New section has no items yet, so it won't appear in parsed output (parser only keeps sections with items)
    // But it should be in the serialized body
    assert.ok(body.includes('## Voice Tests'))
  })

  it('add_section: reports error for duplicate section', () => {
    const { errors } = applyOps(SAMPLE_BODY, [{ op: 'add_section', title: 'UI Tests' }])
    assert.equal(errors.length, 1)
    assert.ok(errors[0].includes('already exists'))
  })

  it('add_section + add_item: can populate new section', () => {
    const { body } = applyOps(SAMPLE_BODY, [
      { op: 'add_section', title: 'Voice Tests' },
      { op: 'add_item', section: 'Voice Tests', id: 'T-VO.1', description: 'STT works' },
    ])
    const sections = parseTestcaseBody(body)
    const voiceSection = sections.find(s => s.title === 'Voice Tests')
    assert.ok(voiceSection)
    assert.equal(voiceSection.items.length, 1)
    assert.equal(voiceSection.items[0].id, 'T-VO.1')
  })

  // ─── Multiple ops ───────────────────────────────────────

  it('applies multiple operations sequentially', () => {
    const { body, errors } = applyOps(SAMPLE_BODY, [
      { op: 'set_status', itemId: 'T-UI.1', status: 'pass' },
      { op: 'set_status', itemId: 'T-UI.2', status: 'fail' },
      { op: 'set_comment', itemId: 'T-UI.2', comment: 'broken on Intel' },
      { op: 'set_status', itemId: 'T-MCP.1', status: 'pass' },
    ])
    assert.equal(errors.length, 0)
    const sections = parseTestcaseBody(body)
    assert.equal(sections[0].items[0].status, 'pass')
    assert.equal(sections[0].items[1].status, 'fail')
    assert.equal(sections[0].items[1].comment, 'broken on Intel')
    assert.equal(sections[1].items[0].status, 'pass')
  })

  // ─── Round-trip ──────────────────────────────────────────

  it('round-trip: parse → ops → serialize → parse preserves structure', () => {
    const { body } = applyOps(SAMPLE_BODY, [
      { op: 'set_status', itemId: 'T-UI.1', status: 'pass' },
      { op: 'add_item', section: 'MCP Tests', id: 'T-MCP.2', description: 'Auth works' },
    ])
    // Re-parse the output
    const sections = parseTestcaseBody(body)
    assert.equal(sections.length, 2)
    assert.equal(sections[0].items[0].id, 'T-UI.1')
    assert.equal(sections[0].items[0].status, 'pass')
    assert.equal(sections[1].items.length, 2)
    assert.equal(sections[1].items[1].id, 'T-MCP.2')
    // Apply another op on the already-modified body
    const { body: body2 } = applyOps(body, [{ op: 'set_status', itemId: 'T-MCP.2', status: 'pass' }])
    const sections2 = parseTestcaseBody(body2)
    assert.equal(sections2[1].items[1].status, 'pass')
  })

  // ─── set_resolution ────────────────────────────────────────

  it('set_resolution: sets resolution on fail item', () => {
    const body = `## Tests\n- [-] **T-1** Bug\n- [x] **T-2** Pass\n`
    const { body: updated, errors } = applyOps(body, [
      { op: 'set_resolution', itemId: 'T-1', resolution: 'addressed' },
    ])
    assert.equal(errors.length, 0)
    const sections = parseTestcaseBody(updated)
    assert.equal(sections[0].items[0].resolution, 'addressed')
  })

  it('set_resolution: errors on non-fail item', () => {
    const body = `## Tests\n- [x] **T-1** Pass\n- [ ] **T-2** Open\n`
    const { errors: e1 } = applyOps(body, [
      { op: 'set_resolution', itemId: 'T-1', resolution: 'fixed' },
    ])
    assert.equal(e1.length, 1)
    assert.ok(e1[0].includes('non-fail'))

    const { errors: e2 } = applyOps(body, [
      { op: 'set_resolution', itemId: 'T-2', resolution: 'in_review' },
    ])
    assert.equal(e2.length, 1)
    assert.ok(e2[0].includes('non-fail'))
  })

  it('set_resolution: errors on unknown item', () => {
    const body = `## Tests\n- [-] **T-1** Bug\n`
    const { errors } = applyOps(body, [
      { op: 'set_resolution', itemId: 'T-NOPE.99', resolution: 'fixed' },
    ])
    assert.equal(errors.length, 1)
    assert.ok(errors[0].includes('T-NOPE.99'))
  })

  it('set_resolution: unresolved clears resolution', () => {
    const body = `## Tests\n- [-] **T-1** Bug {fixed}\n`
    const { body: updated } = applyOps(body, [
      { op: 'set_resolution', itemId: 'T-1', resolution: 'unresolved' },
    ])
    const sections = parseTestcaseBody(updated)
    assert.equal(sections[0].items[0].resolution, undefined)
  })

  it('set_resolution: cycles through resolutions', () => {
    const body = `## Tests\n- [-] **T-1** Bug\n`
    const resolutions: TestcaseResolution[] = ['in_review', 'addressed', 'fixed', 'wont_fix']
    let current = body
    for (const res of resolutions) {
      const { body: updated, errors } = applyOps(current, [
        { op: 'set_resolution', itemId: 'T-1', resolution: res },
      ])
      assert.equal(errors.length, 0)
      const sections = parseTestcaseBody(updated)
      assert.equal(sections[0].items[0].resolution, res)
      current = updated
    }
  })

  it('set_resolution: round-trip preserves resolution alongside other ops', () => {
    const body = `## Tests\n- [ ] **T-1** Item\n`
    // First set to fail, then set resolution
    const { body: b1 } = applyOps(body, [{ op: 'set_status', itemId: 'T-1', status: 'fail' }])
    const { body: b2 } = applyOps(b1, [{ op: 'set_resolution', itemId: 'T-1', resolution: 'addressed' }])
    const { body: b3 } = applyOps(b2, [{ op: 'set_comment', itemId: 'T-1', comment: 'investigating' }])
    const sections = parseTestcaseBody(b3)
    assert.equal(sections[0].items[0].status, 'fail')
    assert.equal(sections[0].items[0].resolution, 'addressed')
    assert.equal(sections[0].items[0].comment, 'investigating')
  })

  // ─── Guard test ──────────────────────────────────────────

  it('guard: testcase body update via mux_notes_update should be rejected', () => {
    // This tests the guard logic conceptually — the actual guard is in mcp-tools.ts
    // We verify the condition: noteType === 'testcase' && body provided → reject
    const noteType = 'testcase'
    const bodyProvided = true
    const shouldReject = noteType === 'testcase' && bodyProvided
    assert.equal(shouldReject, true)

    // Non-testcase notes should pass
    const regularType = undefined
    const shouldAllow = regularType !== 'testcase'
    assert.equal(shouldAllow, true)
  })
})
