import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detectStuck } from '../../../src/main/cyber-factory/worker-monitor.js'
import { CYBER_FACTORY_DEFAULTS } from '../../../src/main/cyber-factory/types.js'

const cfg = CYBER_FACTORY_DEFAULTS.stuckDetection
const NOW = 1_000_000_000_000

describe('detectStuck', () => {
  it('returns false when heartbeat is recent and output is growing', () => {
    const snapshot = {
      lastHeartbeat: NOW - 60_000,           // 60s ago
      lastOutputLength: 5_000,
      previousOutputLength: 4_000,           // +1000 chars
      lastOutputCheckAt: NOW - 4 * 60_000,   // 4 min ago (beyond plateau window)
    }
    assert.equal(detectStuck(snapshot, cfg, NOW), false)
  })

  it('returns true when no heartbeat for 8 minutes', () => {
    const snapshot = {
      lastHeartbeat: NOW - 8 * 60_000,       // 8 min ago (> 7 min timeout)
      lastOutputLength: 5_000,
      previousOutputLength: 4_500,
      lastOutputCheckAt: NOW - 60_000,
    }
    assert.equal(detectStuck(snapshot, cfg, NOW), true)
  })

  it('returns true when output plateau (50 chars growth in 4 minutes)', () => {
    const snapshot = {
      lastHeartbeat: NOW - 60_000,           // heartbeat is fine
      lastOutputLength: 5_050,
      previousOutputLength: 5_000,           // only +50 chars (< 100 threshold)
      lastOutputCheckAt: NOW - 4 * 60_000,   // 4 min ago (> 3 min plateau window)
    }
    assert.equal(detectStuck(snapshot, cfg, NOW), true)
  })

  it('returns false when output grew 800 chars even though check was 4 min ago', () => {
    const snapshot = {
      lastHeartbeat: NOW - 60_000,           // heartbeat fine
      lastOutputLength: 5_800,
      previousOutputLength: 5_000,           // +800 chars (> 100 threshold)
      lastOutputCheckAt: NOW - 4 * 60_000,   // 4 min ago (beyond plateau window)
    }
    assert.equal(detectStuck(snapshot, cfg, NOW), false)
  })
})
