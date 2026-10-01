/**
 * Umzug der Bestands-Tags auf die Achsen.
 *
 * Gemessen am 2026-09-30 über alle 958 Notes: 14 Tag-Klassen, `kind` mit 29
 * Werten, `workspace` als Anzeigename in 13 Schreibweisen, 269 Tags ganz ohne
 * Klasse. Entstanden ist das, weil das Auto-Tagging ein Modell fragte und
 * übernahm, was zurückkam — jede erfundene Klasse ist eine Filterebene, die es
 * nur einmal gibt.
 *
 * **Grundsatz: nichts verschwindet stillschweigend.** Was sich nicht auf eine
 * Achse abbilden lässt, bleibt stehen und wird im Bericht genannt. Ein Umzug,
 * der Information vernichtet, die nirgends sonst steht, wäre kein Umzug.
 *
 * Zwei Befunde aus der Messung haben die Abbildung geprägt:
 *
 *  - **Unter `scope` lagen echte Phasen**: `scope:testing` 46×,
 *    `scope:debugging` 21×, `scope:audit` 19×. Das ist Information, die kein
 *    anderes Tag trägt — sie wird gehoben.
 *  - **Unter `phase` lagen Wellennummern**: `phase:4`, `phase:1`, `phase:0`,
 *    `phase:2`. Die gehören in die Klasse, die Wellen bedeutet: `welle`, mit 89
 *    Vergaben längst im Bestand.
 *
 * Die Funktionen hier sind rein. Sie lesen keine Datei und schreiben keine —
 * das tut der Aufrufer, und das macht die Abbildung prüfbar.
 */
import {
  ENTITY_PHASE_DEFAULT,
  ENTITY_VALUES,
  isExclusiveClass,
  KIND_VALUES,
  PHASE_VALUES,
  STATUS_VALUES,
  type TagAxis,
} from '../../shared/tag-axes'

/**
 * Bestands-Typ → Achsen-Typ.
 *
 * Die Zahlen in Klammern sind die gemessenen Vergaben. Wo deutsch und englisch
 * nebeneinander standen, fasst die Abbildung zusammen.
 */
export const KIND_MAP: Readonly<Record<string, string>> = {
  // Unverändert, nur bestätigt
  spec: 'spec',                     // 109
  handoff: 'handoff',               // 94
  testcase: 'testcase',             // 85
  bugreport: 'bugreport',           // 72
  reference: 'reference',           // 32
  todo: 'todo',                     // 4
  finding: 'finding',               // 1
  requirements: 'requirements',     // 1

  // Pläne
  wellenplan: 'plan',               // 63
  'fix-plan': 'plan',               // 36
  backlog: 'todo',                  // 3

  // Berichte über etwas Abgeschlossenes
  abschlussbericht: 'report',       // 59
  'audit-report': 'report',         // aus der Audit-Vorlage
  'release-empfehlung': 'report',   // aus der Audit-Vorlage
  'testing-run': 'report',          // aus der Testing-Vorlage
  'workshop-run': 'report',         // 30 — die Mitschrift eines Laufs
  'findings-report': 'finding',     // 50 — trägt die FindingView

  // Architektur ist eine Spezifikation
  architektur: 'spec',              // 38
  architecture: 'spec',             // 3
  'detail-spec': 'spec',            // aus den klassenlosen Tags

  // Anleitungen
  walkthrough: 'guide',             // 24
  guide: 'guide',                   // 7
  doku: 'reference',                // 2
  overview: 'reference',            // 1
  guardrail: 'reference',           // 1
  brain: 'reference',               // 30 — abgelegtes Wissen, kein Vorgang

  // Anforderungen und Wünsche
  anforderungspaket: 'requirements', // 18
  'feature-request': 'idea',        // 23 — ein Wunsch, noch keine Anforderung
  'ideation-request': 'idea',       // 5

  // Untersuchungen
  analysis: 'research',             // 2
  lueckenanalyse: 'research',       // 1

  // Listen
  checklist: 'todo',                // 9

  // Schreibvarianten
  handover: 'handoff',              // 1
  journal: 'journal',
  idea: 'idea',
  research: 'research',
  plan: 'plan',
  report: 'report',
}

/** Bestands-Zustand → Achsen-Zustand. */
export const STATUS_MAP: Readonly<Record<string, string>> = {
  done: 'done',                     // 146
  open: 'open',                     // 118
  fixed: 'done',                    // 41 — behoben ist erledigt
  'in-progress': 'in-progress',     // 11
  active: 'in-progress',            // 3
  superseded: 'superseded',         // 2
  verify: 'verify',                 // 1
  archived: 'superseded',           // aus den Seed-Klassen
  resolved: 'done',                 // aus den klassenlosen Tags
  blocked: 'blocked',
}

/**
 * `scope` → Phase, für die Werte, die tatsächlich eine Phase benennen.
 *
 * Die übrigen scope-Werte (`voice`, `notes`, `mcp`, `renderer` …) benennen
 * Bauteile, keine Phasen. Sie bleiben unangetastet.
 */
export const SCOPE_TO_PHASE: Readonly<Record<string, string>> = {
  testing: 'testing',               // 46
  debugging: 'debugging',           // 21
  audit: 'monitoring',              // 19 — Audit beobachtet, es baut nicht
  refinement: 'architecture',       // 2
  architecture: 'architecture',     // 1
}

/**
 * Bestands-Schwere → die vier Stufen.
 *
 * Festgelegt am 2026-09-30: „zum start sollte gerade severity auf 4 (low mid hi
 * now) begrenzt werden ... now als höchste stufe". Der Bestand trug
 * high(36) medium(26) low(15) critical(1).
 *
 * `now` ist mehr als `critical` je war: es sagt nicht „schlimm", sondern „jetzt".
 */
export const SEVERITY_MAP: Readonly<Record<string, string>> = {
  low: 'low',
  medium: 'mid',
  mid: 'mid',
  high: 'hi',
  hi: 'hi',
  critical: 'now',
  now: 'now',
}

/**
 * Klassen, die es nicht mehr gibt.
 *
 * Jede aus einem eigenen Grund, und keine willkürlich:
 *
 *  - `scope` — seine Phasen-Werte sind zu `phase` geworden (siehe
 *    SCOPE_TO_PHASE), der Rest benannte Bauteile. Das ist `component`.
 *  - `project` — doppelte den Workspace. 147 von 161 Vergaben standen auf
 *    Notes, die den Workspace ohnehin trugen.
 *  - `req-status` — doppelte den Zustand, den der requirements-parser aus dem
 *    **Rumpf** liest. Ein Tag daneben kann nur veralten.
 *  - `welle` — die Wellennummer steht im Titel der Note („… Welle 3").
 *  - `verdict` — das Urteil steht im Titel und im Rumpf der Audit-Note.
 *  - `domain`, `tech` — drei und zwei Werte, beide ohne Leser im Code.
 *
 * Nicht dabei: `severity` und `component`. Die sind legitim und editierbar.
 * Ebenfalls nicht dabei: Schlagworte ohne Klasse. Die erzeugen keine
 * Filterebene, und `raspberry-pi` steht nirgends sonst.
 */
export const DISSOLVED_CLASSES: readonly string[] = [
  'scope', 'project', 'req-status', 'welle', 'verdict', 'domain', 'tech', 'category', 'skill',
]

export interface MigrationContext {
  /** Workspace-Anzeigename (kleingeschrieben) → ID. */
  workspaceNameToId: ReadonlyMap<string, string>
}

export interface MigrationResult {
  tags: string[]
  /** Tags, die keine Abbildung hatten und deshalb stehen geblieben sind. */
  unmapped: string[]
  /** Ob sich überhaupt etwas geändert hat — entscheidet über das Schreiben. */
  changed: boolean
}

function splitTag(tag: string): { axis: string; value: string } | null {
  const i = tag.indexOf(':')
  if (i <= 0 || i === tag.length - 1) return null
  return { axis: tag.slice(0, i).toLowerCase(), value: tag.slice(i + 1).trim() }
}

/**
 * Einen klassenlosen Tag der Achse zuordnen, die seinen Wert kennt.
 *
 * 269 Vergaben trugen keine Klasse, und die häufigsten benennen einen
 * Achsenwert: `handoff` 46×, `done` 39×, `bugreport` 9×, `open` 9×,
 * `cyber-factory` 7×. Die Reihenfolge entscheidet bei Mehrdeutigkeit —
 * `testing` wäre Phase und nichts anderes, `audit` wäre Entity und Phase.
 */
function axisForBareValue(value: string): TagAxis | null {
  if (ENTITY_VALUES.includes(value)) return 'entity'
  if (KIND_MAP[value] !== undefined) return 'kind'
  if (STATUS_MAP[value] !== undefined) return 'status'
  if (PHASE_VALUES.includes(value)) return 'phase'
  return null
}

/**
 * Die Tags einer Note umziehen.
 *
 * Rein: keine Datei, kein Zustand, kein Seiteneffekt. Die Eingabe wird nicht
 * verändert.
 */
export function migrateTags(tags: readonly string[], ctx: MigrationContext): MigrationResult {
  const out: string[] = []
  const unmapped: string[] = []

  const push = (tag: string): void => {
    const lower = tag.toLowerCase()
    if (!out.some(t => t.toLowerCase() === lower)) out.push(tag)
  }

  for (const raw of tags) {
    const tag = raw.trim()
    if (!tag) continue

    const parts = splitTag(tag)

    // ── Ohne Klasse: in die Achse heben, die den Wert kennt ──
    if (!parts) {
      if (tag.includes(':')) { push(tag); continue }   // ':' oder 'kind:' — Unsinn, unverändert
      const axis = axisForBareValue(tag.toLowerCase())
      if (!axis) { push(tag); continue }
      const value = axis === 'kind'
        ? KIND_MAP[tag.toLowerCase()]
        : axis === 'status'
          ? STATUS_MAP[tag.toLowerCase()]
          : tag.toLowerCase()
      push(`${axis}:${value}`)
      continue
    }

    const { axis, value } = parts
    const lowerValue = value.toLowerCase()

    switch (axis) {
      case 'workspace': {
        // Die ID ist der stabile Bezug. Der Anzeigename war die Quelle der
        // Schreibweisen-Dubletten.
        if (/^ws-\d+$/.test(lowerValue)) { push(`workspace:${lowerValue}`); break }
        const id = ctx.workspaceNameToId.get(lowerValue)
        if (id) { push(`workspace:${id}`); break }
        // Ein Workspace, den die Konfiguration nicht mehr kennt. Den Tag zu
        // löschen würde die Note in JEDEN Workspace heben — schlimmer als ein
        // Tag, der auf nichts zeigt.
        push(tag)
        unmapped.push(tag)
        break
      }

      case 'kind': {
        const target = KIND_MAP[lowerValue]
        if (target) { push(`kind:${target}`); break }
        if (KIND_VALUES.includes(lowerValue)) { push(`kind:${lowerValue}`); break }
        push(tag)
        unmapped.push(tag)
        break
      }

      case 'status': {
        const target = STATUS_MAP[lowerValue]
        if (target) { push(`status:${target}`); break }
        if (STATUS_VALUES.includes(lowerValue)) { push(`status:${lowerValue}`); break }
        push(tag)
        unmapped.push(tag)
        break
      }

      case 'phase': {
        if (PHASE_VALUES.includes(lowerValue)) { push(`phase:${lowerValue}`); break }
        // Eine Wellennummer ist keine Phase — und seit `welle` aufgelöst ist,
        // auch keine Welle mehr: die Nummer steht im Titel der Note
        // („… Welle 3"). Sie hierher zu hängen wäre Theater, weil
        // DISSOLVED_CLASSES sie gleich danach wieder wegräumt.
        if (/^\d+[a-z]?$/.test(lowerValue)) break
        push(tag)
        unmapped.push(tag)
        break
      }

      case 'entity': {
        if (ENTITY_VALUES.includes(lowerValue)) { push(`entity:${lowerValue}`); break }
        // `orchestrator` etwa gibt es als Rolle nicht mehr.
        push(tag)
        unmapped.push(tag)
        break
      }

      case 'severity': {
        const target = SEVERITY_MAP[lowerValue]
        if (target) { push(`severity:${target}`); break }
        push(tag)
        unmapped.push(tag)
        break
      }

      case 'scope': {
        const phase = SCOPE_TO_PHASE[lowerValue]
        if (phase) { push(`phase:${phase}`); break }
        push(tag)   // Bauteil, keine Phase — bleibt
        break
      }

      default:
        push(tag)
    }
  }

  // ── Ein toter Workspace neben einem gültigen entfällt ──
  // Vor dem Umzug trugen 128 Notes zwei Workspace-Tags, fast alle nur, weil
  // Anzeigename und Kleinschreibung als zwei galten; die bildet die Schleife
  // oben auf dieselbe ID ab. Übrig bleiben Notes mit einem gültigen und einem
  // gelöschten Workspace. Der gelöschte zeigt nirgendwohin und kann weg --
  // solange ein gültiger bleibt. Ist er der Einzige, bleibt er stehen: ohne
  // Workspace-Tag wäre die Note in JEDEM Workspace sichtbar.
  const mappedWorkspaces = out.filter(t => /^workspace:ws-\d+$/.test(t.toLowerCase()))
  if (mappedWorkspaces.length > 0) {
    for (let i = out.length - 1; i >= 0; i--) {
      const lower = out[i].toLowerCase()
      if (lower.startsWith('workspace:') && !/^workspace:ws-\d+$/.test(lower)) {
        out.splice(i, 1)
      }
    }
  }

  // ── Aufgelöste Klassen räumen ──
  // Nach der Schleife, nicht darin: `scope:testing` muss erst zu
  // `phase:testing` geworden sein. Umgekehrt wäre die Phase nie entstanden.
  let result = out.filter(t => {
    const parts = splitTag(t)
    return !parts || !DISSOLVED_CLASSES.includes(parts.axis)
  })

  // ── Ausschliessende Achsen: der erste Wert gewinnt ──
  // Nach dem Zusammenfassen können zwei Bestandswerte auf denselben Achsenwert
  // fallen (status:done und status:fixed) oder auf zwei verschiedene
  // (kind:spec und kind:testcase). Beides ist hier zu entscheiden.
  const seenExclusive = new Set<string>()
  result = result.filter(t => {
    const parts = splitTag(t)
    if (!parts) return true
    // isExclusiveClass fasst die Achsen und die Auswahlzeilen zusammen --
    // `severity` ist keine Achse und trotzdem ausschliessend.
    if (!isExclusiveClass(parts.axis)) return true
    if (seenExclusive.has(parts.axis)) return false
    seenExclusive.add(parts.axis)
    return true
  })

  // ── Phase aus der Entity ableiten, wenn keine da ist ──
  // Dieselbe Ableitung, die processTagsFor beim Anlegen vornimmt, rückwirkend:
  // 557 Notes tragen eine Entity und fast keine eine Phase. Das Vorhandene
  // gewinnt immer gegen die Ableitung.
  if (!result.some(t => t.toLowerCase().startsWith('phase:'))) {
    const entityTag = result.find(t => t.toLowerCase().startsWith('entity:'))
    const entityId = entityTag ? entityTag.slice('entity:'.length).toLowerCase() : null
    const derived = entityId ? ENTITY_PHASE_DEFAULT[entityId] : undefined
    if (derived) result.push(`phase:${derived}`)
  }

  const changed = result.length !== tags.length
    || result.some((t, i) => t !== tags[i])

  return { tags: result, unmapped, changed }
}

// ─── Anwendung auf ein Notes-Verzeichnis ────────────────────

export interface MigrationRunOptions {
  notesDir: string
  ctx: MigrationContext
  /** Ohne `apply` wird nichts geschrieben — der Trockenlauf ist die Voreinstellung. */
  apply?: boolean
}

export interface MigrationRunReport {
  /** Notes mit lesbarem Frontmatter. */
  examined: number
  /** Notes, deren Tags sich ändern. */
  changed: number
  /** Notes, die geschrieben wurden (0 im Trockenlauf). */
  written: number
  /** Tags ohne Abbildung, mit Anzahl. */
  unmapped: Record<string, number>
  /** Verteilung nach dem Umzug: Klasse → Wert → Anzahl. */
  after: Record<string, Record<string, number>>
  problems: string[]
}

/**
 * Den Umzug auf ein Verzeichnis anwenden.
 *
 * Voreinstellung ist der Trockenlauf: ohne `apply` wird gelesen und gerechnet,
 * aber nichts geschrieben. Bei 958 echten Notes ist der Bericht vor dem
 * Schreiben kein Luxus.
 *
 * Eine Note, die sich nicht lesen lässt, wird gemeldet und übersprungen —
 * sie darf den Lauf nicht abbrechen und die übrigen Notes nicht halb
 * umgezogen zurücklassen.
 */
export async function migrateNotesDir(opts: MigrationRunOptions): Promise<MigrationRunReport> {
  const fs = await import('fs')
  const path = await import('path')
  const matter = (await import('gray-matter')).default

  const report: MigrationRunReport = {
    examined: 0, changed: 0, written: 0, unmapped: {}, after: {}, problems: [],
  }

  let files: string[]
  try {
    files = fs.readdirSync(opts.notesDir).filter(f => f.endsWith('.md')).sort()
  } catch {
    report.problems.push(`${opts.notesDir} nicht lesbar.`)
    return report
  }

  for (const file of files) {
    const full = path.join(opts.notesDir, file)
    let parsed: ReturnType<typeof matter>
    try {
      parsed = matter(fs.readFileSync(full, 'utf-8'))
    } catch {
      report.problems.push(`${file}: Frontmatter nicht lesbar — übersprungen.`)
      continue
    }

    const before: unknown = parsed.data.tags
    if (!Array.isArray(before)) continue
    const beforeTags = before.filter((t): t is string => typeof t === 'string')
    report.examined++

    const result = migrateTags(beforeTags, opts.ctx)

    for (const u of result.unmapped) report.unmapped[u] = (report.unmapped[u] ?? 0) + 1
    for (const t of result.tags) {
      const i = t.indexOf(':')
      const cls = i > 0 ? t.slice(0, i) : '(ohne Klasse)'
      const val = i > 0 ? t.slice(i + 1) : t
      report.after[cls] = report.after[cls] ?? {}
      report.after[cls][val] = (report.after[cls][val] ?? 0) + 1
    }

    if (!result.changed) continue
    report.changed++
    if (!opts.apply) continue

    try {
      parsed.data.tags = result.tags
      fs.writeFileSync(full, matter.stringify(parsed.content, parsed.data), 'utf-8')
      report.written++
    } catch (err) {
      report.problems.push(`${file}: nicht schreibbar — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return report
}

// ─── Einmalig beim Start ────────────────────────────────────

/**
 * Markerdatei neben den Notes. Verhindert den zweiten Lauf.
 *
 * Der Umzug ist nachweislich wiederholbar — ein zweiter Lauf schreibt null
 * Dateien. Der Marker ist deshalb keine Sicherung gegen Schaden, sondern gegen
 * 958 sinnlose Dateilesevorgänge bei jedem Start.
 */
const MIGRATION_MARKER = '.tag-axes-migration-done'

/**
 * Den Umzug einmal ausführen, falls er auf dieser Maschine noch nicht lief.
 *
 * **Warum das hier steht:** Der Umzug lief am 2026-09-30 als Skript gegen die
 * echten Notes. Dabei fiel auf, dass `tag-migration.ts` überhaupt nicht im Build
 * landet — nichts im Main-Prozess importierte es. Auf einer zweiten Maschine, in
 * einem frischen Profil oder nach einem Rechnerwechsel wäre die alte Tag-Suppe
 * also unberührt geblieben, und zwar unbemerkt.
 *
 * Wirft nie. Ein fehlgeschlagener Umzug darf den Start nicht verhindern: die
 * Notes sind dann unverändert lesbar, nur eben noch nicht umgezogen.
 */
export async function runTagMigrationOnce(opts: {
  notesDir: string
  /** Workspaces aus der Konfiguration — für die Abbildung Anzeigename → ID. */
  workspaces: ReadonlyArray<{ id: string; name?: string }>
}): Promise<MigrationRunReport | null> {
  const fs = await import('fs')
  const path = await import('path')
  const marker = path.join(opts.notesDir, MIGRATION_MARKER)

  try {
    if (fs.existsSync(marker)) return null
  } catch {
    return null
  }

  const workspaceNameToId = new Map<string, string>()
  for (const ws of opts.workspaces) {
    if (ws.name) workspaceNameToId.set(ws.name.toLowerCase(), ws.id)
    workspaceNameToId.set(ws.id.toLowerCase(), ws.id)
  }

  try {
    const report = await migrateNotesDir({
      notesDir: opts.notesDir,
      ctx: { workspaceNameToId },
      apply: true,
    })
    // Marker erst nach dem Lauf: bricht er ab, läuft er beim nächsten Start
    // erneut — und das ist richtig, weil er wiederholbar ist.
    fs.writeFileSync(marker, new Date().toISOString(), 'utf-8')
    console.log(
      `[TagMigration] ${report.written} von ${report.examined} Notes umgezogen`
      + (report.problems.length > 0 ? `, ${report.problems.length} Probleme` : ''),
    )
    return report
  } catch (err) {
    console.warn('[TagMigration] fehlgeschlagen, Notes bleiben unverändert:', err)
    return null
  }
}
