import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  ENTITY_HEADER,
  ENTITY_HEADER_CANONICAL,
  parseEntityHeader,
  resolveEntityId,
} from '../../../src/main/mcp/entity-header'
import { buildMcpServerConfig } from '../../../src/main/mcp/workspace-header'

// ─── Role identity on the MCP connection ────────────────────
//
// The server had no way to tell which role was calling: one URL, one bearer
// token, and only a workspace header. Two items on the roadmap need that
// identity — limiting companion memory to the Companion role, and role
// boundaries as a constraint — and neither is reachable by editing a
// permission list, because a missing permission only produces a prompt, it
// does not withhold a tool.
//
// Same shape as the workspace header deliberately: identity rides on the
// connection and is bound once at initialize, rather than being a tool
// parameter the model can forget.

const KNOWN = ['companion', 'debugger', 'refinement', 'cyber-factory'] as const

describe('parseEntityHeader', () => {
  it('reads the lowercase header Node hands over', () => {
    assert.equal(parseEntityHeader({ [ENTITY_HEADER]: 'companion' }), 'companion')
  })

  it('treats absent, empty and whitespace as no identity', () => {
    assert.equal(parseEntityHeader({}), null)
    assert.equal(parseEntityHeader({ [ENTITY_HEADER]: '' }), null)
    assert.equal(parseEntityHeader({ [ENTITY_HEADER]: '   ' }), null)
    assert.equal(parseEntityHeader({ [ENTITY_HEADER]: undefined }), null)
  })

  it('takes the first value when a header arrives repeated', () => {
    assert.equal(parseEntityHeader({ [ENTITY_HEADER]: ['debugger', 'companion'] }), 'debugger')
  })

  it('trims surrounding whitespace', () => {
    assert.equal(parseEntityHeader({ [ENTITY_HEADER]: '  refinement ' }), 'refinement')
  })
})

describe('resolveEntityId', () => {
  it('accepts a known entity', () => {
    assert.equal(resolveEntityId('debugger', KNOWN), 'debugger')
  })

  it('treats an unknown id as no identity rather than failing', () => {
    // A client whose entity was renamed or removed must keep working, exactly
    // as resolveWorkspaceId treats a deleted workspace.
    assert.equal(resolveEntityId('ghost-role', KNOWN), null)
  })

  it('passes null through', () => {
    assert.equal(resolveEntityId(null, KNOWN), null)
  })
})

describe('buildMcpServerConfig — entity header', () => {
  it('writes the entity header when an entity is given', () => {
    const cfg = buildMcpServerConfig('http://h/mcp', 'key', 'ws-1', 'companion')
    assert.equal(cfg.headers[ENTITY_HEADER_CANONICAL], 'companion')
  })

  it('omits the header entirely when there is no entity', () => {
    const cfg = buildMcpServerConfig('http://h/mcp', 'key', 'ws-1')
    assert.ok(
      !(ENTITY_HEADER_CANONICAL in cfg.headers),
      'an absent entity must be indistinguishable from a pre-upgrade client',
    )
  })

  it('leaves the workspace header and auth untouched', () => {
    const cfg = buildMcpServerConfig('http://h/mcp', 'key', 'ws-1', 'debugger')
    assert.equal(cfg.headers['Authorization'], 'Bearer key')
    assert.equal(cfg.headers['X-Mux-Workspace'], 'ws-1')
    assert.equal(cfg.type, 'http')
    assert.equal(cfg.url, 'http://h/mcp')
  })

  it('carries the entity even for an unbound workspace', () => {
    const cfg = buildMcpServerConfig('http://h/mcp', 'key', null, 'companion')
    assert.equal(cfg.headers[ENTITY_HEADER_CANONICAL], 'companion')
    assert.ok(!('X-Mux-Workspace' in cfg.headers))
  })
})
