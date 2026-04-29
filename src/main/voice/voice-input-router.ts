/**
 * VoiceInputRouter — routes transcribed text to sessions.
 *
 * Routing priority:
 *   1. Voice-Relay mode: When the voice-relay entity is running, all
 *      transcriptions go there (with auto-Enter, since it's a conversation).
 *   2. Pinned session: If a session is pinned, text goes there regardless of focus.
 *   3. Focused session: text goes to the focused grid session as keystrokes.
 *   4. Off: transcriptions are silently discarded.
 *
 * Voice commands (session mode only):
 *   "abschicken" / "absenden" / "senden" / "enter" / "send" → sends Enter
 *   "neue zeile" / "new line" → sends newline without submitting
 *   Everything else → typed into the session (no Enter)
 */

import { EventEmitter } from 'node:events'
import type { SessionManager } from '../session/session-manager'

export interface VoiceInputRouterDeps {
  sessionManager: SessionManager
}

// Voice commands: pattern → keys to send
// Matched against lowercased, trimmed, punctuation-stripped transcription
const VOICE_COMMANDS: Array<{ patterns: string[]; keys: string; label: string }> = [
  { patterns: ['abschicken', 'absenden', 'senden', 'bitte abschicken', 'bitte absenden', 'enter', 'send', 'submit'], keys: '\r', label: 'submit' },
  { patterns: ['neue zeile', 'new line', 'newline', 'zeilenumbruch'], keys: '\n', label: 'newline' },
]

function stripPunctuation(text: string): string {
  return text.replace(/[.,!?;:…–—'"„"‚'»«()[\]{}]/g, '').trim()
}

export class VoiceInputRouter extends EventEmitter {
  private mode: 'session' | 'off' = 'off'
  private focusedSessionId: string | null = null
  private pinnedSessionId: string | null = null
  private notesEditorFocused = false
  private readonly sessionManager: SessionManager

  constructor(deps: VoiceInputRouterDeps) {
    super()
    this.sessionManager = deps.sessionManager
  }

  setMode(mode: 'session' | 'off'): void {
    this.mode = mode
  }

  getMode(): 'session' | 'off' {
    return this.mode
  }

  setFocusedSession(sessionId: string | null): void {
    this.focusedSessionId = sessionId
    this.notesEditorFocused = false
    this.emit('activeSessionChanged', this.getActiveSessionId())
  }

  /** Set notes editor focus state (STT routes to notes when true). */
  setNotesEditorFocused(focused: boolean): void {
    this.notesEditorFocused = focused
    this.emit('activeSessionChanged', this.getActiveSessionId())
  }

  /** Pin STT to a specific session (overrides focus-following). */
  pinToSession(sessionId: string): void {
    this.pinnedSessionId = sessionId
    this.emit('pinChanged', { pinned: true, sessionId })
    this.emit('activeSessionChanged', this.getActiveSessionId())
  }

  /** Remove session pin (return to focus-following). */
  unpinSession(): void {
    this.pinnedSessionId = null
    this.emit('pinChanged', { pinned: false, sessionId: null })
    this.emit('activeSessionChanged', this.getActiveSessionId())
  }

  /** Toggle pin for a session. If already pinned to this session, unpin. */
  togglePin(sessionId: string): void {
    if (this.pinnedSessionId === sessionId) {
      this.unpinSession()
    } else {
      this.pinToSession(sessionId)
    }
  }

  /** Get the session ID that currently receives voice input (pin > focus). */
  getActiveSessionId(): string | null {
    return this.pinnedSessionId ?? this.focusedSessionId
  }

  /** Whether a session is currently pinned. */
  isPinned(): boolean {
    return this.pinnedSessionId !== null
  }

  /** Get the pinned session ID (null if not pinned). */
  getPinnedSessionId(): string | null {
    return this.pinnedSessionId
  }

  /**
   * Get the voice-relay entity session ID if it's running.
   * Returns null if voice-relay is not active.
   */
  private getVoiceRelaySessionId(): string | null {
    return this.sessionManager.getEntitySessionId('voice-relay')
  }

  async routeTranscription(text: string): Promise<void> {
    const targetId = this.getActiveSessionId()
    console.log('[VoiceRouter] routeTranscription — mode:', this.mode, 'target:', targetId, 'pinned:', this.pinnedSessionId, 'text:', JSON.stringify(text?.slice(0, 80)))
    if (this.mode === 'off') return

    const trimmed = text.trim()
    if (trimmed === '') return

    // Check if voice-relay entity is running — if so, route there
    const voiceRelayId = this.getVoiceRelaySessionId()
    if (voiceRelayId) {
      const relaySession = this.sessionManager.get(voiceRelayId)
      if (relaySession && relaySession.status === 'active') {
        return this.routeToVoiceRelay(voiceRelayId, trimmed, relaySession.name)
      }
    }

    // Route to notes editor if focused and not pinned to a session
    if (!this.pinnedSessionId && this.notesEditorFocused) {
      console.log('[VoiceRouter] routing to notes editor')
      this.emit('notesInsert', trimmed)
      return
    }

    // Route to pinned session or focused session
    return this.routeToSession(trimmed)
  }

  /**
   * Route transcription to the voice-relay entity session.
   * Sends text + Enter (conversational mode — auto-submit).
   */
  private async routeToVoiceRelay(sessionId: string, text: string, sessionName: string): Promise<void> {
    try {
      console.log('[VoiceRouter] routing to voice-relay:', JSON.stringify(text.slice(0, 60)))
      // Send text first, then Enter separately — tmux needs discrete CR
      // to trigger submit in Claude Code's input buffer
      await this.sessionManager.sendKeys(sessionId, text)
      await this.sessionManager.sendKeys(sessionId, '\r')
      this.emit('dispatched', { sessionId, sessionName, text })
      console.log('[VoiceRouter] voice-relay dispatch OK')
    } catch (err) {
      console.log('[VoiceRouter] voice-relay sendKeys FAILED:', (err as Error).message)
      this.emit('error', {
        code: 'send-failed',
        message: (err as Error).message,
      })
    }
  }

  /**
   * Check whether the pinned session is still visible in the grid.
   * If it moved to background, auto-unpin so STT follows focus again.
   */
  private autoUnpinIfBackground(): void {
    if (!this.pinnedSessionId) return
    const gridState = this.sessionManager.getSessionStore().getGridState()
    if (!gridState) return
    const inGrid = gridState.slots.some(
      (s: { sessionId?: string | null }) => s.sessionId === this.pinnedSessionId
    )
    if (!inGrid) {
      console.log('[VoiceRouter] pinned session no longer in grid — auto-unpinning')
      this.unpinSession()
    }
  }

  /**
   * Route transcription to the active session (pinned or focused).
   * Text is sent without Enter — user submits via voice command.
   */
  private async routeToSession(text: string): Promise<void> {
    // Auto-unpin if pinned session was moved to background
    this.autoUnpinIfBackground()
    const targetId = this.getActiveSessionId()
    if (!targetId) {
      console.log('[VoiceRouter] ERROR: no target session')
      this.emit('error', { code: 'no-session', message: 'No session focused — click a session first' })
      return
    }

    const session = this.sessionManager.get(targetId)

    if (session && session.status !== 'active') {
      console.log('[VoiceRouter] ERROR: session inactive:', session.name, session.status)
      this.emit('error', {
        code: 'session-inactive',
        message: `Session "${session.name}" is not active`,
      })
      return
    }

    // Check for voice commands before sending as text
    const normalized = stripPunctuation(text.toLowerCase())
    const command = VOICE_COMMANDS.find(cmd => cmd.patterns.includes(normalized))

    try {
      if (command) {
        console.log('[VoiceRouter] voice command:', command.label)
        await this.sessionManager.sendKeys(targetId, command.keys)
        this.emit('dispatched', {
          sessionId: targetId,
          sessionName: session?.name ?? targetId,
          text: `[${command.label}]`,
        })
      } else {
        // Send text WITHOUT Enter — user submits via "abschicken" voice command
        console.log('[VoiceRouter] sendKeys to', targetId, ':', JSON.stringify(text.slice(0, 60)))
        await this.sessionManager.sendKeys(targetId, text.trimEnd() + ' ')
        this.emit('dispatched', {
          sessionId: targetId,
          sessionName: session?.name ?? targetId,
          text,
        })
      }
      console.log('[VoiceRouter] dispatched OK')
    } catch (err) {
      console.log('[VoiceRouter] sendKeys FAILED:', (err as Error).message)
      this.emit('error', {
        code: 'send-failed',
        message: (err as Error).message,
      })
    }
  }
}
