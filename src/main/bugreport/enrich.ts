/**
 * Aus Diktat wird ein Bugreport.
 *
 * Der Nutzer spricht in das Beschreibungsfeld und schickt ab — dazwischen laeuft
 * dieser Schritt. Er ist **keine Voraussetzung**: scheitert er, geht der Report
 * trotzdem raus, roh und mit Vermerk. Ein Bugreport, der an seiner Veredelung
 * scheitert, ist der schlechteste denkbare Fall.
 *
 * **Das Diktat bleibt erhalten.** Was das Modell daraus macht, steht oben, das
 * Original darunter. Ein Modell, das eine Beobachtung glaettet oder eine Vermutung
 * als Tatsache formuliert, darf nicht die einzige Quelle sein — und beim
 * Nachstellen eines Fehlers zaehlt oft genau die Formulierung, die der Nutzer
 * gewaehlt hat.
 */

import { gatewayChat, LiteLlmError } from '../llm/litellm-client'
import { parseEnrichedOutput, type EnrichedBugreport } from './ollama-client'

/**
 * Die Feldnamen, die `parseEnrichedOutput` liest.
 *
 * **Diese Liste und der Prompt muessen uebereinstimmen.** Der Parser erkennt
 * Schluessel an `name:` am Zeilenanfang und Listen an `- ` darunter; ein Feld, das
 * der Prompt anders nennt, faellt still auf seinen Default zurueck. Genau das
 * haelt `test/main/bugreport-enrich.test.ts` fest.
 */
export const ERWARTETE_FELDER = [
  'title',
  'severity',
  'tags',
  'steps_to_reproduce',
  'expected_behavior',
  'actual_behavior',
  'summary',
] as const

/**
 * Systemprompt.
 *
 * Drei Dinge stehen hier mit Absicht drin:
 *
 * 1. **Das Ausgabeformat woertlich**, weil der Parser zeilenweise liest und kein
 *    JSON erwartet. Ein Modell, das hilfsbereit JSON liefert, waere unlesbar.
 * 2. **„nichts erfinden"**, weil ein Diktat loechrig ist. Fehlt ein Schritt, soll
 *    das Feld leer bleiben, statt dass das Modell eine plausible Reproduktion
 *    dichtet — ein erfundener Schritt kostet beim Nachstellen mehr Zeit als ein
 *    fehlender.
 * 3. **Die Sprache des Diktats**, weil der Nutzer deutsch spricht und ein
 *    englischer Report die Formulierung verliert, an der oft der Hinweis haengt.
 */
export const SYSTEM_PROMPT = `Du bringst ein diktiertes Fehlerprotokoll in Form. Du bist Protokollant, nicht Autor.

Gib AUSSCHLIESSLICH diese Felder aus, jedes auf einer eigenen Zeile, keine Einleitung, kein Nachwort, kein JSON, keine Codeblöcke:

title: <eine Zeile, konkret, nennt das Symptom und nicht die Vermutung>
severity: <low|mid|hi|now>
tags: [<kurze Schlagworte, 2 bis 5>]
steps_to_reproduce:
- <Schritt>
- <Schritt>
expected_behavior: <was passieren sollte>
actual_behavior: <was stattdessen passiert>
summary: <zwei bis vier Sätze>

Regeln:
- Schreibe in der Sprache des Diktats.
- Erfinde nichts. Was im Diktat nicht steht, bleibt leer — besonders Reproduktionsschritte. Ein erfundener Schritt kostet beim Nachstellen mehr Zeit als ein fehlender.
- Trenne Beobachtung von Deutung. Was der Nutzer vermutet, gehört in summary, nicht in actual_behavior.
- severity schätzt du aus der Wirkung: "now" nur bei Datenverlust oder wenn nichts mehr geht.
- Keine Höflichkeitsfloskeln, keine Anrede, keine Rückfragen.`

export interface EnrichErgebnis {
  /** Der strukturierte Report, oder `null` wenn die Anreicherung nicht geklappt hat. */
  enriched: EnrichedBugreport | null
  /** Warum es nicht geklappt hat — gehoert in den Report, damit der Ausfall sichtbar bleibt. */
  fehler?: string
  /** Welches Tier geantwortet hat. Steht im Report, damit nachvollziehbar ist, wer formuliert hat. */
  tier?: string
}

/**
 * Diktat durch das Gateway schicken.
 *
 * Wirft **nie**. Der Aufrufer bekommt entweder einen Report oder einen Grund, und
 * schickt in beiden Faellen ab.
 */
export async function enrichBugreport(
  rohtext: string,
  opts: { typ?: string; tier?: string; timeoutMs?: number; baseUrl?: string; apiKey?: string | null } = {},
): Promise<EnrichErgebnis> {
  const text = rohtext.trim()
  if (!text) return { enriched: null, fehler: 'leere Beschreibung' }

  const art = opts.typ === 'idea' ? 'Verbesserungsvorschlag' : 'Fehlermeldung'
  try {
    const antwort = await gatewayChat({
      system: SYSTEM_PROMPT,
      user: `Art: ${art}\n\nDiktat:\n${text}`,
      tier: opts.tier,
      timeoutMs: opts.timeoutMs,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
    })
    const enriched = parseEnrichedOutput(antwort)
    if (!enriched) return { enriched: null, fehler: 'Antwort nicht lesbar' }
    return { enriched, tier: opts.tier }
  } catch (err) {
    const grund =
      err instanceof LiteLlmError ? err.message : err instanceof Error ? err.message : 'unbekannter Fehler'
    return { enriched: null, fehler: grund }
  }
}

/**
 * Report-Text bauen: erst das Aufgeraeumte, dann das Original.
 *
 * Auch der Fehlerfall erzeugt einen Text — dann steht oben das Diktat und darunter,
 * warum nicht mehr daraus wurde. So sieht man am Report selbst, dass die
 * Anreicherung ausgefallen ist, statt sich zu wundern, warum er so roh aussieht.
 */
export function baueReportText(rohtext: string, ergebnis: EnrichErgebnis): string {
  const original = `## Original (Diktat)\n\n${rohtext.trim()}\n`
  const e = ergebnis.enriched
  if (!e) {
    const grund = ergebnis.fehler ? ` (${ergebnis.fehler})` : ''
    return `## Beschreibung\n\n${rohtext.trim()}\n\n> Nicht aufbereitet${grund}.\n`
  }
  const teile: string[] = []
  teile.push(`## ${e.title}\n`)
  if (e.summary) teile.push(`${e.summary}\n`)
  if (e.steps_to_reproduce.length) {
    teile.push('### Schritte\n')
    teile.push(e.steps_to_reproduce.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n')
  }
  if (e.expected_behavior) teile.push(`### Erwartet\n\n${e.expected_behavior}\n`)
  if (e.actual_behavior) teile.push(`### Tatsächlich\n\n${e.actual_behavior}\n`)
  teile.push(original)
  return teile.join('\n')
}
