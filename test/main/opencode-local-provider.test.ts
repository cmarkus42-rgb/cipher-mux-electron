import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { mergeOpenCodeConfig, buildOpenCodeMcpEntry } from '../../src/main/agent/adapters/opencode'
import { buildLocalProviderBlock, localModelSpec } from '../../src/main/local-factory/local-provider'

const entry = buildOpenCodeMcpEntry('http://127.0.0.1:3100/mcp', 'k', null, 'local-worker')
const cfg = { baseUrl: 'http://h/v1', model: 'qwen', contextWindow: 1000, maxOutputTokens: 100 }
const local = { provider: buildLocalProviderBlock(cfg), model: localModelSpec(cfg) }

type Merged = { provider?: Record<string, { options?: { baseURL?: string } }>; model?: string }

describe('mergeOpenCodeConfig mit lokalem Anbieter', () => {
  it('schreibt provider.cipher-local und model', () => {
    const m = mergeOpenCodeConfig({}, entry, [], local) as Merged
    assert.equal(m.provider?.['cipher-local']?.options?.baseURL, 'http://h/v1')
    assert.equal(m.model, 'cipher-local/qwen')
  })
  it('fremde Anbieter bleiben stehen', () => {
    const m = mergeOpenCodeConfig({ provider: { other: { x: 1 } } }, entry, [], local) as Merged
    assert.deepEqual(m.provider.other, { x: 1 })
  })
  it('ohne local: ein früher geschriebener eigener Anbieter verschwindet, fremdes model bleibt', () => {
    const before = mergeOpenCodeConfig({}, entry, [], local)
    const m = mergeOpenCodeConfig({ ...before, model: 'anthropic/x' }, entry, [], null) as Merged
    assert.equal(m.provider?.['cipher-local'], undefined)
    assert.equal(m.model, 'anthropic/x')
  })
  it('ohne local: das eigene model wird entfernt', () => {
    const before = mergeOpenCodeConfig({}, entry, [], local)
    const m = mergeOpenCodeConfig(before, entry, [], null) as Merged
    assert.equal(m.model, undefined)
  })
})
