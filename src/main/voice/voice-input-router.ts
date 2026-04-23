/**
 * VoiceInputRouter — routes transcribed text to the focused tmux session.
 *
 * In 'session' mode, transcriptions are sent as keystrokes to the focused
 * session via SessionManager.sendKeys(). In 'off' mode, transcriptions
 * are silently discarded (the bugreport flow handles its own routing).
 *
 * Voice commands:
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

  async routeTranscription(text: string): Promise<void> {
    console.log('[VoiceRouter] routeTranscription — mode:', this.mode, 'session:', this.focusedSessionId, 'text:', JSON.stringify(text?.slice(0, 80)))
    if (this.mode === 'off') return

    const trimmed = text.trim()
    if (trimmed === '') return

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
    const normalized = stripPunctuation(trimmed.toLowerCase())
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
        // Send text WITHOUT Enter — user submits via "abschicken" voice command
        console.log('[VoiceRouter] sendKeys to', this.focusedSessionId, ':', JSON.stringify(trimmed.slice(0, 60)))
        await this.sessionManager.sendKeys(this.focusedSessionId, trimmed)
        this.emit('dispatched', {
          sessionId: this.focusedSessionId,
          sessionName: session?.name ?? this.focusedSessionId,
          text: trimmed,
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
