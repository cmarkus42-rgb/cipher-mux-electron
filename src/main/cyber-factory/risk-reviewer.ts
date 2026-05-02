export interface RiskReviewInput {
  runId: string
  workerId: string
  changedFiles: Array<{ path: string; linesChanged: number }>
  deletedFiles: string[]
  newDependencies: Array<{ name: string; version: string; verified: boolean }>
  testsStatus: string
  offLimitsStatus?: string
  schemaChanges?: string
  apiChanges?: string
}

export function generateRiskReview(input: RiskReviewInput): string {
  const date = new Date().toISOString().split('T')[0]

  const lines: string[] = []

  // YAML frontmatter
  lines.push('---')
  lines.push(`run_id: ${input.runId}`)
  lines.push(`worker_id: ${input.workerId}`)
  lines.push(`date: ${date}`)
  lines.push('---')
  lines.push('')

  // Changed files
  lines.push('## Geaenderte Dateien')
  if (input.changedFiles.length === 0) {
    lines.push('(keine)')
  } else {
    for (const f of input.changedFiles) {
      lines.push(`- \`${f.path}\` — ${f.linesChanged} Zeilen geaendert`)
    }
  }
  lines.push('')

  // Deleted files
  lines.push('## Geloeschte Dateien')
  if (input.deletedFiles.length === 0) {
    lines.push('(keine)')
  } else {
    for (const f of input.deletedFiles) {
      lines.push(`- \`${f}\``)
    }
  }
  lines.push('')

  // New dependencies
  lines.push('## Neue Abhaengigkeiten')
  if (input.newDependencies.length === 0) {
    lines.push('(keine)')
  } else {
    for (const dep of input.newDependencies) {
      const verifiedLabel = dep.verified ? 'verifiziert' : 'NICHT verifiziert'
      lines.push(`- \`${dep.name}@${dep.version}\` — ${verifiedLabel}`)
    }
  }
  lines.push('')

  // Schema or API changes
  lines.push('## Schema- oder API-Aenderungen')
  lines.push(`DB-Schema: ${input.schemaChanges ?? '(keine)'}`)
  lines.push(`API: ${input.apiChanges ?? '(keine)'}`)
  lines.push('')

  // Dependency validation
  lines.push('## Abhaengigkeits-Validierung')
  if (input.newDependencies.length === 0) {
    lines.push('Keine neuen Pakete.')
  } else {
    lines.push('Neue Pakete:')
    for (const dep of input.newDependencies) {
      lines.push(`- ${dep.name}@${dep.version}`)
    }
    lines.push('')
    const allVerified = input.newDependencies.every((d) => d.verified)
    lines.push(`Registry-Verifizierung: ${allVerified ? 'alle verifiziert' : 'ausstehend'}`)
    lines.push('')
    const hasUnverified = input.newDependencies.some((d) => !d.verified)
    lines.push(
      `Slopsquatting-Risiko: ${hasUnverified ? 'Slopsquatting-Risiko bei nicht-verifizierten Paketen pruefen' : 'gering'}`
    )
  }
  lines.push('')

  // Off-limits status
  lines.push('## Off-Limits-Status')
  lines.push(input.offLimitsStatus ?? '(keine Beruehrung)')
  lines.push('')

  // Tests
  lines.push('## Tests')
  lines.push(input.testsStatus)

  return lines.join('\n')
}
