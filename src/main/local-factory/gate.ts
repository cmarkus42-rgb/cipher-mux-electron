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
import { isTestPath, matchGlob, PROJECT_CONFIG_RELPATH } from '../session/entity-boundaries'

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

/** Was `rotAusTestfehler` findet: Fehlerklasse, Ort (repo-relativ), ggf. Test-Hilfsname. */
export interface TestfehlerBefund {
  fehler: string
  datei: string
  /** `globalThis.<name>` oder ein Bezeichner mit führendem `__` — nicht übersteuerbar. */
  helfer: string | null
}

const FEHLERKLASSE = /\b(ReferenceError|TypeError|NameError|AttributeError)\b/
// pytest, langes Format: Absturzzeile „tests/test_x.py:6: NameError“
const PY_ABSTURZ = /^\s*(\S+\.py):\d+: (ReferenceError|TypeError|NameError|AttributeError)\b/
// Python-Rahmen: „File "x.py", line 3“ (Traceback) oder „tests/x.py:6: in test_y“ (pytest kurz)
const PY_RAHMEN = /File "([^"]+\.py)", line \d+|^\s*(\S+\.py):\d+: in /
// JS-Rahmen: „at f (/abs/x.test.js:3:9)“, TAP ohne „at“, vitest „❯ src/x.test.ts:12:14“
const JS_RAHMEN = /((?:file:\/\/)?[^\s()'"❯]+\.(?:[cm]?[jt]sx?|svelte|vue)):\d+/

/** Test-Hilfsname in einer Fehlermeldung; Python-Dunder (`__enter__`) zählen nicht. */
function hilfsname(meldung: string): string | null {
  const g = meldung.match(/\bglobalThis\.([A-Za-z_$][\w$]*)/)
  if (g) return `globalThis.${g[1]}`
  for (const m of meldung.matchAll(/(?<![\w$])__[\w$]+/g)) {
    if (!/^__\w+__$/.test(m[0])) return m[0]
  }
  return null
}

/**
 * L16a: Ist der Abnahmetest vorab aus dem falschen Grund rot — ein Fehler, dessen
 * Ort im Test selbst liegt? Maßgeblich ist der Ursprungsort: der oberste Rahmen
 * (JS) bzw. die Absturzzeile oder der letzte Rahmen (Python). Ein Produktionsfehler,
 * den der Test nur aufruft, hat seinen Ursprung in src/ und blockiert nicht.
 * Ist kein Ort lesbar, gibt es keinen Befund (fail-open).
 */
export function rotAusTestfehler(output: string, prot: readonly string[], projekt: string): TestfehlerBefund | null {
  const geschuetzt = prot.map(norm)
  const treffer = (ort: string): string | null => {
    let p = ort.replace(/^file:\/\//, '')
    if (p.startsWith('/')) {
      const rel = p.startsWith(projekt.replace(/\/+$/, '') + '/') ? p.slice(projekt.replace(/\/+$/, '').length + 1) : p
      p = rel
    }
    const n = norm(p)
    return geschuetzt.find(g => n === g || n.endsWith('/' + g)) ?? null
  }
  const zeilen = output.split('\n')
  let befund: TestfehlerBefund | null = null
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i]
    const k = z.match(FEHLERKLASSE)
    // pytest-Zusammenfassung („FAILED tests/x.py::t - NameError: …“) hat keinen Ort.
    if (!k || /^\s*(FAILED|ERROR) /.test(z)) continue
    let ort: string | null = null
    const absturz = z.match(PY_ABSTURZ)
    if (absturz) ort = absturz[1]
    for (let j = i + 1; !ort && j < Math.min(zeilen.length, i + 12); j++) {
      const a = zeilen[j].match(PY_ABSTURZ)
      if (a) ort = a[1]
    }
    for (let j = i + 1; !ort && j < Math.min(zeilen.length, i + 20); j++) {
      if (/node:|node_modules/.test(zeilen[j])) continue
      const r = zeilen[j].match(JS_RAHMEN)
      if (r) ort = r[1]
      else if (zeilen[j].match(FEHLERKLASSE)) break
    }
    for (let j = i - 1; !ort && j >= Math.max(0, i - 40); j--) {
      const r = zeilen[j].match(PY_RAHMEN)
      if (r) ort = r[1] ?? r[2]
    }
    if (!ort) continue
    const datei = treffer(ort)
    if (!datei) continue
    // Die Meldung: die Zeile selbst, bei TAP zusätzlich die „error:“-Zeile kurz davor.
    const umfeld = zeilen.slice(Math.max(0, i - 4), i).filter(x => /^\s*error: /.test(x))
    const helfer = hilfsname([...umfeld, z].join('\n'))
    if (helfer) return { fehler: k[1], datei, helfer }
    befund ??= { fehler: k[1], datei, helfer: null }
  }
  return befund
}

/** So viele Fundstellen eines verbotenen Musters nennt der Grund (L16b). */
export const MAX_FUNDSTELLEN = 5

/** `pfad` aus verboteneMuster: mit `*`/`?` ein Glob, sonst ein Präfix ab Segmentgrenze. */
function passtPfad(pfad: string, datei: string): boolean {
  if (/[*?]/.test(pfad)) return matchGlob(pfad, datei)
  const p = norm(pfad).replace(/\/+$/, '')
  return datei === p || datei.startsWith(p + '/')
}

/**
 * L16b: verbotene Muster in den hinzugefügten Zeilen (Projekt-Config). Ein Treffer
 * ist ROT — was dort steht, gehört nicht in diesen Teil des Baums, gleich ob die
 * Tests grün sind. Je Muster ein Grund mit den ersten Fundstellen.
 */
export function pruefeVerboteneMuster(
  zeilen: readonly { datei: string; zeile: number; text: string }[],
  muster: readonly { pfad: string; regex: string; grund: string }[],
): string[] {
  const reasons: string[] = []
  for (const m of muster) {
    let re: RegExp
    try { re = new RegExp(m.regex) } catch { continue } // der Parser hat das schon verworfen
    const funde = zeilen.filter(z => passtPfad(m.pfad, norm(z.datei)) && re.test(z.text))
    if (funde.length === 0) continue
    const orte = funde.slice(0, MAX_FUNDSTELLEN).map(z => `${norm(z.datei)}:${z.zeile} „${oneLineKurz(z.text)}“`)
    reasons.push(`Verbotenes Muster /${m.regex}/ unter ${m.pfad}: ${m.grund} — `
      + `${funde.length > 1 ? `${funde.length} Fundstellen: ` : ''}${orte.join('; ')}`)
  }
  return reasons
}

function oneLineKurz(s: string): string {
  const t = s.trim()
  return t.length > 120 ? t.slice(0, 119) + '…' : t
}

/**
 * Config-Schutz: Die Projekt-Config bestimmt, was der Gate prüft. Ändert der Worker
 * sie, ist der Versuch ROT — auch bei grünem Test. Auf der vollen Liste geprüft,
 * nicht auf der um sauberkeitIgnoriert gekürzten.
 */
export function configVeraendert(changed: readonly string[]): string[] {
  return changed.map(norm).includes(PROJECT_CONFIG_RELPATH)
    ? [`Projekt-Config ${PROJECT_CONFIG_RELPATH} verändert — sie gehört dem Architekten.`]
    : []
}
