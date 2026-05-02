// test/main/shortcut-registry.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ShortcutRegistry } from '../../src/renderer/shortcut-registry'

describe('ShortcutRegistry', () => {
  let registry: ShortcutRegistry

  beforeEach(() => {
    registry = new ShortcutRegistry()
  })

  it('registers and retrieves shortcuts', () => {
    registry.register({ combo: 'Cmd+K', label: 'Toggle Chat', category: 'Navigation', action: () => {} })
    const all = registry.getAll()
    assert.equal(all.length, 1)
    assert.equal(all[0].combo, 'Cmd+K')
  })

  it('unregisters shortcuts', () => {
    registry.register({ combo: 'Cmd+K', label: 'Toggle Chat', category: 'Navigation', action: () => {} })
    registry.unregister('Cmd+K')
    assert.equal(registry.getAll().length, 0)
  })

  it('handles matching keydown event', () => {
    let called = false
    registry.register({ combo: 'Cmd+K', label: 'Toggle Chat', category: 'Navigation', action: () => { called = true } })
    const event = { metaKey: true, key: 'k', code: 'KeyK', preventDefault: () => {}, stopPropagation: () => {} } as unknown as KeyboardEvent
    const handled = registry.handleKeyDown(event)
    assert.equal(handled, true)
    assert.equal(called, true)
  })

  it('ignores non-matching events', () => {
    let called = false
    registry.register({ combo: 'Cmd+K', label: 'Toggle Chat', category: 'Navigation', action: () => { called = true } })
    const event = { metaKey: false, key: 'k', code: 'KeyK', preventDefault: () => {}, stopPropagation: () => {} } as unknown as KeyboardEvent
    const handled = registry.handleKeyDown(event)
    assert.equal(handled, false)
    assert.equal(called, false)
  })
})
