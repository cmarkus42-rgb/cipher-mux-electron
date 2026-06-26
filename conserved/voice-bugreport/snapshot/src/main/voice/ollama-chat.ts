export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OllamaChatOpts {
  model: string          // e.g. 'gemma3:4b'
  host: string           // e.g. '127.0.0.1'
  port: number           // e.g. 11433
  systemPrompt: string
}

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

  get url(): string {
    return `http://${this.host}:${this.port}/api/chat`
  }

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

  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  injectUserMessage(content: string): void {
    this.history.push({ role: 'user', content })
  }

  injectAssistantMessage(content: string): void {
    this.history.push({ role: 'assistant', content })
  }

  reset(): void {
    this.history = [{ role: 'system', content: this.systemPrompt }]
  }
}
