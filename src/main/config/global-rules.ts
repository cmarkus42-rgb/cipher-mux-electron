// src/main/config/global-rules.ts — Global base rules from Cyber-Factory-Pack
//
// These rules are injected into EVERY entity's CLAUDE.md before the persona block.
// They encode the universal "Tugenden" from the Whitepaper.

import { configStore } from './config-store'

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
9. **Sicherheit.** Keine PII leaken, keine Credentials lesen/zitieren, keine Default-Geheimnisse in Code.`

/**
 * Get the current global rules text from ConfigStore.
 * Falls back to DEFAULT_GLOBAL_RULES if not set.
 */
export function getGlobalRules(): string {
  const stored = configStore.get('globalRules')
  return stored ?? DEFAULT_GLOBAL_RULES
}

/**
 * Save updated global rules to ConfigStore.
 */
export function setGlobalRules(rules: string): void {
  configStore.set('globalRules', rules)
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
