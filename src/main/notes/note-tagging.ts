import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TagRepository, TagEntry } from '../../shared/types'

const TIMEOUT_MS = 60_000

/** Read LLM config lazily (avoids electron dep in test context). */
function getLlmConfig() {
  try {
    const { configStore } = require('../config/config-store')
    const llm = configStore.get('llm')
    return {
      host: llm?.ollamaHost ?? '127.0.0.1',
      port: llm?.ollamaPort ?? 11434,
      model: llm?.ollamaModel ?? 'gemma4:26b',
    }
  } catch {
    return { host: '127.0.0.1', port: 11434, model: 'gemma4:26b' }
  }
}

// ─── Seed Tags ────────────────────────────────────────────

// Tag classes (klasse:wert schema, REQ-NOTES-013):
//   kind:     Note type / purpose (bugreport, testcase, handoff, journal, reference, todo, idea)
//   domain:   Subject area (trading, risk, market-data, portfolio, infra, ai-ml)
//   tech:     Technology (typescript, python, electron, tailscale, truenas)
//   project:  Project name (cipher-mux, cipher-boox, openclaw)
//   phase:    Workflow phase (research, architecture, coding, testing, debugging, automation, monitoring)
//   scope:    Visibility / lifecycle (workspace:<id>, session, global)
//
// Entity-specific functional tags (no class prefix): handoff
// These are used as programmatic markers and must stay flat.

export const SEED_TAGS: Record<string, TagEntry> = {
  // kind — note purpose
  'kind:bugreport': { count: 0, description: 'Bug report notes' },
  'kind:journal': { count: 0, description: 'Personal journal, daily notes, reflections' },
  'kind:reference': { count: 0, description: 'Reference material, documentation, guides' },
  'kind:todo': { count: 0, description: 'Todo items, tasks, action points' },
  'kind:idea': { count: 0, description: 'Ideas, brainstorming, concepts' },
  // domain — subject area
  'domain:trading': { count: 0, description: 'Trading strategies, market analysis, order execution' },
  'domain:risk': { count: 0, description: 'Risk management, position sizing, drawdown' },
  'domain:market-data': { count: 0, description: 'Market data feeds, price history, tick data' },
  'domain:portfolio': { count: 0, description: 'Portfolio management, allocation, performance tracking' },
  'domain:infra': { count: 0, description: 'Infrastructure, server setup, deployment' },
  'domain:ai-ml': { count: 0, description: 'AI/ML models, training, inference, LLMs' },
  'domain:security': { count: 0, description: 'Security, access control, credentials, encryption' },
  'domain:backup': { count: 0, description: 'Backups, snapshots, data recovery' },
  // tech — technology
  'tech:typescript': { count: 0, description: 'TypeScript, type system, compiler' },
  'tech:python': { count: 0, description: 'Python scripts, libraries, automation' },
  'tech:electron': { count: 0, description: 'Electron framework, desktop app, IPC' },
  'tech:tailscale': { count: 0, description: 'Tailscale VPN, mesh networking, node connectivity' },
  'tech:truenas': { count: 0, description: 'TrueNAS SCALE, storage, ZFS, datasets' },
  // project — project name
  'project:cipher-mux': { count: 0, description: 'cipher-mux-electron project, terminal multiplexer UI' },
  'project:cipher-boox': { count: 0, description: 'cipher-boox project, e-reader integration' },
  'project:openclaw': { count: 0, description: 'OpenClaw project, SSH keys, infrastructure access' },
  // phase — workflow phase
  'phase:research': { count: 0, description: 'Research, analysis, investigation' },
  'phase:architecture': { count: 0, description: 'System architecture, design patterns, ADRs' },
  'phase:coding': { count: 0, description: 'General coding, implementation, development' },
  'phase:testing': { count: 0, description: 'Unit tests, integration tests, test coverage' },
  'phase:debugging': { count: 0, description: 'Debugging, troubleshooting, error investigation' },
  'phase:automation': { count: 0, description: 'Automation scripts, workflows, CI/CD' },
  'phase:monitoring': { count: 0, description: 'Monitoring, alerts, metrics, dashboards' },
  'kind:testcase': { count: 0, description: 'Testcase note with checklist format' },
  // Entity-specific functional tags (flat, no class prefix)
  handoff: { count: 0, description: 'Handoff note between sessions' },
}

/** Recommended tag classes for .tags.json documentation */
export const TAG_CLASSES: Record<string, string> = {
  kind: 'Note type/purpose (bugreport, journal, reference, todo, idea)',
  domain: 'Subject area (trading, risk, infra, ai-ml, security)',
  tech: 'Technology (typescript, python, electron, tailscale)',
  project: 'Project name (cipher-mux, cipher-boox, openclaw)',
  phase: 'Workflow phase (research, architecture, coding, testing, debugging)',
  scope: 'Visibility/lifecycle — auto-assigned (workspace:<id>, session)',
}

const TAGS_FILENAME = '.tags.json'

// ─── Prompt ───────────────────────────────────────────────

function buildTaggingPrompt(content: string, tagRepo: TagRepository): string {
  const existingTags = Object.keys(tagRepo.tags).join(', ')
  return `Du bist ein erfahrener Wissensorganisator. Lies die folgende Notiz sorgfältig und vergib bis zu 5 passende Tags.

Tags folgen dem klasse:wert Schema. Bekannte Klassen: kind (Zweck), domain (Fachgebiet), tech (Technologie), project (Projekt), phase (Workflow-Phase).
Beispiele: "domain:trading", "tech:typescript", "phase:debugging", "kind:reference".

Vorhandene Tags im Repository: ${existingTags}

Bevorzuge bestehende Tags — erfinde nur dann neue, wenn wirklich keiner passt. Neue Tags muessen dem klasse:wert Format folgen. Gib ausschliesslich ein JSON-Array zurück, z.B. ["domain:trading", "tech:typescript"].

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
  const cfg = getLlmConfig()
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: cfg.host,
        port: cfg.port,
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
      // Include tag class documentation in .tags.json
      const output = { ...this.repo, _tagClasses: TAG_CLASSES }
      fs.writeFileSync(this.tagsFilePath, JSON.stringify(output, null, 2), 'utf-8')
    } catch {
      // Non-fatal — next call will retry
    }
  }

  getTagRepository(): TagRepository {
    return this.repo
  }

  /** Check if a tag is a built-in seed tag. */
  isSeedTag(tag: string): boolean {
    return tag in SEED_TAGS
  }

  /** Create a new tag manually. Returns false if it already exists. */
  createTag(name: string, description: string): boolean {
    const normalized = name.toLowerCase().trim()
    if (!normalized || this.repo.tags[normalized]) return false
    this.repo.tags[normalized] = { count: 0, description }
    this.saveRepository()
    return true
  }

  /** Rename a tag. Returns the list of affected note files (relative paths). */
  renameTag(oldName: string, newName: string): string[] {
    const oldNorm = oldName.toLowerCase().trim()
    const newNorm = newName.toLowerCase().trim()
    if (!oldNorm || !newNorm || oldNorm === newNorm) return []
    if (!this.repo.tags[oldNorm]) return []
    if (this.repo.tags[newNorm]) return [] // target already exists

    // Move tag entry
    this.repo.tags[newNorm] = { ...this.repo.tags[oldNorm] }
    delete this.repo.tags[oldNorm]
    this.saveRepository()

    // Propagate rename in note frontmatter
    return this.propagateTagChange(oldNorm, newNorm)
  }

  /** Update tag description. */
  updateTagDescription(name: string, description: string): boolean {
    const normalized = name.toLowerCase().trim()
    if (!this.repo.tags[normalized]) return false
    this.repo.tags[normalized] = { ...this.repo.tags[normalized], description }
    this.saveRepository()
    return true
  }

  /** Delete a tag. Returns the list of affected note files. */
  deleteTag(name: string): string[] {
    const normalized = name.toLowerCase().trim()
    if (!this.repo.tags[normalized]) return []
    delete this.repo.tags[normalized]
    this.saveRepository()
    return this.propagateTagChange(normalized, null)
  }

  /**
   * Merge multiple tags into one target tag.
   * All source tags (except target) are replaced with target in all notes.
   * Notes that already have target get duplicates removed.
   * Source tags are deleted from the repository.
   */
  mergeTags(sources: string[], target: string): { affected: number; error?: string } {
    if (sources.length < 2) return { affected: 0, error: 'need at least 2 tags to merge' }
    const normTarget = target.toLowerCase().trim()
    const normSources = sources.map(s => s.toLowerCase().trim())
    if (!normSources.includes(normTarget)) return { affected: 0, error: 'target must be one of the source tags' }

    const toReplace = normSources.filter(s => s !== normTarget)
    const matter = require('gray-matter')
    let affected = 0

    let files: string[]
    try {
      files = fs.readdirSync(this.notesDir).filter(f => f.endsWith('.md'))
    } catch {
      return { affected: 0 }
    }

    for (const file of files) {
      const filePath = path.join(this.notesDir, file)
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = matter(raw)
        const tags: string[] = parsed.data.tags ?? []
        const lower = tags.map((t: string) => t.toLowerCase())

        const hasAnySource = toReplace.some(s => lower.includes(s))
        if (!hasAnySource) continue

        // Replace source tags with target, then deduplicate
        const newTags = tags
          .map((t: string) => toReplace.includes(t.toLowerCase()) ? normTarget : t)
          .filter((t: string, i: number, arr: string[]) =>
            arr.findIndex((x: string) => x.toLowerCase() === t.toLowerCase()) === i)

        parsed.data.tags = newTags
        parsed.data.modified = new Date().toISOString()
        fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8')
        affected++
      } catch { /* skip */ }
    }

    // Remove source tags from repository (keep target)
    for (const src of toReplace) {
      delete this.repo.tags[src]
    }
    // Ensure target exists in repo
    if (!this.repo.tags[normTarget]) {
      this.repo.tags[normTarget] = { count: 0, description: '' }
    }
    this.saveRepository()
    this.recountTags()

    return { affected }
  }

  /**
   * Propagate a tag rename or deletion across all note files.
   * If newTag is null, the tag is removed. Returns affected file paths.
   */
  private propagateTagChange(oldTag: string, newTag: string | null): string[] {
    const affected: string[] = []
    const matter = require('gray-matter')

    // Scan flat notes directory
    let files: string[]
    try {
      files = fs.readdirSync(this.notesDir).filter(f => f.endsWith('.md'))
    } catch {
      return affected
    }

    for (const file of files) {
      const filePath = path.join(this.notesDir, file)
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = matter(raw)
        const tags: string[] = parsed.data.tags ?? []
        const idx = tags.findIndex((t: string) => t.toLowerCase() === oldTag)
        if (idx === -1) continue

        if (newTag) {
          tags[idx] = newTag
        } else {
          tags.splice(idx, 1)
        }
        parsed.data.tags = tags
        parsed.data.modified = new Date().toISOString()
        const updated = matter.stringify(parsed.content, parsed.data)
        fs.writeFileSync(filePath, updated, 'utf-8')
        affected.push(file)
      } catch {
        // Skip files that can't be parsed
      }
    }

    return affected
  }

  /** Recount tag occurrences from all note files. */
  recountTags(): void {
    // Reset all counts to 0
    for (const key of Object.keys(this.repo.tags)) {
      this.repo.tags[key] = { ...this.repo.tags[key], count: 0 }
    }

    let files: string[]
    try {
      files = fs.readdirSync(this.notesDir).filter(f => f.endsWith('.md'))
    } catch {
      return
    }

    const matter = require('gray-matter')
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.notesDir, file), 'utf-8')
        const parsed = matter(raw)
        const tags: string[] = parsed.data.tags ?? []
        for (const tag of tags) {
          const norm = tag.toLowerCase().trim()
          if (this.repo.tags[norm]) {
            this.repo.tags[norm] = {
              ...this.repo.tags[norm],
              count: this.repo.tags[norm].count + 1,
            }
          }
        }
      } catch {
        // Skip
      }
    }
    this.saveRepository()
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
      const cfg = getLlmConfig()
      const body = JSON.stringify({
        model: cfg.model,
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
