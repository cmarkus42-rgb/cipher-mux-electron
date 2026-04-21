import * as http from 'node:http'

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11433
const TIMEOUT_MS = 120_000 // 2 minutes — local models can be slow

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

/**
 * POST JSON to Ollama via Node's http module.
 * Electron's main-process fetch() uses net.fetch (Chromium network stack)
 * which can fail for localhost due to system proxy settings.
 * Node's http module bypasses Chromium entirely.
 */
function ollamaPost(path: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path,
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

export async function enrichBugreport(description: string): Promise<EnrichedBugreport | null> {
  try {
    const body = JSON.stringify({
      model: 'gemma4:26b',
      prompt: `${ENRICH_PROMPT}\n\nBug description:\n${description}`,
      stream: false,
      keep_alive: -1,
    })

    const raw = await ollamaPost('/api/generate', body)
    const data = JSON.parse(raw) as Record<string, unknown>
    const text = (data.response as string | undefined)?.trim()
    if (!text) return null

    return parseEnrichedOutput(text)
  } catch {
    // Ollama not available or request failed — return null for fallback
    return null
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
