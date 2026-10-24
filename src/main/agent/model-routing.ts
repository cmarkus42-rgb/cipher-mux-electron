/**
 * Modell-Routing als Default.
 *
 * Gemessen vom 25.09. bis 24.10.2026: 85 % der Tokens liefen auf Opus. Nicht
 * weil jemand das entschieden hätte — `~/.claude/settings.json` setzt global
 * `"model": "opus"`, und keine Mux-Session gab ein Modell mit. Subagenten (45 %
 * der Tokens) erbten es. Die Entscheidung dazu: Opus führt (Systems Engineer),
 * Sonnet baut und prüft, Haiku arbeitet zu.
 *
 * Hier stehen nur die reinen Regeln. Verdrahtet wird in `session-manager.ts`
 * (Session-Default, Subagent-Umgebung) und in den MCP-Werkzeugen, die Sessions
 * starten (Eskalationspflicht).
 *
 * Gemessen an Claude Code 2.1.310: `CLAUDE_CODE_SUBAGENT_MODEL` bestimmt das
 * Modell eines Subagenten ohne eigenes; `model:` im Frontmatter eines Agenten
 * unter `.claude/agents/` schlägt die Variable. Kann mit der nächsten
 * CLI-Version kippen — nachmessen über `message.model` in den Session-JSONL.
 */
import * as fs from 'fs'
import * as path from 'path'

/** Modell einer Claude-Code-Session ohne Rolle (Ordner-Start, `mux_create_session`). */
export const DEFAULT_SESSION_MODEL = 'sonnet'
/** Modell der Subagenten jeder Claude-Code-Session des Mux. */
export const DEFAULT_SUBAGENT_MODEL = 'sonnet'
/** Die Variable, die Claude Code für Subagenten liest. */
export const SUBAGENT_MODEL_ENV = 'CLAUDE_CODE_SUBAGENT_MODEL'
/** Die einzige Rolle, die Opus ohne Begründung bekommt. */
export const OPUS_ROLE = 'systems-engineer'

/** Die Felder aus `agent`, die hier gelesen werden. Beide optional: ältere Configs kennen sie nicht. */
export interface ModelRoutingConfig {
  sessionModel?: string
  subagentModel?: string
}

/**
 * Ein Modellfeld aus der Config lesen.
 *
 * Fehlt es (alte Config) oder ist es kein String (Handarbeit), gilt der
 * Default. Ein leerer String ist die ausdrückliche Wahl „kein Modell
 * mitgeben" — dann entscheidet die CLI, wie vor dieser Regel.
 */
function readModelSetting(value: unknown, fallback: string): string | undefined {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function sessionModelFor(cfg: ModelRoutingConfig | undefined): string | undefined {
  return readModelSetting(cfg?.sessionModel, DEFAULT_SESSION_MODEL)
}

export function subagentModelFor(cfg: ModelRoutingConfig | undefined): string | undefined {
  return readModelSetting(cfg?.subagentModel, DEFAULT_SUBAGENT_MODEL)
}

/**
 * Darf dieser Modellname in eine Startzeile? Die Zeile wird per tmux in eine
 * Shell getippt, und der Name kommt aus MCP-Aufrufen. Erlaubt ist, was echte
 * Namen brauchen (`anthropic/claude-sonnet-5-5`, `opus[1m]`, `qwen3.8:27b`),
 * kein Leerzeichen, kein Shell-Zeichen, kein führender Bindestrich.
 */
export function isSafeModelName(model: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,127}$/.test(model)
}

/** Alias (`opus`), volle ID (`claude-opus-5-5`) oder mit Anbieter (`anthropic/…`). */
export function isOpusModel(model: string | undefined): boolean {
  return typeof model === 'string' && /opus/i.test(model)
}

export type EscalationCheck =
  | { ok: true; escalated: boolean }
  | { ok: false; error: string }

/**
 * Darf ein Agent eine Session ausdrücklich auf diesem Modell starten?
 *
 * Geprüft wird nur, was ein Aufrufer **ausdrücklich** verlangt. Ein Modell aus
 * den Einstellungen des Users (`entityModels`) oder aus der Registry ist keine
 * Eskalation, sondern eine Entscheidung — das prüft diese Funktion nicht.
 */
export function checkEscalation(args: {
  model: string | undefined
  entityId?: string
  grund?: string
}): EscalationCheck {
  if (args.model !== undefined && !isSafeModelName(args.model)) {
    return { ok: false, error: `Ungueltiger Modellname: ${JSON.stringify(args.model)}` }
  }
  if (!isOpusModel(args.model)) return { ok: true, escalated: false }
  if (args.entityId === OPUS_ROLE) return { ok: true, escalated: false }
  if (typeof args.grund === 'string' && args.grund.trim() !== '') {
    return { ok: true, escalated: true }
  }
  return {
    ok: false,
    error:
      `Opus ist dem Systems Engineer vorbehalten. Fuer eine andere Session nur als Eskalation: `
      + `eskalation.grund angeben (z. B. "zwei rote Gates in Welle 3"). Der Mux protokolliert sie als Note.`,
  }
}

/** Die Note, die eine Eskalation sichtbar macht. Nur vergebbare Tags (`mux_notes_create` weist andere ab). */
export function buildEscalationNote(args: {
  target: string
  model: string
  grund: string
  caller?: string | null
  sessionName?: string
  now?: Date
}): { title: string; body: string; tags: string[] } {
  const day = (args.now ?? new Date()).toISOString().slice(0, 10)
  const body = [
    `# Eskalation: ${args.target} auf Opus — ${day}`,
    '',
    `- **Modell:** ${args.model}`,
    `- **Grund:** ${args.grund.trim()}`,
    `- **Aufrufer:** ${args.caller ?? 'unbekannt'}`,
    ...(args.sessionName ? [`- **Session:** ${args.sessionName}`] : []),
    '',
    'Gilt fuer die Lebensdauer dieser Session. Ein Neustart faellt auf den Default der Rolle zurueck.',
  ].join('\n')
  return { title: `Eskalation: ${args.target} auf Opus — ${day}`, body, tags: ['kind:reference'] }
}

/**
 * Benannte Zuarbeit-Agenten für die Run-Verzeichnisse von Claude-Code-Rollen.
 *
 * Subagenten ohne eigenes Modell laufen über `CLAUDE_CODE_SUBAGENT_MODEL` auf
 * Sonnet — pauschal Haiku wäre zu schwach für Umsetzungsarbeit. Haiku gibt es
 * deshalb gezielt: ein Agent mit `model: haiku` im Frontmatter (schlägt die
 * Variable, gemessen an 2.1.310). Nur lesende Werkzeuge.
 */
export const ZUARBEIT_AGENTS: Readonly<Record<string, string>> = {
  'zuarbeit.md': `---
name: zuarbeit
description: Suche, Inventar, Zählen, Statusabfragen und Zusammenfassen von Dateien — alles, was nur liest und eine kurze Antwort liefert. Nicht für Umsetzung, Review oder Entscheidungen.
model: haiku
tools: Read, Grep, Glob, Bash
---
Du arbeitest zu: suchen, zählen, auflisten, zusammenfassen. Du änderst nichts.
Antworte knapp mit Fundstellen (Datei:Zeile) und Zahlen. Keine Bewertung, keine Empfehlung.
`,
}

/** Schreibt die Zuarbeit-Agenten nach `<runDir>/.claude/agents/` — bei jedem Start, sie sind Code-Vorlage. */
export function writeZuarbeitAgents(runDir: string): void {
  const dir = path.join(runDir, '.claude', 'agents')
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(ZUARBEIT_AGENTS)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf-8')
  }
}
