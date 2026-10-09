/**
 * Gate ohne Modell (Spec §7, Schritt 6).
 *
 * Zwei unabhängige Wege prüfen den Testschutz, weil jeder eine Lücke des
 * anderen schließt: die Prüfsumme sieht Inhaltsänderungen auch an Dateien, die
 * git ignoriert; der Diff sieht jede Änderung, gleichgültig ob sie über das
 * Edit-Werkzeug oder die Shell kam — dort hat die Plugin-Grenze keine Augen.
 */

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
}

export interface GateResult {
  verdict: GateVerdict
  reasons: string[]
}

const norm = (p: string): string => p.replace(/^\.\//, '')

export function touchedProtected(changed: string[], protectedFiles: string[]): string[] {
  const prot = new Set(protectedFiles.map(norm))
  return changed.map(norm).filter(f => prot.has(f))
}

export function changedChecksums(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  return Object.keys(before).filter(f => after[f] !== before[f])
}

export function decideGate(input: GateInput): GateResult {
  if (!input.workerFinished) {
    return { verdict: 'haengt', reasons: ['Worker ist nicht fertig geworden (Timeout oder Stillstand).'] }
  }
  const reasons: string[] = []
  const touched = touchedProtected(input.changedFiles, input.protectedFiles)
  if (touched.length > 0) reasons.push(`Geschützte Tests verändert: ${touched.join(', ')}`)
  const sums = changedChecksums(input.checksumsBefore, input.checksumsAfter)
    .filter(f => !touched.includes(norm(f)))
  if (sums.length > 0) reasons.push(`Prüfsumme geschützter Tests abweichend: ${sums.join(', ')}`)
  if (input.testExitCode === null) reasons.push('Testbefehl ist nicht gelaufen.')
  else if (input.testExitCode !== 0) reasons.push(`Testbefehl rot (Exit ${input.testExitCode}).`)
  return { verdict: reasons.length === 0 ? 'gruen' : 'rot', reasons }
}
