import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { pcmToWav, appendSilence, concatenateWavs, splitSentences, getPauseDuration } from '../../src/main/voice/audio-utils'

// ─── appendSilence ───────────────────────────────────────

describe('appendSilence', () => {
  const sampleRate = 16000

  function makeTestWav(numSamples = 10): Buffer {
    const pcm = new Float32Array(numSamples)
    for (let i = 0; i < numSamples; i++) pcm[i] = 0.5
    return pcmToWav(pcm, sampleRate)
  }

  it('appends correct number of silence samples for 300ms', () => {
    const wav = makeTestWav(10)
    const original = Buffer.from(wav)
    const result = appendSilence(wav, 300, sampleRate)

    // 300ms at 16kHz 16-bit mono = 4800 samples * 2 bytes = 9600 bytes
    const silenceBytes = Math.round(sampleRate * 300 / 1000) * 2
    assert.equal(result.length, original.length + silenceBytes)
  })

  it('updates RIFF file size in header', () => {
    const wav = makeTestWav(10)
    const result = appendSilence(wav, 300, sampleRate)
    const riffSize = result.readUInt32LE(4)
    assert.equal(riffSize, result.length - 8)
  })

  it('updates data sub-chunk size in header', () => {
    const wav = makeTestWav(10)
    const originalDataSize = wav.readUInt32LE(40)
    const result = appendSilence(wav, 300, sampleRate)
    const newDataSize = result.readUInt32LE(40)
    const silenceBytes = Math.round(sampleRate * 300 / 1000) * 2
    assert.equal(newDataSize, originalDataSize + silenceBytes)
  })

  it('appended bytes are all zeros (silence)', () => {
    const wav = makeTestWav(10)
    const originalLen = wav.length
    const result = appendSilence(wav, 100, sampleRate)
    const appended = result.subarray(originalLen)
    for (let i = 0; i < appended.length; i++) {
      assert.equal(appended[i], 0, `byte ${i} should be 0`)
    }
  })

  it('returns unchanged buffer for 0ms duration', () => {
    const wav = makeTestWav(10)
    const result = appendSilence(wav, 0, sampleRate)
    assert.equal(result.length, wav.length)
  })

  it('handles different sample rates', () => {
    const sr = 22050
    const pcm = new Float32Array(10).fill(0.5)
    const wav = pcmToWav(pcm, sr)
    const result = appendSilence(wav, 400, sr)
    const silenceBytes = Math.round(sr * 400 / 1000) * 2
    assert.equal(result.length, wav.length + silenceBytes)
  })
})

// ─── concatenateWavs ─────────────────────────────────────

describe('concatenateWavs', () => {
  const sampleRate = 16000

  function makeTestWav(numSamples: number, value = 0.5): Buffer {
    const pcm = new Float32Array(numSamples).fill(value)
    return pcmToWav(pcm, sampleRate)
  }

  it('returns empty buffer for empty array', () => {
    const result = concatenateWavs([])
    assert.equal(result.length, 0)
  })

  it('returns same buffer for single WAV', () => {
    const wav = makeTestWav(10)
    const result = concatenateWavs([wav])
    assert.deepEqual(result, wav)
  })

  it('concatenates PCM data from multiple WAVs', () => {
    const wav1 = makeTestWav(10)
    const wav2 = makeTestWav(20)
    const result = concatenateWavs([wav1, wav2])

    // Header (44) + 10 samples * 2 bytes + 20 samples * 2 bytes = 44 + 60 = 104
    assert.equal(result.length, 44 + (10 + 20) * 2)
  })

  it('updates RIFF and data sizes correctly', () => {
    const wav1 = makeTestWav(10)
    const wav2 = makeTestWav(15)
    const result = concatenateWavs([wav1, wav2])

    const riffSize = result.readUInt32LE(4)
    assert.equal(riffSize, result.length - 8)

    const dataSize = result.readUInt32LE(40)
    assert.equal(dataSize, (10 + 15) * 2)
  })

  it('preserves audio content', () => {
    const wav1 = makeTestWav(5, 0.5)
    const wav2 = makeTestWav(5, -0.5)
    const result = concatenateWavs([wav1, wav2])

    // First 5 samples should be positive, last 5 negative
    const firstSample = result.readInt16LE(44)
    const lastSample = result.readInt16LE(44 + 8 * 2)
    assert.ok(firstSample > 0, 'first sample should be positive')
    assert.ok(lastSample < 0, 'last sample should be negative')
  })
})

// ─── splitSentences ──────────────────────────────────────

describe('splitSentences', () => {
  it('splits on period with whitespace', () => {
    const result = splitSentences('Hello world. How are you.')
    assert.deepEqual(result, [
      { text: 'Hello world.', trailing: '.' },
      { text: 'How are you.', trailing: '.' },
    ])
  })

  it('splits on question and exclamation marks', () => {
    const result = splitSentences('What? Really! Yes.')
    assert.deepEqual(result, [
      { text: 'What?', trailing: '?' },
      { text: 'Really!', trailing: '!' },
      { text: 'Yes.', trailing: '.' },
    ])
  })

  it('handles single sentence without trailing punctuation', () => {
    const result = splitSentences('Hello world')
    assert.deepEqual(result, [
      { text: 'Hello world', trailing: '' },
    ])
  })

  it('handles empty string', () => {
    const result = splitSentences('')
    assert.deepEqual(result, [])
  })

  it('handles whitespace only', () => {
    const result = splitSentences('   ')
    assert.deepEqual(result, [])
  })

  it('preserves commas and colons within sentences', () => {
    const result = splitSentences('Hello, world: yes.')
    assert.deepEqual(result, [
      { text: 'Hello, world: yes.', trailing: '.' },
    ])
  })

  it('handles multiple punctuation like ...', () => {
    const result = splitSentences('Wait... What?')
    assert.equal(result.length, 2)
    assert.equal(result[0].text, 'Wait...')
    assert.equal(result[1].text, 'What?')
  })

  it('handles trailing whitespace', () => {
    const result = splitSentences('Hello.  ')
    assert.deepEqual(result, [
      { text: 'Hello.', trailing: '.' },
    ])
  })
})

// ─── getPauseDuration ────────────────────────────────────

describe('getPauseDuration', () => {
  const defaults = { pauseAfterPeriod: 300, pauseAfterQuestion: 400, pauseAfterComma: 150 }

  it('returns period pause for .', () => {
    assert.equal(getPauseDuration('.', defaults), 300)
  })

  it('returns question pause for ?', () => {
    assert.equal(getPauseDuration('?', defaults), 400)
  })

  it('returns question pause for !', () => {
    assert.equal(getPauseDuration('!', defaults), 400)
  })

  it('returns comma pause for ,', () => {
    assert.equal(getPauseDuration(',', defaults), 150)
  })

  it('returns comma pause for ; and :', () => {
    assert.equal(getPauseDuration(';', defaults), 150)
    assert.equal(getPauseDuration(':', defaults), 150)
  })

  it('returns 0 for empty trailing', () => {
    assert.equal(getPauseDuration('', defaults), 0)
  })

  it('returns period pause for ...', () => {
    assert.equal(getPauseDuration('...', defaults), 300)
  })
})

// ─── TTS Pipeline Queue ──────────────────────────────────

describe('TTS Pipeline Queue (unit logic)', () => {
  // These test the sentence-level queue logic that will be in voice-manager
  // We test the pure functions here; integration with PiperTTS is in the implementation

  it('splitSentences produces sentences suitable for pipelining', () => {
    const text = 'Erster Satz. Zweiter Satz! Dritter Satz?'
    const sentences = splitSentences(text)
    assert.equal(sentences.length, 3)
    // Each sentence should be non-empty and suitable for TTS
    for (const s of sentences) {
      assert.ok(s.text.length > 0)
    }
  })

  it('interrupt clears remaining sentences from queue', () => {
    // Simulate a queue
    const queue = splitSentences('Eins. Zwei. Drei. Vier. Fuenf.')
    assert.equal(queue.length, 5)

    // Simulate interrupt at index 2
    const remaining = queue.splice(2)
    assert.equal(remaining.length, 3)
    assert.equal(queue.length, 2)
  })
})
