// src/renderer/components/TestcaseView.tsx
// Specialized view for testcase notes: tri-state checkboxes, comments,
// status bar, screenshot support, feature-request export.

import { h } from 'preact'
import { useState, useMemo, useCallback, useEffect, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type {
  ParsedTestcase,
  TestcaseItem,
  TestcaseSection,
  TestcaseStatus,
  TestcaseSummary,
  TestcaseResolution,
} from '../../main/notes/testcase-parser'

// ─── Status cycling ─────────────────────────────────────────

function cycleStatus(status: TestcaseStatus): TestcaseStatus {
  if (status === 'open') return 'pass'
  if (status === 'pass') return 'fail'
  return 'open'
}

// ─── Resolution cycling ─────────────────────────────────

const RESOLUTION_CYCLE: TestcaseResolution[] = ['unresolved', 'in_review', 'addressed', 'fixed', 'wont_fix']

function cycleResolution(current: TestcaseResolution | undefined): TestcaseResolution {
  const idx = RESOLUTION_CYCLE.indexOf(current ?? 'unresolved')
  return RESOLUTION_CYCLE[(idx + 1) % RESOLUTION_CYCLE.length]
}

const RESOLUTION_LABELS: Record<TestcaseResolution, string> = {
  unresolved: '?',
  in_review: 'REV',
  addressed: 'ADDR',
  fixed: 'FIX',
  wont_fix: 'WONT',
}

// ─── Filter types ───────────────────────────────────────────

export type FilterMode = 'neutral' | 'positive' | 'negative'

export interface StatusFilters {
  pass: FilterMode
  fail: FilterMode
  open: FilterMode
}

export interface ResolutionFilters {
  unresolved: FilterMode
  in_review: FilterMode
  addressed: FilterMode
  fixed: FilterMode
  wont_fix: FilterMode
}

export function cycleFilterMode(mode: FilterMode): FilterMode {
  if (mode === 'neutral') return 'positive'
  if (mode === 'positive') return 'negative'
  return 'neutral'
}

export function applyStatusFilters(
  sections: TestcaseSection[],
  filters: StatusFilters,
): TestcaseSection[] {
  const positives = (Object.keys(filters) as TestcaseStatus[]).filter(k => filters[k] === 'positive')
  const negatives = (Object.keys(filters) as TestcaseStatus[]).filter(k => filters[k] === 'negative')

  // No active filters → show all
  if (positives.length === 0 && negatives.length === 0) return sections

  return sections
    .map(s => ({
      ...s,
      items: s.items.filter(item => {
        // Positive filters: item must match ANY positive (OR)
        if (positives.length > 0 && !positives.includes(item.status)) return false
        // Negative filters: item must NOT match ANY negative
        if (negatives.includes(item.status)) return false
        return true
      }),
    }))
    .filter(s => s.items.length > 0)
}

export function applyResolutionFilters(
  sections: TestcaseSection[],
  filters: ResolutionFilters,
): TestcaseSection[] {
  const resKeys = Object.keys(filters) as TestcaseResolution[]
  const positives = resKeys.filter(k => filters[k] === 'positive')
  const negatives = resKeys.filter(k => filters[k] === 'negative')

  if (positives.length === 0 && negatives.length === 0) return sections

  return sections
    .map(s => ({
      ...s,
      items: s.items.filter(item => {
        // Resolution filters only apply to fail items
        if (item.status !== 'fail') return true
        const res = item.resolution ?? 'unresolved'
        if (positives.length > 0 && !positives.includes(res)) return false
        if (negatives.includes(res)) return false
        return true
      }),
    }))
    .filter(s => s.items.length > 0)
}

// ─── Checkbox CSS Art ───────────────────────────────────────

function CheckboxIcon({ status }: { status: TestcaseStatus }) {
  return (
    <span class={`tc-checkbox tc-checkbox--${status}`}>
      {status === 'pass' && <span class="tc-checkbox__mark" />}
      {status === 'fail' && <span class="tc-checkbox__cross" />}
    </span>
  )
}

// ─── Single Item ────────────────────────────────────────────

interface TestcaseItemRowProps {
  item: TestcaseItem
  onToggle: (id: string) => void
  onResolutionCycle: (id: string) => void
  onCommentChange: (id: string, comment: string) => void
  onScreenshot: (id: string) => void
  onFeatureRequest: (id: string) => void
  readOnly: boolean
}

function TestcaseItemRow({ item, onToggle, onResolutionCycle, onCommentChange, onScreenshot, onFeatureRequest, readOnly }: TestcaseItemRowProps) {
  const [showComment, setShowComment] = useState(!!item.comment)
  const res = item.resolution ?? 'unresolved'

  return (
    <div class={`tc-item tc-item--${item.status}`}>
      <div class="tc-item__main">
        <button
          class="tc-item__toggle"
          onClick={() => !readOnly && onToggle(item.id)}
          disabled={readOnly}
          title={readOnly ? 'Archived' : `${item.status} → ${cycleStatus(item.status)}`}
        >
          <CheckboxIcon status={item.status} />
        </button>
        {item.status === 'fail' && !readOnly && (
          <button
            class={`tc-item__resolution tc-item__resolution--${res}`}
            onClick={() => onResolutionCycle(item.id)}
            title={`Resolution: ${res} → ${cycleResolution(item.resolution)}`}
          >
            {RESOLUTION_LABELS[res]}
          </button>
        )}
        <span class="tc-item__id">{item.id}</span>
        <span class="tc-item__desc">{item.description}</span>
        {!readOnly && (
          <div class="tc-item__actions">
            <button
              class="tc-item__action"
              onClick={() => setShowComment(!showComment)}
              title="Comment"
            >
              <span class="tc-action-icon">{"/*"}</span>
            </button>
            <button
              class="tc-item__action"
              onClick={() => onScreenshot(item.id)}
              title="Screenshot"
            >
              <span class="tc-action-icon">[:]</span>
            </button>
            {item.status === 'fail' && (
              <button
                class="tc-item__action tc-item__action--export"
                onClick={() => onFeatureRequest(item.id)}
                title="Export as feature request"
              >
                <span class="tc-action-icon">{">>"}</span>
              </button>
            )}
          </div>
        )}
      </div>
      {showComment && (
        <div class="tc-item__comment-row">
          <textarea
            class="tc-item__comment-input"
            value={item.comment}
            placeholder="Comment..."
            rows={1}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement
              el.style.height = 'auto'
              el.style.height = el.scrollHeight + 'px'
              onCommentChange(item.id, el.value)
            }}
            disabled={readOnly}
          />
          {item.screenshotRef && (
            <div class="tc-item__screenshot-row" title={item.screenshotRef}>
              <span class="tc-action-icon">[:]</span>
              <span class="tc-item__screenshot-path">{item.screenshotRef.replace(/^.*[\\/]/, '')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Filter Bar ─────────────────────────────────────────────

interface FilterBarProps {
  filters: StatusFilters
  resolutionFilters: ResolutionFilters
  summary: TestcaseSummary
  resolutionCounts: Record<TestcaseResolution, number>
  onToggle: (status: TestcaseStatus) => void
  onResolutionToggle: (resolution: TestcaseResolution) => void
  onRefresh: () => void
  isSnapshotActive: boolean
}

function FilterBar({ filters, resolutionFilters, summary, resolutionCounts, onToggle, onResolutionToggle, onRefresh, isSnapshotActive }: FilterBarProps) {
  const buttons: { status: TestcaseStatus; label: string; count: number }[] = [
    { status: 'pass', label: 'PASS', count: summary.pass },
    { status: 'fail', label: 'FAIL', count: summary.fail },
    { status: 'open', label: 'OPEN', count: summary.open },
  ]

  const resButtons: { resolution: TestcaseResolution; label: string }[] = [
    { resolution: 'unresolved', label: '?' },
    { resolution: 'in_review', label: 'REV' },
    { resolution: 'addressed', label: 'ADDR' },
    { resolution: 'fixed', label: 'FIX' },
    { resolution: 'wont_fix', label: 'WONT' },
  ]

  return (
    <div class="tc-filter-bar">
      {buttons.map(({ status, label, count }) => {
        const mode = filters[status]
        return (
          <button
            key={status}
            class={`tc-filter-btn tc-filter-btn--${status} tc-filter-btn--${mode}`}
            onClick={() => onToggle(status)}
            title={
              mode === 'neutral' ? `Show only ${label}` :
              mode === 'positive' ? `Exclude ${label}` :
              `Clear ${label} filter`
            }
          >
            <span class="tc-filter-btn__label">{label}</span>
            <span class="tc-filter-btn__badge">{count}</span>
          </button>
        )
      })}
      {summary.fail > 0 && (
        <>
          <span class="tc-filter-bar__sep">|</span>
          {resButtons.map(({ resolution, label }) => {
            const mode = resolutionFilters[resolution]
            const count = resolutionCounts[resolution]
            if (count === 0 && mode === 'neutral') return null
            return (
              <button
                key={resolution}
                class={`tc-filter-btn tc-filter-btn--resolution tc-filter-btn--res-${resolution} tc-filter-btn--${mode}`}
                onClick={() => onResolutionToggle(resolution)}
                title={
                  mode === 'neutral' ? `Show only ${resolution}` :
                  mode === 'positive' ? `Exclude ${resolution}` :
                  `Clear ${resolution} filter`
                }
              >
                <span class="tc-filter-btn__label">{label}</span>
                <span class="tc-filter-btn__badge">{count}</span>
              </button>
            )
          })}
        </>
      )}
      {isSnapshotActive && (
        <button
          class="tc-filter-btn tc-filter-btn--refresh"
          onClick={onRefresh}
          title="Refresh filter (re-apply to current data)"
        >
          <span class="tc-filter-btn__label">↻</span>
        </button>
      )}
    </div>
  )
}

// ─── Status Bar ─────────────────────────────────────────────

function formatResolutionBreakdown(counts: Record<TestcaseResolution, number>): string {
  const parts: string[] = []
  if (counts.fixed > 0) parts.push(`${counts.fixed} fixed`)
  if (counts.addressed > 0) parts.push(`${counts.addressed} addr`)
  if (counts.in_review > 0) parts.push(`${counts.in_review} rev`)
  if (counts.wont_fix > 0) parts.push(`${counts.wont_fix} wont`)
  if (counts.unresolved > 0) parts.push(`${counts.unresolved} unres`)
  return parts.join(', ')
}

function StatusBar({ summary, resolutionCounts }: { summary: TestcaseSummary; resolutionCounts: Record<TestcaseResolution, number> }) {
  const passPercent = summary.total > 0 ? (summary.pass / summary.total) * 100 : 0
  const failPercent = summary.total > 0 ? (summary.fail / summary.total) * 100 : 0
  const breakdown = summary.fail > 0 ? formatResolutionBreakdown(resolutionCounts) : ''

  return (
    <div class="tc-status-bar">
      <div class="tc-status-bar__progress">
        <div class="tc-status-bar__fill tc-status-bar__fill--pass" style={{ width: `${passPercent}%` }} />
        <div class="tc-status-bar__fill tc-status-bar__fill--fail" style={{ width: `${failPercent}%` }} />
      </div>
      <div class="tc-status-bar__text">
        <span class="tc-status-bar__stat tc-status-bar__stat--pass">{summary.pass} PASS</span>
        <span class="tc-status-bar__stat tc-status-bar__stat--fail">
          {summary.fail} FAIL{breakdown ? ` (${breakdown})` : ''}
        </span>
        <span class="tc-status-bar__stat tc-status-bar__stat--open">{summary.open} open</span>
        <span class="tc-status-bar__stat">/ {summary.total}</span>
      </div>
    </div>
  )
}

// ─── Main View ──────────────────────────────────────────────

interface TestcaseViewProps {
  testcase: ParsedTestcase
  onUpdate: (sections: TestcaseSection[]) => void
  onArchive: () => void
  onScreenshot: (itemId: string) => void
  onFeatureRequest: (itemId: string, description: string) => void
}

export function TestcaseView({
  testcase,
  onUpdate,
  onArchive,
  onScreenshot,
  onFeatureRequest,
}: TestcaseViewProps) {
  const { t } = useTranslation()
  const readOnly = !!testcase.frontmatter.archived
  const containerRef = useRef<HTMLDivElement>(null)
  const [filters, setFilters] = useState<StatusFilters>({ pass: 'neutral', fail: 'neutral', open: 'neutral' })
  const [resolutionFilters, setResolutionFilters] = useState<ResolutionFilters>({
    unresolved: 'neutral', in_review: 'neutral', addressed: 'neutral', fixed: 'neutral', wont_fix: 'neutral',
  })
  // Snapshot: frozen set of item IDs to display when a filter is active.
  // Prevents items from vanishing when their status is toggled while filtered.
  const [snapshotGeneration, setSnapshotGeneration] = useState(0)

  const hasActiveStatusFilter = filters.pass !== 'neutral' || filters.fail !== 'neutral' || filters.open !== 'neutral'
  const hasActiveResFilter = resolutionFilters.unresolved !== 'neutral' || resolutionFilters.in_review !== 'neutral' || resolutionFilters.addressed !== 'neutral' || resolutionFilters.fixed !== 'neutral' || resolutionFilters.wont_fix !== 'neutral'
  const hasActiveFilter = hasActiveStatusFilter || hasActiveResFilter

  // Compute snapshot IDs synchronously (during render, not post-render).
  // Intentionally omits testcase.sections from deps: snapshot must stay stable
  // across status toggles — only re-snapshot when filters or generation change.
  const snapshotIds = useMemo<Set<string> | null>(() => {
    if (!hasActiveFilter) return null
    let filtered = applyStatusFilters(testcase.sections, filters)
    filtered = applyResolutionFilters(filtered, resolutionFilters)
    return new Set(filtered.flatMap(s => s.items.map(i => i.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, resolutionFilters, snapshotGeneration])

  const handleFilterToggle = useCallback((status: TestcaseStatus) => {
    setFilters(prev => ({ ...prev, [status]: cycleFilterMode(prev[status]) }))
  }, [])

  const handleResolutionFilterToggle = useCallback((resolution: TestcaseResolution) => {
    setResolutionFilters(prev => ({ ...prev, [resolution]: cycleFilterMode(prev[resolution]) }))
  }, [])

  // REQ-TCVIEW-004: Manual refresh re-snapshots from current live data
  const handleFilterRefresh = useCallback(() => {
    setSnapshotGeneration(g => g + 1)
  }, [])

  // Register as STT target when a comment input is focused
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const api = (window as any).cipherMux
    const onFocusIn = (e: FocusEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' && (e.target as HTMLElement)?.classList?.contains('tc-item__comment-input')) {
        api?.voice?.setNotesFocus?.(true)
      }
    }
    const onFocusOut = (e: FocusEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' && (e.target as HTMLElement)?.classList?.contains('tc-item__comment-input')) {
        api?.voice?.setNotesFocus?.(false)
      }
    }
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    return () => {
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
      api?.voice?.setNotesFocus?.(false)
    }
  }, [])

  // Handle STT text insertion into focused comment input
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.voice?.onNotesInsert) return
    const unsub = api.voice.onNotesInsert((data: { text: string }) => {
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement && active.classList.contains('tc-item__comment-input')) {
        const start = active.selectionStart ?? active.value.length
        const before = active.value.slice(0, start)
        const after = active.value.slice(active.selectionEnd ?? start)
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        nativeInputValueSetter?.call(active, before + data.text + after)
        active.dispatchEvent(new Event('input', { bubbles: true }))
        active.setSelectionRange(start + data.text.length, start + data.text.length)
      }
    })
    return () => unsub()
  }, [])

  const summary = useMemo(() => {
    let total = 0, pass = 0, fail = 0, open = 0
    for (const s of testcase.sections) {
      for (const item of s.items) {
        total++
        if (item.status === 'pass') pass++
        else if (item.status === 'fail') fail++
        else open++
      }
    }
    return { total, pass, fail, open }
  }, [testcase.sections])

  const resolutionCounts = useMemo(() => {
    const counts: Record<TestcaseResolution, number> = { unresolved: 0, in_review: 0, addressed: 0, fixed: 0, wont_fix: 0 }
    for (const s of testcase.sections) {
      for (const item of s.items) {
        if (item.status === 'fail') {
          counts[item.resolution ?? 'unresolved']++
        }
      }
    }
    return counts
  }, [testcase.sections])

  // REQ-TCVIEW-002: Render from snapshot IDs (stable) with live item data (fresh status)
  const filteredSections = useMemo(() => {
    if (!snapshotIds) return testcase.sections
    return testcase.sections
      .map(s => ({ ...s, items: s.items.filter(i => snapshotIds.has(i.id)) }))
      .filter(s => s.items.length > 0)
  }, [testcase.sections, snapshotIds])

  const handleToggle = useCallback((id: string) => {
    const newSections = testcase.sections.map(s => ({
      ...s,
      items: s.items.map(item =>
        item.id === id ? { ...item, status: cycleStatus(item.status) } : item
      ),
    }))
    onUpdate(newSections)
  }, [testcase.sections, onUpdate])

  const handleResolutionCycle = useCallback((id: string) => {
    const newSections = testcase.sections.map(s => ({
      ...s,
      items: s.items.map(item => {
        if (item.id !== id || item.status !== 'fail') return item
        const next = cycleResolution(item.resolution)
        return { ...item, resolution: next === 'unresolved' ? undefined : next }
      }),
    }))
    onUpdate(newSections)
  }, [testcase.sections, onUpdate])

  const handleCommentChange = useCallback((id: string, comment: string) => {
    const newSections = testcase.sections.map(s => ({
      ...s,
      items: s.items.map(item =>
        item.id === id ? { ...item, comment } : item
      ),
    }))
    onUpdate(newSections)
  }, [testcase.sections, onUpdate])

  const handleFeatureRequest = useCallback((id: string) => {
    const item = testcase.sections.flatMap(s => s.items).find(i => i.id === id)
    if (!item) return
    const desc = `${item.id}: ${item.description}${item.comment ? '\n\n' + item.comment : ''}`
    onFeatureRequest(id, desc)
  }, [testcase.sections, onFeatureRequest])

  const allDone = summary.open === 0 && summary.total > 0

  return (
    <div class="tc-view" ref={containerRef}>
      {/* Header */}
      <div class="tc-view__header">
        <div class="tc-view__title">
          {testcase.frontmatter.title}
          {testcase.frontmatter.version && (
            <span class="tc-view__version">v{testcase.frontmatter.version}</span>
          )}
        </div>
        {readOnly && (
          <span class="tc-view__archived">Archived {testcase.frontmatter.archivedAt || ''}</span>
        )}
        {!readOnly && allDone && (
          <button class="tc-view__archive-btn" onClick={onArchive}>
            Archive
          </button>
        )}
      </div>

      {/* Status bar */}
      <StatusBar summary={summary} resolutionCounts={resolutionCounts} />

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        resolutionFilters={resolutionFilters}
        summary={summary}
        resolutionCounts={resolutionCounts}
        onToggle={handleFilterToggle}
        onResolutionToggle={handleResolutionFilterToggle}
        onRefresh={handleFilterRefresh}
        isSnapshotActive={hasActiveFilter}
      />

      {/* Summary (archived only) */}
      {readOnly && testcase.frontmatter.summary && (
        <div class="tc-view__summary">{testcase.frontmatter.summary}</div>
      )}

      {/* Sections */}
      <div class="tc-view__body">
        {filteredSections.map((section) => (
          <div key={section.title} class="tc-section">
            <div class="tc-section__title">{section.title}</div>
            {section.items.map((item) => (
              <TestcaseItemRow
                key={item.id}
                item={item}
                onToggle={handleToggle}
                onResolutionCycle={handleResolutionCycle}
                onCommentChange={handleCommentChange}
                onScreenshot={onScreenshot}
                onFeatureRequest={handleFeatureRequest}
                readOnly={readOnly}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
