// src/main/refinement/re-audit.ts — Requirements-Engineering audit
//
// Takes a requirements package (markdown string) and checks it against
// professional RE catalogues. Returns structured findings for gaps.

/** Required fields that must be present in every requirements package. */
export const REQUIRED_FIELDS = [
  'Projektziel',
  'Zielgruppe',
  'Funktionale Anforderungen',
  'Meta-Requirements',
  'Wirksamkeits-Test',
  'Ausgeschlossener Scope',
] as const

/** Non-functional requirement categories checked in the audit. */
export const NFR_CATEGORIES = [
  'Performance',
  'Sicherheit',
  'Wartbarkeit',
  'Skalierbarkeit',
  'Internationalisierung',
  'Barrierefreiheit',
  'Logging',
  'Observability',
  'Privacy',
  'UI/UX',
  'Test-Strategie',
] as const

export type AuditDepth = 'basic' | 'standard' | 'deep'

export interface AuditFinding {
  category: 'missing-field' | 'missing-nfr' | 'missing-interface' | 'missing-privacy' | 'missing-ux' | 'missing-test-strategy'
  severity: 'high' | 'medium' | 'low'
  description: string
  recommendation: string
}

export interface AuditResult {
  requiredFieldsPresent: string[]
  requiredFieldsMissing: string[]
  findings: AuditFinding[]
  overallStatus: 'pass' | 'gaps-found' | 'critical-gaps'
}

/**
 * Run an RE audit on a requirements package.
 *
 * @param content  The requirements markdown as string
 * @param depth    Audit depth (basic = required fields only, standard = +NFRs, deep = +all)
 * @returns        Structured audit result
 */
export function auditRequirements(content: string, depth: AuditDepth = 'standard'): AuditResult {
  const lower = content.toLowerCase()
  const findings: AuditFinding[] = []

  // Phase 1: Required field check
  const present: string[] = []
  const missing: string[] = []

  for (const field of REQUIRED_FIELDS) {
    if (contentContainsField(lower, field)) {
      present.push(field)
    } else {
      missing.push(field)
      findings.push({
        category: 'missing-field',
        severity: 'high',
        description: `Pflichtfeld "${field}" fehlt im Anforderungs-Paket.`,
        recommendation: fieldRecommendation(field),
      })
    }
  }

  // Phase 2: NFR check (standard + deep)
  if (depth !== 'basic') {
    for (const nfr of NFR_CATEGORIES) {
      if (!contentContainsField(lower, nfr)) {
        const severity = nfrSeverity(nfr, depth)
        findings.push({
          category: nfr === 'Privacy' ? 'missing-privacy'
            : nfr === 'UI/UX' ? 'missing-ux'
            : nfr === 'Test-Strategie' ? 'missing-test-strategy'
            : 'missing-nfr',
          severity,
          description: `Nicht-funktionale Anforderung "${nfr}" nicht adressiert.`,
          recommendation: `Bitte Aussage zu ${nfr} ergaenzen, auch wenn "nicht relevant" — explizit ist besser als implizit.`,
        })
      }
    }
  }

  // Phase 3: Interface/integration check (deep only)
  if (depth === 'deep') {
    const interfaceKeywords = ['schnittstelle', 'api', 'integration', 'extern', 'import', 'export']
    const hasInterface = interfaceKeywords.some(kw => lower.includes(kw))
    if (!hasInterface) {
      findings.push({
        category: 'missing-interface',
        severity: 'medium',
        description: 'Keine Aussage zu externen Schnittstellen oder Integrationen gefunden.',
        recommendation: 'Externe Systeme, APIs, Import/Export-Formate beschreiben — oder explizit als "keine" markieren.',
      })
    }
  }

  const criticalCount = findings.filter(f => f.severity === 'high').length
  const overallStatus: AuditResult['overallStatus'] =
    criticalCount > 0 ? 'critical-gaps'
    : findings.length > 0 ? 'gaps-found'
    : 'pass'

  return { requiredFieldsPresent: present, requiredFieldsMissing: missing, findings, overallStatus }
}

/** Check if the content addresses a given field (fuzzy heading/keyword match). */
function contentContainsField(lower: string, field: string): boolean {
  const fieldLower = field.toLowerCase()
  // Check for heading-style (## Field) or keyword presence
  return lower.includes(`## ${fieldLower}`)
    || lower.includes(`### ${fieldLower}`)
    || lower.includes(`**${fieldLower}`)
    || lower.includes(fieldLower)
}

function fieldRecommendation(field: string): string {
  const recs: Record<string, string> = {
    'Projektziel': 'Ein-Satz-Beschreibung: Was baut das Projekt und warum?',
    'Zielgruppe': 'Wer ist der primaere Nutzer? Persona-Beschreibung oder Nutzer-Segment.',
    'Funktionale Anforderungen': 'Was kann das System? Eingaben, Ausgaben, Zustaende.',
    'Meta-Requirements': 'Stack-Vorgaben, Constraints, Dependencies.',
    'Wirksamkeits-Test': 'Wie weiss man, dass es fertig und korrekt ist? Akzeptanz-Kriterien.',
    'Ausgeschlossener Scope': 'Was wird explizit NICHT gebaut? Hilft gegen Scope-Creep.',
  }
  return recs[field] || `Bitte "${field}" ergaenzen.`
}

function nfrSeverity(nfr: string, depth: AuditDepth): AuditFinding['severity'] {
  if (depth === 'deep') return 'medium'
  // In standard mode, critical NFRs are medium, rest low
  const critical = ['Sicherheit', 'Privacy', 'Test-Strategie']
  return critical.includes(nfr) ? 'medium' : 'low'
}
