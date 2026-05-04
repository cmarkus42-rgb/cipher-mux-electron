import { EventEmitter } from 'node:events'

/** Minimal chat interface — satisfied by both OllamaChat and ClaudeChat. */
export interface ChatBackend {
  send(message: string): Promise<string>
}

export const BUGREPORT_SYSTEM_PROMPT = `Du bist ein Bug-Interview-Assistent für die Anwendung cipher-mux-electron.
Du sprichst mit dem User über das Bugreport-Fenster innerhalb der cipher-mux Kommandozentrale — einer Electron-App die als Cockpit für Claude Code Projekte dient, mit eingebetteten Terminals (tmux + xterm.js), Message Bus und MCP-Server.
Der User beschreibt dir gerade einen Bug den er in dieser Anwendung gefunden hat.

Deine Aufgabe:
1. Höre zu und fasse den Bug kurz zusammen
2. Frage gezielt nach fehlenden Details:
   - Schritte zur Reproduktion (falls unklar)
   - Erwartetes vs. tatsächliches Verhalten
   - Kontext (was hat der User gerade gemacht?)
3. Halte dich kurz — maximal 1-2 Sätze pro Antwort
4. Nach 2-3 Rückfragen: Generiere den finalen Report

Wenn du den Report generierst, benutze exakt dieses Format:
# [Bug-Titel]
## Summary
[1-2 Sätze]
## Steps to Reproduce
1. ...
## Expected Behavior
...
## Actual Behavior
...
**Severity:** [low/medium/high/critical]
**Tags:** [kommasepariert]

Antworte auf Deutsch.`

const GREETING = 'Hallo! Beschreib mir den Bug den du gefunden hast. Was ist passiert?'

/**
 * Check whether a text contains a complete bug report with all required sections.
 */
export function isReportComplete(text: string): boolean {
  const hasTitle = /^# .+/m.test(text)
  const hasSummary = /^## Summary/m.test(text)
  const hasSteps = /^## Steps to Reproduce/m.test(text)
  const hasSeverity = /\*\*Severity:\*\*/.test(text)
  return hasTitle && hasSummary && hasSteps && hasSeverity
}

/**
 * Extract the structured report from a response that may contain surrounding chatter.
 * Returns everything from the first `# ` heading through the last meaningful report line.
 * Returns empty string if no report heading is found.
 */
export function extractReport(text: string): string {
  const lines = text.split('\n')
  const startIdx = lines.findIndex(l => /^# .+/.test(l))
  if (startIdx === -1) return ''

  // Find the last line that belongs to the report:
  // Look for **Tags:** or **Severity:** line as the natural end
  let endIdx = lines.length - 1
  for (let i = lines.length - 1; i >= startIdx; i--) {
    const line = lines[i].trim()
    if (line.startsWith('**Tags:**') || line.startsWith('**Severity:**')) {
      endIdx = i
      break
    }
  }

  return lines.slice(startIdx, endIdx + 1).join('\n').trim()
}

/**
 * Guided bug-report interview powered by a local LLM (Ollama).
 *
 * Drives a multi-turn conversation: the user describes a bug, the assistant
 * asks clarifying questions, and after 2-3 turns generates a structured
 * Markdown report. Emits 'agent-speaking', 'turn-update', 'interview-complete',
 * and 'error' events.
 */
export class BugreportInterview extends EventEmitter {
  private readonly chat: ChatBackend
  private _complete = false
  private _report = ''
  private _turnCount = 0

  constructor(chat: ChatBackend) {
    super()
    this.chat = chat
  }

  /**
   * Start (or restart) the interview. Resets state and emits the greeting.
   */
  start(): void {
    this._complete = false
    this._report = ''
    this._turnCount = 0

    this.emit('agent-speaking', GREETING)
    this.emit('turn-update', { role: 'assistant', content: GREETING, turn: 0 })
  }

  /**
   * Process a user transcription and get the assistant's response.
   */
  async onUserTranscription(text: string): Promise<void> {
    if (this._complete) return
    if (!text || !text.trim()) return

    this._turnCount++
    this.emit('turn-update', { role: 'user', content: text, turn: this._turnCount })

    try {
      const response = await this.chat.send(text)

      if (isReportComplete(response)) {
        this._report = extractReport(response)
        this._complete = true

        this.emit('agent-speaking', 'Fertig! Der Report ist erstellt.')
        this.emit('turn-update', { role: 'assistant', content: response, turn: this._turnCount })
        this.emit('interview-complete', this._report)
      } else {
        this.emit('agent-speaking', response)
        this.emit('turn-update', { role: 'assistant', content: response, turn: this._turnCount })
      }
    } catch (err) {
      this.emit('error', err)
    }
  }

  /** Whether the interview has concluded with a complete report. */
  isComplete(): boolean {
    return this._complete
  }

  /** The final structured Markdown report (empty string if not yet complete). */
  getReport(): string {
    return this._report
  }

  /** Number of user turns processed so far. */
  getTurnCount(): number {
    return this._turnCount
  }
}
