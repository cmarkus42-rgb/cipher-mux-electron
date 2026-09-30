import { useCallback, useMemo } from 'preact/hooks'
import type {
  FindingItem,
  FindingSection,
  FindingStatus,
  ParsedFinding,
} from '../../main/notes/finding-parser'

/**
 * FindingView — review findings, parked minors and knowingly open gaps.
 *
 * Answers the question the strategy paper left open (7.1): findings stay notes
 * so they remain readable and handable, but a type of their own keeps them out
 * of the general list and gives severity and status a surface.
 *
 * Two choices carried over from what went wrong with the testcase view:
 *
 *  - The summary counts severity for OPEN findings only. A resolved critical is
 *    not a reason for a red badge, and counting it as one would make the bar
 *    useless exactly when it matters.
 *  - Status is a human's click, never derived. The testcase note filled up with
 *    entries ticked by whoever wrote them; a finding marked resolved by the
 *    role that found it is the same failure in mirror image.
 */

const STATUS_ORDER: FindingStatus[] = ['open', 'parked', 'wont_fix', 'resolved']

const STATUS_LABEL: Record<FindingStatus, string> = {
  open: 'offen',
  parked: 'geparkt',
  resolved: 'behoben',
  wont_fix: 'bleibt offen',
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--color-neon-red, #ff2d55)',
  high: 'var(--color-neon-orange, #ff9f45)',
  medium: 'var(--color-warning, #ffaa00)',
  low: 'var(--color-text-muted, #8a8f98)',
}

/** Cycle a status on click: open → parked → wont_fix → resolved → open. */
function nextStatus(current: FindingStatus): FindingStatus {
  const i = STATUS_ORDER.indexOf(current)
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length]
}

interface FindingRowProps {
  item: FindingItem
  onCycle: (item: FindingItem) => void
  onOpenFile?: (file: string, line: number | null) => void
}

function FindingRow({ item, onCycle, onOpenFile }: FindingRowProps) {
  const closed = item.status === 'resolved' || item.status === 'wont_fix'

  return (
    <div class={`fv-row${closed ? ' fv-row--closed' : ''}`}>
      <button
        class={`fv-row__status fv-row__status--${item.status}`}
        title={`${STATUS_LABEL[item.status]} — klicken zum Weiterschalten`}
        onClick={() => onCycle(item)}
      >
        {STATUS_LABEL[item.status]}
      </button>

      <span class="fv-row__id">{item.id}</span>

      {item.severity ? (
        <span
          class="fv-row__severity"
          style={{ color: SEVERITY_COLOR[item.severity] }}
          title={`Schweregrad ${item.severity}`}
        >
          {item.severity}
        </span>
      ) : (
        <span class="fv-row__severity fv-row__severity--none" title="kein Schweregrad angegeben">
          —
        </span>
      )}

      <span class="fv-row__text">
        {item.description}
        {item.comment && <span class="fv-row__comment"> // {item.comment}</span>}
      </span>

      {item.file && (
        <button
          class="fv-row__file"
          title={onOpenFile ? 'Im Editor oeffnen' : item.file}
          onClick={() => onOpenFile?.(item.file!, item.line)}
          disabled={!onOpenFile}
        >
          {item.file}{item.line !== null ? `:${item.line}` : ''}
        </button>
      )}
    </div>
  )
}

export interface FindingViewProps {
  finding: ParsedFinding
  onUpdate: (sections: FindingSection[]) => void
  /** Optional — absent in a detached window that has no editor to jump to. */
  onOpenFile?: (file: string, line: number | null) => void
}

export function FindingView({ finding, onUpdate, onOpenFile }: FindingViewProps) {
  const summary = useMemo(() => {
    let open = 0, parked = 0, resolved = 0, wontFix = 0
    const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const section of finding.sections) {
      for (const item of section.items) {
        if (item.status === 'open') {
          open++
          if (item.severity) bySeverity[item.severity]++
        } else if (item.status === 'parked') parked++
        else if (item.status === 'resolved') resolved++
        else wontFix++
      }
    }
    return { open, parked, resolved, wontFix, bySeverity }
  }, [finding.sections])

  const cycle = useCallback((target: FindingItem) => {
    const sections = finding.sections.map(section => ({
      ...section,
      items: section.items.map(item =>
        item.lineIndex === target.lineIndex && item.id === target.id
          ? { ...item, status: nextStatus(item.status) }
          : item,
      ),
    }))
    onUpdate(sections)
  }, [finding.sections, onUpdate])

  return (
    <div class="fv">
      <div class="fv__header">
        <span class="fv__title">{finding.frontmatter.title ?? 'Befunde'}</span>
        <div class="fv__summary">
          <span class="fv__count fv__count--open" title="offen">{summary.open} offen</span>
          {summary.parked > 0 && (
            <span class="fv__count fv__count--parked" title="geparkt">{summary.parked} geparkt</span>
          )}
          {summary.wontFix > 0 && (
            <span class="fv__count" title="bleibt bewusst offen">{summary.wontFix} bleibt offen</span>
          )}
          <span class="fv__count fv__count--resolved" title="behoben">{summary.resolved} behoben</span>
        </div>
      </div>

      {summary.open > 0 && (
        <div class="fv__severities" title="Schweregrade der offenen Befunde">
          {(['critical', 'high', 'medium', 'low'] as const).map(sev =>
            summary.bySeverity[sev] > 0 ? (
              <span key={sev} class="fv__sev" style={{ color: SEVERITY_COLOR[sev] }}>
                {summary.bySeverity[sev]} {sev}
              </span>
            ) : null,
          )}
        </div>
      )}

      <div class="fv__body">
        {finding.sections.map(section => (
          <div class="fv__section" key={section.title}>
            <div class="fv__section-title">{section.title}</div>
            {section.items.map(item => (
              <FindingRow
                key={`${item.id}-${item.lineIndex}`}
                item={item}
                onCycle={cycle}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
