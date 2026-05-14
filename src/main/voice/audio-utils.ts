/**
 * Convert Float32 PCM [-1.0, 1.0] to WAV file buffer with RIFF header.
 * 1 channel, 16-bit PCM, proper header at offset 0-43.
 */
export function pcmToWav(pcmData: Float32Array, sampleRate: number): Buffer {
  if (!pcmData || pcmData.length === 0) {
    throw new Error('PCM data is empty')
  }

  const numSamples = pcmData.length
  const bytesPerSample = 2 // 16-bit
  const numChannels = 1
  const dataSize = numSamples * bytesPerSample
  const headerSize = 44
  const fileSize = headerSize + dataSize

  const buffer = Buffer.alloc(fileSize)

  // RIFF header
  buffer.write('RIFF', 0, 4, 'ascii')
  buffer.writeUInt32LE(fileSize - 8, 4) // file size minus RIFF + size fields
  buffer.write('WAVE', 8, 4, 'ascii')

  // fmt sub-chunk
  buffer.write('fmt ', 12, 4, 'ascii')
  buffer.writeUInt32LE(16, 16) // sub-chunk size (16 for PCM)
  buffer.writeUInt16LE(1, 20) // audio format: 1 = PCM
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28) // byte rate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32) // block align
  buffer.writeUInt16LE(bytesPerSample * 8, 34) // bits per sample

  // data sub-chunk
  buffer.write('data', 36, 4, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  // Convert Float32 samples to Int16
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, pcmData[i]))
    const int16 = sample >= 0
      ? Math.round(sample * 32767)
      : Math.round(sample * 32768)
    buffer.writeInt16LE(int16, headerSize + i * bytesPerSample)
  }

  return buffer
}

/** Result of splitting text into sentences. */
export interface SentenceSegment {
  /** The sentence text (trimmed). */
  text: string
  /** The trailing punctuation character(s), e.g. '.', '?', '!', '...', or '' if none. */
  trailing: string
}

/**
 * Split text into sentence segments at sentence-ending punctuation (.!?)
 * followed by whitespace or end-of-string.
 * Preserves trailing punctuation in each segment.
 */
export function splitSentences(text: string): SentenceSegment[] {
  if (!text || !text.trim()) return []

  // Split at sentence boundaries: one or more .!? followed by whitespace or end
  const parts = text.match(/[^.!?]*[.!?]+(?:\s+|$)|[^.!?]+$/g)
  if (!parts) return []

  return parts
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      const trailingMatch = p.match(/([.!?]+)\s*$/)
      return {
        text: p,
        trailing: trailingMatch ? trailingMatch[1] : '',
      }
    })
}

export interface PauseConfig {
  pauseAfterPeriod: number
  pauseAfterQuestion: number
  pauseAfterComma: number
}

/**
 * Get pause duration in ms for a trailing punctuation string.
 * '.' → period pause, '?'/'!' → question pause, ','/';'/':' → comma pause.
 */
export function getPauseDuration(trailing: string, config: PauseConfig): number {
  if (!trailing) return 0
  // Check last meaningful character
  const last = trailing[trailing.length - 1]
  if (last === '.') return config.pauseAfterPeriod
  if (last === '?' || last === '!') return config.pauseAfterQuestion
  if (last === ',' || last === ';' || last === ':') return config.pauseAfterComma
  return 0
}

/**
 * Append silence (zero samples) to a WAV buffer.
 * Updates RIFF header and data sub-chunk size.
 *
 * @param wavBuffer - Valid WAV buffer (44-byte header + PCM data)
 * @param durationMs - Silence duration in milliseconds
 * @param sampleRate - Sample rate of the WAV (must match original)
 * @returns New buffer with silence appended
 */
export function appendSilence(wavBuffer: Buffer, durationMs: number, sampleRate: number): Buffer {
  if (durationMs <= 0) return wavBuffer

  const bytesPerSample = 2 // 16-bit mono
  const silenceSamples = Math.round(sampleRate * durationMs / 1000)
  const silenceBytes = silenceSamples * bytesPerSample

  const result = Buffer.alloc(wavBuffer.length + silenceBytes)
  wavBuffer.copy(result)
  // Silence bytes are already 0 from Buffer.alloc

  // Update RIFF file size (offset 4): total file size - 8
  result.writeUInt32LE(result.length - 8, 4)

  // Update data sub-chunk size (offset 40)
  const oldDataSize = wavBuffer.readUInt32LE(40)
  result.writeUInt32LE(oldDataSize + silenceBytes, 40)

  return result
}

/**
 * Concatenate multiple WAV buffers (same format: mono 16-bit PCM, same sampleRate)
 * into a single WAV buffer. Strips individual headers, merges PCM data.
 */
export function concatenateWavs(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 0) return Buffer.alloc(0)
  if (wavBuffers.length === 1) return wavBuffers[0]

  const headerSize = 44
  let totalPcmBytes = 0
  for (const wav of wavBuffers) {
    totalPcmBytes += wav.length - headerSize
  }

  // Copy header from first WAV, then append all PCM data
  const result = Buffer.alloc(headerSize + totalPcmBytes)
  wavBuffers[0].copy(result, 0, 0, headerSize)

  let offset = headerSize
  for (const wav of wavBuffers) {
    wav.copy(result, offset, headerSize)
    offset += wav.length - headerSize
  }

  // Update RIFF file size and data sub-chunk size
  result.writeUInt32LE(result.length - 8, 4)
  result.writeUInt32LE(totalPcmBytes, 40)

  return result
}
