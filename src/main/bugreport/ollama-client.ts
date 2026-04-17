const OLLAMA_URL = 'http://127.0.0.1:11433'
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

export async function enrichBugreport(description: string): Promise<EnrichedBugreport | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: `${ENRICH_PROMPT}\n\nBug description:\n${description}`,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) return null

    const data = await response.json()
    const text = data.response?.trim()
    if (!text) return null

    return parseEnrichedOutput(text)
  } catch {
    // Ollama not available — return null for fallback
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
