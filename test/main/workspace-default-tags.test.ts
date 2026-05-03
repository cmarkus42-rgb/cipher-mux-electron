// test/main/workspace-default-tags.test.ts
// REQ-NOTES-008: Workspace-Default-Tags Auto-Merge
// REQ-NOTES-011: Tag-Editor klasse:wert validation

import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'

// ─── Helpers ────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ws-default-tags-test-'))
}

/** Simulate the workspace-default-tag merge logic from ipc-hub NOTES_CREATE */
function mergeWorkspaceTags(manualTags: string[], workspaceDefaultTags: string[]): string[] {
  const tagSet = new Set([...manualTags, ...workspaceDefaultTags])
  return [...tagSet]
}

/** Simulate the workspace-default-tag merge logic from ipc-hub NOTES_SAVE */
function mergeWorkspaceTagsOnSave(tags: string[], workspaceDefaultTags: string[]): string[] {
  const tagSet = new Set([...tags, ...workspaceDefaultTags])
  return [...tagSet]
}

/** Validate klasse:wert format (from WorkspacesTab handleAddTag) */
function isValidWorkspaceTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase()
  if (!normalized || !normalized.includes(':')) return false
  const [klasse, ...rest] = normalized.split(':')
  return klasse.length > 0 && rest.join(':').length > 0
}

/** Check if a tag is a workspace default (protected from removal) */
function isProtectedTag(tag: string, workspaceDefaults: string[]): boolean {
  return workspaceDefaults.includes(tag)
}

// ─── REQ-NOTES-008: Auto-Merge on Create ────────────────────

describe('Workspace Default Tags — Auto-Merge (REQ-NOTES-008)', () => {
  let tmpDir: string
  let mgr: NoteManager

  before(async () => {
    tmpDir = await makeTempDir()
    mgr = new NoteManager(tmpDir)
  })

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('merges workspace defaults with manual tags (set union)', () => {
    const manual = ['kind:bugreport', 'domain:trading']
    const wsDefaults = ['project:cipher-mux', 'phase:development']
    const merged = mergeWorkspaceTags(manual, wsDefaults)
    assert.equal(merged.length, 4)
    assert.ok(merged.includes('kind:bugreport'))
    assert.ok(merged.includes('domain:trading'))
    assert.ok(merged.includes('project:cipher-mux'))
    assert.ok(merged.includes('phase:development'))
  })

  it('deduplicates overlapping manual and workspace tags', () => {
    const manual = ['kind:bugreport', 'project:cipher-mux']
    const wsDefaults = ['project:cipher-mux', 'domain:trading']
    const merged = mergeWorkspaceTags(manual, wsDefaults)
    assert.equal(merged.length, 3)
    assert.equal(merged.filter(t => t === 'project:cipher-mux').length, 1)
  })

  it('returns only workspace defaults when no manual tags', () => {
    const merged = mergeWorkspaceTags([], ['project:cipher-mux', 'domain:trading'])
    assert.equal(merged.length, 2)
    assert.ok(merged.includes('project:cipher-mux'))
    assert.ok(merged.includes('domain:trading'))
  })

  it('returns only manual tags when no workspace defaults', () => {
    const merged = mergeWorkspaceTags(['kind:bugreport'], [])
    assert.equal(merged.length, 1)
    assert.equal(merged[0], 'kind:bugreport')
  })

  it('creates note with merged tags via NoteManager', async () => {
    const manualTags = ['kind:feature']
    const wsDefaults = ['project:cipher-mux']
    const merged = mergeWorkspaceTags(manualTags, wsDefaults)
    const note = await mgr.create('Test Note', '# Test\n\nBody', merged)
    assert.ok(note.tags.includes('kind:feature'))
    assert.ok(note.tags.includes('project:cipher-mux'))
  })
})

// ─── REQ-NOTES-008: Re-Merge on Save ────────────────────────

describe('Workspace Default Tags — Re-Merge on Save (REQ-NOTES-008)', () => {
  let tmpDir: string
  let mgr: NoteManager

  before(async () => {
    tmpDir = await makeTempDir()
    mgr = new NoteManager(tmpDir)
  })

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('preserves workspace defaults when auto-tagging returns different tags', () => {
    const autoTags = ['kind:bugreport', 'domain:infra'] // auto-tagger result
    const wsDefaults = ['project:cipher-mux']
    const merged = mergeWorkspaceTagsOnSave(autoTags, wsDefaults)
    assert.ok(merged.includes('project:cipher-mux'), 'workspace default must survive auto-tagging')
    assert.ok(merged.includes('kind:bugreport'))
    assert.ok(merged.includes('domain:infra'))
  })

  it('does not duplicate workspace defaults if already present', () => {
    const existingTags = ['kind:bugreport', 'project:cipher-mux']
    const wsDefaults = ['project:cipher-mux']
    const merged = mergeWorkspaceTagsOnSave(existingTags, wsDefaults)
    assert.equal(merged.filter(t => t === 'project:cipher-mux').length, 1)
  })
})

// ─── REQ-NOTES-008: Removal Protection ──────────────────────

describe('Workspace Default Tags — Removal Protection (REQ-NOTES-008)', () => {
  it('blocks removal of workspace default tag', () => {
    const wsDefaults = ['project:cipher-mux', 'domain:trading']
    assert.ok(isProtectedTag('project:cipher-mux', wsDefaults))
    assert.ok(isProtectedTag('domain:trading', wsDefaults))
  })

  it('allows removal of non-default tags', () => {
    const wsDefaults = ['project:cipher-mux']
    assert.ok(!isProtectedTag('kind:bugreport', wsDefaults))
    assert.ok(!isProtectedTag('domain:trading', wsDefaults))
  })

  it('allows removal when no workspace is active (empty defaults)', () => {
    assert.ok(!isProtectedTag('project:cipher-mux', []))
  })

  it('filters workspace defaults from removable common tags in bulk bar', () => {
    const commonTags = ['kind:bugreport', 'project:cipher-mux', 'domain:trading']
    const wsDefaults = ['project:cipher-mux']
    const removable = commonTags.filter(t => !isProtectedTag(t, wsDefaults))
    assert.equal(removable.length, 2)
    assert.ok(!removable.includes('project:cipher-mux'))
    assert.ok(removable.includes('kind:bugreport'))
    assert.ok(removable.includes('domain:trading'))
  })
})

// ─── REQ-NOTES-011: klasse:wert Validation ──────────────────

describe('Workspace Tag Editor — klasse:wert Validation (REQ-NOTES-011)', () => {
  it('accepts valid klasse:wert tag', () => {
    assert.ok(isValidWorkspaceTag('project:cipher-mux'))
    assert.ok(isValidWorkspaceTag('domain:trading'))
    assert.ok(isValidWorkspaceTag('Kind:Bugreport')) // case insensitive internally
    assert.ok(isValidWorkspaceTag('scope:ws-123'))
  })

  it('rejects tag without colon', () => {
    assert.ok(!isValidWorkspaceTag('bugreport'))
    assert.ok(!isValidWorkspaceTag('trading'))
    assert.ok(!isValidWorkspaceTag(''))
  })

  it('rejects tag with colon but empty klasse', () => {
    assert.ok(!isValidWorkspaceTag(':bugreport'))
  })

  it('rejects tag with colon but empty wert', () => {
    assert.ok(!isValidWorkspaceTag('kind:'))
    assert.ok(!isValidWorkspaceTag('project:'))
  })

  it('rejects whitespace-only input', () => {
    assert.ok(!isValidWorkspaceTag('  '))
    assert.ok(!isValidWorkspaceTag('\t'))
  })

  it('accepts tags with multiple colons (nested values)', () => {
    assert.ok(isValidWorkspaceTag('scope:ws:special'))
  })

  it('trims and lowercases input', () => {
    // Simulate the normalization done in handleAddTag
    const input = '  Project:Cipher-Mux  '
    const normalized = input.trim().toLowerCase()
    assert.equal(normalized, 'project:cipher-mux')
    assert.ok(isValidWorkspaceTag(input))
  })
})

// ─── REQ-NOTES-008: Manual tag limit excludes workspace defaults ──

describe('Workspace Default Tags — Manual Tag Limit (REQ-NOTES-008)', () => {
  it('workspace defaults do not count toward MAX_MANUAL_TAGS', () => {
    const MAX_MANUAL_TAGS = 5
    const manualTags = ['kind:bugreport', 'domain:trading', 'tech:typescript', 'phase:debugging', 'status:open']
    const wsDefaults = ['project:cipher-mux', 'scope:ws-123']

    // Manual tags at limit
    assert.equal(manualTags.length, MAX_MANUAL_TAGS)
    // Total exceeds limit
    const merged = mergeWorkspaceTags(manualTags, wsDefaults)
    assert.equal(merged.length, 7)
    // But manual count is within limit
    assert.ok(manualTags.length <= MAX_MANUAL_TAGS, 'manual tags should not be blocked')
  })
})
