/**
 * Mirror drift — has the file a note mirrors moved on since it was mirrored?
 *
 * A mirrored note is information for the human, never the truth for a role:
 * a role that needs to know something reads git. But declaring a mirror
 * non-authoritative is not enough. A stale mirror that looks current gets
 * read anyway, and it misleads exactly as confidently as a true one — the
 * project's own strategy paper carried an "open question" the code had long
 * since answered, and cost the next session real time.
 *
 * So non-authority is computed and shown rather than asserted: the note
 * carries the commit it was mirrored at, and the drift against it is worked
 * out when the note is opened or handed on. Same mechanism as the handoff
 * delta, narrowed from a repository to a single file.
 *
 * Nothing in here throws. A failure to determine drift is reported as a
 * problem, because a mirror whose state is unknown must not silently read as
 * current.
 */
import { gitOrNull, isWorkTree, isCommitHash, resolveHeadCommit } from './git-probe'

/** Cap on listed commits, so a long-neglected mirror cannot flood the view. */
const MAX_COMMITS = 20

export interface DriftCommit {
  hash: string
  subject: string
}

export interface MirrorDrift {
  /** False only when the repository itself could not be read. */
  ok: boolean
  /** True when the mirrored file has not changed since the mirror point. */
  current: boolean
  repoPath: string
  /** Repo-relative path of the mirrored file. */
  filePath: string
  mirrorCommit: string | null
  /** Commits touching this file since the mirror point, newest first. */
  commits: DriftCommit[]
  /** The original is gone at HEAD — deleted or moved away. */
  fileMissing: boolean
  /** Human-readable reasons the drift could not be determined. */
  problems: string[]
  commitsTruncated?: boolean
}

export interface MirrorDriftOptions {
  repoPath: string
  /** Repo-relative path of the mirrored file. */
  filePath: string
  /** Commit the note was mirrored at. */
  mirrorCommit: string | null
}

export async function computeMirrorDrift(opts: MirrorDriftOptions): Promise<MirrorDrift> {
  const { repoPath, filePath, mirrorCommit } = opts
  const problems: string[] = []

  const drift: MirrorDrift = {
    ok: false,
    // Anything unresolved counts as "not current". A mirror whose state is
    // unknown must never pass for up to date.
    current: false,
    repoPath,
    filePath,
    mirrorCommit,
    commits: [],
    fileMissing: false,
    problems,
  }

  if (!(await isWorkTree(repoPath))) {
    problems.push(`Kein git-Repository unter ${repoPath} — Spiegelstand nicht bestimmbar.`)
    return drift
  }
  drift.ok = true

  if (!mirrorCommit) {
    problems.push('Note nennt keinen Spiegel-Commit — Abweichung nicht bestimmbar.')
    return drift
  }

  // Validated before it reaches git — see COMMIT_HASH_PATTERN in git-probe.
  if (!isCommitHash(mirrorCommit)) {
    problems.push(
      'Spiegel-Commit hat kein gültiges Commit-Hash-Format (7–64 Hex-Zeichen) — '
      + 'Abweichung nicht bestimmbar.',
    )
    return drift
  }

  const exists = await gitOrNull(repoPath, ['cat-file', '-e', `${mirrorCommit}^{commit}`])
  if (exists === null) {
    problems.push(
      `Spiegel-Commit ${mirrorCommit.slice(0, 12)} in diesem Repository unbekannt — `
      + 'Abweichung nicht bestimmbar.',
    )
    return drift
  }

  // Does the original still exist at HEAD?
  const tracked = await gitOrNull(repoPath, ['ls-files', '--error-unmatch', '--', filePath])
  drift.fileMissing = tracked === null || tracked.trim().length === 0

  const log = await gitOrNull(repoPath, [
    'log', '--format=%h\t%s', `${mirrorCommit}..HEAD`, '--', filePath,
  ])
  if (log === null) {
    problems.push('Commit-Liste für die gespiegelte Datei nicht lesbar.')
    return drift
  }

  const lines = log.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length > MAX_COMMITS) drift.commitsTruncated = true
  drift.commits = lines.slice(0, MAX_COMMITS).map(line => {
    const tab = line.indexOf('\t')
    return tab === -1
      ? { hash: line, subject: '' }
      : { hash: line.slice(0, tab), subject: line.slice(tab + 1) }
  })

  drift.current = drift.commits.length === 0 && !drift.fileMissing
  return drift
}

/**
 * Render the drift as the line that sits above a mirrored note.
 *
 * Short by design: it is a status line, not a report. The point is that a
 * reader sees at a glance whether what follows still matches the original.
 */
export function formatMirrorDrift(drift: MirrorDrift): string {
  const short = drift.mirrorCommit ? drift.mirrorCommit.slice(0, 7) : '—'

  if (!drift.ok || drift.problems.length > 0) {
    return `⚠ Spiegel von \`${drift.filePath}\` — Stand nicht bestimmbar: ${drift.problems.join(' ')}`
  }

  if (drift.fileMissing) {
    return `⚠ Spiegel von \`${drift.filePath}\` (Stand ${short}) — das Original ist nicht mehr im Repository.`
  }

  if (drift.current) {
    return `Spiegel von \`${drift.filePath}\`, Stand ${short} — aktuell.`
  }

  const count = drift.commits.length + (drift.commitsTruncated ? '+' : '')
  const lines = [
    `⚠ Spiegel von \`${drift.filePath}\`, Stand ${short} — seither ${count} Commit(s) auf dieser Datei:`,
    '',
  ]
  for (const c of drift.commits) lines.push(`- \`${c.hash}\` ${c.subject}`)
  return lines.join('\n')
}


// ─── readMirrorSource ───────────────────────────────────────

export interface MirrorSource {
  ok: boolean
  /** File content at the resolved revision, or null on failure. */
  content: string | null
  /** The revision the content came from. */
  commit: string | null
  problems: string[]
}

export interface MirrorSourceOptions {
  repoPath: string
  /** Repo-relative path of the file to mirror. */
  filePath: string
  /** Revision to read. Defaults to HEAD. */
  atCommit?: string
}

/**
 * Read the content a mirror should carry, from git rather than from disk.
 *
 * Deliberately `git show <commit>:<path>` and not a filesystem read: a mirror
 * names the commit it reflects, and an uncommitted edit in the working tree
 * has no commit to name. Mirroring a dirty tree would produce a note that
 * claims a provenance it does not have — the exact failure the mirror commit
 * exists to prevent.
 */
export async function readMirrorSource(opts: MirrorSourceOptions): Promise<MirrorSource> {
  const { repoPath, filePath } = opts
  const problems: string[] = []
  const result: MirrorSource = { ok: false, content: null, commit: null, problems }

  if (!(await isWorkTree(repoPath))) {
    problems.push(`Kein git-Repository unter ${repoPath} — Spiegelinhalt nicht lesbar.`)
    return result
  }

  let commit = opts.atCommit ?? null
  if (commit !== null && !isCommitHash(commit)) {
    problems.push(
      'Revision hat kein gültiges Commit-Hash-Format (7–64 Hex-Zeichen) — nicht gelesen.',
    )
    return result
  }
  if (commit === null) {
    commit = await resolveHeadCommit(repoPath)
    if (!commit) {
      problems.push('HEAD nicht auflösbar — Spiegelinhalt nicht lesbar.')
      return result
    }
  }

  const content = await gitOrNull(repoPath, ['show', `${commit}:${filePath}`])
  if (content === null) {
    problems.push(
      `\`${filePath}\` existiert in ${commit.slice(0, 7)} nicht — nichts zu spiegeln.`,
    )
    return result
  }

  result.ok = true
  result.content = content
  result.commit = commit
  return result
}
