/**
 * Globals the preload bridge puts on `window`.
 *
 * Without this declaration every access to `window.cipherMux` is a type error,
 * which is why most call sites reach for `(window as any).cipherMux`. The cast
 * hides real mistakes: a typo in a method name looks identical to a correct
 * call. Declaring the global keeps the escape hatch from being the only way in.
 *
 * The shape is deliberately loose (`any`) for now — the bridge in
 * `src/main/preload.ts` is the source of truth for it, and typing it properly
 * means extracting that surface into a shared interface. That is worth doing,
 * but it is a separate change: this one only removes the need to lie to the
 * compiler about whether the object exists at all.
 */
export {}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cipherMux: any
  }
}
