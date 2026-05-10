// src/main/config/global-rules.ts — Global base rules from Cyber-Factory-Pack
//
// These rules are injected into EVERY entity's CLAUDE.md before the persona block.
// They encode the universal "Tugenden" from the Whitepaper.
// Storage: ~/.config/cipher-mux/global-rules.md (file-based, editable in Preset Editor)
//
// REQ-GLOBAL-001: Read global-rules.md at app start, skip silently if missing/empty
// REQ-GLOBAL-002: Inject into every session prompt (Layer 1 in 5-layer model)
// REQ-GLOBAL-003: Warn if file exceeds ~2000 tokens (approx 1500 words / 8000 chars)

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/** Path to the global rules markdown file. */
export const GLOBAL_RULES_PATH = path.join(
  os.homedir(),
  '.config/cipher-mux/global-rules.md',
)

/**
 * Approximate character threshold for ~2000 tokens.
 * Rough heuristic: 1 token ≈ 4 chars for mixed German/English text.
 */
export const TOKEN_WARNING_CHAR_THRESHOLD = 8000

/** Default global rules text (from 02-base-rules.md, condensed for injection). */
export const DEFAULT_GLOBAL_RULES = `### Universelle Regeln

1. **Plan vor Code.** Nicht-triviale Aenderungen brauchen einen Plan: betroffene Dateien, Reihenfolge, Tests. Plan zeigen, Bestaetigung abwarten.
2. **Spec ist Wahrheitsquelle.** Code, der von der Spec abweicht, ist verdaechtig. Spec zuerst aendern, nicht den Code.
3. **Test-First.** Neuer Code braucht Tests — Verhaltens-Tests, keine Implementations-Tests.
4. **Layered Implementation.** Skelett zuerst, dann Kernlogik, dann Edge Cases, dann Refactor. Kein Mega-Prompt.
5. **Off-Limits respektieren.** Auth, Payment, Migrations, .env, Credentials — ohne expliziten Auftrag tabu.
6. **Risk-Review vor Commit.** Was geaendert, was geloescht, was bricht potenziell.
7. **"Weiss ich nicht" ist valide.** Keine erfundenen Library-Namen, API-Endpunkte oder Versionen.
8. **Token-Disziplin.** Antwort-Laenge passt zur Frage. Kein Wiederholen, keine Floskeln, kein "Hoffe das hilft".
9. **Sicherheit.** Keine PII leaken, keine Credentials lesen/zitieren, keine Default-Geheimnisse in Code.

### Companion Memory

Alle Entities haben Zugriff auf persistente Memory-Tools:
- \`companion_memory_write\` — Erinnerung speichern (mit scope: user/workspace/session)
- \`companion_memory_recall\` — letzte Eintraege abrufen (mit scope-Filter)
- \`companion_memory_search\` — Volltextsuche in Erinnerungen
- \`companion_memory_forget\` — Eintrag loeschen

Nutze Memory fuer projekt- oder user-spezifisches Wissen das ueber die Session hinaus gilt: Konventionen, Entscheidungen, Praeferenzen. Nicht fuer temporaere Notizen (dafuer \`mux_notes_create\`).

### MCP-Tool-Grundregeln

- **Session-Handoff Timing:** Nach \`mux_create_session\` mindestens 8-10s warten bevor Instruktionen gesendet werden. tmux + Shell + Claude CLI brauchen Startzeit.
- **mux_send vs. tmux send-keys:** \`mux_send\` ist fuer Inter-Session-Kommunikation (Message Bus), NICHT fuer Prompt-Input. Direkte Instruktionen via \`tmux send-keys\`.
- **Context-Monitoring:** Bei laufenden Worker-Sessions regelmaessig \`mux_context_usage\` pruefen. Bei >80% proaktiv handeln.
- **Task-Updates:** Tasks zeitnah updaten — nicht erst am Ende. Andere Sessions verlassen sich auf aktuelle Task-Stati.
- **Notes fuer Persistenz:** Wichtige Erkenntnisse, die ueber die Session hinaus gelten, als Notes anlegen (\`mux_notes_create\`).

### TTS-Guardrail

- **Baseline:** \`mux_tts_speak\` fuer Kernaussagen: Zusammenfassungen, Meilensteine, direkte Antworten. Saetze kurz und klar.
- **Nie per TTS:** Code, Pfade, IDs, technische Details — gehoeren in schriftlichen Output.
- **Override:** Entity-CLAUDE.md kann TTS erweitern (voice-relay), einschraenken oder deaktivieren (cyber-factory, debugger).

### mux_send Push-Delivery

- **Separates Enter noetig:** Nach \`mux_send\` mit Push-Delivery wird der Text in die Session eingefuegt, aber NICHT submitted. Ein zweites \`mux_send\` mit \`"\\n"\` (oder tmux send-keys Enter) ist Pflicht.
- **Pattern:** \`mux_send(text)\` → 1-2s Pause → \`mux_send("\\n")\` = Submit.
- **Ohne:** Text steht in der Eingabezeile, Session wartet — sieht aus als waere nichts angekommen.

### Lessons Learned — Entscheidungsbaum

Wenn du ein Learning erkennst (etwas das beim naechsten Mal anders laufen soll), lege es auf der richtigen Ebene ab:

\`\`\`
Learning erkannt
  → Betrifft ein spezifisches MCP-Tool?
      → JA: Tool-Description anreichern (in mcp-tools.ts)
  → Muessen ALLE Entities das wissen?
      → JA: Hier eintragen (global-rules.md)
  → Nur fuer EINE Entity relevant?
      → JA: Entity-CLAUDE.md (unter ~/.config/cipher-mux/entities/<id>/)
  → User/Projekt-spezifisch?
      → JA: Companion Memory (companion_memory_write)
\`\`\`

**Format fuer Eintraege hier:**
\`\`\`
- **[Kurztitel]:** [Was ab jetzt gilt]. Quelle: [woher das Learning kommt].
\`\`\`

### Notes-Status-Pflege

- **Status-Tag aktualisieren:** Wenn du eine Note bearbeitest oder ihren Inhalt aenderst, MUSS der \`status:\`-Tag aktualisiert werden: \`status:open\` → \`status:in-progress\` → \`status:done\` / \`status:closed\`.
- **Regel:** Kein \`mux_notes_update\` ohne passenden Status-Tag-Update. Offene Notes die aktiv bearbeitet werden → \`status:in-progress\`. Abgeschlossene Arbeit → \`status:done\` oder \`status:closed\`.
- **Gilt fuer alle Entities:** Jede Entity die Notes anlegt oder bearbeitet muss diese Konvention einhalten.

### Testcase-Konventionen

- **Testcases gehoeren in eine dedizierte Notes-System-Testcase-Note** (noteType: testcase). NICHT in Dateien unter \`docs/archiv/\`. Der TestcaseView rendert nur Notes mit \`noteType: testcase\`.
- **Format:** \`- [ ] **T-PREFIX.N** Beschreibung\` — der Parser braucht dieses exakte Checkbox+Bold-ID-Format.
- **Neue Testcases ans Ende anhaengen**, unter einer neuen \`## Section\`-Ueberschrift.`

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
 * Logs a warning if file exceeds ~2000 tokens (REQ-GLOBAL-003).
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
      `Recommended max is ~2000 tokens (${TOKEN_WARNING_CHAR_THRESHOLD} chars). Large rules consume context in every session.`,
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
