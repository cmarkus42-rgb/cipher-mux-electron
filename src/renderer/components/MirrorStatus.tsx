import { useCallback, useEffect, useState } from 'preact/hooks'
import type { MirrorDrift, MirrorHistory } from '../../main/notes/mirror-drift'

/**
 * MirrorStatus — the header above a note that mirrors a file in git.
 *
 * The concept says a mirror must never look current when it is not, and that
 * this has to be *computed and shown* rather than declared somewhere. Until
 * now it was only computed when a note was handed to a session, so a stale
 * mirror sitting open on screen looked exactly like a fresh one. That was the
 * largest gap between the concept and what a person actually sees.
 *
 * What it shows and why:
 *
 *  - The file it mirrors and the commit it was taken at, always. Without the
 *    commit the age is unknowable, and an unknowable age has to read as stale.
 *  - Commits that touched the file since — the drift, in the words of the
 *    people who made those commits.
 *  - A history list on demand: which commits ever touched this file. That is
 *    following along. No diff, no blame, no branches — those are version
 *    control, and there are better tools for it.
 *  - A refresh button, never an automatic pull. The note is a work surface: a
 *    correction nobody has incorporated yet would be overwritten by a refresh,
 *    so a human presses it.
 */

interface MirrorStatusPayload {
  drift: MirrorDrift
  summary: string
  history: MirrorHistory
}

export interface MirrorStatusProps {
  noteId: string
  /** Bump to re-read after the note changed underneath. */
  reloadKey?: number
  /** Called after a successful refresh so the caller can reload the body. */
  onRefreshed?: () => void
}

export function MirrorStatus({ noteId, reloadKey, onRefreshed }: MirrorStatusProps) {
  const [status, setStatus] = useState<MirrorStatusPayload | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await window.cipherMux.notes.mirrorStatus(noteId)
      setStatus(result ?? null)
    } catch (err) {
      console.error('[MirrorStatus] failed to read mirror status:', err)
      setStatus(null)
    }
  }, [noteId])

  useEffect(() => { void load() }, [load, reloadKey])

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const result = await window.cipherMux.notes.mirrorRefresh(noteId)
      if (result?.ok) {
        onRefreshed?.()
        await load()
      } else {
        console.error('[MirrorStatus] refresh refused:', result?.problems)
      }
    } finally {
      setBusy(false)
    }
  }, [noteId, load, onRefreshed])

  // A note that mirrors nothing gets no header at all.
  if (!status) return null

  const { drift, summary, history } = status
  const stale = !drift.current

  return (
    <div class={`mirror${stale ? ' mirror--stale' : ''}`}>
      <div class="mirror__line">
        <span class="mirror__summary" title={drift.filePath}>{summary}</span>

        <div class="mirror__actions">
          {history.commits.length > 0 && (
            <button
              class="mirror__btn"
              onClick={() => setShowHistory(v => !v)}
              title="Welche Commits diese Datei berührt haben"
            >
              Historie ({history.commits.length}{history.truncated ? '+' : ''})
            </button>
          )}
          {stale && (
            <button
              class="mirror__btn mirror__btn--primary"
              onClick={refresh}
              disabled={busy}
              title="Inhalt aus git nachziehen — ersetzt den Text dieser Note"
            >
              {busy ? 'zieht nach…' : 'nachziehen'}
            </button>
          )}
        </div>
      </div>

      {/* The commits since the mirror point, in the words of whoever made them. */}
      {stale && drift.commits.length > 0 && (
        <ul class="mirror__drift">
          {drift.commits.map(c => (
            <li key={c.hash}>
              <code>{c.hash}</code> {c.subject}
            </li>
          ))}
        </ul>
      )}

      {showHistory && (
        <ul class="mirror__history">
          {history.commits.map(c => (
            <li key={c.hash}>
              <span class="mirror__date">{c.date}</span>
              <code>{c.hash}</code>
              <span class="mirror__subject">{c.subject}</span>
              <span class="mirror__author">{c.author}</span>
            </li>
          ))}
          {history.truncated && (
            <li class="mirror__more">… ältere Commits nicht gezeigt</li>
          )}
        </ul>
      )}
    </div>
  )
}
