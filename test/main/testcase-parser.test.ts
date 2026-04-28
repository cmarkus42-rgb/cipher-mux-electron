import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  parseTestcaseItem,
  parseTestcaseBody,
  parseTestcase,
  summarizeTestcase,
  serializeTestcaseItem,
  serializeTestcaseBody,
  isTestcaseNote,
} from '../../src/main/notes/testcase-parser'

describe('testcase-parser', () => {
  // ─── parseTestcaseItem ──────────────────────────────────

  it('parses open checkbox with bold ID', () => {
    const item = parseTestcaseItem('- [ ] **T-UI.1** Grid renders correctly', 0)
    assert.ok(item)
    assert.equal(item.id, 'T-UI.1')
    assert.equal(item.status, 'open')
    assert.equal(item.description, 'Grid renders correctly')
    assert.equal(item.comment, '')
  })

  it('parses pass checkbox', () => {
    const item = parseTestcaseItem('- [x] **T-UI.2** Sidebar opens', 5)
    assert.ok(item)
    assert.equal(item.status, 'pass')
    assert.equal(item.lineIndex, 5)
  })

  it('parses fail checkbox', () => {
    const item = parseTestcaseItem('- [-] **T-UI.3** Copy paste broken', 10)
    assert.ok(item)
    assert.equal(item.status, 'fail')
  })

  it('parses comment after //', () => {
    const item = parseTestcaseItem('- [-] **T-UI.4** Crash on resize // only on M1', 0)
    assert.ok(item)
    assert.equal(item.description, 'Crash on resize')
    assert.equal(item.comment, 'only on M1')
  })

  it('parses screenshot ref in comment', () => {
    const item = parseTestcaseItem('- [-] **T-UI.5** Visual glitch // ![screenshot](shots/1.png)', 0)
    assert.ok(item)
    assert.equal(item.screenshotRef, 'shots/1.png')
  })

  it('parses plain ID without bold', () => {
    const item = parseTestcaseItem('- [ ] T-MCP.1 Connection drops', 0)
    assert.ok(item)
    assert.equal(item.id, 'T-MCP.1')
  })

  it('returns null for non-checkbox lines', () => {
    assert.equal(parseTestcaseItem('## Section', 0), null)
    assert.equal(parseTestcaseItem('Some text', 0), null)
    assert.equal(parseTestcaseItem('', 0), null)
  })

  // ─── parseTestcaseBody ──────────────────────────────────

  it('parses sections with items', () => {
    const body = `## UI Tests
- [ ] **T-UI.1** Grid renders
- [x] **T-UI.2** Sidebar opens

## MCP Tests
- [-] **T-MCP.1** Connection drops
`
    const sections = parseTestcaseBody(body)
    assert.equal(sections.length, 2)
    assert.equal(sections[0].title, 'UI Tests')
    assert.equal(sections[0].items.length, 2)
    assert.equal(sections[1].title, 'MCP Tests')
    assert.equal(sections[1].items.length, 1)
  })

  it('puts items without section into General', () => {
    const body = `- [ ] **T-1** First item
- [x] **T-2** Second item`
    const sections = parseTestcaseBody(body)
    assert.equal(sections.length, 1)
    assert.equal(sections[0].title, 'General')
    assert.equal(sections[0].items.length, 2)
  })

  // ─── parseTestcase (full) ──────────────────────────────

  it('parses complete testcase markdown', () => {
    const raw = `---
title: "v0.11 Tests"
type: testcase
version: "0.11"
created: 2026-04-26
source: mpo
---

## UI
- [ ] **T-UI.1** Grid renders
- [x] **T-UI.2** Sidebar opens
- [-] **T-UI.3** Copy paste
`
    const tc = parseTestcase(raw)
    assert.ok(tc)
    assert.equal(tc.frontmatter.title, 'v0.11 Tests')
    assert.equal(tc.frontmatter.type, 'testcase')
    assert.equal(tc.frontmatter.version, '0.11')
    assert.equal(tc.frontmatter.source, 'mpo')
    assert.equal(tc.sections.length, 1)
    assert.equal(tc.sections[0].items.length, 3)
  })

  it('returns null for non-testcase notes', () => {
    const raw = `---
title: Regular Note
tags: [coding]
---

# Regular Note
Some content.`
    assert.equal(parseTestcase(raw), null)
  })

  // ─── summarizeTestcase ─────────────────────────────────

  it('computes summary correctly', () => {
    const sections = parseTestcaseBody(`## Tests
- [ ] **T-1** Open
- [x] **T-2** Pass
- [x] **T-3** Pass
- [-] **T-4** Fail`)
    const summary = summarizeTestcase(sections)
    assert.equal(summary.total, 4)
    assert.equal(summary.pass, 2)
    assert.equal(summary.fail, 1)
    assert.equal(summary.open, 1)
  })

  // ─── serializeTestcaseItem ─────────────────────────────

  it('serializes open item', () => {
    const line = serializeTestcaseItem({ id: 'T-1', description: 'Test', status: 'open', comment: '', lineIndex: 0 })
    assert.equal(line, '- [ ] **T-1** Test')
  })

  it('serializes pass item', () => {
    const line = serializeTestcaseItem({ id: 'T-2', description: 'Test', status: 'pass', comment: '', lineIndex: 0 })
    assert.equal(line, '- [x] **T-2** Test')
  })

  it('serializes fail item with comment', () => {
    const line = serializeTestcaseItem({ id: 'T-3', description: 'Test', status: 'fail', comment: 'broken', lineIndex: 0 })
    assert.equal(line, '- [-] **T-3** Test // broken')
  })

  // ─── serializeTestcaseBody ─────────────────────────────

  it('round-trips parse and serialize', () => {
    const body = `## UI Tests
- [ ] **T-UI.1** Grid renders
- [x] **T-UI.2** Sidebar opens

## MCP Tests
- [-] **T-MCP.1** Connection drops
`
    const sections = parseTestcaseBody(body)
    const serialized = serializeTestcaseBody(sections)
    const reParsed = parseTestcaseBody(serialized)
    assert.equal(reParsed.length, sections.length)
    assert.equal(reParsed[0].items.length, sections[0].items.length)
    assert.equal(reParsed[0].items[0].id, 'T-UI.1')
    assert.equal(reParsed[1].items[0].status, 'fail')
  })

  // ─── isTestcaseNote ────────────────────────────────────

  it('detects testcase notes', () => {
    assert.equal(isTestcaseNote('---\ntype: testcase\ntitle: X\n---\nBody'), true)
    assert.equal(isTestcaseNote('---\ntitle: X\ntags: []\n---\nBody'), false)
    assert.equal(isTestcaseNote('no frontmatter'), false)
  })
})
