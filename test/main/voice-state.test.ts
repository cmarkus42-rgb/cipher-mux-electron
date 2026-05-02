import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { VoiceStateMachine, VoiceState } from '../../src/main/voice/voice-state'

describe('VoiceStateMachine', () => {
  let fsm: VoiceStateMachine
  beforeEach(() => { fsm = new VoiceStateMachine() })

  it('starts in idle state', () => {
    assert.equal(fsm.state, VoiceState.IDLE)
  })
  it('allows valid transitions', () => {
    assert.equal(fsm.transition(VoiceState.READY), true)
    assert.equal(fsm.state, VoiceState.READY)
    assert.equal(fsm.transition(VoiceState.RECORDING), true)
    assert.equal(fsm.state, VoiceState.RECORDING)
  })
  it('rejects invalid transitions', () => {
    assert.equal(fsm.transition(VoiceState.PROCESSING), false)
    assert.equal(fsm.state, VoiceState.IDLE)
  })
  it('calls onTransition callback on valid transition', () => {
    const transitions: Array<{ from: string; to: string }> = []
    fsm.onTransition((to, from) => transitions.push({ from, to }))
    fsm.transition(VoiceState.READY)
    assert.equal(transitions.length, 1)
    assert.equal(transitions[0].from, VoiceState.IDLE)
    assert.equal(transitions[0].to, VoiceState.READY)
  })
  it('reset goes back to idle', () => {
    fsm.transition(VoiceState.READY)
    fsm.transition(VoiceState.RECORDING)
    fsm.reset()
    assert.equal(fsm.state, VoiceState.IDLE)
  })

  // USER_SPEAKING (VAD support)
  it('should transition ready → user_speaking', () => {
    const sm = new VoiceStateMachine()
    sm.transition(VoiceState.READY)
    assert.ok(sm.transition(VoiceState.USER_SPEAKING))
    assert.equal(sm.state, VoiceState.USER_SPEAKING)
  })

  it('should transition user_speaking → processing', () => {
    const sm = new VoiceStateMachine()
    sm.transition(VoiceState.READY)
    sm.transition(VoiceState.USER_SPEAKING)
    assert.ok(sm.transition(VoiceState.PROCESSING))
  })

  it('should transition agent_speaking → user_speaking (barge-in)', () => {
    const sm = new VoiceStateMachine()
    sm.transition(VoiceState.READY)
    sm.transition(VoiceState.RECORDING)
    sm.transition(VoiceState.PROCESSING)
    sm.transition(VoiceState.AGENT_SPEAKING)
    assert.ok(sm.transition(VoiceState.USER_SPEAKING))
  })

  it('should reject invalid transitions', () => {
    const sm = new VoiceStateMachine()
    assert.ok(!sm.transition(VoiceState.USER_SPEAKING)) // idle → user_speaking not valid
  })

  it('should fire transition callbacks', () => {
    const sm = new VoiceStateMachine()
    const transitions: [string, string][] = []
    sm.onTransition((n, o) => transitions.push([n, o]))
    sm.transition(VoiceState.READY)
    sm.transition(VoiceState.USER_SPEAKING)
    assert.equal(transitions.length, 2)
    assert.deepEqual(transitions[1], [VoiceState.USER_SPEAKING, VoiceState.READY])
  })
})
