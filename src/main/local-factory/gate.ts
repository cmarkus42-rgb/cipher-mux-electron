/**
 * Gate ohne Modell (Spec §7, Schritt 6).
 *
 * Zwei unabhängige Wege prüfen den Testschutz, weil jeder eine Lücke des
 * anderen schließt: die Prüfsumme sieht Inhaltsänderungen auch an Dateien, die
 * git ignoriert; der Diff sieht jede Änderung, gleichgültig ob sie über das
 * Edit-Werkzeug oder die Shell kam — dort hat die Plugin-Grenze keine Augen.
 *
 * Ruling R6: Vollständige Normalisierung und fail-safe Iterationen.
 */

import { normalize } from 'path/posix'
import { isTestPath } from '../session/entity-boundaries'

export type GateVerdict = 'gruen' | 'rot' | 'haengt'

export interface GateInput {
  workerFinished: boolean
  /** null = Testbefehl lief nicht (Start fehlgeschlagen, Timeout). */
  testExitCode: number | null
  checksumsBefore: Record<string, string>
  checksumsAfter: Record<string, string>
  /** Repo-relativ, wie `git diff --name-only` sie liefert. */
  changedFiles: string[]
  /** Repo-relativ. */
  protectedFiles: string[]
  /** Default true. Der Workshop darf ohne geschützte Tests arbeiten; der Testbefehl entscheidet dann allein. */
  testPflicht?: boolean
}

export interface GateResult {
  verdict: GateVerdict
  reasons: string[]
}

const norm = (p: string): string => normalize(p).replace(/^\.\//, '')

export function touchedProtected(changed: string[], protectedFiles: string[]): string[] {
  const prot = new Set(protectedFiles.map(norm))
  return changed.map(norm).filter(f => prot.has(f))
}

export function decideGate(input: GateInput): GateResult {
  const reasons: string[] = []

  // Check protected files (empty list is an error condition)
  if (input.protectedFiles.length === 0 && input.testPflicht !== false) {
    reasons.push('Keine geschützten Abnahmetests angegeben.')
    return { verdict: 'rot', reasons }
  }

  // Normalize checksums
  const beforeNorm = Object.fromEntries(Object.entries(input.checksumsBefore).map(([k, v]) => [norm(k), v]))
  const afterNorm = Object.fromEntries(Object.entries(input.checksumsAfter).map(([k, v]) => [norm(k), v]))

  // Check if worker finished (but still compute protection reasons)
  const touched = touchedProtected(input.changedFiles, input.protectedFiles)
  if (touched.length > 0) reasons.push(`Geschützte Tests verändert: ${touched.join(', ')}`)

  // Separate baseline missing from checksum changed
  const baseline: string[] = []
  const changed: string[] = []
  for (const f of input.protectedFiles) {
    const nf = norm(f)
    if (touched.includes(nf)) continue // Already reported via diff
    if (beforeNorm[nf] === undefined || afterNorm[nf] === undefined) {
      baseline.push(nf)
    } else if (afterNorm[nf] !== beforeNorm[nf]) {
      changed.push(nf)
    }
  }

  if (baseline.length > 0) reasons.push(`Baseline fehlt für geschützten Test: ${baseline.join(', ')}`)
  if (changed.length > 0) reasons.push(`Prüfsumme geschützter Tests abweichend: ${changed.join(', ')}`)

  if (!input.workerFinished) {
    return {
      verdict: 'haengt',
      reasons: ['Worker ist nicht fertig geworden (Timeout oder Stillstand).'].concat(reasons),
    }
  }

  if (input.testExitCode === null) reasons.push('Testbefehl ist nicht gelaufen.')
  else if (input.testExitCode !== 0) reasons.push(`Testbefehl rot (Exit ${input.testExitCode}).`)

  return { verdict: reasons.length === 0 ? 'gruen' : 'rot', reasons }
}

/**
 * Weitere ROT-Gründe aus den Prüfungen des Läufers (Ersetzungen, Pflicht-Gates,
 * verbotene Muster, Config-Schutz). Ein grünes Urteil wird rot; ein hängendes
 * bleibt hängend, bekommt die Gründe aber mit.
 */
export function mitGruenden(gate: GateResult, gruende: readonly string[]): GateResult {
  if (gruende.length === 0) return gate
  return { verdict: gate.verdict === 'gruen' ? 'rot' : gate.verdict, reasons: [...gate.reasons, ...gruende] }
}

/**
 * Lagebild eines hängenden Workers (L8), aufgenommen VOR dem Stoppen — danach
 * ist die Pane weg. Was der Läufer nicht weiß, steht als null da, nicht geschätzt.
 */
export interface GateDiagnose {
  laufzeitSek: number
  tokens: { input: number; output: number } | null
  /** ISO-Zeitpunkt der letzten Aktivität laut Usage-Datei; null = unbekannt. */
  letzteAktivitaet: string | null
  paneTail: string[]
}

/** Was als gate-<n>-<v>.json auf der Platte liegt. */
export interface GateRecord extends GateResult {
  testOutput: string
  /** Hinweise, die das Urteil nicht ändern (L10). Alte Gates haben keine. */
  warnungen: string[]
  diagnose?: GateDiagnose | null
}

/**
 * Hinweise aus der Testausgabe. Sie ändern das Urteil nicht: ein gefilterter
 * Lauf kann zu Recht grün sein, nur prüft er dann weniger, als der Name sagt.
 */
export function testWarnungen(output: string): string[] {
  const warnungen: string[] = []
  // pytest: „== 3 passed, 41 deselected in 0.5s ==“ bzw. „collected 44 items / 41 deselected“
  const deselected = [...output.matchAll(/\b(\d+) deselected\b/g)].map(m => Number(m[1]))
  const n = Math.max(0, ...deselected)
  if (n > 0) warnungen.push(`${n} Tests deselected — -k filtert, nur für den Abnahmetest gedacht`)
  return warnungen
}

/** Liest ein Gate tolerant: alte Gates ohne warnungen/diagnose, kaputte Felder → Leerwerte. */
export function readGateRecord(raw: unknown): GateRecord {
  const g = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const verdict = g.verdict === 'gruen' || g.verdict === 'haengt' ? g.verdict : 'rot'
  const d = g.diagnose
  return {
    verdict,
    reasons: strings(g.reasons),
    testOutput: typeof g.testOutput === 'string' ? g.testOutput : '',
    warnungen: strings(g.warnungen),
    diagnose: d && typeof d === 'object' ? d as GateDiagnose : null,
  }
}

/** Eine wörtliche Ersetzung aus dem Auftrag (L11). */
export interface Ersetzung {
  datei: string
  alt: string
  neu: string
}

function vorkommen(text: string, teil: string): number {
  if (!teil) return 0
  let n = 0
  for (let i = text.indexOf(teil); i !== -1; i = text.indexOf(teil, i + teil.length)) n++
  return n
}

/**
 * Prüft die Ersetzungen am Baum nach dem Worker (L11). Ein grüner Test sagt nicht,
 * dass jede Fundstelle umgestellt ist — die Zählung schon. Enthält `neu` den Text
 * `alt`, zählen die Vorkommen innerhalb von `neu` nicht als Rest.
 */
export function pruefeErsetzungen(ersetzungen: readonly Ersetzung[], lesen: (datei: string) => string | null): string[] {
  const reasons: string[] = []
  for (const e of ersetzungen) {
    const inhalt = lesen(e.datei)
    if (inhalt === null) {
      reasons.push(`Ersetzung in ${e.datei}: Datei nicht lesbar.`)
      continue
    }
    const rest = vorkommen(inhalt, e.alt) - vorkommen(e.neu, e.alt) * vorkommen(inhalt, e.neu)
    if (rest > 0) reasons.push(`Ersetzung in ${e.datei}: „${e.alt}“ kommt noch ${rest}× vor.`)
    if (e.neu && !inhalt.includes(e.neu)) reasons.push(`Ersetzung in ${e.datei}: „${e.neu}“ fehlt.`)
  }
  return reasons
}

/**
 * Geänderte Dateien, die der Auftrag nicht nennt (L11): weder in `dateien` (ein
 * Eintrag auf `/` gilt als Verzeichnis) noch geschützter Test noch Testpfad.
 * Nur ein Hinweis — der Worker darf Hilfsdateien anlegen, der Architekt soll es sehen.
 */
export function diffAusserhalbAuftrag(
  changed: readonly string[],
  auftrag: { dateien: readonly string[]; prot: readonly string[]; testpfade: readonly string[] },
): string[] {
  const dateien = auftrag.dateien.map(norm)
  const prot = new Set(auftrag.prot.map(norm))
  return changed.map(norm).filter(f =>
    !prot.has(f)
    && !dateien.some(d => d === f || (d.endsWith('/') && f.startsWith(d)))
    && !isTestPath(f, auftrag.testpfade),
  )
}
