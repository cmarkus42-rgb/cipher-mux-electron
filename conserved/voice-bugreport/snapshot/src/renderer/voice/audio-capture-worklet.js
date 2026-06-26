'use strict'

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.capturing = false
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIdx = 0
    this.energySmooth = 0
    this.reportCounter = 0
    this.silenceThreshold = 0.01
    this.silenceTimeoutMs = 8000
    this.silenceStart = 0

    this.port.onmessage = (e) => {
      switch (e.data.cmd) {
        case 'start': this.capturing = true; this.silenceStart = 0; break
        case 'stop': this.capturing = false; this.bufferIdx = 0; break
        case 'set_silence_timeout': this.silenceTimeoutMs = e.data.value || 0; break
      }
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const samples = input[0]

    // RMS energy
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    const rms = Math.sqrt(sum / samples.length)
    this.energySmooth = 0.7 * this.energySmooth + 0.3 * rms

    // Report energy ~10x/sec (at 128 samples/block, 48kHz ≈ 375 blocks/sec)
    this.reportCounter++
    if (this.reportCounter >= 37) {
      this.port.postMessage({ energy: this.energySmooth })
      this.reportCounter = 0
    }

    if (!this.capturing) return true

    // Silence timeout
    if (this.silenceTimeoutMs > 0) {
      if (rms < this.silenceThreshold) {
        if (!this.silenceStart) this.silenceStart = currentTime * 1000
        else if (currentTime * 1000 - this.silenceStart > this.silenceTimeoutMs) {
          this.port.postMessage({ silenceTimeout: true })
          this.capturing = false
          return true
        }
      } else { this.silenceStart = 0 }
    }

    // Buffer and downsample to 16kHz Int16 PCM
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferIdx++] = samples[i]
      if (this.bufferIdx >= this.bufferSize) {
        const ratio = sampleRate / 16000
        const outputLength = Math.floor(this.bufferSize / ratio)
        const int16 = new Int16Array(outputLength)
        for (let j = 0; j < outputLength; j++) {
          const srcIdx = Math.floor(j * ratio)
          const sample = Math.max(-1, Math.min(1, this.buffer[srcIdx]))
          int16[j] = Math.round(sample * 32767)
        }
        this.port.postMessage({ audio: int16.buffer }, [int16.buffer])
        this.bufferIdx = 0
      }
    }
    return true
  }
}

registerProcessor('audio-capture', AudioCaptureProcessor)
