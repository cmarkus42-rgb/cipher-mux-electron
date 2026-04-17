import { useEffect, useRef, useCallback } from 'preact/hooks'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import '@xterm/xterm/css/xterm.css'
import { getTerminalTheme } from './useTheme'
import type { ThemeName } from '../../shared/grid-types'

const api = () => (window as any).cipherMux

/**
 * Tracks sessionIds that have already been capture-restored in this renderer
 * process. We skip capture on brand-new sessions (createdAt within last 10s)
 * on their very first mount to avoid clobbering an in-flight autoLaunch TUI.
 * Recovered sessions (older createdAt) always get captured, even on first mount.
 */
const capturedSessions = new Set<string>()

/** Threshold: sessions created more than 10s ago are considered recovered. */
const RECOVERED_THRESHOLD_MS = 10_000

export interface UseTerminalResult {
  terminalRef: preact.RefObject<HTMLDivElement>
  fit: () => void
}

export function useTerminal(sessionId: string, theme: ThemeName = 'ivory', createdAt?: number): UseTerminalResult {
  const terminalRef = useRef<HTMLDivElement>(null!)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const fit = useCallback(() => {
    const fitAddon = fitAddonRef.current
    const term = termRef.current
    if (!fitAddon || !term) return
    try {
      fitAddon.fit()
      api().terminal.resize(sessionId, term.cols, term.rows)
    } catch {
      // container may not be visible yet
    }
  }, [sessionId])

  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: "'Fira Code', 'Roboto Mono', 'SF Mono', Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: getTerminalTheme(theme),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(container)

    // Try WebGL, fall back to Canvas
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        webgl.dispose()
        term.loadAddon(new CanvasAddon())
      })
      term.loadAddon(webgl)
    } catch {
      try {
        term.loadAddon(new CanvasAddon())
      } catch {
        // basic renderer is fine
      }
    }

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Track first successful fit so we can signal TERMINAL_READY exactly once.
    // This unblocks any queued auto-launch commands in the main process (e.g.
    // `claude --...`) so TUIs start at the real terminal size, not 80x24.
    let reported = false
    const reportReady = () => {
      if (reported) return
      if (term.cols < 20 || term.rows < 5) return
      reported = true
      api().terminal.ready(sessionId, term.cols, term.rows)
      // After autoLaunch fires (≈ 250ms post-ready in main), the viewport can
      // be scrolled off the live region because xterm stored the shell prompt
      // + command echo in scrollback before claude's RIS+clear landed. Nudge
      // the viewport to the cursor a few times to catch up.
      const nudge = () => term.write('', () => term.scrollToBottom())
      setTimeout(nudge, 400)
      setTimeout(nudge, 900)
      setTimeout(nudge, 1500)
    }

    // Use ResizeObserver to fit terminal when container gets/changes size
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        api().terminal.resize(sessionId, term.cols, term.rows)
        reportReady()
      } catch {
        // container may not be visible yet
      }
    })
    resizeObserver.observe(container)

    // Initial fit after layout settles
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        api().terminal.resize(sessionId, term.cols, term.rows)
        reportReady()
      } catch {
        // container may not be visible yet
      }
    })
    // Second fit after a short delay to catch late layout changes
    setTimeout(() => {
      try {
        fitAddon.fit()
        api().terminal.resize(sessionId, term.cols, term.rows)
        reportReady()
      } catch {
        // ignore
      }
    }, 200)

    // Aggressive auto-scroll: poll every 200ms for the first 8 seconds after
    // mount to keep the viewport at the bottom. This catches all async writes,
    // late-arriving data from tmux, and TUI startup sequences (claude CLI).
    const AUTO_SCROLL_MS = 8000
    const scrollInterval = setInterval(() => {
      term.write('', () => term.scrollToBottom())
    }, 200)
    const scrollTimeout = setTimeout(() => clearInterval(scrollInterval), AUTO_SCROLL_MS)

    // Restore pane content from tmux via capture-pane.
    // Skip ONLY for brand-new sessions (created <10s ago) on their first mount,
    // because they may have an autoLaunch TUI (claude) starting up. Recovered
    // sessions (app restart) always need capture to show existing content.
    const alreadyCaptured = capturedSessions.has(sessionId)
    const sessionAge = createdAt ? Date.now() - createdAt : Infinity
    const isBrandNew = !alreadyCaptured && sessionAge < RECOVERED_THRESHOLD_MS
    capturedSessions.add(sessionId)

    const restoreTimer = isBrandNew
      ? null
      : setTimeout(() => {
          api().terminal.capture(sessionId).then((content: string) => {
            if (content?.trim() && term) {
              term.reset()
              term.write(content.replace(/\n/g, '\r\n'), () => {
                term.scrollToBottom()
              })
            }
          }).catch(() => {
            // session may not be ready yet
          })
        }, 500)

    // Send user input to main process
    const inputDisposable = term.onData((data: string) => {
      api().terminal.write(sessionId, data)
    })

    // Receive output from main process
    const unsubscribe = api().terminal.onData(
      (payload: { paneId: string; data: string }) => {
        if (payload.paneId === sessionId) {
          term.write(payload.data)
        }
      }
    )

    return () => {
      clearInterval(scrollInterval)
      clearTimeout(scrollTimeout)
      if (restoreTimer) clearTimeout(restoreTimer)
      resizeObserver.disconnect()
      inputDisposable.dispose()
      unsubscribe()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId, theme])

  return { terminalRef, fit }
}
