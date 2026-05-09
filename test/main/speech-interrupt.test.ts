/**
 * Tests for Speech Interrupt (REQ-TTSLV-004).
 * STT recognizes "okay danke", "stopp", "reicht" as interrupt intent.
 * These emit 'speechInterrupt' and do NOT send keys to the session.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { VoiceInputRouter } from '../../src/main/voice/voice-input-router'

function makeStubSessionManager(sessions: Map<string, { id: string; name: string; status: string }>) {
  return {
    sendKeys: async (_id: string, _keys: string) => {},
    get: (id: string) => sessions.get(id) ?? undefined,
    getEntitySessionId: (_entityId: string) => null as string | null,
    getSessionStore: () => ({
      getGridState: () => ({
        slots: Array.from(sessions.keys()).map((id) => ({ sessionId: id })),
      }),
    }),
  }
}

describe('Speech Interrupt', () => {
  let router: VoiceInputRouter
  let sentKeys: { sessionId: string; keys: string }[]
  let interrupts: number
  const sessions = new Map([
    ['sess-1', { id: 'sess-1', name: 'my-project', status: 'active' }],
  ])

  beforeEach(() => {
    sentKeys = []
    interrupts = 0
    const sm = makeStubSessionManager(sessions)
    sm.sendKeys = async (id: string, keys: string) => { sentKeys.push({ sessionId: id, keys }) }
    router = new VoiceInputRouter({ sessionManager: sm as any })
    router.setMode('session')
    router.setFocusedSession('sess-1')
    router.on('speechInterrupt', () => { interrupts++ })
  })

  it('emits speechInterrupt on "stopp"', async () => {
    await router.routeTranscription('stopp')
    assert.equal(interrupts, 1)
    assert.equal(sentKeys.length, 0, 'should not send keys')
  })

  it('emits speechInterrupt on "okay danke"', async () => {
    await router.routeTranscription('okay danke')
    assert.equal(interrupts, 1)
    assert.equal(sentKeys.length, 0)
  })

  it('emits speechInterrupt on "Reicht." (with punctuation)', async () => {
    await router.routeTranscription('Reicht.')
    assert.equal(interrupts, 1)
    assert.equal(sentKeys.length, 0)
  })

  it('emits speechInterrupt on "ok danke"', async () => {
    await router.routeTranscription('ok danke')
    assert.equal(interrupts, 1)
    assert.equal(sentKeys.length, 0)
  })

  it('emits speechInterrupt on "genug"', async () => {
    await router.routeTranscription('genug')
    assert.equal(interrupts, 1)
    assert.equal(sentKeys.length, 0)
  })

  it('emits speechInterrupt on "stop" (English)', async () => {
    await router.routeTranscription('stop')
    assert.equal(interrupts, 1)
    assert.equal(sentKeys.length, 0)
  })

  it('does NOT emit speechInterrupt for regular text', async () => {
    router.setSubmitMode('manual')
    await router.routeTranscription('hello world')
    assert.equal(interrupts, 0)
    assert.equal(sentKeys.length, 1)
  })

  it('emits dispatched with [speech-interrupt] label', async () => {
    let dispatched: any = null
    router.on('dispatched', (data) => { dispatched = data })
    await router.routeTranscription('stopp')
    assert.ok(dispatched)
    assert.equal(dispatched.text, '[speech-interrupt]')
    assert.equal(dispatched.sessionId, 'sess-1')
  })
})
