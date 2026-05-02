/**
 * vad-loader.ts — Initialize Silero VAD in Electron renderer.
 *
 * Loads MicVAD with local ONNX/WASM assets (no CDN). Reuses the existing
 * MediaStream and AudioContext so only one getUserMedia() call is needed.
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

  console.log('[VAD] Initializing Silero VAD')

  // Disable multi-threaded WASM — blob workers can't resolve file:// paths in Electron
  if (window.ort?.env?.wasm) {
    window.ort.env.wasm.numThreads = 1
  }

  const micVAD = await window.vad.MicVAD.new({
    getStream: () => Promise.resolve(stream),
    pauseStream: () => Promise.resolve(),
    resumeStream: () => Promise.resolve(stream),
    audioContext: audioCtx,
    baseAssetPath: VAD_ASSETS_PATH,
    onnxWASMBasePath: VAD_ASSETS_PATH,
    model: 'legacy',
    startOnLoad: false,
    ...config,

    onSpeechStart: () => callbacks.onSpeechStart(),
    onSpeechEnd: (audio: Float32Array) => callbacks.onSpeechEnd(audio),
    onVADMisfire: () => callbacks.onVADMisfire?.(),
  })

  console.log('[VAD] Silero VAD initialized')
  return micVAD
}
