import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseComboForElectron } from '../../src/main/bluetooth/bt-remote-manager'
import type { BridgeHidEvent, DeviceProfile } from '../../src/main/bluetooth/bt-remote-types'

describe('parseComboForElectron', () => {
  it('parses Cmd+Shift+W', () => {
    const result = parseComboForElectron('Cmd+Shift+W')
    assert.equal(result.keyCode, 'W')
    assert.deepEqual(result.modifiers.sort(), ['meta', 'shift'])
  })

  it('parses Cmd+C', () => {
    const result = parseComboForElectron('Cmd+C')
    assert.equal(result.keyCode, 'C')
    assert.deepEqual(result.modifiers, ['meta'])
  })

  it('parses single key', () => {
    const result = parseComboForElectron('Escape')
    assert.equal(result.keyCode, 'Escape')
    assert.deepEqual(result.modifiers, [])
  })

  it('parses Ctrl+Alt+Delete', () => {
    const result = parseComboForElectron('Ctrl+Alt+Delete')
    assert.equal(result.keyCode, 'Delete')
    assert.deepEqual(result.modifiers.sort(), ['alt', 'control'])
  })

  it('handles Meta alias for Cmd', () => {
    const result = parseComboForElectron('Meta+A')
    assert.equal(result.keyCode, 'A')
    assert.deepEqual(result.modifiers, ['meta'])
  })
})

describe('BtRemoteManager.resolveAction (logic)', () => {
  // Test the resolution logic without spawning a process
  // by replicating the algorithm from bt-remote-manager.ts

  const satechiProfile: DeviceProfile = {
    vendorId: '0x1915',
    productId: '0xEEEE',
    name: 'Satechi R2',
    buttons: [
      { id: 'dpad-up', label: 'D-Pad Up', usagePage: 7, usage: 82 },
      { id: 'dpad-left', label: 'D-Pad Left', usagePage: 7, usage: 80 },
      { id: 'dpad-right', label: 'D-Pad Right', usagePage: 7, usage: 79 },
      { id: 'center', label: 'Center', usagePage: 7, usage: 40 },
      { id: 'btn-l', label: 'L', usagePage: 9, usage: 2 },
      { id: 'home', label: 'Home', usagePage: 12, usage: 547 },
    ],
    mapping: {
      'dpad-up': 'passthrough',
      'dpad-left': 'Ctrl+U',
      'dpad-right': 'Cmd+V',
      'center': 'passthrough',
      'btn-l': 'passthrough',
      'home': 'Cmd+C',
    },
  }

  function resolveAction(profiles: DeviceProfile[], event: BridgeHidEvent) {
    const [vid, pid] = event.device.split(':')
    const profile = profiles.find(
      p => p.vendorId.toLowerCase().replace(/^0x/, '') === vid
        && p.productId.toLowerCase().replace(/^0x/, '') === pid,
    )
    if (!profile) return { type: 'unmapped', buttonId: 'unknown', deviceId: event.device }

    const button = profile.buttons.find(
      b => b.usagePage === event.usagePage && b.usage === event.usage,
    )
    if (!button) return { type: 'unmapped', buttonId: 'unknown', deviceId: event.device }

    const mapping = profile.mapping[button.id]
    if (!mapping || mapping === 'disabled') return { type: 'disabled', buttonId: button.id, deviceId: event.device }
    if (mapping === 'passthrough') return { type: 'passthrough', buttonId: button.id, deviceId: event.device }
    return { type: 'shortcut', combo: mapping, buttonId: button.id, deviceId: event.device }
  }

  it('resolves dpad-up as passthrough (terminal history)', () => {
    const event: BridgeHidEvent = { device: '1915:eeee', usagePage: 7, usage: 82, value: 1 }
    const action = resolveAction([satechiProfile], event)
    assert.equal(action.type, 'passthrough')
    assert.equal(action.buttonId, 'dpad-up')
  })

  it('resolves dpad-left to Ctrl+U (clear input)', () => {
    const event: BridgeHidEvent = { device: '1915:eeee', usagePage: 7, usage: 80, value: 1 }
    const action = resolveAction([satechiProfile], event)
    assert.equal(action.type, 'shortcut')
    assert.equal(action.combo, 'Ctrl+U')
    assert.equal(action.buttonId, 'dpad-left')
  })

  it('resolves dpad-right to Cmd+V (paste)', () => {
    const event: BridgeHidEvent = { device: '1915:eeee', usagePage: 7, usage: 79, value: 1 }
    const action = resolveAction([satechiProfile], event)
    assert.equal(action.type, 'shortcut')
    assert.equal(action.combo, 'Cmd+V')
    assert.equal(action.buttonId, 'dpad-right')
  })

  it('resolves passthrough button', () => {
    const event: BridgeHidEvent = { device: '1915:eeee', usagePage: 7, usage: 40, value: 1 }
    const action = resolveAction([satechiProfile], event)
    assert.equal(action.type, 'passthrough')
    assert.equal(action.buttonId, 'center')
  })

  it('resolves btn-l as passthrough', () => {
    const event: BridgeHidEvent = { device: '1915:eeee', usagePage: 9, usage: 2, value: 1 }
    const action = resolveAction([satechiProfile], event)
    assert.equal(action.type, 'passthrough')
    assert.equal(action.buttonId, 'btn-l')
  })

  it('returns unmapped for unknown device', () => {
    const event: BridgeHidEvent = { device: 'dead:beef', usagePage: 7, usage: 82, value: 1 }
    const action = resolveAction([satechiProfile], event)
    assert.equal(action.type, 'unmapped')
  })

  it('returns unmapped for unknown button on known device', () => {
    const event: BridgeHidEvent = { device: '1915:eeee', usagePage: 7, usage: 999, value: 1 }
    const action = resolveAction([satechiProfile], event)
    assert.equal(action.type, 'unmapped')
  })

  it('resolves Consumer page button (Home)', () => {
    const event: BridgeHidEvent = { device: '1915:eeee', usagePage: 12, usage: 547, value: 1 }
    const action = resolveAction([satechiProfile], event)
    assert.equal(action.type, 'shortcut')
    assert.equal(action.combo, 'Cmd+C')
    assert.equal(action.buttonId, 'home')
  })
})
