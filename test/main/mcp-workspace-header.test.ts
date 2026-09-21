import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  WORKSPACE_HEADER,
  parseWorkspaceHeader,
  resolveWorkspaceId,
  buildMcpServerConfig,
} from '../../src/main/mcp/workspace-header'

describe('parseWorkspaceHeader', () => {
  it('reads the lowercase header name Node hands us', () => {
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': 'ws-alpha' }), 'ws-alpha')
  })

  it('returns null when the header is absent — an older client must keep working', () => {
    assert.equal(parseWorkspaceHeader({ authorization: 'Bearer x' }), null)
  })

  it('returns null for an empty or whitespace-only value', () => {
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': '' }), null)
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': '   ' }), null)
  })

  it('trims surrounding whitespace', () => {
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': ' ws-alpha ' }), 'ws-alpha')
  })

  it('takes the first value when the header arrives repeated', () => {
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': ['ws-alpha', 'ws-beta'] }), 'ws-alpha')
  })

  it('exposes the header name in lowercase', () => {
    assert.equal(WORKSPACE_HEADER, 'x-mux-workspace')
  })
})

describe('resolveWorkspaceId', () => {
  it('accepts a known workspace', () => {
    assert.equal(resolveWorkspaceId('ws-alpha', ['ws-alpha', 'ws-beta']), 'ws-alpha')
  })

  it('falls back to null for an unknown workspace instead of throwing', () => {
    assert.equal(resolveWorkspaceId('ws-deleted', ['ws-alpha']), null)
  })

  it('passes null straight through', () => {
    assert.equal(resolveWorkspaceId(null, ['ws-alpha']), null)
  })

  it('falls back to null when no workspaces exist at all', () => {
    assert.equal(resolveWorkspaceId('ws-alpha', []), null)
  })
})

describe('buildMcpServerConfig', () => {
  it('includes the workspace header when bound', () => {
    const cfg = buildMcpServerConfig('http://127.0.0.1:7777/mcp', 'key123', 'ws-alpha')
    assert.equal(cfg.type, 'http')
    assert.equal(cfg.url, 'http://127.0.0.1:7777/mcp')
    assert.equal(cfg.headers.Authorization, 'Bearer key123')
    assert.equal(cfg.headers['X-Mux-Workspace'], 'ws-alpha')
  })

  it('omits the header entirely when unbound — not an empty string', () => {
    const cfg = buildMcpServerConfig('http://127.0.0.1:7777/mcp', 'key123', null)
    assert.equal('X-Mux-Workspace' in cfg.headers, false)
    assert.equal(cfg.headers.Authorization, 'Bearer key123')
  })

  it('round-trips through parseWorkspaceHeader with lowercased keys', () => {
    const cfg = buildMcpServerConfig('http://x/mcp', 'k', 'ws-alpha')
    const lowered: Record<string, string> = {}
    for (const [k, v] of Object.entries(cfg.headers)) lowered[k.toLowerCase()] = v
    assert.equal(parseWorkspaceHeader(lowered), 'ws-alpha')
  })
})
