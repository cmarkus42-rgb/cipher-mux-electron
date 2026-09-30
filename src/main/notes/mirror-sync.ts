/**
 * Der Mux spiegelt, nicht die Rolle.
 *
 * Entschieden am 2026-09-30. Die Alternative wäre gewesen, dass eine Rolle
 * Datei und Note gemeinsam anlegt — einfacher, aber vergesslich: die
 * Spiegelung hinge dann daran, ob jemand daran gedacht hat. Deterministisch
 * heißt, dass eine Spec, die in git liegt, im Mux auftaucht, ohne dass jemand
 * einen zweiten Handgriff macht.
 *
 * Zwei Eigenschaften machen das brauchbar:
 *
 *  - **Wiederholbar.** Ein zweiter Lauf erzeugt keine zweite Note. Die
 *    Zuordnung hängt an `mirrors_file`, nicht am Titel — ein umbenannter
 *    Notentitel darf keine Doppelung auslösen.
 *  - **Der Workspace wird vererbt.** Der Workspace ist die Heimat eines
 *    Projekts und die höchste Filterebene, also gehört eine Spec dieses
 *    Projekts in seinen Workspace.
 *
 * Gespiegelt wird nur, was in git liegt. Eine uncommittete Datei hat keinen
 * Commit, den der Spiegel nennen könnte — und ein Spiegel ohne Bezugspunkt ist
 * genau das, was die ganze Mechanik verhindern soll.
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import type { NoteManager } from './note-manager'
import { gitOrNull, isWorkTree, resolveHeadCommit } from './git-probe'

export interface MirrorSyncOptions {
  noteManager: NoteManager
  /** Absoluter Pfad des Repositories. */
  repoPath: string
  /** Verzeichnisse relativ zum Repository, deren .md-Dateien gespiegelt werden. */
  directories: readonly string[]
  /** Typ der erzeugten Notes — setzt Tag und Frontmatter. */
  noteType: string
  /** Workspace, den die Notes erben. Fehlt er, bleiben sie ungebunden. */
  workspaceId?: string | null
}

export interface MirrorSyncResult {
  /** False nur, wenn das Repository selbst nicht lesbar war. */
  ok: boolean
  /** Neu gespiegelte Dateien, repo-relativ. */
  created: string[]
  /** Dateien, die bereits eine Note hatten. */
  skipped: string[]
  problems: string[]
}

/** Erste Überschrift als Titel — sonst der Dateiname. */
function titleFrom(body: string, filePath: string): string {
  const match = body.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  return path.basename(filePath, '.md')
}

export async function syncMirrors(opts: MirrorSyncOptions): Promise<MirrorSyncResult> {
  const { noteManager, repoPath, directories, noteType, workspaceId } = opts
  const problems: string[] = []
  const result: MirrorSyncResult = { ok: false, created: [], skipped: [], problems }

  if (!(await isWorkTree(repoPath))) {
    problems.push(`Kein git-Repository unter ${repoPath} — nichts zu spiegeln.`)
    return result
  }
  result.ok = true

  const head = await resolveHeadCommit(repoPath)
  if (!head) {
    problems.push('HEAD nicht auflösbar — kein Spiegelpunkt bestimmbar.')
    return result
  }

  // Einmal alle bestehenden Spiegel einlesen. Die Zuordnung hängt an
  // mirrors_file, damit ein umbenannter Notentitel keine Doppelung auslöst.
  const existing = new Set(
    (await noteManager.list())
      .map(n => n.mirrorsFile)
      .filter((f): f is string => typeof f === 'string'),
  )

  for (const dir of directories) {
    let entries: string[]
    try {
      entries = await fs.readdir(path.join(repoPath, dir))
    } catch {
      problems.push(`Verzeichnis ${dir} nicht lesbar — übersprungen.`)
      continue
    }

    for (const entry of entries.sort()) {
      if (!entry.endsWith('.md')) continue
      const relative = path.posix.join(dir, entry)

      if (existing.has(relative)) {
        result.skipped.push(relative)
        continue
      }

      // Nur was in git liegt: eine uncommittete Datei hat keinen Commit, den
      // der Spiegel nennen könnte.
      const tracked = await gitOrNull(repoPath, ['ls-files', '--error-unmatch', '--', relative])
      if (tracked === null || tracked.trim().length === 0) {
        problems.push(`${relative} ist nicht in git — nicht gespiegelt.`)
        continue
      }

      let body: string
      try {
        body = await fs.readFile(path.join(repoPath, relative), 'utf-8')
      } catch {
        problems.push(`${relative} nicht lesbar — übersprungen.`)
        continue
      }

      const tags = [`kind:${noteType}`]
      if (workspaceId) tags.push(`workspace:${workspaceId}`)

      await noteManager.create(titleFrom(body, relative), body, tags, {
        type: noteType,
        mirrorsFile: relative,
        mirrorCommit: head,
        anchorRepo: repoPath,
      })
      existing.add(relative)
      result.created.push(relative)
    }
  }

  return result
}
