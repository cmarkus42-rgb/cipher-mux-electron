import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TagRepository, TagEntry } from '../../shared/types'

// ─── Ollama Config ────────────────────────────────────────

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11433
const OLLAMA_MODEL = 'gemma4:26b'
const TIMEOUT_MS = 60_000

// ─── Seed Tags ────────────────────────────────────────────

export const SEED_TAGS: Record<string, TagEntry> = {
  // Trading
  trading: { count: 0, description: 'Trading strategies, market analysis, order execution' },
  risk: { count: 0, description: 'Risk management, position sizing, drawdown' },
  'market-data': { count: 0, description: 'Market data feeds, price history, tick data' },
  portfolio: { count: 0, description: 'Portfolio management, allocation, performance tracking' },
  // Infrastructure
  infra: { count: 0, description: 'Infrastructure, server setup, deployment' },
  tailscale: { count: 0, description: 'Tailscale VPN, mesh networking, node connectivity' },
  truenas: { count: 0, description: 'TrueNAS SCALE, storage, ZFS, datasets' },
  monitoring: { count: 0, description: 'Monitoring, alerts, metrics, dashboards' },
  // Development
  coding: { count: 0, description: 'General coding, implementation, development' },
  typescript: { count: 0, description: 'TypeScript, type system, compiler' },
  python: { count: 0, description: 'Python scripts, libraries, automation' },
  testing: { count: 0, description: 'Unit tests, integration tests, test coverage' },
  architecture: { count: 0, description: 'System architecture, design patterns, ADRs' },
  debugging: { count: 0, description: 'Debugging, troubleshooting, error investigation' },
  // Projects
  project: { count: 0, description: 'Project planning, milestones, scope' },
  'cipher-mux': { count: 0, description: 'cipher-mux-electron project, terminal multiplexer UI' },
  'cipher-boox': { count: 0, description: 'cipher-boox project, e-reader integration' },
  openclaw: { count: 0, description: 'OpenClaw project, SSH keys, infrastructure access' },
  // Research
  research: { count: 0, description: 'Research, analysis, investigation' },
  'ai-ml': { count: 0, description: 'AI/ML models, training, inference, LLMs' },
  idea: { count: 0, description: 'Ideas, brainstorming, concepts' },
  // Operations
  automation: { count: 0, description: 'Automation scripts, workflows, CI/CD' },
  security: { count: 0, description: 'Security, access control, credentials, encryption' },
  backup: { count: 0, description: 'Backups, snapshots, data recovery' },
  // Personal
  journal: { count: 0, description: 'Personal journal, daily notes, reflections' },
  reference: { count: 0, description: 'Reference material, documentation, guides' },
  todo: { count: 0, description: 'Todo items, tasks, action points' },
}

const TAGS_FILENAME = '.tags.json'

// ─── Prompt ───────────────────────────────────────────────

function buildTaggingPrompt(content: string, tagRepo: TagRepository): string {
  const existingTags = Object.keys(tagRepo.tags).join(', ')
  return `Du bist ein erfahrener Wissensorganisator. Lies die folgende Notiz sorgfältig und vergib bis zu 5 passende Tags.

Vorhandene Tags im Repository: ${existingTags}

Bevorzuge bestehende Tags — erfinde nur dann neue, wenn wirklich keiner passt. Gib ausschliesslich ein JSON-Array zurück, z.B. ["tag1", "tag2"].

Notiz:
${content.slice(0, 3000)}`
}

// ─── Tag Response Parser ──────────────────────────────────

export function parseTagResponse(text: string): string[] {
  const normalize = (arr: unknown[]): string[] =>
    arr
      .filter((t) => typeof t === 'string')
      .map((t) => (t as string).toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 5)

  // 1. Try direct JSON array parse
  try {
    const parsed = JSON.parse(text.trim())
    if (Array.isArray(parsed)) {
      return normalize(parsed)
    }
  } catch {
    // not a clean JSON array
  }

  // 2. Try extracting JSON array from within text
  const match = text.match(/\[[\s\S]*?\]/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) {
        return normalize(parsed)
      }
    } catch {
      // not valid JSON
    }
  }

  // 3. Fallback: comma-separated
  const tags = text
    .replace(/[\[\]"']/g, '')
    .split(',')
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 5)

  return tags
}

// ─── Ollama HTTP ──────────────────────────────────────────

function ollamaPost(body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: '/api/generate',
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

// ─── NoteTagging ──────────────────────────────────────────

export class NoteTagging {
  private notesDir: string
  private repo: TagRepository

  constructor(notesDir: string) {
    this.notesDir = notesDir
    this.repo = { tags: {} }
    this.loadRepository()
  }

  private get tagsFilePath(): string {
    return path.join(this.notesDir, TAGS_FILENAME)
  }

  private loadRepository(): void {
    // Start with seed tags
    const merged: Record<string, TagEntry> = {}
    for (const [tag, entry] of Object.entries(SEED_TAGS)) {
      merged[tag] = { ...entry }
    }

    // Merge persisted tags (persisted counts take priority)
    try {
      const raw = fs.readFileSync(this.tagsFilePath, 'utf-8')
      const persisted = JSON.parse(raw) as TagRepository
      if (persisted.tags && typeof persisted.tags === 'object') {
        for (const [tag, entry] of Object.entries(persisted.tags)) {
          merged[tag] = { ...entry }
        }
      }
    } catch {
      // File doesn't exist yet or is invalid — use seeds only
    }

    this.repo = { tags: merged }
  }

  private saveRepository(): void {
    try {
      fs.mkdirSync(this.notesDir, { recursive: true })
      fs.writeFileSync(this.tagsFilePath, JSON.stringify(this.repo, null, 2), 'utf-8')
    } catch {
      // Non-fatal — next call will retry
    }
  }

  getTagRepository(): TagRepository {
    return this.repo
  }

  updateRepository(tags: string[]): void {
    for (const tag of tags) {
      const normalized = tag.toLowerCase().trim()
      if (!normalized) continue
      if (this.repo.tags[normalized]) {
        this.repo.tags[normalized] = {
          ...this.repo.tags[normalized],
          count: this.repo.tags[normalized].count + 1,
        }
      } else {
        this.repo.tags[normalized] = { count: 1, description: '' }
      }
    }
    this.saveRepository()
  }

  async autoTag(content: string): Promise<string[] | null> {
    try {
      const prompt = buildTaggingPrompt(content, this.repo)
      const body = JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        keep_alive: -1,
      })

      const raw = await ollamaPost(body)
      const data = JSON.parse(raw) as Record<string, unknown>
      const text = (data.response as string | undefined)?.trim()
      if (!text) return null

      return parseTagResponse(text)
    } catch {
      // Ollama not available or request failed — return null for fallback
      return null
    }
  }
}
