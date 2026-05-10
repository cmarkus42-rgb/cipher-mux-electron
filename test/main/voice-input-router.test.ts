import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { VoiceInputRouter } from '../../src/main/voice/voice-input-router'

function makeStubSessionManager(sessions: Map<string, { id: string; name: string; status: string }>) {
  return {
    sendKeys: async (_id: string, _keys: string) => {},
    get: (id: string) => sessions.get(id) ?? undefined,
    getEntitySessionId: (_entityId: string) => null,
    getSessionStore: () => ({
      getGridState: () => ({
        slots: Array.from(sessions.keys()).map((id) => ({ sessionId: id })),
      }),
    }),
  }
}

describe('VoiceInputRouter', () => {
  let router: VoiceInputRouter
  let sentKeys: { sessionId: string; keys: string }[]
  const sessions = new Map([
    ['sess-1', { id: 'sess-1', name: 'my-project', status: 'active' }],
    ['sess-2', { id: 'sess-2', name: 'stopped-project', status: 'stopped' }],
  ])

  beforeEach(() => {
    sentKeys = []
    const sm = makeStubSessionManager(sessions)
    sm.sendKeys = async (id: string, keys: string) => { sentKeys.push({ sessionId: id, keys }) }
    router = new VoiceInputRouter({ sessionManager: sm as any })
  })

  it('defaults to mode=off and does nothing on dispatch', async () => {
    router.setFocusedSession('sess-1')
    await router.routeTranscription('hello')
    assert.equal(sentKeys.length, 0)
  })

  it('dispatches text to focused session in session mode (manual, no Enter)', async () => {
    router.setMode('session')
    router.setSubmitMode('manual')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('hello world')
    assert.equal(sentKeys.length, 1)
    assert.equal(sentKeys[0].sessionId, 'sess-1')
    assert.equal(sentKeys[0].keys, 'hello world ')
  })

  it('sends Enter on "abschicken" voice command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('abschicken')
    assert.equal(sentKeys.length, 1)
    assert.equal(sentKeys[0].keys, '\r')
  })

  it('sends Enter on "senden" voice command (with punctuation)', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('Senden.')
    assert.equal(sentKeys.length, 1)
    assert.equal(sentKeys[0].keys, '\r')
  })

  it('emits dispatched event with session info', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let dispatched: any = null
    router.on('dispatched', (data) => { dispatched = data })
    await router.routeTranscription('test input')
    assert.ok(dispatched)
    assert.equal(dispatched.sessionId, 'sess-1')
    assert.equal(dispatched.sessionName, 'my-project')
    assert.equal(dispatched.text, 'test input')
  })

  it('emits error when no session focused', async () => {
    router.setMode('session')
    let error: any = null
    router.on('error', (data) => { error = data })
    await router.routeTranscription('hello')
    assert.ok(error)
    assert.equal(error.code, 'no-session')
    assert.equal(sentKeys.length, 0)
  })

  it('emits error when focused session is not active', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-2')
    let error: any = null
    router.on('error', (data) => { error = data })
    await router.routeTranscription('hello')
    assert.ok(error)
    assert.equal(error.code, 'session-inactive')
    assert.equal(sentKeys.length, 0)
  })

  it('ignores empty transcriptions', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('')
    await router.routeTranscription('   ')
    assert.equal(sentKeys.length, 0)
  })

  it('avoids double space when transcript already ends with space (manual mode)', async () => {
    router.setMode('session')
    router.setSubmitMode('manual')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('hello world ')
    assert.equal(sentKeys.length, 1)
    assert.equal(sentKeys[0].keys, 'hello world ')
  })

  it('strips U+200E/U+200F directional marks before sending (T-VP.7)', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('hello\u200e world\u200f')
    assert.equal(sentKeys.length, 2) // text + CR
    assert.equal(sentKeys[0].keys, 'hello world')
    assert.equal(sentKeys[1].keys, '\r')
  })

  it('auto-submit sends CR as separate sendKeys call (T-VP.7)', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('test input')
    assert.equal(sentKeys.length, 2)
    assert.equal(sentKeys[0].keys, 'test input')
    assert.equal(sentKeys[1].keys, '\r')
  })

  it('routes to pinned session instead of focused', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    // Add a third active session for pinning
    sessions.set('sess-3', { id: 'sess-3', name: 'pinned-project', status: 'active' })
    router.pinToSession('sess-3')
    await router.routeTranscription('goes to pinned')
    assert.equal(sentKeys.length, 2) // text + CR (auto-submit)
    assert.equal(sentKeys[0].sessionId, 'sess-3')
    assert.equal(sentKeys[1].keys, '\r')
  })

  it('returns to focus-following after unpin', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    sessions.set('sess-3', { id: 'sess-3', name: 'pinned-project', status: 'active' })
    router.pinToSession('sess-3')
    router.unpinSession()
    await router.routeTranscription('goes to focused')
    assert.equal(sentKeys.length, 2) // text + CR (auto-submit)
    assert.equal(sentKeys[0].sessionId, 'sess-1')
  })

  it('togglePin unpins when already pinned to same session', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    sessions.set('sess-3', { id: 'sess-3', name: 'pinned-project', status: 'active' })
    router.togglePin('sess-3')
    assert.equal(router.isPinned(), true)
    router.togglePin('sess-3')
    assert.equal(router.isPinned(), false)
  })

  it('routes to notes editor when focused and not pinned', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    router.setNotesEditorFocused(true)
    let notesText: string | null = null
    router.on('notesInsert', (text: string) => { notesText = text })
    await router.routeTranscription('dictated text')
    assert.equal(notesText, 'dictated text')
    assert.equal(sentKeys.length, 0) // NOT sent to session
  })

  it('pin overrides notes editor focus', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    router.setNotesEditorFocused(true)
    sessions.set('sess-3', { id: 'sess-3', name: 'pinned', status: 'active' })
    router.pinToSession('sess-3')
    await router.routeTranscription('goes to pin')
    // auto-submit sends text + CR as two separate sendKeys calls
    assert.equal(sentKeys.length, 2)
    assert.equal(sentKeys[0].sessionId, 'sess-3')
    assert.equal(sentKeys[0].keys, 'goes to pin')
    assert.equal(sentKeys[1].keys, '\r')
  })

  it('getActiveSessionId returns pinned > focused', () => {
    router.setFocusedSession('sess-1')
    assert.equal(router.getActiveSessionId(), 'sess-1')
    sessions.set('sess-3', { id: 'sess-3', name: 'pinned-project', status: 'active' })
    router.pinToSession('sess-3')
    assert.equal(router.getActiveSessionId(), 'sess-3')
    router.unpinSession()
    assert.equal(router.getActiveSessionId(), 'sess-1')
  })

  it('emits scroll event for "hoch" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let scrollEvent: any = null
    router.on('scroll', (data) => { scrollEvent = data })
    await router.routeTranscription('hoch')
    assert.ok(scrollEvent)
    assert.equal(scrollEvent.sessionId, 'sess-1')
    assert.equal(scrollEvent.action, 'up')
    assert.equal(sentKeys.length, 0, 'scroll commands must NOT send keys to tmux')
  })

  it('emits scroll event for "ganz runter" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let scrollEvent: any = null
    router.on('scroll', (data) => { scrollEvent = data })
    await router.routeTranscription('Ganz runter.')
    assert.ok(scrollEvent)
    assert.equal(scrollEvent.action, 'bottom')
    assert.equal(sentKeys.length, 0)
  })

  it('emits scroll event for "zum marker" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let scrollEvent: any = null
    router.on('scroll', (data) => { scrollEvent = data })
    await router.routeTranscription('zum Marker')
    assert.ok(scrollEvent)
    assert.equal(scrollEvent.action, 'to-marker')
    assert.equal(sentKeys.length, 0)
  })

  it('emits dispatched event with scroll label', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let dispatched: any = null
    router.on('dispatched', (data) => { dispatched = data })
    await router.routeTranscription('weiter')
    assert.ok(dispatched)
    assert.equal(dispatched.text, '[scroll-down]')
  })

  it('sends Ctrl+U on "löschen" voice command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('löschen')
    assert.equal(sentKeys.length, 1)
    assert.equal(sentKeys[0].keys, '\x15')
  })

  it('sends Ctrl+U on "leeren" voice command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('Leeren.')
    assert.equal(sentKeys.length, 1)
    assert.equal(sentKeys[0].keys, '\x15')
  })

  it('sends Ctrl+U on "alles weg" voice command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('alles weg')
    assert.equal(sentKeys.length, 1)
    assert.equal(sentKeys[0].keys, '\x15')
  })

  it('emits clipboard event for "kopieren" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let clipEvent: any = null
    router.on('clipboard', (data) => { clipEvent = data })
    await router.routeTranscription('kopieren')
    assert.ok(clipEvent)
    assert.equal(clipEvent.action, 'copy')
    assert.equal(sentKeys.length, 0, 'clipboard commands must NOT send keys to tmux')
  })

  it('emits clipboard event for "paste" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let clipEvent: any = null
    router.on('clipboard', (data) => { clipEvent = data })
    await router.routeTranscription('Paste!')
    assert.ok(clipEvent)
    assert.equal(clipEvent.action, 'paste')
    assert.equal(sentKeys.length, 0)
  })

  it('emits clipboard event for "einfügen" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let clipEvent: any = null
    router.on('clipboard', (data) => { clipEvent = data })
    await router.routeTranscription('einfügen')
    assert.ok(clipEvent)
    assert.equal(clipEvent.action, 'paste')
    assert.equal(sentKeys.length, 0)
  })

  it('emits dispatched event with clear-input label', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let dispatched: any = null
    router.on('dispatched', (data) => { dispatched = data })
    await router.routeTranscription('löschen')
    assert.ok(dispatched)
    assert.equal(dispatched.text, '[clear-input]')
  })

  it('emits dispatched event with copy label', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let dispatched: any = null
    router.on('dispatched', (data) => { dispatched = data })
    await router.routeTranscription('copy')
    assert.ok(dispatched)
    assert.equal(dispatched.text, '[copy]')
  })

  it('does not match scroll command in longer text', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let scrollEvent: any = null
    router.on('scroll', (data) => { scrollEvent = data })
    await router.routeTranscription('scroll mal hoch bitte')
    assert.equal(scrollEvent, null, 'partial match should not trigger scroll')
    // auto-submit sends text + CR as two separate sendKeys calls
    assert.equal(sentKeys.length, 2, 'text should be sent normally')
  })

  // --- Dialog Target Routing ---

  describe('dialog target routing', () => {
    it('setDialogTarget routes transcriptions via dialogInsert event', async () => {
      router.setMode('session')
      router.setFocusedSession('sess-1')
      router.setDialogTarget('bugreport')
      let inserted: any = null
      router.on('dialogInsert', (data) => { inserted = data })
      await router.routeTranscription('the button is broken')
      assert.ok(inserted)
      assert.equal(inserted.target, 'bugreport')
      assert.equal(inserted.text, 'the button is broken')
      assert.equal(sentKeys.length, 0, 'should NOT send keys to any session')
    })

    it('dialog target takes priority over voiceRelay', async () => {
      const sm = makeStubSessionManager(sessions)
      sm.sendKeys = async (id: string, keys: string) => { sentKeys.push({ sessionId: id, keys }) }
      sm.getEntitySessionId = (entityId: string) => entityId === 'voice-relay' ? 'vr-sess' : null
      sessions.set('vr-sess', { id: 'vr-sess', name: 'Voice Relay', status: 'active' })

      const r = new VoiceInputRouter({ sessionManager: sm as any })
      r.setMode('session')
      r.setFocusedSession('sess-1')
      r.setDialogTarget('bugreport')
      let inserted: any = null
      r.on('dialogInsert', (data) => { inserted = data })

      await r.routeTranscription('bug description')
      assert.ok(inserted, 'dialog target must take priority over voice-relay')
      assert.equal(sentKeys.length, 0)
    })

    it('clearDialogTarget restores normal routing', async () => {
      router.setMode('session')
      router.setFocusedSession('sess-1')
      router.setDialogTarget('bugreport')
      router.clearDialogTarget()
      await router.routeTranscription('normal text')
      assert.equal(sentKeys[0].sessionId, 'sess-1', 'should route to focused after clear')
    })

    it('dialog target skips voice commands', async () => {
      router.setMode('session')
      router.setFocusedSession('sess-1')
      router.setDialogTarget('bugreport')
      let scrollEvent: any = null
      let inserted: any = null
      router.on('scroll', (data) => { scrollEvent = data })
      router.on('dialogInsert', (data) => { inserted = data })
      await router.routeTranscription('hoch')
      assert.equal(scrollEvent, null, 'scroll commands should not fire in dialog mode')
      assert.ok(inserted, '"hoch" should be sent as raw text via dialogInsert')
      assert.equal(inserted.text, 'hoch')
      assert.equal(sentKeys.length, 0)
    })
  })
})
