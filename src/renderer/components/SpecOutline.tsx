import { useCallback, useEffect, useState } from 'preact/hooks'
import type { SpecOutlineEntry } from '../../main/notes/spec-outline'

/**
 * SpecOutline — the headings of a spec note, as a way to get around in it.
 *
 * Deliberately not a rendered view of the document. A spec note stays an
 * editor because that is where corrections are written, and the round trip
 * through a handoff depends on the text being editable. What was missing was
 * orientation, not rendering: seven sections in a scrolling text field are
 * invisible until you scroll past them.
 *
 * Collapsible, and collapsed by default for short documents — a spec with
 * three headings needs no map.
 */

/** Below this many headings the outline is more chrome than help. */
const WORTH_SHOWING = 4

export interface SpecOutlineProps {
  noteId: string
  /** Bump after the body changed so the headings are re-read. */
  reloadKey?: number
  /** Jump to a line in the editor. Absent where there is nothing to jump in. */
  onJump?: (line: number) => void
}

export function SpecOutline({ noteId, reloadKey, onJump }: SpecOutlineProps) {
  const [entries, setEntries] = useState<SpecOutlineEntry[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await window.cipherMux.notes.specOutline(noteId)
      setEntries(Array.isArray(result) ? result : [])
    } catch (err) {
      console.error('[SpecOutline] failed to read outline:', err)
      setEntries([])
    }
  }, [noteId])

  useEffect(() => { void load() }, [load, reloadKey])

  if (entries.length < WORTH_SHOWING) return null

  return (
    <div class={`outline${open ? ' outline--open' : ''}`}>
      <button
        class="outline__toggle"
        onClick={() => setOpen(v => !v)}
        title="Abschnitte dieses Dokuments"
      >
        {open ? '▾' : '▸'} Gliederung ({entries.length})
      </button>

      {open && (
        <ul class="outline__list">
          {entries.map(e => (
            <li
              key={`${e.line}-${e.title}`}
              class={`outline__item outline__item--l${e.level}`}
            >
              <button
                class="outline__link"
                onClick={() => onJump?.(e.line)}
                disabled={!onJump}
                title={onJump ? `Zu Zeile ${e.line + 1}` : e.title}
              >
                {e.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
