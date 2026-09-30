/**
 * Session readiness — deciding when a freshly started session can be talked to.
 *
 * Two independent signals, checked on every pass, neither able to veto the
 * other:
 *
 * 1. **The session's own report.** Claude Code's statusLine hook pipes JSON to
 *    `<statusLineDir>/$CIPHER_MUX_SESSION_ID.json` on every update. A report
 *    written after dispatch began means the CLI is up and rendering. This is
 *    the session telling us it is there, rather than us reading its screen.
 * 2. **The visible prompt.** Reading the pane for a prompt marker. Weaker —
 *    it depends on how the CLI draws itself — but it is the only signal left
 *    when the self-report never arrives.
 *
 * The self-report is not always available, which is why the fallback stays:
 * `injectStatusLineHook` skips projects that already define a `statusLine`
 * command, adapters other than Claude Code have no such hook, and a CLI that
 * dies during startup never writes one. A report from an *earlier* run of the
 * same session id would be worse than none, so freshness is required.
 *
 * The structure matters more than either probe. This loop previously gated its
 * reliable check behind a heuristic (`isBusy`), and when that heuristic broke
 * against a new CLI version, every handoff into a fresh session timed out
 * against a session that was sitting at its prompt, ready. One signal must
 * never be able to silence another.
 */

/** Which signal established readiness. */
export type ReadySignal = 'status-line' | 'prompt'

export interface ReadinessProbes {
  /**
   * Epoch-ms mtime of the session's most recent self-report, or null when
   * there is none.
   */
  statusReportMtime: (sessionId: string) => Promise<number | null>
  /** Current contents of the session's pane. */
  capturePane: (sessionId: string) => Promise<string>
  /** Injected so tests do not wait in real time. */
  sleep?: (ms: number) => Promise<void>
}

export interface ReadinessResult {
  ready: boolean
  /** Which signal answered, or null if none did. */
  via: ReadySignal | null
  /** How many probe rounds were used. */
  attempts: number
}

export interface ReadinessOptions {
  /**
   * Epoch ms the wait started. A self-report older than this belongs to an
   * earlier run and proves nothing about the session being addressed now.
   */
  since: number
  delays?: number[]
}

/** Markers Claude Code draws when it is waiting for input. */
export const PROMPT_MARKERS = ['❯', 'Try']

/** 500ms, 1s, 2s, 4s, 4s — roughly 15s in total. */
export const DEFAULT_BACKOFF = [500, 1000, 2000, 4000, 4000]

const defaultSleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

export async function waitForSessionReady(
  probes: ReadinessProbes,
  sessionId: string,
  opts: ReadinessOptions,
): Promise<ReadinessResult> {
  const delays = opts.delays ?? DEFAULT_BACKOFF
  const sleep = probes.sleep ?? defaultSleep
  let attempts = 0

  for (const delay of delays) {
    // Always wait first — a session started microseconds ago has had no
    // chance to produce either signal, and probing it proves nothing.
    await sleep(delay)
    attempts++

    // Each probe is isolated. A probe that throws reports nothing; it does
    // not get to decide anything about the other.
    try {
      const mtime = await probes.statusReportMtime(sessionId)
      if (mtime !== null && mtime >= opts.since) {
        return { ready: true, via: 'status-line', attempts }
      }
    } catch { /* no self-report available this round */ }

    try {
      const captured = await probes.capturePane(sessionId)
      if (PROMPT_MARKERS.some(marker => captured.includes(marker))) {
        return { ready: true, via: 'prompt', attempts }
      }
    } catch { /* pane not capturable this round */ }
  }

  return { ready: false, via: null, attempts }
}
