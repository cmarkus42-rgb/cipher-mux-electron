import { useCallback, useMemo, useState } from 'preact/hooks'
import type {
  RequirementItem,
  RequirementSection,
  RequirementStatus,
  ParsedRequirements,
} from '../../main/notes/requirements-parser'

/**
 * RequirementsView — Anforderungen als interne Quelle, aus der Specs entstehen.
 *
 * Gleiche Bauweise wie die Befund-Ansicht, und aus denselben Gründen:
 *
 *  - Der Zustand ist ein Klick des Menschen, nie abgeleitet. Wer eine
 *    Anforderung erhebt, soll sie nicht im selben Zug als erfüllt abhaken.
 *  - Die Zusammenfassung hebt hervor, was über Fertigsein entscheidet: offene
 *    Muss-Anforderungen. Alles andere ist Zählerei.
 *  - Begründung und Quelle sind einklappbar, nicht versteckt. Nach Monaten ist
 *    das „weil" wertvoller als die Anforderung selbst, aber beim Überfliegen
 *    stört es.
 */

const STATUS_ORDER: RequirementStatus[] = ['offen', 'teilweise', 'erfuellt', 'verworfen']

const PRIORITY_COLOR: Record<string, string> = {
  muss: 'var(--color-neon-red, #ff2d55)',
  soll: 'var(--color-warning, #ffaa00)',
  kann: 'var(--color-text-muted, #8a8f98)',
}

function nextStatus(current: RequirementStatus): RequirementStatus {
  return STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length]
}

interface RowProps {
  item: RequirementItem
  onCycle: (item: RequirementItem) => void
}

function RequirementRow({ item, onCycle }: RowProps) {
  const [showWhy, setShowWhy] = useState(false)
  const closed = item.status === 'erfuellt' || item.status === 'verworfen'
  const hasWhy = !!(item.rationale || item.source)

  return (
    <div class={`rq-row${closed ? ' rq-row--closed' : ''}`}>
      <div class="rq-row__main">
        <button
          class={`rq-row__status rq-row__status--${item.status}`}
          onClick={() => onCycle(item)}
          title={`${item.status} — klicken zum Weiterschalten`}
        >
          {item.status}
        </button>

        <span class="rq-row__id">{item.id}</span>

        {item.priority ? (
          <span class="rq-row__prio" style={{ color: PRIORITY_COLOR[item.priority] }}>
            {item.priority}
          </span>
        ) : (
          <span class="rq-row__prio rq-row__prio--none" title="keine Priorität angegeben">—</span>
        )}

        <span class="rq-row__text">
          {item.text}
          {item.comment && <span class="rq-row__comment"> // {item.comment}</span>}
        </span>

        {hasWhy && (
          <button
            class="rq-row__why"
            onClick={() => setShowWhy(v => !v)}
            title="Begründung und Quelle"
          >
            {showWhy ? 'weniger' : 'warum'}
          </button>
        )}
      </div>

      {showWhy && (
        <div class="rq-row__detail">
          {item.rationale && <div><strong>weil:</strong> {item.rationale}</div>}
          {item.source && <div><strong>Quelle:</strong> {item.source}</div>}
        </div>
      )}
    </div>
  )
}

export interface RequirementsViewProps {
  requirements: ParsedRequirements
  onUpdate: (sections: RequirementSection[]) => void
}

export function RequirementsView({ requirements, onUpdate }: RequirementsViewProps) {
  const summary = useMemo(() => {
    let offen = 0, teilweise = 0, erfuellt = 0, verworfen = 0, offeneMuss = 0
    for (const s of requirements.sections) {
      for (const i of s.items) {
        if (i.status === 'offen') offen++
        else if (i.status === 'teilweise') teilweise++
        else if (i.status === 'erfuellt') erfuellt++
        else verworfen++
        if (i.priority === 'muss' && (i.status === 'offen' || i.status === 'teilweise')) offeneMuss++
      }
    }
    return { offen, teilweise, erfuellt, verworfen, offeneMuss }
  }, [requirements.sections])

  const cycle = useCallback((target: RequirementItem) => {
    onUpdate(requirements.sections.map(section => ({
      ...section,
      items: section.items.map(item =>
        item.lineIndex === target.lineIndex && item.id === target.id
          ? { ...item, status: nextStatus(item.status) }
          : item,
      ),
    })))
  }, [requirements.sections, onUpdate])

  return (
    <div class="rq">
      <div class="rq__header">
        <span class="rq__title">{requirements.frontmatter.title ?? 'Anforderungen'}</span>
        <div class="rq__summary">
          {/* Die einzige Zahl, an der Fertigsein haengt. */}
          <span
            class={`rq__count${summary.offeneMuss > 0 ? ' rq__count--blocking' : ' rq__count--clear'}`}
            title="offene Muss-Anforderungen"
          >
            {summary.offeneMuss} offen (muss)
          </span>
          <span class="rq__count">{summary.offen + summary.teilweise} offen gesamt</span>
          <span class="rq__count rq__count--done">{summary.erfuellt} erfüllt</span>
          {summary.verworfen > 0 && <span class="rq__count">{summary.verworfen} verworfen</span>}
        </div>
      </div>

      <div class="rq__body">
        {requirements.sections.map(section => (
          <div class="rq__section" key={section.title}>
            <div class="rq__section-title">{section.title}</div>
            {section.items.map(item => (
              <RequirementRow key={`${item.id}-${item.lineIndex}`} item={item} onCycle={cycle} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
