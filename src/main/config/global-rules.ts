// src/main/config/global-rules.ts — Global base rules from Cyber-Factory-Pack
//
// These rules are injected into EVERY entity's CLAUDE.md before the persona block.
// They encode the universal "Tugenden" from the Whitepaper.
// Storage: ~/.config/cipher-mux/global-rules.md (file-based, editable in Preset Editor)
//
// REQ-GLOBAL-001: Read global-rules.md at app start, skip silently if missing/empty
// REQ-GLOBAL-002: Inject into every session prompt (Layer 1 in 5-layer model)
// REQ-GLOBAL-003: Warn if file exceeds ~1000 tokens (4000 chars; Kontext-Diät 2026-10-24, vorher 8000)

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/** Path to the global rules markdown file. */
export const GLOBAL_RULES_PATH = path.join(
  os.homedir(),
  '.config/cipher-mux/global-rules.md',
)

/**
 * Approximate character threshold for ~1000 tokens.
 * Rough heuristic: 1 token ≈ 4 chars for mixed German/English text.
 * Ziel des Defaults sind 3.000 Zeichen; die Schwelle lässt Luft für eigene Regeln.
 */
export const TOKEN_WARNING_CHAR_THRESHOLD = 4000

/**
 * Default global rules text.
 *
 * Nur, was jede Rolle in jedem Turn braucht (Kontext-Diät 2026-10-24): alles
 * Tool-spezifische steht in der Tool-Beschreibung, Rollen-spezifische in der
 * preset.md, Projekt-spezifisches in der Projekt-CLAUDE.md. Diese Sektion
 * landet in jeder Rollen- und Workspace-Projekt-CLAUDE.md — jedes Zeichen hier
 * wird in jedem Turn jeder Session neu gelesen.
 */
export const DEFAULT_GLOBAL_RULES = `### Grundregeln

1. **Plan vor Code.** Nicht-Triviales: betroffene Dateien, Reihenfolge, Tests zeigen, Bestätigung abwarten. Die Spec ist Wahrheitsquelle; weicht Code ab, zuerst die Spec ändern. Neuer Code braucht Verhaltenstests.
2. **Off-Limits ohne Auftrag:** Auth, Payment, Migrationen, \`.env\`, Credentials. Keine PII leaken, keine Geheimnisse lesen, zitieren oder in Code schreiben.
3. **Risk-Review vor Commit:** was geändert, was gelöscht, was bricht.
4. **„Weiß ich nicht" ist valide.** Keine erfundenen Bibliotheken, Endpunkte, Versionen.

### Pre-Work-Check

Vor jedem Arbeitsbeginn, auch bei klarem Handoff — Handoffs und Specs können veraltet sein:

1. **Schon gebaut?** Ist-Zustand per grep gegen den Auftrag prüfen. Vorhanden → nicht neu bauen, Vollständigkeit prüfen und melden.
2. **Arbeitet schon jemand dran?** \`mux_sessions\`, ggf. \`capture-pane\`. Läuft etwas am selben Repo → koordinieren, nicht in denselben Working-Tree schreiben.
3. **Parallel schreibende Worker** → je eigener Worktree und Branch, Merge nach \`main\` erst nach Grün.

### Wissen ablegen

Was über die Session hinaus gilt, wird sichtbar: Note (\`mux_notes_create\`) oder Übergabe (\`mux_notes_handoff_create\` + \`_dispatch\`). Notes beim **Titel** nennen, nie bei der ID. Ein Learning gehört an genau eine Stelle: Tool-spezifisch → Tool-Beschreibung, eine Rolle → deren \`preset.md\`, ein Projekt → dessen CLAUDE.md, alle Rollen → hier, Nachschlagewissen → \`docs/\` mit Zeiger. Format hier: \`- **Titel:** was ab jetzt gilt. Quelle: woher.\`

### Kontext

Zuschnitt statt Vorladen: lies, was der Auftrag braucht, nicht, was es gibt. Wer Arbeit weitergibt, gibt Zeiger (Pfad, Note-Titel), keinen kopierten Inhalt.

Läuft im Workspace ein Systems Engineer, gehen Übergaben und Reports an ihn, nicht an die Folgerolle: höchstens ~500 Tokens — Ergebnis, offene Punkte, Pfad oder Note-Titel der Langfassung.`

/**
 * Ensure the global-rules.md file exists. Creates it with DEFAULT_GLOBAL_RULES
 * on first install. Existing files are NEVER overwritten.
 */
export function ensureGlobalRulesFile(): void {
  if (fs.existsSync(GLOBAL_RULES_PATH)) return
  const dir = path.dirname(GLOBAL_RULES_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(GLOBAL_RULES_PATH, DEFAULT_GLOBAL_RULES, 'utf-8')
}

/**
 * Get the current global rules text from the file.
 * Falls back to DEFAULT_GLOBAL_RULES if file doesn't exist.
 */
export function getGlobalRules(): string {
  try {
    return fs.readFileSync(GLOBAL_RULES_PATH, 'utf-8')
  } catch {
    return DEFAULT_GLOBAL_RULES
  }
}

/**
 * Save updated global rules to the file.
 */
export function setGlobalRules(rules: string): void {
  const dir = path.dirname(GLOBAL_RULES_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(GLOBAL_RULES_PATH, rules, 'utf-8')
}

/** Cached global rules content, loaded once at app start. */
let cachedGlobalRules: string | null = null

/**
 * Load global-rules.md at app start (REQ-GLOBAL-001).
 * Caches the content for injection into sessions.
 * Logs a warning if file exceeds ~1000 tokens (REQ-GLOBAL-003).
 * Returns the loaded content (empty string if file missing/empty).
 */
export function loadGlobalRulesOnStartup(): string {
  ensureGlobalRulesFile()
  const content = getGlobalRules()

  // If file is empty or only whitespace, treat as absent
  if (!content.trim()) {
    cachedGlobalRules = ''
    return ''
  }

  // REQ-GLOBAL-003: Warn if content exceeds ~2000 tokens
  if (content.length > TOKEN_WARNING_CHAR_THRESHOLD) {
    console.warn(
      `[GlobalRules] WARNING: global-rules.md is ${content.length} chars (~${Math.round(content.length / 4)} tokens). ` +
      `Recommended max is ~1000 tokens (${TOKEN_WARNING_CHAR_THRESHOLD} chars). Large rules consume context in every session.`,
    )
  }

  cachedGlobalRules = content
  return content
}

/**
 * Get the cached global rules content (loaded at startup).
 * Falls back to reading the file if not yet loaded.
 */
export function getCachedGlobalRules(): string {
  if (cachedGlobalRules === null) {
    return loadGlobalRulesOnStartup()
  }
  return cachedGlobalRules
}

/**
 * Invalidate the cached global rules (e.g. after user edits in UI).
 */
export function invalidateGlobalRulesCache(): void {
  cachedGlobalRules = null
}

/**
 * Resolve template variables in a persona block.
 *
 * Variables:
 *   {{display_name}}        — User's display name from companion memory
 *   {{user_profile_yaml}}   — Full user profile as YAML
 *   {{evolved_annotations}} — Tone corrections accepted by the user
 *
 * If a variable cannot be resolved (empty source), it is replaced with
 * an empty string — no error, no default phrase.
 */
export function resolveTemplateVariables(
  text: string,
  context: {
    displayName?: string
    userProfileYaml?: string
    evolvedAnnotations?: string
  },
): string {
  return text
    .replace(/\{\{display_name\}\}/g, context.displayName ?? '')
    .replace(/\{\{user_profile_yaml\}\}/g, context.userProfileYaml ?? '')
    .replace(/\{\{evolved_annotations\}\}/g, context.evolvedAnnotations ?? '')
}

/**
 * Build the full injection block: global rules + persona character block.
 * This is prepended to the entity's CLAUDE.md before session start.
 */
export function buildInjectionBlock(
  globalRules: string,
  characterBlock: string,
): string {
  const parts: string[] = []

  if (globalRules.trim()) {
    parts.push(globalRules.trim())
  }

  if (characterBlock.trim()) {
    parts.push(characterBlock.trim())
  }

  return parts.join('\n\n')
}
