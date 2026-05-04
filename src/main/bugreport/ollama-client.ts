import * as http from 'node:http'
import * as https from 'node:https'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const TIMEOUT_MS = 120_000 // 2 minutes — local models can be slow
const CLAUDE_TIMEOUT_MS = 30_000 // 30s — cloud API is faster
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const CLAUDE_API_HOST = 'api.anthropic.com'

const ENRICH_PROMPT = `You are a professional QA engineer. Given a raw bug description, produce a structured bug report in YAML format with these fields:
- title: concise summary (max 80 chars)
- severity: critical | high | medium | low
- tags: array of relevant tags (e.g., ui, crash, data-loss, performance)
- steps_to_reproduce: numbered list of steps
- expected_behavior: what should happen
- actual_behavior: what actually happens
- summary: 1-2 sentence technical summary

Respond ONLY with the YAML block, no markdown fences.`

export interface EnrichedBugreport {
  title: string
  severity: string
  tags: string[]
  steps_to_reproduce: string[]
  expected_behavior: string
  actual_behavior: string
  summary: string
}

/** Read current LLM config from config-store (lazy import to avoid electron dep in tests). */
function getLlmConfig() {
  try {
    const { configStore } = require('../config/config-store')
    const llm = configStore.get('llm')
    return {
      host: llm?.ollamaHost ?? '127.0.0.1',
      port: llm?.ollamaPort ?? 11434,
      model: llm?.ollamaModel ?? 'gemma4:26b',
      bugreportEnrichBackend: llm?.bugreportEnrichBackend ?? 'cloud',
    }
  } catch {
    return { host: '127.0.0.1', port: 11434, model: 'gemma4:26b', bugreportEnrichBackend: 'cloud' as const }
  }
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

/** Call Claude API (Haiku) for bug report enrichment. */
async function enrichViaClaude(description: string): Promise<EnrichedBugreport | null> {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) throw new Error('No Anthropic API key found')

  const body = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: `${ENRICH_PROMPT}\n\nBug description:\n${description}` },
    ],
  })

  const raw = await new Promise<string>((resolve, reject) => {
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
        timeout: CLAUDE_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Claude API HTTP ${res.statusCode}`))
            return
          }
          resolve(Buffer.concat(chunks).toString('utf-8'))
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

  const data = JSON.parse(raw) as { content?: Array<{ type: string; text?: string }> }
  const text = data.content?.find(b => b.type === 'text')?.text?.trim()
  if (!text) return null
  return parseEnrichedOutput(text)
}

/**
 * POST JSON to Ollama via Node's http module.
 * Electron's main-process fetch() uses net.fetch (Chromium network stack)
 * which can fail for localhost due to system proxy settings.
 * Node's http module bypasses Chromium entirely.
 */
function ollamaPost(urlPath: string, body: string, host?: string, port?: number): Promise<string> {
  const cfg = getLlmConfig()
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: host ?? cfg.host,
        port: port ?? cfg.port,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Ollama HTTP ${res.statusCode}`))
            return
          }
          resolve(Buffer.concat(chunks).toString('utf-8'))
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Ollama request timed out'))
    })
    req.write(body)
    req.end()
  })
}

/**
 * GET request to Ollama via Node's http module.
 */
function ollamaGet(urlPath: string, host?: string, port?: number): Promise<string> {
  const cfg = getLlmConfig()
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: host ?? cfg.host,
        port: port ?? cfg.port,
        path: urlPath,
        method: 'GET',
        timeout: 10_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Ollama HTTP ${res.statusCode}`))
            return
          }
          resolve(Buffer.concat(chunks).toString('utf-8'))
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Ollama request timed out'))
    })
    req.end()
  })
}

/** Enrich via local Ollama. */
async function enrichViaOllama(description: string): Promise<EnrichedBugreport | null> {
  const cfg = getLlmConfig()
  const body = JSON.stringify({
    model: cfg.model,
    prompt: `${ENRICH_PROMPT}\n\nBug description:\n${description}`,
    stream: false,
    keep_alive: -1,
  })

  const raw = await ollamaPost('/api/generate', body)
  const data = JSON.parse(raw) as Record<string, unknown>
  const text = (data.response as string | undefined)?.trim()
  if (!text) return null
  return parseEnrichedOutput(text)
}

export async function enrichBugreport(description: string): Promise<EnrichedBugreport | null> {
  const cfg = getLlmConfig()
  const backend = cfg.bugreportEnrichBackend
  try {
    if (backend === 'cloud') {
      return await enrichViaClaude(description)
    }
    return await enrichViaOllama(description)
  } catch (err) {
    console.error(`[enrichBugreport] ${backend} backend failed:`, err)
    return null
  }
}

/** Test connection to Ollama. Returns { ok, error? }. */
export async function testOllamaConnection(host?: string, port?: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await ollamaGet('/api/tags', host, port)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Connection failed' }
  }
}

/** List available models from Ollama. Returns model names. */
export async function listOllamaModels(host?: string, port?: number): Promise<string[]> {
  try {
    const raw = await ollamaGet('/api/tags', host, port)
    const data = JSON.parse(raw) as { models?: Array<{ name: string }> }
    return (data.models ?? []).map(m => m.name)
  } catch {
    return []
  }
}

/** Exported for testing. */
export function parseEnrichedOutput(text: string): EnrichedBugreport | null {
  try {
    const lines = text.split('\n')
    const result: Record<string, any> = {}
    let currentKey = ''
    let listBuffer: string[] = []

    for (const line of lines) {
      const keyMatch = line.match(/^(\w[\w_]*):\s*(.*)/)
      if (keyMatch) {
        if (currentKey && listBuffer.length) {
          result[currentKey] = listBuffer
          listBuffer = []
        }
        currentKey = keyMatch[1]
        const value = keyMatch[2].trim()
        if (value && !value.startsWith('[')) {
          result[currentKey] = value
        } else if (value.startsWith('[')) {
          // Inline array: [tag1, tag2]
          result[currentKey] = value
            .replace(/[\[\]]/g, '')
            .split(',')
            .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean)
        }
      } else if (line.match(/^\s*-\s+/)) {
        listBuffer.push(line.replace(/^\s*-\s+/, '').trim())
      }
    }
    if (currentKey && listBuffer.length) {
      result[currentKey] = listBuffer
    }

    return {
      title: result.title || 'untitled bug',
      severity: result.severity || 'medium',
      tags: Array.isArray(result.tags) ? result.tags : [],
      steps_to_reproduce: Array.isArray(result.steps_to_reproduce) ? result.steps_to_reproduce : [],
      expected_behavior: result.expected_behavior || '',
      actual_behavior: result.actual_behavior || '',
      summary: result.summary || '',
    }
  } catch {
    return null
  }
}
