import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeWorkspaceBadge } from '../../src/shared/workspace-badge'

const workspaces = [
  { id: 'ws-a', name: 'Workspace A' },
  { id: 'ws-b', name: 'Workspace B' },
]

describe('computeWorkspaceBadge', () => {
  it('shows no badge when the session sits in the active workspace', () => {
    assert.equal(computeWorkspaceBadge('ws-a', 'ws-a', workspaces), null)
  })

  it('shows no badge for an unbound session when no workspace is active', () => {
    assert.equal(computeWorkspaceBadge(null, null, workspaces), null)
    assert.equal(computeWorkspaceBadge(undefined, undefined, workspaces), null)
  })

  it('marks an unbound session as global while a workspace is active', () => {
    const badge = computeWorkspaceBadge(null, 'ws-a', workspaces)
    assert.deepEqual(badge, { label: '', deleted: false, global: true })
  })

  it('shows the other workspace name for a session bound elsewhere', () => {
    const badge = computeWorkspaceBadge('ws-b', 'ws-a', workspaces)
    assert.deepEqual(badge, { label: 'Workspace B', deleted: false, global: false })
  })

  it('shows the other workspace name even when no workspace is active', () => {
    const badge = computeWorkspaceBadge('ws-b', null, workspaces)
    assert.deepEqual(badge, { label: 'Workspace B', deleted: false, global: false })
  })

  it('flags a workspace id that no longer resolves as deleted', () => {
    const badge = computeWorkspaceBadge('ws-gone', 'ws-a', workspaces)
    assert.deepEqual(badge, { label: 'ws-gone', deleted: true, global: false })
  })

  it('treats undefined activeWorkspaceId the same as null', () => {
    assert.equal(computeWorkspaceBadge(null, undefined, workspaces), null)
  })
})
