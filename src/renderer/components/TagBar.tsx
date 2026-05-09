// src/renderer/components/TagBar.tsx

import { useState, useRef, useCallback, useEffect, useMemo } from 'preact/hooks'
import { EXCLUSIVE_TAG_CLASSES } from '../../shared/constants'
import type { TagClass } from '../../shared/types'

const MAX_TAGS = 5

const DEFAULT_QUICK_TAGS = [
  'status:open',
  'status:done',
  'kind:bugreport',
  'kind:spec',
]

/** Validate tag format: must be klasse:wert */
function isValidTag(tag: string): boolean {
  return /^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(tag)
}

interface TagBarProps {
  tags: string[]
  onTagsChange: (tags: string[]) => void
  quickTags?: string[]
}

export function TagBar({ tags, onTagsChange, quickTags = DEFAULT_QUICK_TAGS }: TagBarProps) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<Array<{ tag: string; className?: string; color?: string }>>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<string[]>([])
  const [classValues, setClassValues] = useState<Record<string, string[]>>({})
  const [classColors, setClassColors] = useState<Record<string, string>>({})
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Load available tags + class data
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.notes?.tags) return
    api.notes.tags().then((repo: { tags: Record<string, { count: number }> }) => {
      setAllTags(Object.keys(repo.tags))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.notes?.tagClassRepo) return
    api.notes.tagClassRepo().then((repo: { classes: Record<string, TagClass> }) => {
      const cv: Record<string, string[]> = {}
      const cc: Record<string, string> = {}
      for (const [cls, data] of Object.entries(repo.classes)) {
        cv[cls] = data.values
        if (data.color) cc[cls] = data.color
      }
      setClassValues(cv)
      setClassColors(cc)
    }).catch(() => {})
  }, [])

  // Parse class prefix from input (e.g. "kind:" → classPrefix="kind")
  const classPrefix = useMemo(() => {
    const colonIdx = input.indexOf(':')
    if (colonIdx > 0 && colonIdx === input.length - 1) {
      return input.slice(0, colonIdx).toLowerCase()
    }
    if (colonIdx > 0) {
      return input.slice(0, colonIdx).toLowerCase()
    }
    return null
  }, [input])

  // Filter suggestions based on input — class-aware
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([])
      setHighlightIdx(-1)
      return
    }
    const lower = input.toLowerCase()

    let candidates: Array<{ tag: string; className?: string; color?: string }>

    if (classPrefix && classValues[classPrefix]) {
      // Class-scoped: show only values from this class
      const values = classValues[classPrefix]
      const partial = lower.includes(':') ? lower.split(':')[1] : ''
      candidates = values
        .filter(v => v.toLowerCase().includes(partial))
        .map(v => ({
          tag: `${classPrefix}:${v}`,
          className: classPrefix,
          color: classColors[classPrefix],
        }))
    } else {
      // Free input: search all tags
      candidates = allTags
        .filter(t => t.toLowerCase().includes(lower))
        .map(t => {
          const cls = t.includes(':') ? t.split(':')[0] : undefined
          return {
            tag: t,
            className: cls,
            color: cls ? classColors[cls] : undefined,
          }
        })
    }

    const filtered = candidates
      .filter(c => !tags.includes(c.tag))
      .slice(0, 10)

    setSuggestions(filtered)
    setHighlightIdx(-1)
  }, [input, allTags, tags, classPrefix, classValues, classColors])

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearWarning = useCallback(() => {
    if (warning) setTimeout(() => setWarning(null), 2500)
  }, [warning])

  useEffect(() => { clearWarning() }, [warning])

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed) return

    if (!isValidTag(trimmed)) {
      setWarning('Format: klasse:wert (z.B. status:open)')
      return
    }
    if (tags.includes(trimmed)) {
      setWarning('Tag bereits vorhanden')
      return
    }
    if (tags.length >= MAX_TAGS) {
      setWarning(`Max ${MAX_TAGS} Tags pro Note`)
      return
    }

    // Exclusive categories: remove existing tag of same class
    const colonIdx = trimmed.indexOf(':')
    const tagClass = colonIdx > 0 ? trimmed.slice(0, colonIdx) : null
    let newTags = [...tags]
    if (tagClass && EXCLUSIVE_TAG_CLASSES.includes(tagClass)) {
      newTags = newTags.filter(t => !t.startsWith(tagClass + ':'))
    }
    newTags.push(trimmed)

    onTagsChange(newTags)
    setInput('')
    setShowSuggestions(false)
    setHighlightIdx(-1)
  }, [tags, onTagsChange])

  const removeTag = useCallback((tag: string) => {
    onTagsChange(tags.filter(t => t !== tag))
  }, [tags, onTagsChange])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
        addTag(suggestions[highlightIdx].tag)
      } else if (suggestions.length > 0 && showSuggestions) {
        addTag(suggestions[0].tag)
      } else {
        addTag(input)
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setHighlightIdx(-1)
    } else if (e.key === 'Tab' && classPrefix && suggestions.length > 0) {
      // Tab-complete the first suggestion
      e.preventDefault()
      const target = highlightIdx >= 0 ? suggestions[highlightIdx] : suggestions[0]
      addTag(target.tag)
    }
  }, [input, suggestions, showSuggestions, addTag, highlightIdx, classPrefix])

  const toggleQuickTag = useCallback((tag: string) => {
    if (tags.includes(tag)) {
      removeTag(tag)
    } else {
      addTag(tag)
    }
  }, [tags, addTag, removeTag])

  const cycleTag = useCallback((tag: string) => {
    const colonIdx = tag.indexOf(':')
    if (colonIdx <= 0) return
    const cls = tag.slice(0, colonIdx)
    const val = tag.slice(colonIdx + 1)
    const values = classValues[cls]
    if (!values || values.length < 2) return
    const idx = values.indexOf(val)
    const nextIdx = (idx + 1) % values.length
    const newTag = `${cls}:${values[nextIdx]}`
    const newTags = tags.map(t => t === tag ? newTag : t)
    onTagsChange(newTags)
  }, [tags, classValues, onTagsChange])

  return (
    <div class="tag-bar">
      {/* Current tags as chips */}
      <div class="tag-bar__chips">
        {tags.map(tag => {
          const colonIdx = tag.indexOf(':')
          const cls = colonIdx > 0 ? tag.slice(0, colonIdx) : null
          const canCycle = !!(cls && EXCLUSIVE_TAG_CLASSES.includes(cls) && (classValues[cls]?.length ?? 0) > 1)
          const chipColor = cls ? classColors[cls] : undefined

          return (
            <span
              key={tag}
              class={`tag-bar__chip${canCycle ? ' tag-bar__chip--cyclable' : ''}`}
              style={chipColor ? { borderColor: chipColor } : undefined}
            >
              {chipColor && <span class="tag-bar__chip-dot" style={{ background: chipColor }} />}
              <span
                class="tag-bar__chip-text"
                onClick={canCycle ? () => cycleTag(tag) : undefined}
                title={canCycle ? `Click to cycle ${cls} values` : undefined}
                style={canCycle ? { cursor: 'pointer' } : undefined}
              >{tag}</span>
              <button
                class="tag-bar__chip-remove"
                onClick={() => removeTag(tag)}
                title="Tag entfernen"
              >
                &times;
              </button>
            </span>
          )
        })}

        {/* Input field */}
        <div class="tag-bar__input-wrap">
          <input
            ref={inputRef}
            class="tag-bar__input"
            type="text"
            value={input}
            placeholder={tags.length >= MAX_TAGS ? 'Max erreicht' : 'klasse:wert...'}
            disabled={tags.length >= MAX_TAGS}
            onInput={(e) => {
              setInput((e.target as HTMLInputElement).value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div ref={suggestionsRef} class="tag-bar__suggestions">
              {classPrefix && (
                <div class="tag-bar__suggestions-header">
                  {classColors[classPrefix] && (
                    <span class="tag-bar__suggestions-dot" style={{ background: classColors[classPrefix] }} />
                  )}
                  {classPrefix}:
                </div>
              )}
              {suggestions.map((s, idx) => (
                <div
                  key={s.tag}
                  class={`tag-bar__suggestion${idx === highlightIdx ? ' tag-bar__suggestion--highlighted' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); addTag(s.tag) }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                >
                  {s.color && <span class="tag-bar__suggestion-dot" style={{ background: s.color }} />}
                  {s.tag}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick-select buttons */}
      <div class="tag-bar__quick">
        {quickTags.map(qt => (
          <button
            key={qt}
            class={`tag-bar__quick-btn ${tags.includes(qt) ? 'tag-bar__quick-btn--active' : ''}`}
            onClick={() => toggleQuickTag(qt)}
            title={qt}
          >
            {qt.split(':')[1]}
          </button>
        ))}
      </div>

      {/* Warning */}
      {warning && <div class="tag-bar__warning">{warning}</div>}
    </div>
  )
}
