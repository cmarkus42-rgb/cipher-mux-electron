/**
 * BargeInDetector — amplitude-based barge-in detection.
 *
 * Monitors audio RMS amplitude and fires a callback when a sharp onset
 * is detected (loud enough for long enough). Runs independently of the
 * echo guard and VAD/STT pipeline, allowing barge-in even while the
 * echo guard suppresses normal VAD triggers during TTS playback.
 */

export interface BargeInDetectorOptions {
  /** RMS threshold in dB (default: -30). Audio louder than this is considered onset. */
  thresholdDb?: number
  /** Minimum duration in ms the signal must exceed threshold (default: 50). */
  minDurationMs?: number
  /** Callback fired when barge-in is detected. */
  onBargeIn: () => void
}

export class BargeInDetector {
  private thresholdLinear: number
  private minDurationMs: number
  private onBargeIn: () => void
  private enabled = false
  private onsetStartTime: number | null = null
  private fired = false

  constructor(opts: BargeInDetectorOptions) {
    const thresholdDb = opts.thresholdDb ?? -30
    this.thresholdLinear = Math.pow(10, thresholdDb / 20)
    this.minDurationMs = opts.minDurationMs ?? 50
    this.onBargeIn = opts.onBargeIn
  }

  /** Enable or disable the detector. Resets state on disable. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.onsetStartTime = null
      this.fired = false
    }
  }

  /**
   * Feed an audio frame (Int16 PCM samples) for amplitude analysis.
   * Call this with each audio frame from the microphone stream.
   */
  processFrame(samples: Int16Array): void {
    if (!this.enabled || this.fired) return

    const rms = this.computeRMS(samples)

    if (rms >= this.thresholdLinear) {
      if (this.onsetStartTime === null) {
        this.onsetStartTime = Date.now()
      } else if (Date.now() - this.onsetStartTime >= this.minDurationMs) {
        this.fired = true
        this.onBargeIn()
      }
    } else {
      this.onsetStartTime = null
    }
  }

  /** Compute RMS of Int16 PCM samples, normalized to 0..1 range. */
  private computeRMS(samples: Int16Array): number {
    if (samples.length === 0) return 0
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / 32768
      sum += normalized * normalized
    }
    return Math.sqrt(sum / samples.length)
  }
}
