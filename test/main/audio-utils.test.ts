import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pcmToWav } from '../../src/main/voice/audio-utils'

describe('pcmToWav', () => {
  it('creates valid WAV header from Float32 PCM', () => {
    const pcm = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0])
    const wav = pcmToWav(pcm, 16000)
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
    assert.equal(wav.toString('ascii', 12, 16), 'fmt ')
    assert.equal(wav.readUInt16LE(20), 1) // PCM format
    assert.equal(wav.readUInt16LE(22), 1) // mono
    assert.equal(wav.readUInt32LE(24), 16000) // sample rate
    assert.equal(wav.readUInt16LE(34), 16) // bits per sample
    assert.equal(wav.readUInt32LE(40), 10) // data size
    assert.equal(wav.length, 44 + 10)
  })
  it('converts Float32 samples to Int16 correctly', () => {
    const pcm = new Float32Array([0.0, 1.0, -1.0])
    const wav = pcmToWav(pcm, 16000)
    assert.equal(wav.readInt16LE(44), 0)
    assert.equal(wav.readInt16LE(46), 32767)
    assert.equal(wav.readInt16LE(48), -32768)
  })
  it('throws on empty PCM data', () => {
    assert.throws(() => pcmToWav(new Float32Array(0), 16000), /empty/i)
  })
})
