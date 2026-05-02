/**
 * VoiceOutputRouter — captures voice-relay session output and feeds to TTS.
 *
 * Polls tmux capture-pane for new content from the voice-relay session.
 * When a complete agent response is detected (output stabilizes), the
 * text is cleaned and sent to ConversationEngine.speakResponse().
 *
 * Detection strategy:
 *   - Poll capture-pane every 500ms while voice-relay is active
 *   - Track last-seen output length
 *   - When output grows then stabilizes for 2 consecutive polls → response complete
 *   - Extract the new text, strip ANSI/control sequences, send to TTS
 */

import { EventEmitter } from 'node:events'
import type { SessionManager } from '../session/session-manager'
import type { ConversationEngine } from './conversation-engine'

const POLL_INTERVAL_MS = 500
const STABLE_POLLS_REQUIRED = 2

/** Strip ANSI escape sequences and control characters from tmux output. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // control chars except \t \n \r
}

/** Remove common Claude Code UI chrome from captured text. */
function cleanAgentResponse(raw: string): string {
  const lines = raw.split('\n')
  const cleaned: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip empty lines, prompt markers, spinner lines, tool indicators
    if (trimmed === '') continue
    if (trimmed.startsWith('❯')) continue
    if (trimmed.startsWith('⠋') || trimmed.startsWith('⠙') || trimmed.startsWith('⠹')) continue
    if (trimmed.startsWith('⠸') || trimmed.startsWith('⠼') || trimmed.startsWith('⠴')) continue
    if (trimmed.startsWith('⠦') || trimmed.startsWith('⠧') || trimmed.startsWith('⠇') || trimmed.startsWith('⠏')) continue
    if (/^\d+\s*[\/%]/.test(trimmed)) continue // progress indicators
    cleaned.push(trimmed)
  }
  return cleaned.join(' ').trim()
}

export class VoiceOutputRouter extends EventEmitter {
  private readonly sessionManager: SessionManager
  private conversationEngine: ConversationEngine | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private lastCaptureLength = 0
  private stableCount = 0
  private lastCapture = ''
  private active = false

  constructor(sessionManager: SessionManager) {
    super()
    this.sessionManager = sessionManager
  }

  /** Set the conversation engine for TTS playback. */
  setConversationEngine(engine: ConversationEngine | null): void {
    this.conversationEngine = engine
  }

  /** Start watching the voice-relay session for output. */
  start(): void {
    if (this.active) return
    this.active = true
    this.lastCaptureLength = 0
    this.stableCount = 0
    this.lastCapture = ''
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS)
    console.log('[VoiceOutputRouter] started polling')
  }

  /** Stop watching. */
  stop(): void {
    this.active = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    console.log('[VoiceOutputRouter] stopped polling')
  }

  /** Shut down and release resources. */
  shutdown(): void {
    this.stop()
    this.conversationEngine = null
    this.removeAllListeners()
  }

  private async poll(): Promise<void> {
    if (!this.active) return

    const voiceRelaySessionId = this.sessionManager.getEntitySessionId('voice-relay')
    if (!voiceRelaySessionId) return

    try {
      const capture = await this.sessionManager.capture(voiceRelaySessionId, 50)
      const stripped = stripAnsi(capture)
      const currentLength = stripped.length

      if (currentLength > this.lastCaptureLength) {
        // New output detected — reset stability counter
        this.stableCount = 0
        this.lastCaptureLength = currentLength
        this.lastCapture = stripped
      } else if (currentLength === this.lastCaptureLength && currentLength > 0) {
        // Output stable
        this.stableCount++
        if (this.stableCount === STABLE_POLLS_REQUIRED) {
          // Response complete — extract new text
          this.handleCompleteResponse(this.lastCapture)
          // Reset for next response
          this.lastCaptureLength = currentLength
          this.stableCount = 0
        }
      }
    } catch {
      // Session may have been stopped
    }
  }

  private handleCompleteResponse(rawCapture: string): void {
    const cleaned = cleanAgentResponse(rawCapture)
    if (!cleaned || cleaned.length < 3) return

    console.log('[VoiceOutputRouter] agent response detected:', JSON.stringify(cleaned.slice(0, 80)))
    this.emit('agent-response', cleaned)

    // Route to TTS if conversation engine is available
    if (this.conversationEngine) {
      this.conversationEngine.speakResponse(cleaned).catch((err) => {
        console.error('[VoiceOutputRouter] TTS error:', (err as Error).message)
      })
    }
  }
}
