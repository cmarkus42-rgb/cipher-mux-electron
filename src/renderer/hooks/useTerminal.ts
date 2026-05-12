import { useEffect, useRef, useCallback } from 'preact/hooks'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import '@xterm/xterm/css/xterm.css'
import { getTerminalTheme as getGeneratedTerminalTheme } from './useTheme'
import type { ThemeName } from '../../shared/grid-types'
import { registerTerminal, unregisterTerminal, setMarker } from '../terminal-registry'
import { getTerminalFontSize } from '../a11y/terminal-font-size'

const api = () => (window as any).cipherMux

/**
 * Reads terminal color CSS variables from body and returns an xterm.js theme object.
 * Variables are defined on body[data-theme="..."], so we must read from body, not :root.
 * Falls back to the generated theme map if CSS variables are not yet defined.
 */
function getCssTerminalTheme(fallbackTheme?: ThemeName): Record<string, string | undefined> {
  const style = getComputedStyle(document.body)
  const get = (name: string) => style.getPropertyValue(name).trim() || undefined
  const bg = get('--terminal-bg')
  // If no CSS variable defined, fall back to generated theme
  if (!bg) {
    const current = (document.body.dataset.theme as ThemeName) || fallbackTheme || 'cipher-ivory'
    return getGeneratedTerminalTheme(current)
  }
  return {
    background: bg,
    foreground: get('--terminal-foreground'),
    cursor: get('--terminal-cursor'),
    selectionBackground: get('--terminal-selection'),
    black: get('--terminal-ansi-black'),
    red: get('--terminal-ansi-red'),
    green: get('--terminal-ansi-green'),
    yellow: get('--terminal-ansi-yellow'),
    blue: get('--terminal-ansi-blue'),
    magenta: get('--terminal-ansi-magenta'),
    cyan: get('--terminal-ansi-cyan'),
    white: get('--terminal-ansi-white'),
    brightBlack: get('--terminal-ansi-bright-black'),
    brightRed: get('--terminal-ansi-bright-red'),
    brightGreen: get('--terminal-ansi-bright-green'),
    brightYellow: get('--terminal-ansi-bright-yellow'),
    brightBlue: get('--terminal-ansi-bright-blue'),
    brightMagenta: get('--terminal-ansi-bright-magenta'),
    brightCyan: get('--terminal-ansi-bright-cyan'),
    brightWhite: get('--terminal-ansi-bright-white'),
  }
}

/**
 * Tracks sessionIds that have already been capture-restored in this renderer
 * process. We skip capture on brand-new sessions (createdAt within last 10s)
 * on their very first mount to avoid clobbering an in-flight autoLaunch TUI.
 * Recovered sessions (older createdAt) always get captured, even on first mount.
 */
const capturedSessions = new Set<string>()

/** Threshold: sessions created more than 10s ago are considered recovered. */
const RECOVERED_THRESHOLD_MS = 10_000

/** Minimum container dimension (px) to attempt fit — avoids zero-size states during transitions. */
const MIN_FIT_DIMENSION = 50

/** Debounce interval (ms) for fit() calls — coalesces rapid ResizeObserver / window resize events. */
const FIT_DEBOUNCE_MS = 150

export interface UseTerminalResult {
  terminalRef: preact.RefObject<HTMLDivElement>
  fit: () => void
}

export function useTerminal(sessionId: string, theme: ThemeName = 'cipher-ivory', createdAt?: number): UseTerminalResult {
  const terminalRef = useRef<HTMLDivElement>(null!)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Timer for post-resize capture-pane re-sync with tmux. */
  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Last cols/rows sent to tmux — skip IPC if unchanged. */
  const lastSizeRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 })

  /**
   * Re-sync xterm.js buffer with tmux's actual pane content via capture-pane.
   * Called after resize to fix reflow mismatch: xterm.js reflows its buffer
   * internally when cols change, but tmux reflows differently. Without re-sync,
   * lines fragment and text appears garbled (T-LC.7).
   */
  const scheduleResync = useCallback(() => {
    if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current)
    resyncTimerRef.current = setTimeout(() => {
      resyncTimerRef.current = null
      const term = termRef.current
      if (!term) return

      // T-BF.1: Save scroll state before capture so we can restore after rewrite
      const buf = term.buffer.active
      const wasAtBottom = buf.viewportY >= buf.baseY
      const savedViewportY = buf.viewportY

      api().terminal.capture(sessionId).then((content: string) => {
        if (!term || !termRef.current) return
        if (content?.trim()) {
          term.reset()
          term.write(content.replace(/\n/g, '\r\n'), () => {
            // T-BF.1: Restore scroll position instead of always jumping to bottom
            if (wasAtBottom) {
              term.scrollToBottom()
            } else {
              const newBuf = term.buffer.active
              term.scrollToLine(Math.min(savedViewportY, newBuf.baseY))
            }
            try { term.refresh(0, term.rows - 1) } catch { /* ignore */ }

            // T-BF.2: Re-fit after content write — scrollbar may have appeared/
            // disappeared, changing available viewport width. Without this, cols
            // calculated pre-write can be too wide, clipping the right edge.
            const fitAddon = fitAddonRef.current
            if (fitAddon) {
              try {
                fitAddon.fit()
                const { cols, rows } = term
                const last = lastSizeRef.current
                if (cols !== last.cols || rows !== last.rows) {
                  lastSizeRef.current = { cols, rows }
                  api().terminal.resize(sessionId, cols, rows)
                }
              } catch { /* ignore */ }
            }
          })
        }
      }).catch(() => { /* session may not be ready */ })
    }, 200)
  }, [sessionId])

  /**
   * Core fit-and-sync: runs fitAddon.fit(), syncs tmux resize-pane if
   * dimensions changed, and schedules a capture-pane resync.
   * Returns true if fit succeeded, false if skipped/failed.
   * All callers should use this instead of raw fitAddon.fit().
   */
  const fitAndSync = useCallback((): boolean => {
    const fitAddon = fitAddonRef.current
    const term = termRef.current
    const container = terminalRef.current
    if (!fitAddon || !term || !container) return false

    // Visibility-gate: skip fit on collapsed / zero-size containers
    const { clientWidth, clientHeight } = container
    if (clientWidth < MIN_FIT_DIMENSION || clientHeight < MIN_FIT_DIMENSION) return false

    try {
      // Preserve scroll position across fit() — without this, resizing
      // (especially height increase) resets the viewport to the bottom.
      const buf = term.buffer.active
      const wasAtBottom = buf.viewportY >= buf.baseY
      const savedViewportY = buf.viewportY

      fitAddon.fit()

      // After fit(), refresh the viewport so xterm recalculates scrollback
      // accessibility. Without this, height increases leave scroll stuck.
      try { term.refresh(0, term.rows - 1) } catch { /* ignore */ }

      if (!wasAtBottom) {
        // User was scrolled up — restore their position
        term.scrollToLine(Math.min(savedViewportY, buf.baseY))
      }

      // Only send resize IPC if dimensions actually changed
      const { cols, rows } = term
      const last = lastSizeRef.current
      if (cols !== last.cols || rows !== last.rows) {
        lastSizeRef.current = { cols, rows }
        api().terminal.resize(sessionId, cols, rows)
        // Re-sync with tmux after resize to fix xterm.js/tmux reflow mismatch
        scheduleResync()
      }
      return true
    } catch {
      // container may not be visible yet
      return false
    }
  }, [sessionId, scheduleResync])

  /**
   * Debounced fit: coalesces all resize triggers into a single fit() call
   * that only fires after the layout has settled (FIT_DEBOUNCE_MS).
   */
  const fit = useCallback(() => {
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
    fitTimerRef.current = setTimeout(() => {
      fitTimerRef.current = null
      fitAndSync()
    }, FIT_DEBOUNCE_MS)
  }, [fitAndSync])

  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: "'Fira Code', 'Roboto Mono', 'SF Mono', Menlo, monospace",
      fontSize: getTerminalFontSize(),
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: getCssTerminalTheme(theme),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(container)

    // Cmd+C/Cmd+X with selection → clipboard copy instead of SIGINT
    // Cmd+Shift+WASD → grid navigation (let event bubble to shortcut registry)
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true
      if (!ev.metaKey) return true
      // Grid navigation shortcuts — pass through to window-level handler
      if (ev.shiftKey && ['w', 'a', 's', 'd'].includes(ev.key.toLowerCase())) {
        return false
      }
      // Cmd+? — shortcut help overlay
      if (ev.shiftKey && ev.key === '?') {
        return false
      }
      if (ev.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        return false
      }
      if (ev.key === 'x' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      return true
    })

    // Try WebGL, fall back to Canvas
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        webgl.dispose()
        try {
          term.loadAddon(new CanvasAddon())
        } catch {
          // basic renderer fallback
        }
        // Re-render content after renderer swap to avoid black screen
        try { term.refresh(0, term.rows - 1) } catch { /* ignore */ }
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
    registerTerminal(sessionId, term)

    // Listen for theme-editor live preview (style changes) and theme switch (data-theme).
    // IMPORTANT: MutationObserver.observe() replaces previous observations on the same
    // target, so both filters must be in a single observe() call.
    const themeObserver = new MutationObserver(() => {
      if (term) {
        term.options.theme = getCssTerminalTheme()
      }
    })
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'data-theme'] })

    // Listen for terminal font size changes from a11y settings
    const onTermFontSize = ((e: CustomEvent<number>) => {
      const newSize = e.detail
      if (term.options.fontSize !== newSize) {
        term.options.fontSize = newSize
        try { fitAddon.fit() } catch { /* ignore */ }
        // Sync tmux pane size after font change
        const { cols, rows } = term
        const last = lastSizeRef.current
        if (cols !== last.cols || rows !== last.rows) {
          lastSizeRef.current = { cols, rows }
          api().terminal.resize(sessionId, cols, rows)
          scheduleResync()
        }
      }
    }) as EventListener
    window.addEventListener('a11y:terminal-font-size', onTermFontSize)

    // Track first successful fit so we can signal TERMINAL_READY exactly once.
    // This unblocks any queued auto-launch commands in the main process (e.g.
    // `claude --...`) so TUIs start at the real terminal size, not 80x24.
    let reported = false
    const reportReady = () => {
      if (reported) return
      if (term.cols < 20 || term.rows < 5) return
      reported = true
      lastSizeRef.current = { cols: term.cols, rows: term.rows }
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

    /**
     * Immediate (non-debounced) fit — used only during initial mount sequence
     * where we need to measure the real terminal size for TERMINAL_READY.
     * After the initial ready signal, all subsequent resizes go through the
     * debounced `fit()` to avoid rapid-fire IPC during grid reflows.
     */
    const immediateFit = () => {
      if (fitAndSync()) {
        reportReady()
      }
    }

    // Use ResizeObserver to fit terminal when container gets/changes size.
    // All resize events are funnelled through the debounced fit() to prevent
    // rapid-fire fit+IPC storms during grid reflow / CSS transitions.
    const resizeObserver = new ResizeObserver(() => {
      if (!reported) {
        // Before ready, try immediate fit to establish initial size quickly
        immediateFit()
      } else {
        fit()
      }
    })
    resizeObserver.observe(container)

    // IntersectionObserver: when terminal becomes visible (e.g. after grid
    // switch or un-hiding), trigger double-fit to avoid black/unsized terminals.
    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!reported) {
            immediateFit()
          } else {
            // Double-fit on visibility: immediate + rAF follow-up (T-LC.7)
            fitAndSync()
            requestAnimationFrame(() => fitAndSync())
          }
        }
      }
    }, { threshold: 0.1 })
    intersectionObserver.observe(container)

    // Initial fit after layout settles
    requestAnimationFrame(() => {
      immediateFit()
    })
    // Second fit after a short delay to catch late layout changes
    setTimeout(() => {
      immediateFit()
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

    // Restore pane content: fit first so tmux has the correct cols/rows,
    // wait for layout to settle, then capture-pane at the right dimensions.
    // Uses a two-phase approach: fit at 300ms, capture at 600ms (H.9 fix).
    const restoreTimer = isBrandNew
      ? null
      : setTimeout(() => {
          // Phase 1: ensure terminal is at final container size
          fitAndSync()
          // Phase 2: capture after tmux has processed the resize
          setTimeout(() => {
            api().terminal.capture(sessionId).then((content: string) => {
              if (content?.trim() && term) {
                term.reset()
                term.write(content.replace(/\n/g, '\r\n'), () => {
                  term.scrollToBottom()
                  try { term.refresh(0, term.rows - 1) } catch { /* ignore */ }
                  // Final fit to catch any dimension drift
                  fitAndSync()
                  requestAnimationFrame(() => fitAndSync())
                })
              } else {
                try { term.refresh(0, term.rows - 1) } catch { /* ignore */ }
                fitAndSync()
                requestAnimationFrame(() => fitAndSync())
              }
            }).catch(() => {
              // session may not be ready yet
            })
          }, 300)
        }, 300)

    // Send user input to main process
    const inputDisposable = term.onData((data: string) => {
      // Track scroll marker on Enter — marks start of next response
      if (data === '\r') {
        setMarker(sessionId, term.buffer.active.baseY + term.buffer.active.cursorY)
      }
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
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
      if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      inputDisposable.dispose()
      unsubscribe()
      window.removeEventListener('a11y:terminal-font-size', onTermFontSize)
      themeObserver.disconnect()
      unregisterTerminal(sessionId)
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      lastSizeRef.current = { cols: 0, rows: 0 }
    }
  }, [sessionId, theme])

  return { terminalRef, fit }
}
