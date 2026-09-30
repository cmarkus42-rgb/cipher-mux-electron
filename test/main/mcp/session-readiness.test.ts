import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { waitForSessionReady } from '../../../src/main/mcp/session-readiness'
import type { ReadinessProbes } from '../../../src/main/mcp/session-readiness'

// ─── Helpers ────────────────────────────────────────────────

const SINCE = 1_000_000

/** Probes that report nothing, overridable per test. No real waiting. */
function probes(over: Partial<ReadinessProbes> = {}): ReadinessProbes {
  return {
    statusReportMtime: async () => null,
    capturePane: async () => '',
    sleep: async () => {},
    ...over,
  }
}

const FAST = { since: SINCE, delays: [1, 1, 1] }

// ─── waitForSessionReady ────────────────────────────────────
//
// Two independent signals that a session is up. The point of the design is
// that neither can veto the other: this loop previously gated its only
// reliable check behind a heuristic, and when that heuristic broke, every
// handoff into a fresh session timed out against a session sitting ready.

describe('waitForSessionReady', () => {
  it('reports ready via the session\'s own status-line report', async () => {
    const result = await waitForSessionReady(
      probes({ statusReportMtime: async () => SINCE + 10 }),
      'sess-1',
      FAST,
    )

    assert.equal(result.ready, true)
    assert.equal(result.via, 'status-line')
  })

  it('ignores a status report left over from an earlier run', async () => {
    const result = await waitForSessionReady(
      probes({ statusReportMtime: async () => SINCE - 1 }),
      'sess-1',
      FAST,
    )

    assert.equal(result.ready, false, 'a stale report must not count as readiness')
    assert.equal(result.via, null)
  })

  it('falls back to the visible prompt when no status report arrives', async () => {
    // The real case: a project whose settings already carry a statusLine
    // command gets no hook injected, so the self-report never appears.
    const result = await waitForSessionReady(
      probes({ capturePane: async () => 'irgendwas\n❯ ' }),
      'sess-1',
      FAST,
    )

    assert.equal(result.ready, true)
    assert.equal(result.via, 'prompt')
  })

  it('accepts the alternate prompt marker', async () => {
    const result = await waitForSessionReady(
      probes({ capturePane: async () => 'Try "fix the bug"' }),
      'sess-1',
      FAST,
    )
    assert.equal(result.ready, true)
    assert.equal(result.via, 'prompt')
  })

  it('still finds the prompt when the status probe throws', async () => {
    const result = await waitForSessionReady(
      probes({
        statusReportMtime: async () => { throw new Error('kein Zugriff') },
        capturePane: async () => '❯ ',
      }),
      'sess-1',
      FAST,
    )

    assert.equal(result.ready, true, 'a broken probe must not veto the other')
    assert.equal(result.via, 'prompt')
  })

  it('still finds the status report when the capture throws', async () => {
    const result = await waitForSessionReady(
      probes({
        statusReportMtime: async () => SINCE + 5,
        capturePane: async () => { throw new Error('pane weg') },
      }),
      'sess-1',
      FAST,
    )

    assert.equal(result.ready, true)
    assert.equal(result.via, 'status-line')
  })

  it('reports not ready when both signals stay silent', async () => {
    const result = await waitForSessionReady(probes(), 'sess-1', FAST)

    assert.equal(result.ready, false)
    assert.equal(result.via, null)
    assert.equal(result.attempts, 3, 'every configured delay should be used up')
  })

  it('reports not ready when both probes throw', async () => {
    const result = await waitForSessionReady(
      probes({
        statusReportMtime: async () => { throw new Error('x') },
        capturePane: async () => { throw new Error('y') },
      }),
      'sess-1',
      FAST,
    )

    assert.equal(result.ready, false)
    assert.equal(result.via, null)
  })

  it('waits before the first probe, so a just-started session is not misjudged', async () => {
    const order: string[] = []
    const result = await waitForSessionReady(
      {
        statusReportMtime: async () => { order.push('probe'); return null },
        capturePane: async () => { order.push('capture'); return '' },
        sleep: async () => { order.push('sleep') },
      },
      'sess-1',
      { since: SINCE, delays: [1] },
    )

    assert.equal(result.ready, false)
    assert.equal(order[0], 'sleep', 'must not probe a session that had no time to start')
  })

  it('stops probing as soon as one signal answers', async () => {
    let captures = 0
    const result = await waitForSessionReady(
      probes({
        capturePane: async () => { captures++; return '❯ ' },
      }),
      'sess-1',
      { since: SINCE, delays: [1, 1, 1, 1] },
    )

    assert.equal(result.ready, true)
    assert.equal(result.attempts, 1)
    assert.equal(captures, 1, 'no further probing after readiness is established')
  })

  it('prefers the self-report when both signals are present', async () => {
    const result = await waitForSessionReady(
      probes({
        statusReportMtime: async () => SINCE + 1,
        capturePane: async () => '❯ ',
      }),
      'sess-1',
      FAST,
    )

    assert.equal(result.via, 'status-line', 'the session\'s own report outranks reading its screen')
  })
})
