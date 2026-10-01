/**
 * Modell-Listen der drei CLIs — Auswertung getrennt vom Aufruf.
 *
 * Hier stehen nur die **Parser**: Text rein, `AdapterModel[]` raus. Der Aufruf
 * der jeweiligen CLI bleibt im Adapter. Das ist kein Selbstzweck — ein Parser,
 * der eine CLI startet, laesst sich nur gegen eine echte Installation pruefen,
 * und dann prueft man beim naechsten Mal eben nicht.
 *
 * Gemessen am 2026-10-01, und die drei koennen es verschieden gut:
 *
 * | CLI | auflistbar | Quelle |
 * |---|---|---|
 * | Claude Code | **nein** | `--help` nennt Aliase als Beispiel, es gibt kein Kommando |
 * | Codex | ja | `codex debug models` → JSON mit `slug`, `display_name`, `context_window` |
 * | opencode | ja | `opencode models` → eine Zeile `anbieter/modell` je Eintrag |
 *
 * **Keine dieser Listen ist vollstaendig**, und bei opencode ist sie nicht
 * einmal stabil: sie zeigt nur Modelle angemeldeter Anbieter. Ohne Anmeldung
 * kommen acht freie zurueck, mit Anmeldung mehr. Das ist richtig so — angezeigt
 * gehoert, was benutzbar ist — aber es heisst, dass die Liste kein Katalog ist,
 * sondern eine Momentaufnahme.
 */

import type { AdapterModel } from './agent-adapter'

/**
 * Die dokumentierten Aliase der Claude-Code-CLI.
 *
 * Aus `claude --help`: *„Provide an alias for the latest model (e.g. 'fable',
 * 'opus', or 'sonnet') or a model's full name."* Das „e.g." ist wichtig — die
 * Liste ist ausdruecklich beispielhaft, nicht abschliessend. Deshalb steht
 * daneben immer das Freitextfeld, und deshalb steht hier auch kein `haiku`,
 * obwohl es ihn gibt: was die CLI nicht nennt, wird hier nicht behauptet.
 */
export const CLAUDE_CODE_MODEL_ALIASES: readonly AdapterModel[] = [
  { id: 'opus', label: 'opus', description: 'Alias auf das jeweils neueste Opus-Modell' },
  { id: 'sonnet', label: 'sonnet', description: 'Alias auf das jeweils neueste Sonnet-Modell' },
  { id: 'fable', label: 'fable', description: 'Alias auf das jeweils neueste Fable-Modell' },
]

/**
 * Wertet die Ausgabe von `codex debug models` aus.
 *
 * Der Modellname steht unter `slug`, **nicht** unter `id` — das Feld gibt es
 * dort gar nicht. Wer `id` liest, bekommt `undefined` und zeigt eine Liste
 * leerer Eintraege an; genau das ist beim Bauen einmal passiert.
 */
export function parseCodexModels(stdout: string): AdapterModel[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  const container = parsed as { models?: unknown }
  const list = Array.isArray(container?.models) ? container.models : Array.isArray(parsed) ? parsed : []
  const out: AdapterModel[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const m = entry as Record<string, unknown>
    const id = typeof m.slug === 'string' ? m.slug.trim() : ''
    if (!id) continue
    out.push({
      id,
      label: typeof m.display_name === 'string' && m.display_name.trim() !== '' ? m.display_name.trim() : id,
      ...(typeof m.context_window === 'number' ? { contextWindow: m.context_window } : {}),
      ...(typeof m.description === 'string' && m.description.trim() !== ''
        ? { description: m.description.trim() }
        : {}),
    })
  }
  return dedupeById(out)
}

/**
 * Wertet die Ausgabe von `opencode models` aus.
 *
 * Eine Zeile je Modell, Form `anbieter/modell`. Gefiltert wird auf genau diese
 * Form: die CLI schreibt gelegentlich ein Banner oder eine Warnung dazwischen,
 * und eine Zeile ohne Schraegstrich ist kein Modell.
 */
export function parseOpenCodeModels(stdout: string): AdapterModel[] {
  const out: AdapterModel[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    // Anbieter/Modell, beide nicht leer, keine Leerzeichen — alles andere ist Beiwerk.
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(line)) continue
    out.push({ id: line, label: line })
  }
  return dedupeById(out)
}

/**
 * Doppelte raus, Reihenfolge der CLI behalten.
 *
 * Die Reihenfolge ist eine Aussage — die CLI nennt in der Regel das Aktuellste
 * zuerst. Alphabetisch zu sortieren wuerde sie zerstoeren.
 */
function dedupeById(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>()
  const out: AdapterModel[] = []
  for (const m of models) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  return out
}
