/**
 * Projekt-Config der Local Factory: `.cipher-mux/local-factory.json` im Ziel-Repo.
 *
 * Was ein Projekt anders braucht als der Standard — wo seine Tests liegen, welche
 * Gates Pflicht sind, was vor dem ersten Dispatch laufen muss —, steht im Projekt,
 * nicht im Rollentext. Der Parser ist defensiv: eine ungueltige Angabe wird
 * verworfen und als Hinweis gemeldet, nie geworfen. Eine kaputte Config darf
 * keinen Lauf abbrechen; sie darf nur nichts bewirken, und das sichtbar.
 *
 * Die Datei selbst ist fuer `local-factory` (und in Welle 2 fuer den Worker)
 * unter der Edit-Sperre — siehe entity-boundaries.ts.
 */
import * as fs from 'fs'
import * as path from 'path'
import { checkTestPaths, matchGlob, PROJECT_CONFIG_RELPATH } from '../session/entity-boundaries'

export const PROJEKT_CONFIG_PFAD = PROJECT_CONFIG_RELPATH

export interface PflichtGate {
  /** Glob (`*`, `**`, `?`) auf geaenderte Dateien, relativ zur Repo-Wurzel. */
  muster: string
  befehl: string
}

export interface Vorpruefung {
  befehl: string
  /** Was die Ausgabe enthalten muss (LESSONS L2: z. B. der Worktree-Pfad im `__file__`). */
  erwartet: string
}

export interface VerbotenesMuster {
  /** Glob auf die Datei, relativ zur Repo-Wurzel. */
  pfad: string
  /** Regex-Quelle, geprueft auf hinzugefuegte Diff-Zeilen. Beim Parsen kompiliert. */
  regex: string
  grund: string
}

export interface ProjektConfig {
  testpfade: string[]
  pflichtGates: PflichtGate[]
  vorpruefung: Vorpruefung | null
  worktreeVorbereitung: { befehl: string } | null
  sauberkeitIgnoriert: string[]
  verboteneMuster: VerbotenesMuster[]
}

export interface ProjektConfigErgebnis {
  config: ProjektConfig
  hinweise: string[]
}

export const LEERE_PROJEKT_CONFIG: Readonly<ProjektConfig> = Object.freeze({
  testpfade: [],
  pflichtGates: [],
  vorpruefung: null,
  worktreeVorbereitung: null,
  sauberkeitIgnoriert: [],
  verboteneMuster: [],
})

const BEKANNTE_SCHLUESSEL = new Set(Object.keys(LEERE_PROJEKT_CONFIG))

function leer(): ProjektConfig {
  return { ...LEERE_PROJEKT_CONFIG, testpfade: [], pflichtGates: [], sauberkeitIgnoriert: [], verboteneMuster: [] }
}

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

const zeige = (v: unknown): string => JSON.stringify(v) ?? String(v)

class Fehler {
  constructor(readonly text: string) {}
}

/** Eine Liste: jedes Element einzeln pruefen, Ungueltiges mit Hinweis verwerfen. */
function liste<T>(
  feld: string,
  wert: unknown,
  hinweise: string[],
  eintrag: (e: unknown) => T | Fehler,
): T[] {
  if (wert === undefined) return []
  if (!Array.isArray(wert)) {
    hinweise.push(`${feld} ist keine Liste und wird ignoriert.`)
    return []
  }
  const out: T[] = []
  for (const e of wert) {
    const r = eintrag(e)
    if (r instanceof Fehler) hinweise.push(`${feld}-Eintrag ${zeige(e)} wird ignoriert: ${r.text}`)
    else out.push(r)
  }
  return out
}

/** Prueft eine geparste Config. Wirft nie. */
export function parseProjektConfig(raw: unknown): ProjektConfigErgebnis {
  const config = leer()
  const hinweise: string[] = []
  if (!istObjekt(raw)) {
    hinweise.push(`${PROJEKT_CONFIG_PFAD} ist kein JSON-Objekt und wird ignoriert.`)
    return { config, hinweise }
  }

  for (const key of Object.keys(raw)) {
    if (!BEKANNTE_SCHLUESSEL.has(key)) hinweise.push(`Unbekannter Schluessel ${zeige(key)} wird ignoriert.`)
  }

  // Dieselbe Pruefung wie in der Rollengrenze — was dort nicht gilt, gilt hier auch nicht.
  const tp = checkTestPaths(raw.testpfade)
  config.testpfade = tp.accepted
  hinweise.push(...tp.hints)

  config.pflichtGates = liste('pflichtGates', raw.pflichtGates, hinweise, (e) => {
    if (!istObjekt(e)) return new Fehler('kein Objekt.')
    const muster = text(e.muster)
    const befehl = text(e.befehl)
    if (!muster || !befehl) return new Fehler('braucht muster und befehl.')
    return { muster, befehl }
  })

  if (raw.vorpruefung !== undefined) {
    const v = raw.vorpruefung
    const befehl = istObjekt(v) ? text(v.befehl) : null
    const erwartet = istObjekt(v) ? text(v.erwartet) : null
    if (befehl && erwartet) config.vorpruefung = { befehl, erwartet }
    else hinweise.push('vorpruefung braucht befehl und erwartet und wird ignoriert.')
  }

  if (raw.worktreeVorbereitung !== undefined) {
    const v = raw.worktreeVorbereitung
    const befehl = istObjekt(v) ? text(v.befehl) : null
    if (befehl) config.worktreeVorbereitung = { befehl }
    else hinweise.push('worktreeVorbereitung braucht befehl und wird ignoriert.')
  }

  // Nur Pfade im Repo: was hier steht, sehen Gate, Commit und Reset nicht.
  config.sauberkeitIgnoriert = liste('sauberkeitIgnoriert', raw.sauberkeitIgnoriert, hinweise, (e) => {
    const p = text(e)
    if (!p) return new Fehler('kein Pfad.')
    if (p.startsWith('/') || p.split('/').includes('..')) return new Fehler('muss relativ zur Repo-Wurzel sein, ohne „..“.')
    if (p.replace(/^(\.\/)+/, '').replace(/\/+$/, '') === '' || /^\.\/*$/.test(p)) return new Fehler('nicht die Repo-Wurzel selbst.')
    return p
  })

  config.verboteneMuster = liste('verboteneMuster', raw.verboteneMuster, hinweise, (e) => {
    if (!istObjekt(e)) return new Fehler('kein Objekt.')
    const pfad = text(e.pfad)
    const regex = text(e.regex)
    const grund = text(e.grund)
    if (!pfad || !regex || !grund) return new Fehler('braucht pfad, regex und grund.')
    try {
      new RegExp(regex)
    } catch (err) {
      return new Fehler(`ungueltige Regex (${(err as Error).message}).`)
    }
    return { pfad, regex, grund }
  })

  return { config, hinweise }
}

/** Liest die Config eines Repos. Fehlt sie: leer, ohne Hinweis. Wirft nie. */
export function ladeProjektConfig(repoPfad: string): ProjektConfigErgebnis {
  let roh: string
  try {
    roh = fs.readFileSync(path.join(repoPfad, PROJEKT_CONFIG_PFAD), 'utf-8')
  } catch {
    return { config: leer(), hinweise: [] }
  }
  try {
    return parseProjektConfig(JSON.parse(roh))
  } catch (err) {
    return { config: leer(), hinweise: [`${PROJEKT_CONFIG_PFAD} ist kein gueltiges JSON (${(err as Error).message}).`] }
  }
}

/**
 * Glob gegen einen Pfad relativ zur Repo-Wurzel: `*` und `?` bleiben in einem
 * Segment, `**` geht ueber Segmente (`**\/` auch ueber keins). Passen muss der
 * ganze Pfad. Dieselbe Implementierung wie in der Rollengrenze.
 */
export function passtGlob(muster: string, pfad: string): boolean {
  return matchGlob(muster, pfad)
}
