import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { ConversationEngine, type ConversationTransport } from '../../src/main/voice/conversation-engine'
import { VoiceState } from '../../src/main/voice/voice-state'

function mockTransport(): ConversationTransport {
  return {
    sendStartCapture: mock.fn(),
    sendStopCapture: mock.fn(),
    sendTranscription: mock.fn(),
    sendAudioPlayback: mock.fn(),
    sendStateChange: mock.fn(),
    sendStopPlayback: mock.fn(),
    sendGenerationDone: mock.fn(),
    dispatchStatus: mock.fn(),
    cancelStream: mock.fn(),
  }
}

function mockSTTRouter(): any {
  return {
    init: mock.fn(async () => {}),
    isReady: mock.fn(() => true),
    activeProvider: mock.fn(() => 'local'),
    transcribeBatch: mock.fn(async () => 'test transcription'),
    shutdown: mock.fn(),
    on: mock.fn(),
    emit: mock.fn(),
    removeAllListeners: mock.fn(),
  }
}

/** Helper: transition engine to AGENT_SPEAKING state. */
function transitionToAgentSpeaking(engine: ConversationEngine): void {
  engine.stateMachine.transition(VoiceState.USER_SPEAKING)
  engine.stateMachine.transition(VoiceState.PROCESSING)
  engine.stateMachine.transition(VoiceState.AGENT_SPEAKING)
}

describe('Echo Cancellation — feedback loop prevention', () => {
  let engine: ConversationEngine
  let transport: ConversationTransport
  let stt: any

  beforeEach(() => {
    transport = mockTransport()
    stt = mockSTTRouter()
    engine = new ConversationEngine({
      sttRouter: stt,
      transport,
      interactionMode: 'always-listen',
    })
    engine.stateMachine.transition(VoiceState.READY)
  })

  // ── Bug fix: onVADMisfire must respect echo guard ──

  it('should suppress VAD misfires during echo guard', () => {
    // Transition to agent speaking, then back to ready (activates echo guard)
    transitionToAgentSpeaking(engine)
    engine.onPlaybackComplete() // AGENT_SPEAKING → READY, activates echo guard
    assert.equal(engine.state, VoiceState.READY)
    assert.equal((engine as any)._echoGuardActive, true)

    // Transition back to agent speaking to test misfire suppression
    transitionToAgentSpeaking(engine)

    // Manually set echo guard active (simulating overlap)
    ;(engine as any)._echoGuardActive = true

    // Fire misfires during echo guard — should NOT accumulate
    engine.onVADMisfire()
    engine.onVADMisfire()
    engine.onVADMisfire()

    // Should still be speaking — no false barge-in triggered
    assert.equal(engine.state, VoiceState.AGENT_SPEAKING)
    assert.equal((engine as any)._bargeInMisfireTimestamps.length, 0,
      'Misfires during echo guard must not accumulate')
  })

  // ── Bug fix: echo guard should activate when entering AGENT_SPEAKING ──

  it('should activate echo guard when entering AGENT_SPEAKING', () => {
    transitionToAgentSpeaking(engine)

    assert.equal((engine as any)._echoGuardActive, true,
      'Echo guard must be active during agent speaking to prevent speaker echo triggering VAD')
  })

  // ── Bug fix: clear stale barge-in misfires when echo guard activates ──

  it('should clear barge-in misfire timestamps when echo guard activates', () => {
    transitionToAgentSpeaking(engine)
    // Simulate some misfires accumulated before echo guard
    ;(engine as any)._bargeInMisfireTimestamps = [Date.now(), Date.now(), Date.now()]

    // Return to ready, activating echo guard
    engine.onPlaybackComplete()
    assert.equal((engine as any)._echoGuardActive, true)

    // Stale misfires from previous playback must be cleared
    assert.equal((engine as any)._bargeInMisfireTimestamps.length, 0,
      'Barge-in misfire timestamps must be cleared when echo guard activates')
  })

  // ── Bug fix: default echo guard should be long enough for external speakers ──

  it('should use a longer default echo guard duration (>= 600ms)', () => {
    const defaultEngine = new ConversationEngine({
      sttRouter: stt,
      transport,
      interactionMode: 'always-listen',
    })

    const echoGuardMs = (defaultEngine as any)._echoGuardDurationMs
    assert.ok(echoGuardMs >= 600,
      `Default echo guard (${echoGuardMs}ms) must be >= 600ms for external speakers`)
  })

  // ── Bug fix: VAD speech start should be suppressed during AGENT_SPEAKING ──

  it('should suppress VAD speech start during AGENT_SPEAKING when echo guard is active', () => {
    transitionToAgentSpeaking(engine)
    ;(engine as any)._echoGuardActive = true

    // VAD speech start during agent speaking with echo guard should NOT set barge-in pending
    engine.onVADSpeechStart()
    assert.equal((engine as any)._bargeInPending, false,
      'VAD speech start during echo guard must not trigger barge-in pending')
  })
})
