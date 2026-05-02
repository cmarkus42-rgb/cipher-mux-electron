import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { migrateForward, migrateReverse } from '../../scripts/migrate-to-cyber-factory'

describe('migrateForward', () => {
  it('renames mpo config section to cyber_factory', () => {
    const config: any = { mpo: { maxWorkers: 3 } }
    const result = migrateForward(config)
    assert.deepStrictEqual(config.cyber_factory, { maxWorkers: 3 })
    assert.strictEqual(config.mpo, undefined)
    assert.ok(result.changes.length > 0)
  })

  it('removes mpo section when cyber_factory already exists', () => {
    const config: any = { mpo: { old: true }, cyber_factory: { new: true } }
    migrateForward(config)
    assert.strictEqual(config.mpo, undefined)
    assert.deepStrictEqual(config.cyber_factory, { new: true })
  })

  it('renames workspace cell personas mpo -> cyber-factory', () => {
    const config: any = {
      workspaces: [{
        name: 'test', cells: [
          { persona: 'mpo', project: '', prompt: '' },
          { persona: 'worker', project: '', prompt: '' },
        ],
        promptOverrides: {},
      }],
    }
    migrateForward(config)
    assert.strictEqual(config.workspaces[0].cells[0].persona, 'cyber-factory')
    assert.strictEqual(config.workspaces[0].cells[1].persona, 'worker')
  })

  it('renames watchdog -> testing-assistant in cells', () => {
    const config: any = {
      workspaces: [{
        name: 'test', cells: [{ persona: 'watchdog', project: '', prompt: '' }],
        promptOverrides: {},
      }],
    }
    migrateForward(config)
    assert.strictEqual(config.workspaces[0].cells[0].persona, 'testing-assistant')
  })

  it('renames entity map keys', () => {
    const config: any = {
      entitySortOrders: { mpo: 20, companion: 40 },
      entityHidden: { watchdog: true },
    }
    migrateForward(config)
    assert.strictEqual(config.entitySortOrders['cyber-factory'], 20)
    assert.strictEqual(config.entitySortOrders.mpo, undefined)
    assert.strictEqual(config.entityHidden['testing-assistant'], true)
    assert.strictEqual(config.entityHidden.watchdog, undefined)
  })

  it('sets experimental flags to true', () => {
    const config: any = { experimental: {} }
    migrateForward(config)
    assert.strictEqual(config.experimental.refinement_v2, true)
    assert.strictEqual(config.experimental.testing_assistant, true)
    assert.strictEqual(config.experimental.audit_full, true)
  })

  it('enables module flags', () => {
    const config: any = {
      debugger: { enabled: false },
      testing_assistant: { enabled: false },
      audit_config: { enabled: false },
    }
    migrateForward(config)
    assert.strictEqual(config.debugger.enabled, true)
    assert.strictEqual(config.testing_assistant.enabled, true)
    assert.strictEqual(config.audit_config.enabled, true)
  })

  it('reports no changes when already migrated', () => {
    const config: any = {
      cyber_factory: { enabled: true },
      experimental: {
        refinement_v2: true, ideation_partner: true, cyber_factory: true,
        testing_assistant: true, audit_full: true,
      },
      debugger: { enabled: true },
      testing_assistant: { enabled: true },
      audit_config: { enabled: true },
    }
    const result = migrateForward(config)
    assert.strictEqual(result.changes.length, 0)
    assert.ok(result.warnings.length > 0)
  })

  it('renames promptOverrides keys', () => {
    const config: any = {
      workspaces: [{
        name: 'test', cells: [],
        promptOverrides: { mpo: 'custom mpo prompt', watchdog: 'watch prompt' },
      }],
    }
    migrateForward(config)
    assert.strictEqual(config.workspaces[0].promptOverrides['cyber-factory'], 'custom mpo prompt')
    assert.strictEqual(config.workspaces[0].promptOverrides['testing-assistant'], 'watch prompt')
    assert.strictEqual(config.workspaces[0].promptOverrides.mpo, undefined)
  })

  it('handles missing workspaces gracefully', () => {
    const config: any = {}
    const result = migrateForward(config)
    assert.ok(result.changes.length > 0) // experimental flags added
  })

  it('creates experimental section if missing', () => {
    const config: any = {}
    migrateForward(config)
    assert.strictEqual(config.experimental.cyber_factory, true)
    assert.strictEqual(config.experimental.refinement_v2, true)
  })
})

describe('migrateReverse', () => {
  it('renames cyber_factory back to mpo', () => {
    const config: any = { cyber_factory: { maxWorkers: 3 } }
    migrateReverse(config)
    assert.deepStrictEqual(config.mpo, { maxWorkers: 3 })
    assert.strictEqual(config.cyber_factory, undefined)
  })

  it('reverts workspace cell personas', () => {
    const config: any = {
      workspaces: [{
        name: 'test', cells: [
          { persona: 'cyber-factory', project: '', prompt: '' },
          { persona: 'testing-assistant', project: '', prompt: '' },
        ],
        promptOverrides: {},
      }],
    }
    migrateReverse(config)
    assert.strictEqual(config.workspaces[0].cells[0].persona, 'mpo')
    assert.strictEqual(config.workspaces[0].cells[1].persona, 'watchdog')
  })

  it('reverts experimental flags but keeps cyber_factory true', () => {
    const config: any = {
      experimental: {
        refinement_v2: true, ideation_partner: true, cyber_factory: true,
        testing_assistant: true, audit_full: true,
      },
    }
    migrateReverse(config)
    assert.strictEqual(config.experimental.refinement_v2, false)
    assert.strictEqual(config.experimental.ideation_partner, false)
    assert.strictEqual(config.experimental.cyber_factory, true) // stays true
    assert.strictEqual(config.experimental.testing_assistant, false)
    assert.strictEqual(config.experimental.audit_full, false)
  })

  it('disables module flags', () => {
    const config: any = {
      debugger: { enabled: true },
      testing_assistant: { enabled: true },
      audit_config: { enabled: true },
    }
    migrateReverse(config)
    assert.strictEqual(config.debugger.enabled, false)
    assert.strictEqual(config.testing_assistant.enabled, false)
    assert.strictEqual(config.audit_config.enabled, false)
  })

  it('round-trips: forward then reverse restores mpo section', () => {
    const original: any = {
      mpo: { maxWorkers: 3 },
      workspaces: [{
        name: 'ws', cells: [{ persona: 'mpo', project: '', prompt: '' }],
        promptOverrides: { mpo: 'test' },
      }],
      entitySortOrders: { mpo: 20 },
      entityHidden: { watchdog: true },
      debugger: { enabled: false },
      testing_assistant: { enabled: false },
      audit_config: { enabled: false },
    }
    const config = JSON.parse(JSON.stringify(original))
    migrateForward(config)
    migrateReverse(config)
    assert.deepStrictEqual(config.mpo, { maxWorkers: 3 })
    assert.strictEqual(config.workspaces[0].cells[0].persona, 'mpo')
    assert.strictEqual(config.entitySortOrders.mpo, 20)
    assert.strictEqual(config.entityHidden.watchdog, true)
  })

  it('reverts promptOverrides keys', () => {
    const config: any = {
      workspaces: [{
        name: 'ws', cells: [],
        promptOverrides: { 'cyber-factory': 'cf prompt', 'testing-assistant': 'ta prompt' },
      }],
    }
    migrateReverse(config)
    assert.strictEqual(config.workspaces[0].promptOverrides.mpo, 'cf prompt')
    assert.strictEqual(config.workspaces[0].promptOverrides.watchdog, 'ta prompt')
  })
})
