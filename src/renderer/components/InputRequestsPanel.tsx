import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import type { InputRequest, InputRequestBubble, InputRequestReviewLink } from '../../shared/types'
import { useInputRequests } from '../hooks/useInputRequests'

interface InputRequestsPanelProps {
  visible: boolean
}

export function InputRequestsPanel({ visible }: InputRequestsPanelProps) {
  const { requests, openCount, answerRequest, openReview } = useInputRequests()
  const feedRef = useRef<HTMLDivElement>(null!)

  // Auto-scroll on new requests
  useEffect(() => {
    const el = feedRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [requests.length])

  const openRequests = requests.filter((r) => r.status === 'open')
  const answeredRequests = requests.filter((r) => r.status === 'answered')

  return (
    <aside
      class="requests-panel"
      style={{ display: visible ? 'flex' : 'none' }}
    >
      <div class="requests-panel__header">
        <span>Requests</span>
        {openCount > 0 && (
          <span class="badge badge--error badge--filled">{openCount}</span>
        )}
      </div>

      <div class="requests-panel__feed" ref={feedRef}>
        {requests.length === 0 ? (
          <div class="empty-state" style={{ height: 'auto', padding: '32px 16px' }}>
            <div class="empty-state__text">No input requests</div>
          </div>
        ) : (
          <>
            {openRequests.map((req) => (
              <RequestBubble
                key={req.id}
                request={req}
                onAnswer={answerRequest}
                onOpenReview={openReview}
              />
            ))}
            {answeredRequests.length > 0 && openRequests.length > 0 && (
              <div class="requests-panel__divider">Answered</div>
            )}
            {answeredRequests.map((req) => (
              <RequestBubble
                key={req.id}
                request={req}
                onAnswer={answerRequest}
                onOpenReview={openReview}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  )
}

// ─── Individual Bubble ──────────────────────────────────

interface RequestBubbleProps {
  request: InputRequest
  onAnswer: (id: string, answer: string) => void
  onOpenReview: (filePath: string) => void
}

function RequestBubble({ request, onAnswer, onOpenReview }: RequestBubbleProps) {
  if (request.type === 'review-link') {
    return <ReviewLinkBubble request={request} onOpenReview={onOpenReview} />
  }
  return <InlineBubble request={request} onAnswer={onAnswer} />
}

// ─── Typ A: Inline Question ─────────────────────────────

function InlineBubble({ request, onAnswer }: {
  request: InputRequestBubble
  onAnswer: (id: string, answer: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(request.answer ?? request.recommendation ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null!)

  const isAnswered = request.status === 'answered'

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])

  const handleSave = useCallback(() => {
    if (!draft.trim()) return
    onAnswer(request.id, draft.trim())
    setEditing(false)
  }, [draft, onAnswer, request.id])

  const cls = [
    'request-bubble',
    'request-bubble--inline',
    isAnswered ? 'request-bubble--answered' : '',
  ].filter(Boolean).join(' ')

  return (
    <div class={cls}>
      <div class="request-bubble__project">{request.projectId}</div>
      <div class="request-bubble__question">{request.question}</div>

      {request.context && (
        <div class="request-bubble__context">{request.context}</div>
      )}

      {request.options && request.options.length > 0 && (
        <div class="request-bubble__options">
          {request.options.map((opt) => (
            <div
              key={opt.key}
              class={`request-bubble__option${opt.key === request.recommendation ? ' request-bubble__option--recommended' : ''}`}
              onClick={() => {
                if (!isAnswered) {
                  setDraft(opt.key)
                  setEditing(true)
                }
              }}
            >
              <span class="request-bubble__option-key">{opt.key}</span>
              <span class="request-bubble__option-label">{opt.label}</span>
              {opt.description && (
                <span class="request-bubble__option-desc">— {opt.description}</span>
              )}
              {opt.key === request.recommendation && (
                <span class="request-bubble__recommended-tag">empfohlen</span>
              )}
            </div>
          ))}
        </div>
      )}

      {isAnswered ? (
        <div class="request-bubble__answer">
          Antwort: <strong>{request.answer}</strong>
        </div>
      ) : editing ? (
        <div class="request-bubble__edit">
          <textarea
            ref={textareaRef}
            class="request-bubble__textarea"
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                e.preventDefault()
                handleSave()
              }
            }}
            rows={2}
          />
          <button class="btn btn--primary btn--sm" onClick={handleSave}>
            Save
          </button>
        </div>
      ) : (
        <button
          class="btn btn--sm"
          onClick={() => setEditing(true)}
        >
          Answer
        </button>
      )}

      <div class="request-bubble__time">{formatTime(request.createdAt)}</div>
    </div>
  )
}

// ─── Typ B: Review Link ─────────────────────────────────

function ReviewLinkBubble({ request, onOpenReview }: {
  request: InputRequestReviewLink
  onOpenReview: (filePath: string) => void
}) {
  const cls = [
    'request-bubble',
    'request-bubble--review',
    request.status === 'answered' ? 'request-bubble--answered' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      class={cls}
      onClick={() => onOpenReview(request.filePath)}
      style={{ cursor: 'pointer' }}
    >
      <div class="request-bubble__project">{request.projectId}</div>
      <div class="request-bubble__review-title">{request.title}</div>
      <div class="request-bubble__review-path">{request.filePath.split('/').pop()}</div>
      <div class="request-bubble__time">{formatTime(request.createdAt)}</div>
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}
