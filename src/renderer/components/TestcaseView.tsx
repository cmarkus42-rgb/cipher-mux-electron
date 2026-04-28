// src/renderer/components/TestcaseView.tsx
// Specialized view for testcase notes: tri-state checkboxes, comments,
// status bar, screenshot support, feature-request export.

import { h } from 'preact'
import { useState, useMemo, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type {
  ParsedTestcase,
  TestcaseItem,
  TestcaseSection,
  TestcaseStatus,
  TestcaseSummary,
} from '../../main/notes/testcase-parser'

// ─── Status cycling ─────────────────────────────────────────

function cycleStatus(status: TestcaseStatus): TestcaseStatus {
  if (status === 'open') return 'pass'
  if (status === 'pass') return 'fail'
  return 'open'
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
  onCommentChange: (id: string, comment: string) => void
  onScreenshot: (id: string) => void
  onFeatureRequest: (id: string) => void
  readOnly: boolean
}

function TestcaseItemRow({ item, onToggle, onCommentChange, onScreenshot, onFeatureRequest, readOnly }: TestcaseItemRowProps) {
  const [showComment, setShowComment] = useState(!!item.comment)

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
          <input
            type="text"
            class="tc-item__comment-input"
            value={item.comment}
            placeholder="Comment..."
            onInput={(e) => onCommentChange(item.id, (e.target as HTMLInputElement).value)}
            disabled={readOnly}
          />
          {item.screenshotRef && (
            <span class="tc-item__screenshot-ref" title={item.screenshotRef}>
              [img]
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Status Bar ─────────────────────────────────────────────

function StatusBar({ summary }: { summary: TestcaseSummary }) {
  const passPercent = summary.total > 0 ? (summary.pass / summary.total) * 100 : 0
  const failPercent = summary.total > 0 ? (summary.fail / summary.total) * 100 : 0

  return (
    <div class="tc-status-bar">
      <div class="tc-status-bar__progress">
        <div class="tc-status-bar__fill tc-status-bar__fill--pass" style={{ width: `${passPercent}%` }} />
        <div class="tc-status-bar__fill tc-status-bar__fill--fail" style={{ width: `${failPercent}%` }} />
      </div>
      <div class="tc-status-bar__text">
        <span class="tc-status-bar__stat tc-status-bar__stat--pass">{summary.pass} PASS</span>
        <span class="tc-status-bar__stat tc-status-bar__stat--fail">{summary.fail} FAIL</span>
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

  const handleToggle = useCallback((id: string) => {
    const newSections = testcase.sections.map(s => ({
      ...s,
      items: s.items.map(item =>
        item.id === id ? { ...item, status: cycleStatus(item.status) } : item
      ),
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
    <div class="tc-view">
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
      <StatusBar summary={summary} />

      {/* Summary (archived only) */}
      {readOnly && testcase.frontmatter.summary && (
        <div class="tc-view__summary">{testcase.frontmatter.summary}</div>
      )}

      {/* Sections */}
      <div class="tc-view__body">
        {testcase.sections.map((section) => (
          <div key={section.title} class="tc-section">
            <div class="tc-section__title">{section.title}</div>
            {section.items.map((item) => (
              <TestcaseItemRow
                key={item.id}
                item={item}
                onToggle={handleToggle}
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
