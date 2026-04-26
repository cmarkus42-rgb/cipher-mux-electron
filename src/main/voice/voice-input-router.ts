/**
 * VoiceInputRouter — routes transcribed text to sessions.
 *
 * Two routing modes:
 *   1. Voice-Relay mode: When the voice-relay entity is running, all
 *      transcriptions go there (with auto-Enter, since it's a conversation).
 *   2. Session mode: transcriptions go to the focused session as keystrokes.
 *      User submits via "abschicken" voice command.
 *   3. Off: transcriptions are silently discarded.
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
  }

  /**
   * Get the voice-relay entity session ID if it's running.
   * Returns null if voice-relay is not active.
   */
  private getVoiceRelaySessionId(): string | null {
    return this.sessionManager.getEntitySessionId('voice-relay')
  }

  async routeTranscription(text: string): Promise<void> {
    console.log('[VoiceRouter] routeTranscription — mode:', this.mode, 'session:', this.focusedSessionId, 'text:', JSON.stringify(text?.slice(0, 80)))
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

    // Fallback: route to focused session (existing behavior)
    return this.routeToFocusedSession(trimmed)
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
   * Route transcription to the focused session (existing behavior).
   * Text is sent without Enter — user submits via voice command.
   */
  private async routeToFocusedSession(text: string): Promise<void> {
    if (!this.focusedSessionId) {
      console.log('[VoiceRouter] ERROR: no focused session')
      this.emit('error', { code: 'no-session', message: 'No session focused — click a session first' })
      return
    }

    const session = this.sessionManager.get(this.focusedSessionId)

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
        await this.sessionManager.sendKeys(this.focusedSessionId, command.keys)
        this.emit('dispatched', {
          sessionId: this.focusedSessionId,
          sessionName: session?.name ?? this.focusedSessionId,
          text: `[${command.label}]`,
        })
      } else {
        // Send text WITHOUT Enter �� user submits via "abschicken" voice command
        console.log('[VoiceRouter] sendKeys to', this.focusedSessionId, ':', JSON.stringify(text.slice(0, 60)))
        await this.sessionManager.sendKeys(this.focusedSessionId, text)
        this.emit('dispatched', {
          sessionId: this.focusedSessionId,
          sessionName: session?.name ?? this.focusedSessionId,
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
