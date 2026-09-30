import { useState, useEffect, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { Memory, MemoryKind } from '../../shared/types'

// MemoryKind carries 13 values. These maps covered four, so the other nine
// rendered an empty label and `background: undefined` — a memory of kind
// 'finding' or 'decision' showed up as an unlabelled blank chip. Record<K, V>
// was the right type all along; it was the maps that had fallen behind.
const KIND_LABELS: Record<MemoryKind, string> = {
  fact: 'fact',
  preference: 'pref',
  interaction: 'int',
  event: 'event',
  decision: 'dec',
  architecture: 'arch',
  welle: 'welle',
  'welle-plan': 'plan',
  finding: 'find',
  'risk-review': 'risk',
  pattern: 'pat',
  convention: 'conv',
  off_limit: 'off',
}

const KIND_COLORS: Record<MemoryKind, string> = {
  fact: 'var(--color-info, #4a9eff)',
  preference: 'var(--color-neon, #00ff88)',
  interaction: 'var(--color-warn, #ffaa00)',
  event: 'var(--color-error, #ff4444)',
  decision: 'var(--color-accent, #7c5cff)',
  architecture: 'var(--color-neon-cyan, #00d5ff)',
  welle: 'var(--color-neon-green, #3ddc84)',
  'welle-plan': 'var(--color-neon-green, #3ddc84)',
  finding: 'var(--color-neon-orange, #ff9f45)',
  'risk-review': 'var(--color-danger, #ff4d4d)',
  pattern: 'var(--color-text-accent, #9aa8ff)',
  convention: 'var(--color-text-muted, #8a8f98)',
  off_limit: 'var(--color-neon-red, #ff2d55)',
}

interface CompanionMemoryViewProps {
  expanded: boolean
  onToggle: () => void
}

export function CompanionMemoryView({ expanded, onToggle }: CompanionMemoryViewProps) {
  const { t } = useTranslation()
  const [memories, setMemories] = useState<Memory[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)

  const api = (window as any).cipherMux?.companion

  const loadMemories = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      if (searchTerm.trim()) {
        const results = await api.search(searchTerm, 50)
        setMemories(results)
      } else {
        const results = await api.listMemories({ limit: 50 })
        setMemories(results)
      }
    } catch {
      setMemories([])
    } finally {
      setLoading(false)
    }
  }, [api, searchTerm])

  useEffect(() => {
    if (expanded) loadMemories()
  }, [expanded, loadMemories])

  const handleDelete = useCallback(async (id: string, text: string) => {
    if (!api) return
    const preview = text.length > 40 ? text.slice(0, 40) + '...' : text
    if (!confirm(t('companion.confirmDelete', { text: preview }))) return
    await api.deleteMemory(id)
    loadMemories()
  }, [api, loadMemories, t])

  const handleSearch = useCallback((e: Event) => {
    setSearchTerm((e.target as HTMLInputElement).value)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!expanded) return
    const timer = setTimeout(() => loadMemories(), 300)
    return () => clearTimeout(timer)
  }, [searchTerm, expanded, loadMemories])

  if (!api) return null

  return (
    <section class="sidebar-section" data-highlight="side-memory">
      <div class={`sidebar-section__head${memories.length === 0 && !loading ? ' sidebar-section__head--empty' : ''}`} onClick={onToggle}>
        <span>{expanded ? '\u25BE' : '\u25B8'} {t('companion.title')}</span>
      </div>
      {expanded && (
        <div class="sidebar-section__feed">
          <input
            type="text"
            class="sidebar-notes__search"
            placeholder={t('companion.searchPlaceholder')}
            value={searchTerm}
            onInput={handleSearch}
          />
          {loading && <div class="sidebar-panel__empty" style={{ padding: 'var(--space-xs)' }}>{t('companion.loading')}</div>}
          {!loading && memories.length === 0 && (
            <div class="sidebar-panel__empty" style={{ padding: 'var(--space-sm)' }}>
              {searchTerm ? t('companion.noResults') : t('companion.empty')}
            </div>
          )}
          {memories.map(m => (
            <div key={m.id} class="bg-card" style={{ position: 'relative' }}>
              <div class="bg-card__head">
                <span
                  class="companion-kind-badge"
                  style={{
                    background: KIND_COLORS[m.kind],
                    color: '#000',
                    padding: '0 4px',
                    borderRadius: '3px',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    marginRight: '4px',
                  }}
                >{KIND_LABELS[m.kind]}</span>
                <span class="bg-card__name" style={{ flex: 1, fontSize: 'var(--font-size-xs)' }}>
                  {new Date(m.ts).toLocaleDateString()} {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  class="bg-card__delete"
                  onClick={() => handleDelete(m.id, m.text)}
                  title={t('companion.delete')}
                >{'\u2715'}</button>
              </div>
              <div class="bg-card__preview">{m.text}</div>
              {m.salience !== 0.5 && (
                <div style={{ position: 'absolute', top: '4px', right: '24px', opacity: 0.4 }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: m.salience > 0.7 ? 'var(--color-neon)' : 'var(--color-text)',
                      display: 'inline-block',
                    }}
                    title={`salience: ${m.salience}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
