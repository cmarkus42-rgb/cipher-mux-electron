// src/renderer/components/ProjectPopup.tsx
import { useState, useCallback, useMemo } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { ProjectInfo } from '../../shared/types'
import { FolderPickerInput } from './FolderPickerInput'

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
  const { t } = useTranslation()
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
    const dir = await api().dialog.openDir({ title: t('projectPopup.selectDir') })
    if (dir) {
      handleSelect(projectFromPath(dir))
    }
  }, [handleSelect])

  // Kickoff handlers
  const handleKickoffPickReqFile = useCallback(async () => {
    const selected = await api().dialog.openFile({ title: t('projectPopup.reqFile') })
    if (selected) setKickoffReqFile(selected)
  }, [])

  const handleKickoffSubmit = useCallback(async () => {
    setKickoffError(null)
    if (!kickoffDir.trim()) {
      setKickoffError(t('projectPopup.errorMissing'))
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
            {targetSessionId ? t('projectPopup.switchTitle') : t('projectPopup.selectTitle')}
          </span>
          <button class="cell-btn" onClick={onClose}>{'\u2715'}</button>
        </div>

        {/* Custom path input + Finder browse */}
        <div class="project-popup__custom">
          <input
            type="text"
            class="project-popup__input"
            placeholder={t('projectPopup.pathPlaceholder')}
            value={customPath}
            onInput={(e) => setCustomPath((e.target as HTMLInputElement).value)}
            onKeyDown={handleCustomPathKey}
          />
          <button class="cell-btn" onClick={handleCustomPathOpen} title={t('projectPopup.openPath')}>{'\u2192'}</button>
          <button class="cell-btn" onClick={handleBrowse} title={t('projectPopup.browseInFinder')}>{'\u22EF'}</button>
        </div>

        <div class="project-popup__search">
          <input
            type="text"
            class="project-popup__input"
            placeholder={t('projectPopup.filterPlaceholder')}
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
              {scanning ? t('projectPopup.scanning') : t('projectPopup.noProjects')}
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
              {t('projectPopup.launchNew')}
            </button>

            {kickoffOpen && (
              <div class="project-popup__kickoff-body">
                <label class="project-popup__kickoff-label">
                  <span>{t('projectPopup.projectDir')}</span>
                  <FolderPickerInput
                    value={kickoffDir}
                    onChange={setKickoffDir}
                    placeholder={t('projectPopup.projectDirPlaceholder')}
                    class="project-popup__kickoff-row"
                  />
                </label>

                <label class="project-popup__kickoff-label">
                  <span>{t('projectPopup.reqFile')}</span>
                  <div class="project-popup__kickoff-row">
                    <input
                      class="project-popup__input"
                      type="text"
                      placeholder={t('projectPopup.reqFilePlaceholder')}
                      value={kickoffReqFile}
                      onInput={(e) => setKickoffReqFile((e.target as HTMLInputElement).value)}
                    />
                    <button class="cell-btn" onClick={handleKickoffPickReqFile} title={t('projectPopup.selectFile')}>{'\u22EF'}</button>
                  </div>
                </label>

                <label class="project-popup__kickoff-label">
                  <span>{t('projectPopup.extraContext')}</span>
                  <textarea
                    class="project-popup__input project-popup__kickoff-textarea"
                    rows={4}
                    placeholder={t('projectPopup.extraContextPlaceholder')}
                    value={kickoffContext}
                    onInput={(e) => setKickoffContext((e.target as HTMLTextAreaElement).value)}
                  />
                </label>

                {kickoffError && <div class="project-popup__kickoff-error">{kickoffError}</div>}

                <div class="project-popup__kickoff-footer">
                  <button class="btn btn--sm" onClick={() => setKickoffOpen(false)}>{t('projectPopup.cancel')}</button>
                  <button class="btn btn--sm btn--primary" onClick={handleKickoffSubmit} disabled={kickoffLoading}>
                    {kickoffLoading ? t('projectPopup.starting') : t('projectPopup.setupProject')}
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
