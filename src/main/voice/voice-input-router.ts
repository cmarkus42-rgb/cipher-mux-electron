/**
 * VoiceInputRouter — routes transcribed text to the focused tmux session.
 *
 * In 'session' mode, transcriptions are sent as keystrokes to the focused
 * session via SessionManager.sendKeys(). In 'off' mode, transcriptions
 * are silently discarded (the bugreport flow handles its own routing).
 */

import { EventEmitter } from 'node:events'
import type { SessionManager } from '../session/session-manager'

export interface VoiceInputRouterDeps {
  sessionManager: SessionManager
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
    if (this.mode === 'off') return

    const trimmed = text.trim()
    if (trimmed === '') return

    if (!this.focusedSessionId) {
      this.emit('error', { code: 'no-session', message: 'No session focused — click a session first' })
      return
    }

    const session = this.sessionManager.get(this.focusedSessionId)

    if (session && session.status !== 'active') {
      this.emit('error', {
        code: 'session-inactive',
        message: `Session "${session.name}" is not active`,
      })
      return
    }

    try {
      await this.sessionManager.sendKeys(this.focusedSessionId, trimmed + '\n')
      this.emit('dispatched', {
        sessionId: this.focusedSessionId,
        sessionName: session?.name ?? this.focusedSessionId,
        text: trimmed,
      })
    } catch (err) {
      this.emit('error', {
        code: 'send-failed',
        message: (err as Error).message,
      })
    }
  }
}
