/**
 * Globals the preload bridge puts on `window`.
 *
 * Without this declaration every access to `window.cipherMux` is a type error,
 * which is why most call sites reach for `window.cipherMux`. The cast
 * hides real mistakes: a typo in a method name looks identical to a correct
 * call. Declaring the global keeps the escape hatch from being the only way in.
 *
 * The shape is deliberately loose (`any`) for now — the bridge in
 * `src/main/preload.ts` is the source of truth for it, and typing it properly
 * means extracting that surface into a shared interface. That is worth doing,
 * but it is a separate change: this one only removes the need to lie to the
 * compiler about whether the object exists at all.
 */
import type { CipherMuxApi } from '../main/preload'
import type { NoteInfo } from '../shared/types'

export {}

declare global {
  interface Window {
    /**
     * The preload bridge. Typed from `typeof api` in preload.ts, so the shape
     * is derived rather than restated — a method that exists here exists there,
     * and a typo is a compile error instead of a runtime undefined.
     */
    cipherMux: CipherMuxApi
    /**
     * Slot index → the open handler of the NotesCell sitting in that slot.
     * Created lazily by NotesCell so the sidebar and app can hand a note to a
     * specific cell without threading callbacks through the whole tree.
     */
    __notesCellRegistry?: Record<number, (info: NoteInfo) => void | Promise<void>>
  }
}
