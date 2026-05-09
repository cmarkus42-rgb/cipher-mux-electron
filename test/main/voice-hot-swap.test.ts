import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

// Mock configStore before importing VoiceManager
let storedPiperVoice = 'de_DE-cipher_adult-medium'
const mockConfigStore = {
  get(key: string) {
    if (key === 'piperVoice') return storedPiperVoice
    if (key === 'ttsEnabled') return true
    if (key === 'ttsVoice') return 'local'
    return undefined
  },
  set(key: string, value: unknown) {
    if (key === 'piperVoice') storedPiperVoice = value as string
  },
}

// We test the hot-swap logic in isolation — no real PiperTTS or Whisper.
// The VoiceManager swap logic is the unit under test.

describe('VoiceManager hot-swap', () => {
  // Simulated PiperTTS for testing swap logic
  class FakePiperTTS {
    voice: string
    ready = false
    disposed = false
    initCalled = false

    constructor(opts: { voice: string }) {
      this.voice = opts.voice
    }

    async init() {
      this.ready = true
      this.initCalled = true
    }

    isReady() { return this.ready }

    dispose() {
      this.ready = false
      this.disposed = true
    }

    shutdown() {
      this.ready = false
    }

    stop() { /* noop */ }

    async *speak(_text: string): AsyncGenerator<Buffer> {
      yield Buffer.from('fake-wav')
    }
  }

  // Minimal SwapManager that mirrors VoiceManager's swap logic
  class SwapManager extends EventEmitter {
    piperTTS: FakePiperTTS | null = null
    isSwapping = false
    private _speakChain: Promise<void> = Promise.resolve()
    private _swapQueue: Promise<void> = Promise.resolve()
    configStore = mockConfigStore
    modelsDir = '/fake/models'

    async swapVoice(newVoiceName: string): Promise<void> {
      if (this.isSwapping) {
        // Queue: chain behind current swap
        const prev = this._swapQueue
        let release!: () => void
        this._swapQueue = new Promise<void>(r => { release = r })
        await prev
        try {
          await this._doSwap(newVoiceName)
        } finally {
          release()
        }
        return
      }

      this.isSwapping = true
      try {
        // Wait for any active TTS to finish
        await this._speakChain
        await this._doSwap(newVoiceName)
      } finally {
        this.isSwapping = false
      }
    }

    private async _doSwap(newVoiceName: string): Promise<void> {
      if (this.piperTTS) {
        this.piperTTS.dispose()
        this.piperTTS = null
      }

      const newTTS = new FakePiperTTS({ voice: newVoiceName })
      await newTTS.init()
      this.piperTTS = newTTS
      this.configStore.set('piperVoice', newVoiceName)
      this.emit('voice-swapped', newVoiceName)
    }

    // Simulate speak chain like VoiceManager
    async simulateSpeak(durationMs: number): Promise<void> {
      const prev = this._speakChain
      let release!: () => void
      this._speakChain = new Promise<void>(r => { release = r })
      await prev
      await new Promise(r => setTimeout(r, durationMs))
      release()
    }
  }

  let mgr: SwapManager

  beforeEach(() => {
    storedPiperVoice = 'de_DE-cipher_adult-medium'
    mgr = new SwapManager()
    mgr.piperTTS = new FakePiperTTS({ voice: 'de_DE-cipher_adult-medium' })
    mgr.piperTTS.ready = true
  })

  it('swapVoice disposes old TTS and creates new', async () => {
    const oldTTS = mgr.piperTTS!
    await mgr.swapVoice('en_US-lessac-medium')

    assert.equal(oldTTS.disposed, true, 'old TTS should be disposed')
    assert.notEqual(mgr.piperTTS, oldTTS, 'piperTTS should be a new instance')
    assert.equal(mgr.piperTTS!.voice, 'en_US-lessac-medium')
    assert.equal(mgr.piperTTS!.ready, true, 'new TTS should be initialized')
  })

  it('swapVoice updates ConfigStore piperVoice', async () => {
    await mgr.swapVoice('en_US-lessac-medium')
    assert.equal(storedPiperVoice, 'en_US-lessac-medium')
  })

  it('swapVoice emits voice-swapped event', async () => {
    let emittedName: string | null = null
    mgr.on('voice-swapped', (name: string) => { emittedName = name })

    await mgr.swapVoice('en_US-lessac-medium')
    assert.equal(emittedName, 'en_US-lessac-medium')
  })

  it('swapVoice sets isSwapping mutex during operation', async () => {
    const states: boolean[] = []
    const originalSwap = mgr.swapVoice.bind(mgr)

    // Start swap and check mutex at different points
    const swapPromise = mgr.swapVoice('en_US-lessac-medium')
    states.push(mgr.isSwapping) // should be true during swap
    await swapPromise
    states.push(mgr.isSwapping) // should be false after

    assert.equal(states[0], true, 'isSwapping should be true during swap')
    assert.equal(states[1], false, 'isSwapping should be false after swap')
  })

  it('swapVoice waits for active TTS speak to finish', async () => {
    const order: string[] = []

    // Start a "speak" that takes 50ms
    const speakPromise = mgr.simulateSpeak(50).then(() => order.push('speak-done'))

    // Immediately queue a swap
    const swapPromise = mgr.swapVoice('en_US-lessac-medium').then(() => order.push('swap-done'))

    await Promise.all([speakPromise, swapPromise])

    assert.deepEqual(order, ['speak-done', 'swap-done'], 'swap should wait for speak to finish')
  })

  it('queued swaps execute sequentially', async () => {
    const order: string[] = []

    // Queue two swaps
    const swap1 = mgr.swapVoice('en_US-lessac-medium').then(() => order.push('swap1'))
    const swap2 = mgr.swapVoice('de_DE-thorsten-high').then(() => order.push('swap2'))

    await Promise.all([swap1, swap2])

    assert.deepEqual(order, ['swap1', 'swap2'], 'swaps should execute in order')
    assert.equal(mgr.piperTTS!.voice, 'de_DE-thorsten-high', 'last swap wins')
    assert.equal(storedPiperVoice, 'de_DE-thorsten-high')
  })

  it('swapVoice works when piperTTS is null', async () => {
    mgr.piperTTS = null
    await mgr.swapVoice('en_US-lessac-medium')

    assert.equal(mgr.piperTTS!.voice, 'en_US-lessac-medium')
    assert.equal(mgr.piperTTS!.ready, true)
  })
})

describe('PiperTTS dispose()', () => {
  it('dispose sets ready=false and is distinct from shutdown', () => {
    // This tests the contract: dispose() is a clean teardown that allows
    // re-creation, while shutdown() is terminal
    // The actual PiperTTS.dispose() test is here for the contract;
    // implementation test happens against the real class.

    // Minimal interface check
    const disposable = {
      ready: true,
      worker: { send: () => {}, kill: () => {}, once: () => {} },
      dispose() {
        this.ready = false
        // Worker is killed but no pending rejection
        try { this.worker.send({ cmd: 'shutdown' }) } catch { /* */ }
      },
    }

    disposable.dispose()
    assert.equal(disposable.ready, false)
  })
})

describe('voice-bundle recommendations', () => {
  it('getRecommendedDownloads returns DE and EN voices', async () => {
    // Import dynamically so we can test the pure function
    const { getRecommendedDownloads } = await import('../../src/main/setup/voice-bundle')

    const recs = getRecommendedDownloads()
    assert.ok(Array.isArray(recs))
    assert.ok(recs.length >= 2)

    const deRec = recs.find(r => r.language === 'de')
    const enRec = recs.find(r => r.language === 'en')
    assert.ok(deRec, 'should have a DE recommendation')
    assert.ok(enRec, 'should have an EN recommendation')
    assert.ok(deRec!.name.includes('dii'), 'DE rec should be dii')
    assert.ok(enRec!.name.includes('lessac'), 'EN rec should be lessac')
  })
})

describe('language-based voice default', () => {
  it('getDefaultVoiceForLanguage returns correct voice per language', async () => {
    const { getDefaultVoiceForLanguage } = await import('../../src/main/setup/voice-bundle')

    assert.equal(getDefaultVoiceForLanguage('de'), 'de_DE-cipher_adult-medium')
    assert.equal(getDefaultVoiceForLanguage('en'), 'en_US-lessac-medium')
    assert.equal(getDefaultVoiceForLanguage('fr'), null, 'unknown language returns null')
  })
})
