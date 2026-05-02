import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Import entity-registry directly — no Electron dependencies
const { EntityRegistry, registerBuiltinEntities } = require('../../src/main/session/entity-registry')

describe('EntityRegistry', () => {
  let registry: InstanceType<typeof EntityRegistry>

  beforeEach(() => {
    registry = new EntityRegistry()
  })

  it('register() + get() stores and retrieves config', () => {
    const config = {
      id: 'companion',
      displayName: 'Coding Companion',
      color: '#ffb74d',
      projectPath: '/tmp/companion',
      features: ['mcp', 'resume'],
    }
    registry.register(config)
    const result = registry.get('companion')
    assert.deepStrictEqual(result, config)
  })

  it('get() returns undefined for unknown entity', () => {
    assert.strictEqual(registry.get('companion'), undefined)
  })

  it('list() returns all registered entities', () => {
    registry.register({
      id: 'orchestrator',
      displayName: 'Orchestrator',
      color: '#4fc3f7',
      projectPath: '/tmp/orch',
      features: ['mcp'],
    })
    registry.register({
      id: 'companion',
      displayName: 'Coding Companion',
      color: '#ffb74d',
      projectPath: '/tmp/comp',
      features: ['mcp'],
    })
    assert.strictEqual(registry.list().length, 2)
  })

  it('linkSession() + getBySessionId() maps session to entity', () => {
    registry.register({
      id: 'companion',
      displayName: 'Coding Companion',
      color: '#ffb74d',
      projectPath: '/tmp/comp',
      features: ['mcp'],
    })
    registry.linkSession('sess-1', 'companion')
    const config = registry.getBySessionId('sess-1')
    assert.strictEqual(config?.id, 'companion')
  })

  it('unlinkSession() removes the mapping', () => {
    registry.register({
      id: 'companion',
      displayName: 'Coding Companion',
      color: '#ffb74d',
      projectPath: '/tmp/comp',
      features: ['mcp'],
    })
    registry.linkSession('sess-1', 'companion')
    registry.unlinkSession('sess-1')
    assert.strictEqual(registry.getBySessionId('sess-1'), undefined)
  })

  it('getEntityIdForSession() returns entity ID', () => {
    registry.register({
      id: 'refinement',
      displayName: 'Refinement',
      color: '#ef5350',
      projectPath: '/tmp/ref',
      features: ['mcp'],
    })
    registry.linkSession('sess-2', 'refinement')
    assert.strictEqual(registry.getEntityIdForSession('sess-2'), 'refinement')
  })

  it('getEntityIdForSession() returns undefined for unknown session', () => {
    assert.strictEqual(registry.getEntityIdForSession('unknown'), undefined)
  })
})

describe('registerBuiltinEntities()', () => {
  it('registers all 8 builtin entities', () => {
    const registry = new EntityRegistry()
    registerBuiltinEntities(registry, '~/.config/cipher-mux/orchestrator', '~/.config/cipher-mux/cyber-factory')
    const entities = registry.list()
    assert.strictEqual(entities.length, 8)
    const ids = entities.map((e: any) => e.id).sort()
    assert.deepStrictEqual(ids, ['audit', 'companion', 'cyber-factory', 'ideation-partner', 'launcher', 'orchestrator', 'refinement', 'voice-relay'])
  })

  it('companion has correct display name and color', () => {
    const registry = new EntityRegistry()
    registerBuiltinEntities(registry, '~/.config/cipher-mux/orchestrator', '~/.config/cipher-mux/cyber-factory')
    const companion = registry.get('companion')
    assert.strictEqual(companion?.displayName, 'Coding Companion')
    assert.strictEqual(companion?.color, '#ffb74d')
    assert.ok(companion?.features.includes('mcp'))
    assert.ok(companion?.features.includes('memory'))
    assert.ok(!('autoResume' in (companion ?? {})), 'autoResume should not exist')
  })

  it('refinement has correct display name and color', () => {
    const registry = new EntityRegistry()
    registerBuiltinEntities(registry, '~/.config/cipher-mux/orchestrator', '~/.config/cipher-mux/cyber-factory')
    const refinement = registry.get('refinement')
    assert.strictEqual(refinement?.displayName, 'Refinement')
    assert.strictEqual(refinement?.color, '#ef5350')
  })

  it('orchestrator gets correct projectPath from BRAND', () => {
    const registry = new EntityRegistry()
    registerBuiltinEntities(registry, '/custom/orch', '/custom/cyber-factory')
    const orch = registry.get('orchestrator')
    assert.strictEqual(orch?.projectPath, '/custom/orch')
    const cf = registry.get('cyber-factory')
    assert.strictEqual(cf?.projectPath, '/custom/cyber-factory')
  })
})
