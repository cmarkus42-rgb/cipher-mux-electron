import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  generateLocalFactoryPreset,
  generateLocalWorkerPreset,
  LOCAL_WORKER_DISPATCH_TOOL,
} from '../../../src/main/local-factory/presets'

describe('Local Cyber Factory presets', () => {
  it('Architekt nennt das Werkzeug, die 2-Versuche-Grenze und dass er nicht codet', () => {
    const p = generateLocalFactoryPreset()
    assert.match(p, new RegExp(LOCAL_WORKER_DISPATCH_TOOL))
    assert.match(p, /2 Versuche/)
    assert.match(p, /codest nicht/i)
  })
  it('Architekt pollt nicht', () => {
    assert.match(generateLocalFactoryPreset(), /nicht.*capture-pane|kein.*Polling/i)
  })
  it('Worker endet mit REPORT.md und fasst Abnahmetests nicht an', () => {
    const p = generateLocalWorkerPreset()
    assert.match(p, /REPORT\.md/)
    assert.match(p, /Abnahmetest/)
  })
})
