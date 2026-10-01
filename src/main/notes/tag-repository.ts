import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TagClassRepository, TagClass } from '../../shared/types'
import { AXIS_VALUES, FLAT_MARKERS, SEVERITY_VALUES, type TagAxis } from '../../shared/tag-axes'

const TAGS_FILENAME = '.tags.json'

// ─── Seed Classes ────────────────────────────────────────

/**
 * Die Achsenwerte gehoeren in die Registry, weil `isKnownTag` sie prueft und
 * `mux_notes_create` unbekannte Tags hart abweist.
 *
 * Gemessen am 2026-09-30 gegen die echte .tags.json fehlten `phase:coding`,
 * `phase:testing`, `phase:debugging`, `phase:monitoring`, `phase:research`,
 * `kind:research`, `kind:idea` sowie `entity:audit`, `entity:launcher` und
 * `entity:voice-relay`. Eine Audit-Rolle haette ihre eigene Herkunft nicht
 * mitgeben koennen: die Achse bot den Wert an, die Registry wies ihn ab.
 *
 * Die Achsen sind die Quelle (shared/tag-axes.ts) und werden hier eingespeist,
 * damit dieselbe Tatsache nicht zweimal aufgeschrieben wird. Ergaenzend, nicht
 * ersetzend — `load()` bildet die Vereinigung mit dem Bestand, und was in
 * .tags.json steht, stammt aus echten Notes.
 */
function axisSeed(axis: TagAxis, color: string, extra: readonly string[] = []): TagClass {
  return { values: [...new Set([...(AXIS_VALUES[axis] ?? []), ...extra])], color }
}

/**
 * Klassen, deren Werte der Code besitzt.
 *
 * Werden bei **jedem** Start eingemischt: sie stehen in tag-axes.ts, Ansichten
 * hängen daran, und sie sollen sich nicht wegkonfigurieren lassen.
 *
 * `feature-request` und `archived` standen hier, bis der Umzug am 2026-09-30
 * sie abgebildet hat (-> kind:idea, -> status:superseded). Sie als Seed zu
 * behalten hätte bedeutet, dass sie beim nächsten Start zurückkommen und die
 * Vorschläge wieder Werte anbieten, die auf keiner Note stehen.
 *
 * `domain`, `project` und `scope` standen hier ebenfalls. Der Umzug hat sie
 * aufgelöst: `scope`-Phasen wurden zu `phase`, `project` doppelte den
 * Workspace, `domain` trug drei Werte. Wieder einzusäen hieße, die Klassen
 * beim nächsten Start neu anzulegen.
 */
export const SEED_CLASSES: Record<string, TagClass> = {
  kind: axisSeed('kind', '#6366f1'),
  status: axisSeed('status', '#f59e0b'),
  phase: axisSeed('phase', '#a78bfa'),
  entity: axisSeed('entity', '#22d3ee'),
}

/**
 * Klassen mit einer **Startbelegung**, die danach dem Benutzer gehört.
 *
 * Der Unterschied zu SEED_CLASSES ist der ganze Punkt: diese Werte werden nur
 * eingesetzt, wenn die Klasse noch **gar nicht** existiert. Danach nicht mehr.
 *
 * Sonst wäre „editierbar" nicht wahr: wer `severity:low` im Tag-Manager
 * entfernt, hätte es beim nächsten Start wieder, und ein Knopf, dessen Wirkung
 * ein Neustart aufhebt, ist eine Irreführung.
 *
 * Festgelegt am 2026-09-30: „severity und component finde ich legitim - aber
 * die werte müssen editierbar sein - gerade component ist dabei ja schon
 * projektspezifisch". `component` bekommt deshalb gar keine Startbelegung —
 * welche Bauteile ein Projekt hat, weiß der Code nicht.
 */
export const REGISTRY_SEED_CLASSES: Record<string, TagClass> = {
  severity: { values: [...SEVERITY_VALUES], color: '#ef4444' },
  component: { values: [], color: '#14b8a6' },
}

// ─── TagClassRepository ──────────────────────────────────

export class TagClassRepo {
  private filePath: string
  private data: TagClassRepository

  constructor(notesDir: string) {
    this.filePath = path.join(notesDir, TAGS_FILENAME)
    this.data = { classes: {} }
    this.load()
  }

  private load(): void {
    // Start with seeds
    const merged: Record<string, TagClass> = {}
    for (const [cls, entry] of Object.entries(SEED_CLASSES)) {
      merged[cls] = { values: [...entry.values], color: entry.color }
    }
    // Registry-Seeds spaeter, und nur fuer Klassen, die die Datei nicht kennt
    // -- siehe REGISTRY_SEED_CLASSES. Hier waeren sie eine Vereinigung und
    // damit nicht mehr editierbar.
    const persistedClassNames = new Set<string>()

    let synonyms: Record<string, string> = {}

    // Merge persisted
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const persisted = JSON.parse(raw) as TagClassRepository
      if (persisted.classes && typeof persisted.classes === 'object') {
        for (const [cls, entry] of Object.entries(persisted.classes)) {
          persistedClassNames.add(cls)
          if (merged[cls]) {
            // Merge values (union), persisted color wins
            const valueSet = new Set([...merged[cls].values, ...entry.values])
            merged[cls] = {
              values: [...valueSet],
              color: entry.color ?? merged[cls].color,
            }
          } else {
            merged[cls] = { values: [...entry.values], color: entry.color }
          }
        }
      }
      // Load synonyms (additive field, backward compatible)
      if (persisted.synonyms && typeof persisted.synonyms === 'object') {
        synonyms = { ...persisted.synonyms }
      }
    } catch {
      // File doesn't exist yet — use seeds only
    }

    // Startbelegung: nur fuer Klassen, die die Datei nicht kennt. Ein zweites
    // Mal eingesetzt waere sie keine Startbelegung, sondern eine Vorschrift --
    // und der Benutzer koennte einen Wert nicht loswerden.
    for (const [cls, entry] of Object.entries(REGISTRY_SEED_CLASSES)) {
      if (persistedClassNames.has(cls)) continue
      merged[cls] = { values: [...entry.values], color: entry.color }
    }

    this.data = { classes: merged, synonyms }
  }

  private save(): void {
    this.saveWithTags(undefined, undefined)
  }

  /**
   * Single-writer entry point for all .tags.json writes.
   * NoteTagging delegates here so both sets of fields are written atomically
   * in one read-merge-write cycle, eliminating the last-writer-wins race.
   *
   * @param tags       The `tags` map from NoteTagging (pass undefined to preserve existing)
   * @param tagClasses The `_tagClasses` constant from NoteTagging (pass undefined to preserve existing)
   */
  saveWithTags(
    tags: Record<string, unknown> | undefined,
    tagClasses: Record<string, unknown> | undefined,
  ): void {
    try {
      const dir = path.dirname(this.filePath)
      fs.mkdirSync(dir, { recursive: true })
      // Read existing file once — single read-merge-write cycle
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      } catch { /* file missing or invalid — start fresh */ }
      const merged: Record<string, unknown> = {
        ...existing,
        classes: this.data.classes,
        synonyms: this.data.synonyms,
      }
      if (tags !== undefined) merged.tags = tags
      if (tagClasses !== undefined) merged._tagClasses = tagClasses
      fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf-8')
    } catch {
      // Non-fatal
    }
  }

  getRepository(): TagClassRepository {
    return this.data
  }

  /** Parse a tag string into [class, value]. Legacy tags without colon get class=null. */
  static parseTag(tag: string): { tagClass: string | null; value: string } {
    const idx = tag.indexOf(':')
    if (idx === -1) return { tagClass: null, value: tag }
    return { tagClass: tag.slice(0, idx), value: tag.slice(idx + 1) }
  }

  /** Ensure a tag's class and value are registered. Auto-adds unknown classes/values. */
  ensureTag(tag: string): boolean {
    const { tagClass, value } = TagClassRepo.parseTag(tag)
    if (!tagClass) return false // legacy tag, no class

    let changed = false
    if (!this.data.classes[tagClass]) {
      this.data.classes[tagClass] = { values: [], color: undefined }
      changed = true
    }
    if (!this.data.classes[tagClass].values.includes(value)) {
      this.data.classes[tagClass].values.push(value)
      changed = true
    }
    if (changed) this.save()
    return changed
  }

  /** Register multiple tags at once. Returns true if any were new. */
  ensureTags(tags: string[]): boolean {
    let anyChanged = false
    for (const tag of tags) {
      const { tagClass, value } = TagClassRepo.parseTag(tag)
      if (!tagClass) continue

      if (!this.data.classes[tagClass]) {
        this.data.classes[tagClass] = { values: [], color: undefined }
        anyChanged = true
      }
      if (!this.data.classes[tagClass].values.includes(value)) {
        this.data.classes[tagClass].values.push(value)
        anyChanged = true
      }
    }
    if (anyChanged) this.save()
    return anyChanged
  }

  /** Set or update color for a class. */
  setClassColor(className: string, color: string): void {
    if (!this.data.classes[className]) {
      this.data.classes[className] = { values: [], color }
    } else {
      this.data.classes[className] = { ...this.data.classes[className], color }
    }
    this.save()
  }

  /** Get all known class names. */
  getClassNames(): string[] {
    return Object.keys(this.data.classes)
  }

  /** Get values for a class. */
  getClassValues(className: string): string[] {
    return this.data.classes[className]?.values ?? []
  }

  // ─── Synonyms ─────────────────────────────────────────────

  /** Resolve a single tag through the synonym map. Returns canonical tag or original. */
  resolveSynonym(tag: string): string {
    return this.data.synonyms?.[tag] ?? tag
  }

  /** Resolve multiple tags, replacing synonyms and deduplicating. */
  resolveSynonyms(tags: string[]): string[] {
    const resolved = tags.map(t => this.resolveSynonym(t))
    return [...new Set(resolved)]
  }

  /** Add a synonym mapping (from → to). Persists immediately. */
  addSynonym(from: string, to: string): void {
    if (!this.data.synonyms) this.data.synonyms = {}
    this.data.synonyms[from] = to
    this.save()
  }

  /** Remove a synonym mapping. */
  removeSynonym(from: string): void {
    if (!this.data.synonyms?.[from]) return
    delete this.data.synonyms[from]
    this.save()
  }

  /** Get the full synonym map. */
  getSynonyms(): Record<string, string> {
    return { ...(this.data.synonyms ?? {}) }
  }

  /** Check if a tag string is registered (class name, value within any class, or workspace:* pattern). */
  isKnownTag(tag: string): boolean {
    // workspace:* tags are auto-generated, always valid
    if (tag.startsWith('workspace:')) return true

    const { tagClass, value } = TagClassRepo.parseTag(tag)

    if (tagClass !== null) {
      // tag has class:value format — check that the class exists and the value is registered
      const cls = this.data.classes[tagClass]
      if (!cls) return false
      return cls.values.includes(value)
    }

    // Flache Funktionsmarker: programmatisch gelesen, ohne Klasse. Siehe
    // FLAT_MARKERS -- `handoff` wird von createHandoff geschrieben und von
    // mux_notes_handoff_search gefiltert.
    if (FLAT_MARKERS.includes(value)) return true

    // No colon — check if it matches a bare class name (tag === value here, tagClass is null)
    return Object.prototype.hasOwnProperty.call(this.data.classes, value)
  }

  // ─── Class CRUD ───────────────────────────────────────────

  /** Create a new tag class. Returns false if it already exists. */
  createClass(name: string, color: string): boolean {
    if (this.data.classes[name]) return false
    this.data.classes[name] = { values: [], color }
    this.save()
    return true
  }

  /** Rename a tag class. Updates all notes with tags in this class. Returns false on conflict. */
  renameClass(oldName: string, newName: string): boolean {
    if (!this.data.classes[oldName]) return false
    if (this.data.classes[newName]) return false

    // Move class data
    this.data.classes[newName] = { ...this.data.classes[oldName] }
    delete this.data.classes[oldName]
    this.save()

    // Rename tags in note frontmatter: oldName:value → newName:value
    this.propagateClassRename(oldName, newName)
    return true
  }

  /** Delete a tag class. Tags remain in notes as unclassified. */
  deleteClass(className: string): boolean {
    if (!this.data.classes[className]) return false
    delete this.data.classes[className]
    this.save()
    return true
  }

  /** Add a single value to an existing class. Returns true if added (false if class missing or duplicate). */
  addValue(className: string, value: string): boolean {
    const cls = this.data.classes[className]
    if (!cls) return false
    const normalized = value.toLowerCase().trim()
    if (!normalized || cls.values.includes(normalized)) return false
    cls.values.push(normalized)
    this.save()
    return true
  }

  /** Remove a single value from a class. Returns true if the value was found and removed. */
  removeValue(className: string, value: string): boolean {
    const cls = this.data.classes[className]
    if (!cls) return false
    const idx = cls.values.indexOf(value.toLowerCase().trim())
    if (idx === -1) return false
    cls.values.splice(idx, 1)
    this.save()
    return true
  }

  /** Propagate class rename across all notes in the directory. */
  private propagateClassRename(oldClass: string, newClass: string): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- synchrones Lazy-Load, CommonJS-Ziel
    const matter = require('gray-matter')
    const dir = path.dirname(this.filePath)
    let files: string[]
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    } catch {
      return
    }

    const prefix = oldClass + ':'
    for (const file of files) {
      const filePath = path.join(dir, file)
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = matter(raw)
        const tags: string[] = parsed.data.tags ?? []
        let changed = false
        const newTags = tags.map((t: string) => {
          if (t.startsWith(prefix)) {
            changed = true
            return newClass + ':' + t.slice(prefix.length)
          }
          return t
        })
        if (changed) {
          parsed.data.tags = newTags
          parsed.data.modified = new Date().toISOString()
          fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8')
        }
      } catch { /* skip */ }
    }
  }
}
