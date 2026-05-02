/** A single message in the Ollama chat history. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OllamaChatOpts {
  model: string
  host: string
  port: number
  systemPrompt: string
}

/**
 * Stateful chat client for a local Ollama instance.
 *
 * Maintains conversation history (system + user/assistant turns) and
 * communicates via Ollama's /api/chat endpoint (non-streaming).
 * On network or HTTP errors, the failed user message is rolled back
 * so the history stays consistent.
 */
export class OllamaChat {
  private readonly model: string
  private readonly host: string
  private readonly port: number
  private readonly systemPrompt: string
  private history: ChatMessage[]

  constructor(opts: OllamaChatOpts) {
    this.model = opts.model
    this.host = opts.host
    this.port = opts.port
    this.systemPrompt = opts.systemPrompt
    this.history = [{ role: 'system', content: this.systemPrompt }]
  }

  /** Full endpoint URL for Ollama's chat API. */
  get url(): string {
    return `http://${this.host}:${this.port}/api/chat`
  }

  /**
   * Send a user message and return the assistant's response.
   * Rolls back the user message on error to keep history consistent.
   */
  async send(userMessage: string): Promise<string> {
    this.history.push({ role: 'user', content: userMessage })

    let res: Response
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: this.history,
          stream: false,
        }),
      })
    } catch (err) {
      this.history.pop()
      throw err
    }

    if (!res.ok) {
      this.history.pop()
      throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as { message?: { content?: string } }
    const content = data.message?.content ?? ''

    this.history.push({ role: 'assistant', content })
    return content
  }

  /** Return a shallow copy of the full conversation history. */
  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  /** Inject a synthetic user message into history (for context seeding). */
  injectUserMessage(content: string): void {
    this.history.push({ role: 'user', content })
  }

  /** Inject a synthetic assistant message into history (for context seeding). */
  injectAssistantMessage(content: string): void {
    this.history.push({ role: 'assistant', content })
  }

  /** Clear conversation history, retaining only the system prompt. */
  reset(): void {
    this.history = [{ role: 'system', content: this.systemPrompt }]
  }
}
