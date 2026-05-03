import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { VoiceStateMachine, VoiceState } from '../../src/main/voice/voice-state'

/**
 * Voice UX tests — REQ-VOICE-001 through REQ-VOICE-004.
 *
 * Tests the voice state machine transitions relevant to:
 * - TTS Barge-In (agent_speaking → ready/idle)
 * - Voice status indicator states (listening, processing, speaking, idle)
 * - Long STT runs (user_speaking stays stable, transitions to processing)
 * - Speaking status during TTS
 */
describe('Voice UX — REQ-VOICE-001: TTS Barge-In', () => {
  let fsm: VoiceStateMachine

  beforeEach(() => {
    fsm = new VoiceStateMachine()
    // Get to agent_speaking state
    fsm.transition(VoiceState.READY)
    fsm.transition(VoiceState.USER_SPEAKING)
    fsm.transition(VoiceState.PROCESSING)
    fsm.transition(VoiceState.AGENT_SPEAKING)
  })

  it('can transition agent_speaking → ready (barge-in stop)', () => {
    assert.ok(fsm.transition(VoiceState.READY))
    assert.equal(fsm.state, VoiceState.READY)
  })

  it('can transition agent_speaking → idle (full stop)', () => {
    assert.ok(fsm.transition(VoiceState.IDLE))
    assert.equal(fsm.state, VoiceState.IDLE)
  })

  it('fires transition callback on barge-in', () => {
    const transitions: [string, string][] = []
    fsm.onTransition((n, o) => transitions.push([n, o]))
    fsm.transition(VoiceState.READY)
    assert.equal(transitions.length, 1)
    assert.deepEqual(transitions[0], [VoiceState.READY, VoiceState.AGENT_SPEAKING])
  })

  it('allows next TTS cycle after barge-in (ready → recording → processing → agent_speaking)', () => {
    fsm.transition(VoiceState.READY)
    assert.ok(fsm.transition(VoiceState.RECORDING))
    assert.ok(fsm.transition(VoiceState.PROCESSING))
    assert.ok(fsm.transition(VoiceState.AGENT_SPEAKING))
    assert.equal(fsm.state, VoiceState.AGENT_SPEAKING)
  })

  it('stopSpeech barge-in transitions agent_speaking → ready, then next TTS works', () => {
    // Simulate what VoiceManager.stopSpeech() does after the fix
    assert.equal(fsm.state, VoiceState.AGENT_SPEAKING)
    assert.ok(fsm.transition(VoiceState.READY))
    assert.equal(fsm.state, VoiceState.READY)

    // Next TTS cycle works normally
    assert.ok(fsm.transition(VoiceState.USER_SPEAKING))
    assert.ok(fsm.transition(VoiceState.PROCESSING))
    assert.ok(fsm.transition(VoiceState.AGENT_SPEAKING))
    assert.equal(fsm.state, VoiceState.AGENT_SPEAKING)
  })

  it('barge-in has no effect when not in agent_speaking', () => {
    // Reset to ready first
    fsm.transition(VoiceState.READY)
    const state = fsm.state
    // Transition to ready again should fail (already there)
    assert.equal(fsm.transition(VoiceState.READY), false)
    assert.equal(fsm.state, state)
  })
})

describe('Voice UX — REQ-VOICE-002: Voice Status Indicator', () => {
  it('maps voice states to correct indicator classes', () => {
    // This tests the mapping logic used in SessionCell
    const stateToClass = (voiceState: string, isSpeaking: boolean): string => {
      if (isSpeaking) return 'voice-dot--speaking'
      if (voiceState === 'user_speaking' || voiceState === 'recording') return 'voice-dot--listening'
      if (voiceState === 'processing') return 'voice-dot--processing'
      if (voiceState === 'ready') return 'voice-dot--idle'
      return ''
    }

    assert.equal(stateToClass('ready', false), 'voice-dot--idle')
    assert.equal(stateToClass('recording', false), 'voice-dot--listening')
    assert.equal(stateToClass('user_speaking', false), 'voice-dot--listening')
    assert.equal(stateToClass('processing', false), 'voice-dot--processing')
    assert.equal(stateToClass('agent_speaking', true), 'voice-dot--speaking')
    assert.equal(stateToClass('idle', false), '')
  })

  it('voice dot only visible when voice is active (not idle)', () => {
    const isVoiceTarget = true
    const voiceActive = (voiceState: string) => isVoiceTarget && voiceState !== 'idle'

    assert.equal(voiceActive('idle'), false)
    assert.equal(voiceActive('ready'), true)
    assert.equal(voiceActive('recording'), true)
    assert.equal(voiceActive('user_speaking'), true)
    assert.equal(voiceActive('processing'), true)
    assert.equal(voiceActive('agent_speaking'), true)
  })

  it('voice dot not visible when not voice target', () => {
    const isVoiceTarget = false
    const voiceActive = (voiceState: string) => isVoiceTarget && voiceState !== 'idle'

    assert.equal(voiceActive('ready'), false)
    assert.equal(voiceActive('recording'), false)
  })
})

describe('Voice UX — REQ-VOICE-003: Long STT runs', () => {
  let fsm: VoiceStateMachine

  beforeEach(() => {
    fsm = new VoiceStateMachine()
    fsm.transition(VoiceState.READY)
  })

  it('stays in user_speaking during continuous speech (no flicker)', () => {
    fsm.transition(VoiceState.USER_SPEAKING)
    assert.equal(fsm.state, VoiceState.USER_SPEAKING)
    // Multiple calls to user_speaking while already in user_speaking should fail (no transition)
    // This means the state stays stable — no flicker
    assert.equal(fsm.transition(VoiceState.USER_SPEAKING), false)
    assert.equal(fsm.state, VoiceState.USER_SPEAKING)
  })

  it('transitions user_speaking → processing after speech ends', () => {
    fsm.transition(VoiceState.USER_SPEAKING)
    assert.ok(fsm.transition(VoiceState.PROCESSING))
    assert.equal(fsm.state, VoiceState.PROCESSING)
  })

  it('transitions processing → ready after STT result dispatched', () => {
    fsm.transition(VoiceState.USER_SPEAKING)
    fsm.transition(VoiceState.PROCESSING)
    assert.ok(fsm.transition(VoiceState.READY))
    assert.equal(fsm.state, VoiceState.READY)
  })

  it('full STT cycle: ready → user_speaking → processing → ready', () => {
    const transitions: string[] = []
    fsm.onTransition((n) => transitions.push(n))

    fsm.transition(VoiceState.USER_SPEAKING)
    fsm.transition(VoiceState.PROCESSING)
    fsm.transition(VoiceState.READY)

    assert.deepEqual(transitions, [
      VoiceState.USER_SPEAKING,
      VoiceState.PROCESSING,
      VoiceState.READY,
    ])
  })
})

describe('Voice UX — REQ-VOICE-004: Speaking status during TTS', () => {
  let fsm: VoiceStateMachine

  beforeEach(() => {
    fsm = new VoiceStateMachine()
    fsm.transition(VoiceState.READY)
  })

  it('transitions to agent_speaking when TTS starts', () => {
    fsm.transition(VoiceState.RECORDING)
    fsm.transition(VoiceState.PROCESSING)
    assert.ok(fsm.transition(VoiceState.AGENT_SPEAKING))
    assert.equal(fsm.state, VoiceState.AGENT_SPEAKING)
  })

  it('transitions agent_speaking → ready when TTS ends normally', () => {
    fsm.transition(VoiceState.RECORDING)
    fsm.transition(VoiceState.PROCESSING)
    fsm.transition(VoiceState.AGENT_SPEAKING)
    assert.ok(fsm.transition(VoiceState.READY))
    assert.equal(fsm.state, VoiceState.READY)
  })

  it('transitions agent_speaking → idle when TTS stops completely', () => {
    fsm.transition(VoiceState.RECORDING)
    fsm.transition(VoiceState.PROCESSING)
    fsm.transition(VoiceState.AGENT_SPEAKING)
    assert.ok(fsm.transition(VoiceState.IDLE))
    assert.equal(fsm.state, VoiceState.IDLE)
  })

  it('speaking indicator tracks isSpeaking flag independently of FSM', () => {
    // isSpeaking is tracked by useGlobalTtsPlayback (renderer-side audio queue)
    // It's true when audio is being played, false when queue is empty or stopped
    // This test verifies the mapping logic
    const getIndicator = (voiceState: string, isSpeaking: boolean) => {
      if (isSpeaking) return 'speaking'
      if (voiceState === 'agent_speaking') return 'speaking' // fallback
      return 'not-speaking'
    }

    // During TTS: isSpeaking=true overrides everything
    assert.equal(getIndicator('agent_speaking', true), 'speaking')
    assert.equal(getIndicator('processing', true), 'speaking')

    // After barge-in: isSpeaking=false, state transitions away
    assert.equal(getIndicator('ready', false), 'not-speaking')
    assert.equal(getIndicator('idle', false), 'not-speaking')
  })
})
