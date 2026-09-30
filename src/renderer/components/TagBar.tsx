// src/renderer/components/TagBar.tsx

import { useState, useRef, useCallback, useEffect, useMemo } from 'preact/hooks'
import { EXCLUSIVE_TAG_CLASSES } from '../../shared/constants'
import {
  AXIS_VALUES,
  PROCESS_SET_AXES,
  toggleAxisTag,
  type TagAxis,
} from '../../shared/tag-axes'
import type { TagClass } from '../../shared/types'

/**
 * Acht, nicht fünf.
 *
 * Fünf Achsen füllen bei zwei Phasen schon sechs Plätze — bei einer Grenze von
 * fünf wäre die Auswahl blockiert, bevor sie vollständig ist, und eine Note mit
 * Altlast-Tags liesse sich gar nicht mehr einordnen.
 */
const MAX_TAGS = 8

/**
 * Die Achsen, die zur Auswahl stehen, in der Reihenfolge des Arbeitsablaufs.
 *
 * Anforderung vom 2026-09-30: „tags müssen glaub ich schlicht hart zur auswahl
 * angeboten werden bzw aus dem prozess kommen". Ein Freitextfeld kann das
 * nicht — es lädt zum Erfinden ein, und genau dabei sind 14 Klassen und 29
 * kind-Werte entstanden.
 *
 * `workspace` und `entity` fehlen hier absichtlich: die setzt der Prozess (aus
 * der Verbindung), und ein Auswahlknopf dafür wäre eine Einladung, eine Note in
 * ein fremdes Projekt oder unter eine fremde Rolle zu hängen. Sie erscheinen
 * als Chip, nicht als Knopf.
 */
const CHOOSABLE_AXES: ReadonlyArray<{ axis: TagAxis; label: string }> = [
  { axis: 'kind', label: 'Typ' },
  { axis: 'phase', label: 'Phase' },
  { axis: 'status', label: 'Zustand' },
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
    const api = window.cipherMux
    if (!api?.notes?.tags) return
    api.notes.tags().then((repo: { tags: Record<string, { count: number }> }) => {
      setAllTags(Object.keys(repo.tags))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const api = window.cipherMux
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

  /**
   * Ein Achsenwert an oder aus.
   *
   * Die Bewegung steckt in toggleAxisTag (shared/tag-axes.ts) und nicht hier:
   * bei einer ausschliessenden Achse wechselt die Auswahl, statt zu sammeln.
   * Ohne das entstehen Notes, die zugleich `status:open` und `status:done`
   * tragen, und das ist keine Aussage, sondern deren Abwesenheit.
   */
  const toggleAxis = useCallback((tag: string) => {
    const next = toggleAxisTag(tags, tag)
    if (next.length > MAX_TAGS) {
      setWarning(`Max ${MAX_TAGS} Tags pro Note`)
      return
    }
    onTagsChange(next)
  }, [tags, onTagsChange])

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
          // Herkunft, nicht Wahl: der Workspace kommt aus der Verbindung, die
          // Entity aus ihrem Kopf. Beides gesetzt, nicht getroffen -- und das
          // soll man sehen, sonst liest sich eine Tatsache wie eine Meinung.
          const fromProcess = !!(cls && (PROCESS_SET_AXES as readonly string[]).includes(cls))

          return (
            <span
              key={tag}
              class={`tag-bar__chip${canCycle ? ' tag-bar__chip--cyclable' : ''}${fromProcess ? ' tag-bar__chip--process' : ''}`}
              title={fromProcess ? 'vom Mux gesetzt — Herkunft dieser Note' : undefined}
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

      {/* Harte Auswahl pro Achse — kein Freitext, keine erfundenen Klassen */}
      <div class="tag-bar__axes">
        {CHOOSABLE_AXES.map(({ axis, label }) => {
          const values = AXIS_VALUES[axis] ?? []
          return (
            <div key={axis} class="tag-bar__axis">
              <span class="tag-bar__axis-label">{label}</span>
              <div class="tag-bar__axis-values">
                {values.map(value => {
                  const tag = `${axis}:${value}`
                  const active = tags.some(t => t.toLowerCase() === tag)
                  return (
                    <button
                      key={tag}
                      class={`tag-bar__quick-btn${active ? ' tag-bar__quick-btn--active' : ''}`}
                      onClick={() => toggleAxis(tag)}
                      title={tag}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Warning */}
      {warning && <div class="tag-bar__warning">{warning}</div>}
    </div>
  )
}
