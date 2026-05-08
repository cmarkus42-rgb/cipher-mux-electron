// test/main/notes-tree-view.test.ts
// Tests for NotesTreeView logic: buildClassTree, applyTagFilter, filterByWorkspace.
// These are pure functions exported from the component — testable without DOM.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildClassTree, applyTagFilter, filterByWorkspace } from '../../src/renderer/components/NotesTreeView'
import type { NoteInfo, TagClassRepository, TagIndexData } from '../../src/shared/types'

// ─── Helpers ────────────────────────────────────────────────

function makeNote(id: string, tags: string[], title = `Note ${id}`): NoteInfo {
  return {
    id,
    title,
    tags,
    scope: 'global',
    relativePath: `${id}.md`,
    createdAt: '2026-01-01',
    modifiedAt: '2026-01-01',
  }
}

const EMPTY_INDEX: TagIndexData = {
  tagToNoteIds: {},
  classValueCounts: {},
  totalNotes: 0,
  builtAt: '',
}

const SEED_REPO: TagClassRepository = {
  classes: {
    kind: { values: ['bugreport', 'feature', 'journal'], color: '#6366f1' },
    status: { values: ['open', 'done'], color: '#f59e0b' },
    domain: { values: ['trading', 'infra'], color: '#10b981' },
  },
}

// ─── buildClassTree ─────────────────────────────────────────

describe('buildClassTree', () => {
  it('groups class:value tags into two-level tree', () => {
    const notes = [
      makeNote('n1', ['kind:bugreport', 'status:open']),
      makeNote('n2', ['kind:feature', 'status:open']),
      makeNote('n3', ['kind:bugreport', 'domain:trading']),
    ]

    const tree = buildClassTree(notes, SEED_REPO, EMPTY_INDEX)

    assert.equal(tree.length, 3) // domain, kind, status
    const kindNode = tree.find(n => n.className === 'kind')!
    assert.ok(kindNode)
    assert.equal(kindNode.color, '#6366f1')
    assert.equal(kindNode.values.length, 2)

    const bugreportVal = kindNode.values.find(v => v.value === 'bugreport')!
    assert.ok(bugreportVal)
    assert.equal(bugreportVal.fullTag, 'kind:bugreport')
    assert.equal(bugreportVal.count, 2)

    const featureVal = kindNode.values.find(v => v.value === 'feature')!
    assert.equal(featureVal.count, 1)

    assert.equal(kindNode.totalCount, 3)
  })

  it('puts legacy tags under Unklassifiziert', () => {
    const notes = [
      makeNote('n1', ['todo', 'kind:feature']),
      makeNote('n2', ['journal']),
    ]

    const tree = buildClassTree(notes, SEED_REPO, EMPTY_INDEX)
    const unclassified = tree.find(n => n.className === 'Unklassifiziert')!
    assert.ok(unclassified)
    assert.equal(unclassified.values.length, 2)

    const todo = unclassified.values.find(v => v.value === 'todo')!
    assert.equal(todo.count, 1)
    assert.equal(todo.fullTag, 'todo')

    const journal = unclassified.values.find(v => v.value === 'journal')!
    assert.equal(journal.count, 1)
  })

  it('sorts classes alphabetically with Unklassifiziert last', () => {
    const notes = [
      makeNote('n1', ['legacy', 'kind:bugreport', 'domain:trading']),
    ]

    const tree = buildClassTree(notes, SEED_REPO, EMPTY_INDEX)
    const names = tree.map(n => n.className)
    assert.deepEqual(names, ['domain', 'kind', 'Unklassifiziert'])
  })

  it('omits classes with no notes', () => {
    const notes = [
      makeNote('n1', ['kind:bugreport']),
    ]

    const tree = buildClassTree(notes, SEED_REPO, EMPTY_INDEX)
    assert.equal(tree.length, 1)
    assert.equal(tree[0].className, 'kind')
  })

  it('returns empty array for notes with no tags', () => {
    const notes = [makeNote('n1', [])]
    const tree = buildClassTree(notes, SEED_REPO, EMPTY_INDEX)
    assert.equal(tree.length, 0)
  })

  it('sorts values alphabetically within a class', () => {
    const notes = [
      makeNote('n1', ['kind:feature']),
      makeNote('n2', ['kind:bugreport']),
      makeNote('n3', ['kind:journal']),
    ]

    const tree = buildClassTree(notes, SEED_REPO, EMPTY_INDEX)
    const kindNode = tree.find(n => n.className === 'kind')!
    const valueNames = kindNode.values.map(v => v.value)
    assert.deepEqual(valueNames, ['bugreport', 'feature', 'journal'])
  })
})

// ─── applyTagFilter ─────────────────────────────────────────

describe('applyTagFilter', () => {
  const notes = [
    makeNote('n1', ['kind:bugreport', 'status:open']),
    makeNote('n2', ['kind:feature', 'status:done']),
    makeNote('n3', ['kind:bugreport', 'domain:trading']),
    makeNote('n4', ['legacy']),
  ]

  it('returns all notes when filter is empty', () => {
    const result = applyTagFilter(notes, {})
    assert.equal(result.length, 4)
  })

  it('includes notes matching include filter', () => {
    const result = applyTagFilter(notes, { 'kind:bugreport': 'include' })
    assert.equal(result.length, 2)
    assert.ok(result.every(n => n.tags.includes('kind:bugreport')))
  })

  it('excludes notes matching exclude filter', () => {
    const result = applyTagFilter(notes, { 'kind:bugreport': 'exclude' })
    assert.equal(result.length, 2)
    assert.ok(result.every(n => !n.tags.includes('kind:bugreport')))
  })

  it('combines include and exclude', () => {
    const result = applyTagFilter(notes, {
      'kind:bugreport': 'include',
      'domain:trading': 'exclude',
    })
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'n1')
  })

  it('includes legacy tags', () => {
    const result = applyTagFilter(notes, { 'legacy': 'include' })
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'n4')
  })

  it('multiple include filters use OR logic', () => {
    const result = applyTagFilter(notes, {
      'kind:bugreport': 'include',
      'kind:feature': 'include',
    })
    assert.equal(result.length, 3) // n1, n2, n3
  })
})

// ─── filterByWorkspace ──────────────────────────────────────

describe('filterByWorkspace', () => {
  const notes = [
    makeNote('n1', ['kind:bugreport', 'workspace:ws-123']),
    makeNote('n2', ['kind:feature', 'workspace:ws-456']),
    makeNote('n3', ['kind:bugreport']),
    makeNote('n4', ['workspace:ws-123', 'domain:trading']),
  ]

  it('filters to notes with matching scope tag', () => {
    const result = filterByWorkspace(notes, 'ws-123')
    assert.equal(result.length, 2)
    assert.deepEqual(result.map(n => n.id).sort(), ['n1', 'n4'])
  })

  it('returns empty when no notes match workspace', () => {
    const result = filterByWorkspace(notes, 'ws-999')
    assert.equal(result.length, 0)
  })

  it('does not match partial workspace IDs', () => {
    const result = filterByWorkspace(notes, 'ws-12')
    assert.equal(result.length, 0)
  })
})
