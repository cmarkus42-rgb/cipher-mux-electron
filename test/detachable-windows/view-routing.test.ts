import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * REQ-DW-007: View Routing — tests that URL parameters correctly determine
 * which view component to mount.
 *
 * The production logic in main.tsx:
 *   ?view=session&id=X → DetachedSessionView
 *   ?view=note&id=X → DetachedNoteView
 *   ?view=workspaces → WorkspacesWindow
 *   ?view=sidebar → SidebarWindow
 *   (default) → App
 *
 * We test the routing decision logic as a pure function.
 */

type ViewType = 'session' | 'note' | 'workspaces' | 'sidebar' | 'app' | 'error'

interface RouteResult {
  view: ViewType
  id?: string
  error?: string
}

/** Pure function that mirrors main.tsx routing logic */
function resolveRoute(searchParams: string): RouteResult {
  const params = new URLSearchParams(searchParams)
  const view = params.get('view')
  const id = params.get('id')

  if (view === 'workspaces') return { view: 'workspaces' }
  if (view === 'sidebar') return { view: 'sidebar' }

  if (view === 'session') {
    if (!id) return { view: 'error', error: 'Missing "id" parameter for session view' }
    return { view: 'session', id }
  }

  if (view === 'note') {
    if (!id) return { view: 'error', error: 'Missing "id" parameter for note view' }
    return { view: 'note', id }
  }

  return { view: 'app' }
}

describe('REQ-DW-007: View Routing', () => {
  it('?view=session&id=X routes to DetachedSessionView', () => {
    const result = resolveRoute('view=session&id=sess-123')
    assert.strictEqual(result.view, 'session')
    assert.strictEqual(result.id, 'sess-123')
  })

  it('?view=note&id=X routes to DetachedNoteView', () => {
    const result = resolveRoute('view=note&id=note-abc')
    assert.strictEqual(result.view, 'note')
    assert.strictEqual(result.id, 'note-abc')
  })

  it('?view=session without id produces error', () => {
    const result = resolveRoute('view=session')
    assert.strictEqual(result.view, 'error')
    assert.ok(result.error?.includes('id'))
  })

  it('?view=note without id produces error', () => {
    const result = resolveRoute('view=note')
    assert.strictEqual(result.view, 'error')
    assert.ok(result.error?.includes('id'))
  })

  it('?view=workspaces routes to WorkspacesWindow', () => {
    const result = resolveRoute('view=workspaces')
    assert.strictEqual(result.view, 'workspaces')
    assert.strictEqual(result.id, undefined)
  })

  it('?view=sidebar routes to SidebarWindow', () => {
    const result = resolveRoute('view=sidebar')
    assert.strictEqual(result.view, 'sidebar')
  })

  it('no view parameter routes to main App', () => {
    const result = resolveRoute('')
    assert.strictEqual(result.view, 'app')
  })

  it('unknown view parameter routes to main App', () => {
    const result = resolveRoute('view=unknown')
    assert.strictEqual(result.view, 'app')
  })

  it('handles URL-encoded entity IDs', () => {
    const result = resolveRoute('view=session&id=sess%2F123')
    assert.strictEqual(result.view, 'session')
    assert.strictEqual(result.id, 'sess/123')
  })

  it('extra parameters are ignored', () => {
    const result = resolveRoute('view=session&id=sess-1&extra=ignored')
    assert.strictEqual(result.view, 'session')
    assert.strictEqual(result.id, 'sess-1')
  })
})
