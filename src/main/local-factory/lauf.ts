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

export type HaeppchenStatus = 'laeuft' | 'wartet' | 'abgenommen' | 'eskaliert' | 'abgebrochen'
type Verdict = 'gruen' | 'rot' | 'haengt'

export interface Versuch {
  nr: number
  gestartet: number
  beendet?: number
  verdict?: Verdict
  gatePfad?: string
  patchPfad?: string
  commit?: string
  tokensAmEnde?: { input: number; output: number }
}

export interface Haeppchen {
  nummer: number
  ziel: string
  status: HaeppchenStatus
  versuche: Versuch[]
}

export interface Lauf {
  id: string
  projekt: string
  erstellt: number
  weckrufe: number
  haeppchen: Haeppchen[]
}

export function newLauf(id: string, projekt: string, now: number): Lauf {
  return { id, projekt, erstellt: now, weckrufe: 0, haeppchen: [] }
}

const replaceH = (lauf: Lauf, h: Haeppchen): Lauf => ({
  ...lauf,
  haeppchen: lauf.haeppchen.map(x => (x.nummer === h.nummer ? h : x)),
})

export function beginVersuch(
  lauf: Lauf,
  opts: { nummer?: number; ziel: string; now: number },
): { lauf: Lauf; nummer: number; versuch: number } | { error: string } {
  if (lauf.haeppchen.some(h => h.status === 'laeuft')) {
    return { error: 'Es läuft bereits ein Worker. Nacheinander (Spec E2).' }
  }
  if (opts.nummer === undefined) {
    const nummer = lauf.haeppchen.reduce((m, h) => Math.max(m, h.nummer), 0) + 1
    const h: Haeppchen = {
      nummer, ziel: opts.ziel, status: 'laeuft', versuche: [{ nr: 1, gestartet: opts.now }],
    }
    return { lauf: { ...lauf, haeppchen: [...lauf.haeppchen, h] }, nummer, versuch: 1 }
  }
  const h = lauf.haeppchen.find(x => x.nummer === opts.nummer)
  if (!h) return { error: `Häppchen #${opts.nummer} gibt es in diesem Lauf nicht.` }
  if (h.status === 'eskaliert') {
    return { error: `Häppchen #${h.nummer} ist eskaliert (${MAX_VERSUCHE} Versuche). An den User melden.` }
  }
  if (h.status === 'abgenommen') return { error: `Häppchen #${h.nummer} ist schon abgenommen.` }
  if (h.versuche.length >= MAX_VERSUCHE) {
    return { error: `Häppchen #${h.nummer} hat ${MAX_VERSUCHE} Versuche hinter sich. An den User melden.` }
  }
  const versuch = h.versuche.length + 1
  const next: Haeppchen = {
    ...h, ziel: opts.ziel, status: 'laeuft', versuche: [...h.versuche, { nr: versuch, gestartet: opts.now }],
  }
  return { lauf: replaceH(lauf, next), nummer: h.nummer, versuch }
}

export function endVersuch(
  lauf: Lauf,
  nummer: number,
  patch: Partial<Versuch> & { verdict: Verdict },
  now: number,
): Lauf {
  const h = lauf.haeppchen.find(x => x.nummer === nummer)
  if (!h || h.versuche.length === 0) return lauf
  const versuche = [...h.versuche]
  versuche[versuche.length - 1] = { ...versuche[versuche.length - 1], ...patch, beendet: now }
  const fehlschlaege = versuche.filter(v => v.verdict === 'rot' || v.verdict === 'haengt').length
  const status: HaeppchenStatus =
    patch.verdict === 'gruen' ? 'wartet' : fehlschlaege >= MAX_VERSUCHE ? 'eskaliert' : 'wartet'
  return replaceH(lauf, { ...h, versuche, status })
}

export function markAbgenommen(lauf: Lauf, nummer: number): Lauf {
  const h = lauf.haeppchen.find(x => x.nummer === nummer)
  return h ? replaceH(lauf, { ...h, status: 'abgenommen' }) : lauf
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

const STATUS: readonly HaeppchenStatus[] = ['laeuft', 'wartet', 'abgenommen', 'eskaliert', 'abgebrochen']
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
    haeppchen.push({
      nummer: h.nummer,
      ziel: h.ziel,
      // Ohne Status weiß niemand, was daraus wurde — „abgebrochen" behauptet am wenigsten.
      status: STATUS.includes(h.status as HaeppchenStatus) ? (h.status as HaeppchenStatus) : 'abgebrochen',
      versuche: Array.isArray(h.versuche)
        ? (h.versuche.filter(v => v && typeof v === 'object' && typeof (v as Versuch).nr === 'number') as Versuch[])
        : [],
    })
  }
  return { id: r.id, projekt: r.projekt, erstellt: num(r.erstellt, 0), weckrufe: num(r.weckrufe, 0), haeppchen }
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
