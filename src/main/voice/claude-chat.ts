/**
 * Stateful chat client for the Claude API (Anthropic Messages API).
 *
 * Drop-in replacement for OllamaChat — same send()/getHistory()/reset() interface
 * but routes to Claude Haiku via the Anthropic API instead of local Ollama.
 */

import * as https from 'node:https'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ChatMessage } from './ollama-chat'

const CLAUDE_API_HOST = 'api.anthropic.com'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const TIMEOUT_MS = 30_000

export interface ClaudeChatOpts {
  systemPrompt: string
  model?: string
}

/** Read Anthropic API key from env var or ~/.cipher-anthropic.env file. */
function getAnthropicApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    const envFile = path.join(os.homedir(), '.cipher-anthropic.env')
    const content = fs.readFileSync(envFile, 'utf-8')
    for (const line of content.split('\n')) {
      const match = line.match(/^(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*['"]?(.+?)['"]?\s*$/)
      if (match) return match[1]
    }
  } catch { /* file not found — ok */ }
  return null
}

export class ClaudeChat {
  private readonly model: string
  private readonly systemPrompt: string
  private history: ChatMessage[]

  constructor(opts: ClaudeChatOpts) {
    this.model = opts.model ?? CLAUDE_MODEL
    this.systemPrompt = opts.systemPrompt
    this.history = [{ role: 'system', content: this.systemPrompt }]
  }

  /**
   * Send a user message and return the assistant's response.
   * Rolls back the user message on error to keep history consistent.
   */
  async send(userMessage: string): Promise<string> {
    const apiKey = getAnthropicApiKey()
    if (!apiKey) throw new Error('No Anthropic API key found — set ANTHROPIC_API_KEY or create ~/.cipher-anthropic.env')

    this.history.push({ role: 'user', content: userMessage })

    // Build messages array for Anthropic API (system prompt is separate param)
    const messages = this.history
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))

    const body = JSON.stringify({
      model: this.model,
      max_tokens: 1024,
      system: this.systemPrompt,
      messages,
    })

    let content: string
    try {
      content = await this._request(apiKey, body)
    } catch (err) {
      this.history.pop()
      throw err
    }

    this.history.push({ role: 'assistant', content })
    return content
  }

  /** Return a shallow copy of the full conversation history. */
  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  /** Clear conversation history, retaining only the system prompt. */
  reset(): void {
    this.history = [{ role: 'system', content: this.systemPrompt }]
  }

  /** HTTPS POST to the Anthropic Messages API. */
  private _request(apiKey: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: CLAUDE_API_HOST,
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Claude API HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf-8').slice(0, 200)}`))
              return
            }
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
                content?: Array<{ type: string; text?: string }>
              }
              const text = data.content?.find(b => b.type === 'text')?.text?.trim() ?? ''
              resolve(text)
            } catch (err) {
              reject(new Error(`Claude API response parse error: ${(err as Error).message}`))
            }
          })
        },
      )
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Claude API request timed out'))
      })
      req.write(body)
      req.end()
    })
  }
}
