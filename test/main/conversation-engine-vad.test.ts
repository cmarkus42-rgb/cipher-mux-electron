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

describe('ConversationEngine VAD', () => {
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

  it('should transition to user_speaking on VAD speech start', () => {
    engine.onVADSpeechStart()
    assert.equal(engine.state, VoiceState.USER_SPEAKING)
  })

  it('should ignore VAD speech start during echo guard', () => {
    ;(engine as any)._echoGuardActive = true
    engine.onVADSpeechStart()
    assert.equal(engine.state, VoiceState.READY)
  })

  it('should process audio on VAD speech end', async () => {
    engine.onVADSpeechStart()
    assert.equal(engine.state, VoiceState.USER_SPEAKING)

    const audio = new Float32Array(16000)
    for (let i = 0; i < audio.length; i++) audio[i] = Math.sin(i * 0.1) * 0.5

    await engine.onVADSpeechEnd(Array.from(audio))
    assert.equal((stt.transcribeBatch as any).mock.callCount(), 1)
  })

  it('should reject too-short speech', async () => {
    engine.onVADSpeechStart()
    const audio = new Float32Array(1600) // 100ms — below minimum
    await engine.onVADSpeechEnd(Array.from(audio))
    assert.equal(engine.state, VoiceState.READY)
    assert.equal((stt.transcribeBatch as any).mock.callCount(), 0)
  })

  it('should ignore VAD events in toggle mode', () => {
    const toggleEngine = new ConversationEngine({
      sttRouter: stt,
      transport,
      interactionMode: 'toggle',
    })
    toggleEngine.stateMachine.transition(VoiceState.READY)
    toggleEngine.onVADSpeechStart()
    assert.equal(toggleEngine.state, VoiceState.READY)
  })

  it('should activate echo guard after agent_speaking → ready', () => {
    engine.stateMachine.transition(VoiceState.USER_SPEAKING)
    engine.stateMachine.transition(VoiceState.PROCESSING)
    engine.stateMachine.transition(VoiceState.AGENT_SPEAKING)
    engine.onPlaybackComplete()
    assert.equal(engine.state, VoiceState.READY)
    assert.equal((engine as any)._echoGuardActive, true)
  })

  it('should set interaction mode', () => {
    engine.setInteractionMode('toggle')
    assert.equal((engine as any)._interactionMode, 'toggle')
    engine.onVADSpeechStart()
    assert.equal(engine.state, VoiceState.READY) // ignored in toggle
  })
})
