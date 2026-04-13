import { useEffect, useRef, useCallback } from 'preact/hooks'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import '@xterm/xterm/css/xterm.css'

const api = () => (window as any).cipherMux

export interface UseTerminalResult {
  terminalRef: preact.RefObject<HTMLDivElement>
  fit: () => void
}

export function useTerminal(sessionId: string): UseTerminalResult {
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
      theme: {
        background: '#222228',
        foreground: '#D8D8E0',
        cursor: '#5C9A6E',
        selectionBackground: 'rgba(92, 154, 110, 0.25)',
        black: '#222228',
        brightBlack: '#6E6E80',
        white: '#D8D8E0',
        brightWhite: '#FFFFFF',
        green: '#5C9A6E',
        brightGreen: '#8CC8A0',
        red: '#B85060',
        brightRed: '#D06070',
        yellow: '#C07840',
        brightYellow: '#D09060',
        blue: '#5090A8',
        brightBlue: '#70B0C8',
        cyan: '#5090A8',
        brightCyan: '#70B0C8',
        magenta: '#8060A0',
        brightMagenta: '#A080C0',
      },
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

    // Use ResizeObserver to fit terminal when container gets/changes size
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        api().terminal.resize(sessionId, term.cols, term.rows)
      } catch {
        // container may not be visible yet
      }
    })
    resizeObserver.observe(container)

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
      resizeObserver.disconnect()
      inputDisposable.dispose()
      unsubscribe()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  return { terminalRef, fit }
}
