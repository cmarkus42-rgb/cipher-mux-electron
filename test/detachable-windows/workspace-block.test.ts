import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * REQ-DW-009: Workspace Block — tests that workspace save/apply is blocked
 * when detached windows exist, and enabled when all are docked.
 *
 * The production logic in WorkspacePopup.tsx:
 *   - calls api.detach.hasDetached() to check
 *   - disables "Update Current" and "Apply" buttons when true
 *
 * We test the pure decision logic.
 */

/** Simulates the hasDetached check from WindowManager */
function hasDetached(entries: Array<{ type: string; entityId: string }>): boolean {
  return entries.length > 0
}

/** Simulates the workspace action guard */
function canApplyWorkspace(detachedEntries: Array<{ type: string; entityId: string }>): {
  allowed: boolean
  reason?: string
} {
  if (hasDetached(detachedEntries)) {
    return { allowed: false, reason: 'Dock all detached windows before saving' }
  }
  return { allowed: true }
}

describe('REQ-DW-009: Workspace Block', () => {
  it('blocks workspace apply when sessions are detached', () => {
    const entries = [{ type: 'session', entityId: 'sess-1' }]
    const result = canApplyWorkspace(entries)
    assert.strictEqual(result.allowed, false)
    assert.ok(result.reason)
  })

  it('blocks workspace apply when notes are detached', () => {
    const entries = [{ type: 'note', entityId: 'note-1' }]
    const result = canApplyWorkspace(entries)
    assert.strictEqual(result.allowed, false)
  })

  it('allows workspace apply when no windows are detached', () => {
    const result = canApplyWorkspace([])
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.reason, undefined)
  })

  it('blocks when multiple windows are detached', () => {
    const entries = [
      { type: 'session', entityId: 'sess-1' },
      { type: 'note', entityId: 'note-1' },
      { type: 'session', entityId: 'sess-2' },
    ]
    const result = canApplyWorkspace(entries)
    assert.strictEqual(result.allowed, false)
  })

  it('allows after all detached windows are docked back', () => {
    // Simulate: had detached, now empty
    let entries = [{ type: 'session', entityId: 'sess-1' }]
    assert.strictEqual(canApplyWorkspace(entries).allowed, false)

    // Dock all
    entries = []
    assert.strictEqual(canApplyWorkspace(entries).allowed, true)
  })

  it('hasDetached returns false for empty array', () => {
    assert.strictEqual(hasDetached([]), false)
  })

  it('hasDetached returns true for non-empty array', () => {
    assert.strictEqual(hasDetached([{ type: 'session', entityId: 'x' }]), true)
  })
})
