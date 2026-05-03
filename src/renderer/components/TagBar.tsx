// src/renderer/components/TagBar.tsx

import { useState, useRef, useCallback, useEffect } from 'preact/hooks'

const MAX_TAGS = 5

const QUICK_TAGS = [
  'status:open',
  'status:in-progress',
  'status:done',
  'status:wichtig',
]

/** Validate tag format: must be klasse:wert */
function isValidTag(tag: string): boolean {
  return /^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(tag)
}

interface TagBarProps {
  tags: string[]
  onTagsChange: (tags: string[]) => void
}

export function TagBar({ tags, onTagsChange }: TagBarProps) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Load available tags from .tags.json via IPC
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.notes?.tags) return
    api.notes.tags().then((repo: { tags: Record<string, { count: number }> }) => {
      setAllTags(Object.keys(repo.tags))
    }).catch(() => {})
  }, [])

  // Filter suggestions based on input
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([])
      return
    }
    const lower = input.toLowerCase()
    const filtered = allTags
      .filter(t => t.toLowerCase().includes(lower) && !tags.includes(t))
      .slice(0, 8)
    setSuggestions(filtered)
  }, [input, allTags, tags])

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

    onTagsChange([...tags, trimmed])
    setInput('')
    setShowSuggestions(false)
  }, [tags, onTagsChange])

  const removeTag = useCallback((tag: string) => {
    onTagsChange(tags.filter(t => t !== tag))
  }, [tags, onTagsChange])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0 && showSuggestions) {
        addTag(suggestions[0])
      } else {
        addTag(input)
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }, [input, suggestions, showSuggestions, addTag])

  const toggleQuickTag = useCallback((tag: string) => {
    if (tags.includes(tag)) {
      removeTag(tag)
    } else {
      addTag(tag)
    }
  }, [tags, addTag, removeTag])

  return (
    <div class="tag-bar">
      {/* Current tags as chips */}
      <div class="tag-bar__chips">
        {tags.map(tag => (
          <span key={tag} class="tag-bar__chip">
            <span class="tag-bar__chip-text">{tag}</span>
            <button
              class="tag-bar__chip-remove"
              onClick={() => removeTag(tag)}
              title="Tag entfernen"
            >
              ×
            </button>
          </span>
        ))}

        {/* Input field */}
        <div class="tag-bar__input-wrap">
          <input
            ref={inputRef}
            class="tag-bar__input"
            type="text"
            value={input}
            placeholder={tags.length >= MAX_TAGS ? 'Max erreicht' : 'Tag hinzufügen...'}
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
              {suggestions.map(s => (
                <div
                  key={s}
                  class="tag-bar__suggestion"
                  onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick-select buttons */}
      <div class="tag-bar__quick">
        {QUICK_TAGS.map(qt => (
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
