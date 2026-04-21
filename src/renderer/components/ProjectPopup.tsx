// src/renderer/components/ProjectPopup.tsx
import { useState, useCallback, useMemo } from 'preact/hooks'
import type { ProjectInfo } from '../../shared/types'

const api = () => (window as any).cipherMux

/** Create a minimal ProjectInfo from a raw filesystem path. */
function projectFromPath(dirPath: string): ProjectInfo {
  const name = dirPath.split('/').filter(Boolean).pop() ?? 'session'
  return {
    path: dirPath,
    name,
    hasClaudeMd: false,
    gitBranch: null,
    gitDirty: false,
  } as ProjectInfo
}

interface ProjectPopupProps {
  visible: boolean
  projects: ProjectInfo[]
  scanning: boolean
  /** Session ID if switching project for an existing session, null if new session. */
  targetSessionId: string | null
  onSelect: (project: ProjectInfo, targetSessionId: string | null) => void
  onKickoffStarted: (launcherSessionId: string) => void
  onRescan: () => void
  onClose: () => void
}

export function ProjectPopup({
  visible, projects, scanning, targetSessionId,
  onSelect, onKickoffStarted, onRescan, onClose,
}: ProjectPopupProps) {
  const [filter, setFilter] = useState('')
  const [customPath, setCustomPath] = useState('')

  // Kickoff accordion state
  const [kickoffOpen, setKickoffOpen] = useState(false)
  const [kickoffDir, setKickoffDir] = useState('')
  const [kickoffReqFile, setKickoffReqFile] = useState('')
  const [kickoffContext, setKickoffContext] = useState('')
  const [kickoffError, setKickoffError] = useState<string | null>(null)
  const [kickoffLoading, setKickoffLoading] = useState(false)

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
    setCustomPath('')
  }, [onSelect, targetSessionId])

  const handleCustomPathOpen = useCallback(() => {
    const p = customPath.trim()
    if (!p) return
    handleSelect(projectFromPath(p))
  }, [customPath, handleSelect])

  const handleCustomPathKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCustomPathOpen()
    }
  }, [handleCustomPathOpen])

  const handleBrowse = useCallback(async () => {
    const dir = await api().dialog.openDir({ title: 'Projektordner auswählen' })
    if (dir) {
      handleSelect(projectFromPath(dir))
    }
  }, [handleSelect])

  // Kickoff handlers
  const handleKickoffPickDir = useCallback(async () => {
    const selected = await api().dialog.openDir({ title: 'Projekt-Verzeichnis wählen' })
    if (selected) setKickoffDir(selected)
  }, [])

  const handleKickoffPickReqFile = useCallback(async () => {
    const selected = await api().dialog.openFile({ title: 'Anforderungsdatei wählen' })
    if (selected) setKickoffReqFile(selected)
  }, [])

  const handleKickoffSubmit = useCallback(async () => {
    setKickoffError(null)
    if (!kickoffDir.trim()) {
      setKickoffError('Projekt-Verzeichnis fehlt')
      return
    }
    setKickoffLoading(true)
    try {
      const handle = await api().projects.kickoff({
        projectDir: kickoffDir.trim(),
        requirementsFile: kickoffReqFile.trim() || undefined,
        extraContext: kickoffContext.trim() || undefined,
      })
      // Add launcher session to grid so the user can see it
      onKickoffStarted(handle.launcherSessionId)
      // Reset and close on success
      setKickoffDir('')
      setKickoffReqFile('')
      setKickoffContext('')
      setKickoffOpen(false)
      onClose()
    } catch (err) {
      setKickoffError(err instanceof Error ? err.message : String(err))
    } finally {
      setKickoffLoading(false)
    }
  }, [kickoffDir, kickoffReqFile, kickoffContext, onKickoffStarted, onClose])

  if (!visible) return null

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-panel project-popup" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">
            {targetSessionId ? 'projekt wechseln' : 'projekt auswählen'}
          </span>
          <button class="cell-btn" onClick={onClose}>{'\u2715'}</button>
        </div>

        {/* Custom path input + Finder browse */}
        <div class="project-popup__custom">
          <input
            type="text"
            class="project-popup__input"
            placeholder="pfad einfügen..."
            value={customPath}
            onInput={(e) => setCustomPath((e.target as HTMLInputElement).value)}
            onKeyDown={handleCustomPathKey}
          />
          <button class="cell-btn" onClick={handleCustomPathOpen} title="pfad öffnen">{'\u2192'}</button>
          <button class="cell-btn" onClick={handleBrowse} title="im finder auswählen">{'\u22EF'}</button>
        </div>

        <div class="project-popup__search">
          <input
            type="text"
            class="project-popup__input"
            placeholder="projekte filtern..."
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            autofocus
          />
          <button
            class="cell-btn"
            onClick={onRescan}
            disabled={scanning}
          >
            {scanning ? '...' : '\u21BB'}
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

        {/* Kickoff accordion — only show when opening new session, not when switching */}
        {!targetSessionId && (
          <div class="project-popup__kickoff">
            <button
              class="project-popup__kickoff-toggle"
              onClick={() => setKickoffOpen((v) => !v)}
            >
              <span class={`project-popup__kickoff-arrow ${kickoffOpen ? 'project-popup__kickoff-arrow--open' : ''}`}>{'\u25B6'}</span>
              neues projekt launchen
            </button>

            {kickoffOpen && (
              <div class="project-popup__kickoff-body">
                <label class="project-popup__kickoff-label">
                  <span>Projekt-Verzeichnis</span>
                  <div class="project-popup__kickoff-row">
                    <input
                      class="project-popup__input"
                      type="text"
                      placeholder="/pfad/zum/neuen/projekt..."
                      value={kickoffDir}
                      onInput={(e) => setKickoffDir((e.target as HTMLInputElement).value)}
                    />
                    <button class="cell-btn" onClick={handleKickoffPickDir} title="verzeichnis auswählen">{'\u22EF'}</button>
                  </div>
                </label>

                <label class="project-popup__kickoff-label">
                  <span>Anforderungsdatei (optional)</span>
                  <div class="project-popup__kickoff-row">
                    <input
                      class="project-popup__input"
                      type="text"
                      placeholder="leer lassen, wenn schon im projekt"
                      value={kickoffReqFile}
                      onInput={(e) => setKickoffReqFile((e.target as HTMLInputElement).value)}
                    />
                    <button class="cell-btn" onClick={handleKickoffPickReqFile} title="datei auswählen">{'\u22EF'}</button>
                  </div>
                </label>

                <label class="project-popup__kickoff-label">
                  <span>Zusätzlicher Kontext (optional)</span>
                  <textarea
                    class="project-popup__input project-popup__kickoff-textarea"
                    rows={4}
                    placeholder="stack-präferenzen, referenz-projekte, URLs..."
                    value={kickoffContext}
                    onInput={(e) => setKickoffContext((e.target as HTMLTextAreaElement).value)}
                  />
                </label>

                {kickoffError && <div class="project-popup__kickoff-error">{kickoffError}</div>}

                <div class="project-popup__kickoff-footer">
                  <button class="btn btn--sm" onClick={() => setKickoffOpen(false)}>abbrechen</button>
                  <button class="btn btn--sm btn--primary" onClick={handleKickoffSubmit} disabled={kickoffLoading}>
                    {kickoffLoading ? 'starte...' : 'projekt aufsetzen'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
