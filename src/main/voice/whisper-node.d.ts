/**
 * Type declarations for @fugood/whisper.node (optional native dependency).
 * The module is lazy-imported at runtime and may not be installed.
 */
declare module '@fugood/whisper.node' {
  export function transcribe(
    modelPath: string,
    pcm: Float32Array,
    options?: { language?: string }
  ): Promise<string | { text: string }>
}
