import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TagRepository, TagEntry } from '../../shared/types'
import type { TagClassRepo } from './tag-repository'
import { AXIS_VALUES, filterToAxes, KIND_VALUES, PHASE_VALUES, STATUS_VALUES } from '../../shared/tag-axes'

const TIMEOUT_MS = 60_000

/** Read LLM config lazily (avoids electron dep in test context). */
function getLlmConfig() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- synchrones Lazy-Load, CommonJS-Ziel
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

/**
 * Beschreibungen zu den Achsenwerten, soweit eine gebraucht wird.
 *
 * Nur ein Nachschlagewerk — die LISTE der Vokabeln kommt aus den Achsen, nicht
 * von hier. Vorher standen hier 16 Einträge für `domain:`, `tech:` und
 * `project:`; der Umzug am 2026-10-01 hat diese Klassen aufgelöst, und ein Seed
 * hätte sie bei jedem Speichern in `.tags.json` zurückgeschrieben.
 */
const VALUE_DESCRIPTIONS: Record<string, string> = {
  'kind:bugreport': 'Bug report notes',
  'kind:journal': 'Personal journal, daily notes, reflections',
  'kind:reference': 'Reference material, documentation',
  'kind:todo': 'Todo items, tasks, action points',
  'kind:idea': 'Ideas, brainstorming, concepts',
  'kind:testcase': 'Testcase note with checklist format',
  'kind:spec': 'Specification with requirement IDs',
  'kind:requirements': 'Requirements package',
  'kind:finding': 'Findings from a review, audit or test run',
  'kind:handoff': 'Handoff note between sessions',
  'kind:research': 'Research, investigation, gap analysis',
  'kind:plan': 'Plan — waves, fixes, sequencing',
  'kind:report': 'Report on something completed',
  'kind:guide': 'Walkthrough or guide',
  'phase:research': 'Research, analysis, investigation',
  'phase:architecture': 'System architecture, design patterns, ADRs',
  'phase:coding': 'General coding, implementation, development',
  'phase:testing': 'Unit tests, integration tests, test coverage',
  'phase:debugging': 'Debugging, troubleshooting, error investigation',
  'phase:automation': 'Automation scripts, workflows, CI/CD',
  'phase:monitoring': 'Monitoring, alerts, metrics, audits',
}

/**
 * Die Startvokabeln für `.tags.json`.
 *
 * **Abgeleitet, nicht aufgeschrieben.** Dieselbe Tatsache zweimal zu notieren
 * heißt, dass eine der beiden Stellen irgendwann falsch ist — und genau das war
 * sie: die Liste enthielt `category:*`, obwohl es die Klasse nie gab, und die
 * Testing-Vorlage wies ihre Rolle darauf hin. Deren Notes wären an der
 * Tag-Prüfung gescheitert.
 */
export const SEED_TAGS: Record<string, TagEntry> = (() => {
  const out: Record<string, TagEntry> = {}
  for (const [axis, values] of Object.entries(AXIS_VALUES)) {
    for (const value of values ?? []) {
      const tag = `${axis}:${value}`
      out[tag] = { count: 0, description: VALUE_DESCRIPTIONS[tag] ?? `${axis}: ${value}` }
    }
  }
  // Flacher Funktionsmarker ohne Klasse — programmatisch gelesen, bleibt flach.
  out.handoff = { count: 0, description: 'Handoff note between sessions' }
  return out
})()

/** Recommended tag classes for .tags.json documentation */
export const TAG_CLASSES: Record<string, string> = {
  kind: 'Note type/purpose — see KIND_VALUES in shared/tag-axes.ts',
  phase: 'Workflow phase — research, architecture, coding, testing, debugging, automation, monitoring',
  status: 'State — open, in-progress, blocked, verify, done, superseded',
  entity: 'Origin: the role that created the note. Set by the Mux, never guessed',
  workspace: 'Origin: the workspace. Set by the Mux, never guessed',
  severity: 'Severity of a finding — low, mid, hi, now. Editable in the Tag Manager',
  component: 'Project-specific part. Editable in the Tag Manager',
}

const TAGS_FILENAME = '.tags.json'

// ─── Prompt ───────────────────────────────────────────────

/**
 * Die Frage ans Modell.
 *
 * Nennt genau die drei Achsen, die es einschaetzen kann, mit ihren erlaubten
 * Werten. Der Workspace fehlt absichtlich: er ist eine Tatsache ueber die
 * Herkunft einer Note und keine Einschaetzung ihres Inhalts — ein Modell, das
 * ihn erraet, haengt eine Note in den falschen Workspace.
 *
 * Der Prompt ist die Bitte, filterToAxes ist die Garantie. Die frueheren
 * "Klassen" im Prompt waren offen formuliert ("erfinde nur dann neue, wenn
 * wirklich keiner passt"), und das Ergebnis waren 14 Klassen und 29 kind-Werte.
 */
function buildTaggingPrompt(content: string, _tagRepo: TagRepository): string {
  return `Du bist ein erfahrener Wissensorganisator. Lies die folgende Notiz und vergib bis zu 4 Tags.

Es gibt genau drei Achsen. Andere Tags werden verworfen — erfinde keine Klassen.

kind (der Typ der Notiz, hoechstens einer):
${KIND_VALUES.join(', ')}

phase (die Arbeitsphase, mehrere moeglich):
${PHASE_VALUES.join(', ')}

status (der Zustand, hoechstens einer):
${STATUS_VALUES.join(', ')}

Vergib nur, was die Notiz wirklich hergibt. Lieber zwei treffende Tags als vier geratene.

Gib ausschliesslich ein JSON-Array zurueck, zum Beispiel: ["kind:spec", "phase:architecture", "status:open"]

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
  private tagClassRepo: TagClassRepo | null = null

  constructor(notesDir: string) {
    this.notesDir = notesDir
    this.repo = { tags: {} }
    this.loadRepository()
  }

  /**
   * Wire up the single-writer. Call this after both NoteTagging and TagClassRepo
   * are constructed with the same notesDir. Once set, all .tags.json writes are
   * routed through TagClassRepo.saveWithTags() so there is only one writer.
   */
  setTagClassRepo(repo: TagClassRepo): void {
    this.tagClassRepo = repo
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
    if (this.tagClassRepo) {
      // Single-writer path: TagClassRepo owns the file, merges all fields in one write
      this.tagClassRepo.saveWithTags(this.repo.tags as Record<string, unknown>, TAG_CLASSES)
      return
    }
    // Fallback (no TagClassRepo wired — standalone/test usage): write directly
    try {
      fs.mkdirSync(this.notesDir, { recursive: true })
      // Merge with existing file to avoid clobbering TagClassRepo's 'classes'/'synonyms' fields
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(fs.readFileSync(this.tagsFilePath, 'utf-8'))
      } catch { /* file missing or invalid — start fresh */ }
      const merged = { ...existing, tags: this.repo.tags, _tagClasses: TAG_CLASSES }
      fs.writeFileSync(this.tagsFilePath, JSON.stringify(merged, null, 2), 'utf-8')
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- synchrones Lazy-Load, CommonJS-Ziel
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

    // Register merged sources as synonyms in .tags.json
    this.registerSynonyms(toReplace, normTarget)

    return { affected }
  }

  /** Write synonym entries into .tags.json (shared with TagClassRepo). */
  private registerSynonyms(sources: string[], target: string): void {
    if (this.tagClassRepo) {
      // Single-writer path: use TagClassRepo's synonym API — one write per source
      for (const src of sources) {
        this.tagClassRepo.addSynonym(src, target)
      }
      return
    }
    // Fallback (no TagClassRepo wired — standalone/test usage): write directly
    try {
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(fs.readFileSync(this.tagsFilePath, 'utf-8'))
      } catch { /* file may not exist yet */ }

      const synonyms: Record<string, string> = (existing as any).synonyms ?? {}
      for (const src of sources) {
        synonyms[src] = target
      }
      ;(existing as any).synonyms = synonyms
      fs.writeFileSync(this.tagsFilePath, JSON.stringify(existing, null, 2), 'utf-8')
    } catch { /* non-fatal */ }
  }

  /**
   * Propagate a tag rename or deletion across all note files.
   * If newTag is null, the tag is removed. Returns affected file paths.
   */
  private propagateTagChange(oldTag: string, newTag: string | null): string[] {
    const affected: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- synchrones Lazy-Load, CommonJS-Ziel
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- synchrones Lazy-Load, CommonJS-Ziel
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

      // Auf die vier Achsen zurechtstutzen: Workspace, Typ, Phase, Status.
      // Als Filter auf dem Ergebnis und nicht als Bitte im Prompt -- eine
      // Bitte kann ein Modell ueberhoeren, und genau das ist passiert:
      // 14 Klassen, 29 kind-Werte, Wellennummern als Phase. Siehe tag-axes.ts.
      return filterToAxes(parseTagResponse(text))
    } catch {
      // Ollama not available or request failed — return null for fallback
      return null
    }
  }
}
