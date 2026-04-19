/**
 * vad-loader.ts — Initialize Silero VAD in Electron renderer.
 *
 * Loads MicVAD with local assets (no CDN). Shares the existing MediaStream
 * so only one getUserMedia() call is needed.
 *
 * Ported from cipher-desktop's vad-loader.js (proven, battle-tested).
 */

declare global {
  interface Window {
    vad?: { MicVAD: any }
    ort?: { env: { wasm: { numThreads: number } } }
  }
}

// Build absolute URL for VAD assets relative to the page
const VAD_ASSETS_PATH = new URL('./vad-assets/', window.location.href).href

export interface VADCallbacks {
  onSpeechStart: () => void
  onSpeechEnd: (audio: Float32Array) => void
  onVADMisfire?: () => void
}

export interface VADConfig {
  positiveSpeechThreshold?: number
  negativeSpeechThreshold?: number
  redemptionFrames?: number
  minSpeechFrames?: number
  preSpeechPadFrames?: number
}

export interface MicVADInstance {
  start: () => void
  pause: () => void
  destroy: () => void
}

/**
 * Initialize Silero VAD with local assets and a shared MediaStream.
 */
export async function initVAD(
  stream: MediaStream,
  audioCtx: AudioContext,
  callbacks: VADCallbacks,
  vadConfig: VADConfig = {},
): Promise<MicVADInstance> {
  if (!window.vad?.MicVAD) {
    throw new Error('VAD not loaded — ensure ort.wasm.min.js and vad-web.bundle.min.js are included in index.html')
  }

  const config = {
    positiveSpeechThreshold: vadConfig.positiveSpeechThreshold ?? 0.7,
    negativeSpeechThreshold: vadConfig.negativeSpeechThreshold ?? 0.3,
    redemptionFrames: vadConfig.redemptionFrames ?? 8,
    minSpeechFrames: vadConfig.minSpeechFrames ?? 5,
    preSpeechPadFrames: vadConfig.preSpeechPadFrames ?? 3,
  }

  console.log('[VAD] Initializing Silero VAD with config:', config)
  console.log('[VAD] Asset path:', VAD_ASSETS_PATH)

  // Disable multi-threaded WASM — blob workers can't resolve file:// paths
  if (window.ort?.env?.wasm) {
    window.ort.env.wasm.numThreads = 1
    console.log('[VAD] ONNX WASM threads set to 1 (single-thread)')
  }

  const micVAD = await window.vad.MicVAD.new({
    // Use shared stream — no second getUserMedia call
    getStream: () => Promise.resolve(stream),
    pauseStream: () => Promise.resolve(),
    resumeStream: () => Promise.resolve(stream),

    // Share AudioContext
    audioContext: audioCtx,

    // Local asset paths (no CDN)
    baseAssetPath: VAD_ASSETS_PATH,
    onnxWASMBasePath: VAD_ASSETS_PATH,

    // Model
    model: 'legacy',

    // Don't start automatically
    startOnLoad: false,

    // VAD sensitivity
    ...config,

    // Callbacks
    onSpeechStart: () => {
      console.log('[VAD] Speech start detected')
      callbacks.onSpeechStart()
    },

    onSpeechEnd: (audio: Float32Array) => {
      const durationMs = Math.round((audio.length / 16000) * 1000)
      console.log(`[VAD] Speech end — ${audio.length} samples (${durationMs}ms)`)
      callbacks.onSpeechEnd(audio)
    },

    onVADMisfire: () => {
      console.log('[VAD] Misfire (speech too short)')
      callbacks.onVADMisfire?.()
    },
  })

  console.log('[VAD] Silero VAD initialized successfully')
  return micVAD
}
