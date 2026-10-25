import * as fs from 'fs'
import * as path from 'path'

/**
 * Zustand und Zählung eines Laufs (Spec §8). JSON statt SQLite-Spalten: das
 * wäre eine Migration, und die Datei ist direkt lesbar. Alle Übergänge sind
 * rein; nur load/save berühren die Platte.
 *
 * MAX_VERSUCHE ist hier und nicht im Prompt erzwungen (Spec E3).
 */

export const MAX_VERSUCHE = 2

/**
 * So viele Läuferfehler je Häppchen erlauben einen ungezählten Neustart (User-Entscheid
 * 23.10.). Der nächste eskaliert — ein Läufer, der immer wieder abbricht, kreist sonst.
 */
export const MAX_LAEUFERFEHLER = 2

export type HaeppchenStatus = 'laeuft' | 'wartet' | 'abgenommen' | 'eskaliert' | 'abgebrochen' | 'beurteilt'
/**
 * Ausgang eines Versuchs. `laeuferfehler`: der Läufer selbst ist gescheitert (Exception,
 * z. B. git-Fehler beim Commit) — weder ein Hänger noch ein Urteil über den Worker.
 */
export type Verdict = 'gruen' | 'rot' | 'haengt' | 'laeuferfehler'

export interface Versuch {
  nr: number
  gestartet: number
  beendet?: number
  verdict?: Verdict
  gatePfad?: string
  patchPfad?: string
  commit?: string
  tokensAmEnde?: { input: number; output: number }
  /** Profil und Modell, die der Worker bekam (aus local-profile.json). Spec 2026-10-12 §5. */
  profil?: string
  modell?: string
  /** Umfang des grünen Commits (Bilanz). Fehlt, wenn die Messung scheiterte. */
  dateien?: number
  diffZeilen?: number
  /**
   * L12: Dieser Fehlversuch geht auf den Architekten (falscher Zuschnitt, falscher
   * Test), nicht auf das Modell. Zählt nicht gegen MAX_VERSUCHE und nicht als Anlauf.
   */
  architektenfehler?: string
  /** L16a: Begründung, mit der der Architekt ein Vorab-Rot aus dem Testcode übersteuert hat. */
  rotGrund?: string
  /** Meldung des Läufers bei Ausgang `laeuferfehler` (oder einem Abbruch beim Aufräumen nach ROT). */
  fehler?: string
}

export interface Haeppchen {
  nummer: number
  ziel: string
  status: HaeppchenStatus
  versuche: Versuch[]
  /** Gab es beim ersten Versuch einen Abnahmetest? Für die Bilanz. */
  mitTest?: boolean
  /** Läuferfehler in diesem Häppchen (Ausgang `laeuferfehler`). Fehlt, solange es keinen gab. */
  laeuferfehler?: number
}

export interface Lauf {
  id: string
  projekt: string
  erstellt: number
  weckrufe: number
  haeppchen: Haeppchen[]
  /**
   * Branch, auf dem der Lauf begann. Ein späterer Dispatch auf einem anderen
   * Branch wird abgelehnt — sonst setzt ein Worker, der den Branch gewechselt
   * und dort den Abnahmetest geschwächt hat, die neue Basis.
   * Fehlt in Läufen aus älteren Fassungen.
   */
  branch?: string
}

export function newLauf(id: string, projekt: string, now: number, branch?: string): Lauf {
  return { id, projekt, erstellt: now, weckrufe: 0, haeppchen: [], ...(branch ? { branch } : {}) }
}

/**
 * Versuche, die gegen MAX_VERSUCHE zählen — ohne Architektenfehler und ohne Läuferfehler.
 * Ein Läuferfehler zählt von selbst nicht: der Worker ist daran nicht gescheitert.
 */
export function zaehlendeVersuche(h: Haeppchen): number {
  return h.versuche.filter(v => !v.architektenfehler && v.verdict !== 'laeuferfehler').length
}

const anzahlLaeuferfehler = (versuche: readonly Versuch[]): number => versuche.filter(v => v.verdict === 'laeuferfehler').length

/** Text, den ein „haengt“ mit grünem Gate beim Umdeuten bekommt (Altfall lf-live). */
export const ALTFALL_FEHLER = 'haengt mit grünem Gate — Absturz des Läufers vor dem Ausgang laeuferfehler (Altfall)'

const replaceH = (lauf: Lauf, h: Haeppchen): Lauf => ({
  ...lauf,
  haeppchen: lauf.haeppchen.map(x => (x.nummer === h.nummer ? h : x)),
})

export function beginVersuch(
  lauf: Lauf,
  opts: BeginOpts & { rotGrund?: string },
): { lauf: Lauf; nummer: number; versuch: number } | { error: string } {
  const r = beginOhneRotGrund(lauf, opts)
  if ('error' in r || opts.rotGrund === undefined) return r
  // Der neue Versuch ist der letzte des Häppchens; dort steht die Begründung.
  const h = r.lauf.haeppchen.find(x => x.nummer === r.nummer)!
  const versuche = [...h.versuche.slice(0, -1), { ...h.versuche[h.versuche.length - 1], rotGrund: opts.rotGrund }]
  return { ...r, lauf: replaceH(r.lauf, { ...h, versuche }) }
}

interface BeginOpts {
  nummer?: number; ziel: string; now: number; mitTest?: boolean; architektenfehler?: string
  /**
   * Altfall lf-live: Vor dem Ausgang `laeuferfehler` endete ein Absturz des Läufers als
   * „haengt“. War das Gate dieses Versuchs GRÜN, war es kein Hänger — er wird beim
   * erneuten Dispatch zum Läuferfehler. Der Läufer liest das Gate; der Zustand hier
   * bleibt ohne Platte.
   */
  letzterGateGruen?: boolean
}

/** Altfall: den letzten Versuch eines „haengt“ mit grünem Gate als Läuferfehler verbuchen. */
function altfallUmdeuten(lauf: Lauf, opts: BeginOpts): Lauf {
  if (opts.nummer === undefined || !opts.letzterGateGruen) return lauf
  const h = lauf.haeppchen.find(x => x.nummer === opts.nummer)
  const letzter = h?.versuche.at(-1)
  if (!h || !letzter || letzter.verdict !== 'haengt') return lauf
  const versuche = [...h.versuche.slice(0, -1), { ...letzter, verdict: 'laeuferfehler' as const, fehler: letzter.fehler ?? ALTFALL_FEHLER }]
  const n = anzahlLaeuferfehler(versuche)
  return replaceH(lauf, {
    ...h, versuche, laeuferfehler: n,
    ...(n > MAX_LAEUFERFEHLER ? { status: 'eskaliert' as const } : h.status === 'eskaliert' && zaehlendeVersuche({ ...h, versuche }) < MAX_VERSUCHE ? { status: 'wartet' as const } : {}),
  })
}

function beginOhneRotGrund(lauf0: Lauf, opts: BeginOpts): { lauf: Lauf; nummer: number; versuch: number } | { error: string } {
  if (lauf0.haeppchen.some(h => h.status === 'laeuft')) {
    return { error: 'Es läuft bereits ein Worker. Nacheinander (Spec E2).' }
  }
  const lauf = altfallUmdeuten(lauf0, opts)
  if (opts.architektenfehler !== undefined) return beginNachArchitektenfehler(lauf, { ...opts, architektenfehler: opts.architektenfehler })
  if (opts.nummer === undefined) {
    const nummer = lauf.haeppchen.reduce((m, h) => Math.max(m, h.nummer), 0) + 1
    const h: Haeppchen = {
      nummer, ziel: opts.ziel, status: 'laeuft', versuche: [{ nr: 1, gestartet: opts.now }],
      ...(opts.mitTest !== undefined ? { mitTest: opts.mitTest } : {}),
    }
    return { lauf: { ...lauf, haeppchen: [...lauf.haeppchen, h] }, nummer, versuch: 1 }
  }
  const h = lauf.haeppchen.find(x => x.nummer === opts.nummer)
  if (!h) return { error: `Häppchen #${opts.nummer} gibt es in diesem Lauf nicht.` }
  if (h.status === 'eskaliert') {
    const lf = h.laeuferfehler ?? 0
    return {
      error: lf > MAX_LAEUFERFEHLER
        ? `Häppchen #${h.nummer} ist eskaliert (wiederholter Läuferfehler, ${lf}×). An den User melden.`
        : `Häppchen #${h.nummer} ist eskaliert (${MAX_VERSUCHE} Versuche). An den User melden.`,
    }
  }
  if (h.status === 'abgenommen') return { error: `Häppchen #${h.nummer} ist schon abgenommen.` }
  if (h.status === 'beurteilt') return { error: `Häppchen #${h.nummer} ist schon beurteilt.` }
  if (zaehlendeVersuche(h) >= MAX_VERSUCHE) {
    return { error: `Häppchen #${h.nummer} hat ${MAX_VERSUCHE} Versuche hinter sich. An den User melden.` }
  }
  const versuch = h.versuche.length + 1
  const next: Haeppchen = {
    ...h, ziel: opts.ziel, status: 'laeuft', versuche: [...h.versuche, { nr: versuch, gestartet: opts.now }],
  }
  return { lauf: replaceH(lauf, next), nummer: h.nummer, versuch }
}

/**
 * L12: Der letzte Fehlversuch war ein Fehler des Architekten. Er wird markiert und
 * zählt nicht mehr; der neue Versuch beginnt — auch aus „eskaliert“ heraus. Höchstens
 * einmal je Häppchen: wer zweimal falsch schneidet, meldet an den User.
 */
function beginNachArchitektenfehler(
  lauf: Lauf,
  opts: { nummer?: number; ziel: string; now: number; architektenfehler: string },
): { lauf: Lauf; nummer: number; versuch: number } | { error: string } {
  if (opts.nummer === undefined) return { error: 'architektenfehler braucht haeppchen: er markiert den letzten Fehlversuch eines Häppchens.' }
  const h = lauf.haeppchen.find(x => x.nummer === opts.nummer)
  if (!h) return { error: `Häppchen #${opts.nummer} gibt es in diesem Lauf nicht.` }
  if (h.status === 'abgenommen') return { error: `Häppchen #${h.nummer} ist schon abgenommen.` }
  if (h.status === 'beurteilt') return { error: `Häppchen #${h.nummer} ist schon beurteilt.` }
  if (h.versuche.some(v => v.architektenfehler)) {
    return { error: `Häppchen #${h.nummer} hat schon einen Architektenfehler (höchstens 1 je Häppchen). An den User melden.` }
  }
  const letzter = h.versuche.at(-1)
  if (!letzter || letzter.verdict === 'gruen') {
    return { error: `architektenfehler markiert einen Fehlversuch; der letzte Versuch von #${h.nummer} ist keiner.` }
  }
  const versuch = h.versuche.length + 1
  const versuche = [...h.versuche.slice(0, -1), { ...letzter, architektenfehler: opts.architektenfehler }, { nr: versuch, gestartet: opts.now }]
  return { lauf: replaceH(lauf, { ...h, ziel: opts.ziel, status: 'laeuft', versuche }), nummer: h.nummer, versuch }
}

export function endVersuch(
  lauf: Lauf,
  nummer: number,
  patch: Partial<Versuch> & { verdict: Verdict },
  now: number,
): Lauf {
  const h = lauf.haeppchen.find(x => x.nummer === nummer)
  if (!h || h.versuche.length === 0) return lauf
  if (h.status !== 'laeuft') return lauf
  const versuche = [...h.versuche]
  versuche[versuche.length - 1] = { ...versuche[versuche.length - 1], ...patch, beendet: now }
  // Über dem Deckel eskaliert ein Läuferfehler: ein Läufer, der immer wieder abbricht, kreiste sonst.
  const lf = anzahlLaeuferfehler(versuche)
  const status: HaeppchenStatus =
    patch.verdict === 'gruen' ? 'wartet'
      : lf > MAX_LAEUFERFEHLER || zaehlendeVersuche({ ...h, versuche }) >= MAX_VERSUCHE ? 'eskaliert' : 'wartet'
  return replaceH(lauf, { ...h, versuche, status, ...(lf ? { laeuferfehler: lf } : {}) })
}

export function markAbgenommen(lauf: Lauf, nummer: number): Lauf {
  const h = lauf.haeppchen.find(x => x.nummer === nummer)
  if (!h || h.status !== 'wartet') return lauf
  const lastVersuch = h.versuche[h.versuche.length - 1]
  if (!lastVersuch || lastVersuch.verdict !== 'gruen') return lauf
  return replaceH(lauf, { ...h, status: 'abgenommen' })
}

/**
 * Urteil des Workshops (Spec 2026-10-12 §5). Anders als `markAbgenommen` auch für
 * ein ausgeschöpftes Häppchen — „selbst übernommen" ist ein Urteil über einen
 * roten Lauf. Nie für ein laufendes oder schon beurteiltes.
 */
export function markBeurteilt(lauf: Lauf, nummer: number): Lauf {
  const h = lauf.haeppchen.find(x => x.nummer === nummer)
  if (!h || (h.status !== 'wartet' && h.status !== 'eskaliert')) return lauf
  return replaceH(lauf, { ...h, status: 'beurteilt' })
}

export function countWeckruf(lauf: Lauf): Lauf {
  return { ...lauf, weckrufe: lauf.weckrufe + 1 }
}

export function abortRunning(lauf: Lauf): Lauf {
  return {
    ...lauf,
    haeppchen: lauf.haeppchen.map(h => (h.status === 'laeuft' ? { ...h, status: 'abgebrochen' } : h)),
  }
}

const STATUS: readonly HaeppchenStatus[] = ['laeuft', 'wartet', 'abgenommen', 'eskaliert', 'abgebrochen', 'beurteilt']
const num = (n: unknown, d: number): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)

/** Defensiv wie alles Persistierte: eine Datei aus einer älteren Fassung wird aufgefüllt. */
export function parseLauf(raw: unknown): Lauf | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.projekt !== 'string') return null
  const haeppchen: Haeppchen[] = []
  for (const x of Array.isArray(r.haeppchen) ? r.haeppchen : []) {
    if (!x || typeof x !== 'object') continue
    const h = x as Record<string, unknown>
    if (typeof h.nummer !== 'number' || typeof h.ziel !== 'string') continue
    const versuche: Versuch[] = []
    if (Array.isArray(h.versuche)) {
      for (let i = 0; i < h.versuche.length; i++) {
        const v = h.versuche[i]
        if (v && typeof v === 'object' && typeof (v as Versuch).nr === 'number') {
          versuche.push(v as Versuch)
        } else {
          versuche.push({ nr: i + 1, gestartet: 0, verdict: 'haengt' })
        }
      }
    }
    haeppchen.push({
      nummer: h.nummer,
      ziel: h.ziel,
      // Ohne Status weiß niemand, was daraus wurde — „abgebrochen" behauptet am wenigsten.
      status: STATUS.includes(h.status as HaeppchenStatus) ? (h.status as HaeppchenStatus) : 'abgebrochen',
      versuche,
      ...(typeof h.mitTest === 'boolean' ? { mitTest: h.mitTest } : {}),
      ...(typeof h.laeuferfehler === 'number' ? { laeuferfehler: h.laeuferfehler } : {}),
    })
  }
  return {
    id: r.id, projekt: r.projekt, erstellt: num(r.erstellt, 0), weckrufe: num(r.weckrufe, 0), haeppchen,
    ...(typeof r.branch === 'string' && r.branch ? { branch: r.branch } : {}),
  }
}

export function loadLauf(file: string): Lauf | null {
  try {
    return parseLauf(JSON.parse(fs.readFileSync(file, 'utf-8')))
  } catch {
    return null
  }
}

export function saveLauf(file: string, lauf: Lauf): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(lauf, null, 2) + '\n', 'utf-8')
  fs.renameSync(tmp, file)
}
