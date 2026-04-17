// src/renderer/components/ProjectPopup.tsx
import { useState, useCallback, useMemo } from 'preact/hooks'
import type { ProjectInfo } from '../../shared/types'

interface ProjectPopupProps {
  visible: boolean
  projects: ProjectInfo[]
  scanning: boolean
  /** Session ID if switching project for an existing session, null if new session. */
  targetSessionId: string | null
  onSelect: (project: ProjectInfo, targetSessionId: string | null) => void
  onRescan: () => void
  onClose: () => void
}

export function ProjectPopup({
  visible, projects, scanning, targetSessionId,
  onSelect, onRescan, onClose,
}: ProjectPopupProps) {
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    if (!filter) return projects
    const q = filter.toLowerCase()
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    )
  }, [projects, filter])

  const handleSelect = useCallback((project: ProjectInfo) => {
    onSelect(project, targetSessionId)
    setFilter('')
  }, [onSelect, targetSessionId])

  if (!visible) return null

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-panel project-popup" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">
            {targetSessionId ? 'projekt wechseln' : 'projekt auswählen'}
          </span>
          <button class="cell-btn" onClick={onClose}>✕</button>
        </div>
        <div class="project-popup__search">
          <input
            type="text"
            class="project-popup__input"
            placeholder="filter..."
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            autofocus
          />
          <button
            class="cell-btn"
            onClick={onRescan}
            disabled={scanning}
          >
            {scanning ? '...' : '↻'}
          </button>
        </div>
        <div class="project-popup__list">
          {filtered.map((project) => (
            <div
              key={project.path}
              class="project-popup__item"
              onClick={() => handleSelect(project)}
            >
              <div class="project-popup__name">{project.name}</div>
              <div class="project-popup__path">{project.path}</div>
              <div class="project-popup__meta">
                {project.gitBranch && <span>{project.gitBranch}</span>}
                {project.gitDirty && <span class="text-ctx-warn">dirty</span>}
                {project.hasClaudeMd && <span class="text-accent">claude.md</span>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div class="project-popup__empty">
              {scanning ? 'scanning...' : 'keine projekte gefunden'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
