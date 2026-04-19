/**
 * Build the prompt sent to the /launch skill in projectlauncher/.
 *
 * The prompt is deliberately written in a natural, engaging tone — LLMs
 * respond with richer output to human-sounding prompts than to clinical
 * bullet-lists. See memory/feedback_prompt_style.md for context.
 */

export interface LauncherPromptInput {
  /** Absolute path to the existing project directory. */
  projectDir: string
  /**
   * Relative path (inside projectDir) to the requirements file, if we copied
   * an external file in. Omit if the user put the requirements in the dir
   * themselves and we don't want to prescribe a location.
   */
  requirementsRelPath?: string
  /** Optional free-form context the user typed in the dialog. */
  extraContext?: string
}

const BOOX_BASELINE =
  '/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox'

export function buildLauncherPrompt(input: LauncherPromptInput): string {
  const reqHint = input.requirementsRelPath
    ? `Die Anforderungsdatei: ${input.requirementsRelPath} (relativ zum Projekt-Verzeichnis).\n\n`
    : ''

  const extra = input.extraContext?.trim()
    ? `Zusätzlicher Kontext von cipher:\n\n${input.extraContext.trim()}\n\n`
    : ''

  return `Hey, cipher setzt ein neues Projekt auf. In Obsidian hat er schon ein Verzeichnis angelegt und sein Konzept dort abgelegt:

    ${input.projectDir}

${reqHint}Lies die Anforderungen gründlich — nicht oberflächlich — und versteh, worum es wirklich geht, bevor du scaffoldest.

Das Verzeichnis existiert schon, also merge das Template rein statt neu anzulegen: vorhandene Dateien bleiben, \`.claude/\`, \`docs/SPEC.md\`-Skelett, \`.gitignore\`, Platzhalter etc. kommen dazu.

Qualitäts-Baseline: ${BOOX_BASELINE}
Schau dir an, wie tief die ADRs, die Modulstruktur und die Referenzen dort sind. Der Launcher-Output muss dieses Niveau anstreben. Nutz Subagenten parallel — einer für Requirements-Tiefenanalyse, einer für Tech-Stack + Referenz-Projekt-Matching, einer für ADR-Ableitung aus den Anforderungen.

${extra}Wenn du fertig bist, ruf das MCP-Tool \`kickoff_complete\` auf mit \`{ projectPath, projectName, detectedStack }\`. Als Fallback: schreib eine leere Datei \`.kickoff-complete\` ins Projekt-Verzeichnis.

/launch`
}
