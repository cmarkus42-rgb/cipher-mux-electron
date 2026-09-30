/**
 * Handoff delta — the world state a handoff note deliberately does not carry.
 *
 * A handoff note stores the durable part: the assignment, the decisions, the
 * alternatives that were rejected, the pointers. It stores exactly one piece
 * of world state, the anchor commit, because that is the reference point
 * everything else is measured from.
 *
 * Everything derivable from the repo is computed here, at dispatch time, and
 * prepended to the note. A stored delta goes stale the moment it is written
 * and then asserts itself as confidently as a true one; a `git diff` cannot
 * go stale.
 *
 * Every failure mode in here returns a problem string rather than throwing.
 * A broken git call must never block a handoff — a handoff delivered without
 * its state block is worth far more than one that never arrives.
 */
import { gitOrNull, isWorkTree, resolveHeadCommit, isCommitHash } from './git-probe'

/** Cap on how many mentioned paths are fed to git, to bound the command line. */
const MAX_MENTIONED_FILES = 40
/** Cap on commits listed in the block, so a stale anchor cannot flood the payload. */
const MAX_COMMITS = 40

export interface DeltaCommit {
  hash: string
  subject: string
}

export interface DirtyEntry {
  /** Two-character porcelain status code, e.g. ' M', '??', 'A '. */
  status: string
  path: string
}

export interface HandoffDelta {
  /** False only when the repo itself could not be read at all. */
  ok: boolean
  repoPath: string
  anchorCommit: string | null
  /** Whether the anchor exists in this repo and could be used as a base. */
  anchorKnown: boolean
  branch: string | null
  commits: DeltaCommit[]
  /** git diff --stat output, or null when nothing changed. */
  diffstat: string | null
  dirty: DirtyEntry[]
  /** Repo-relative paths the note mentions and git knows. */
  mentionedFiles: string[]
  /** Human-readable reasons why parts of the delta are missing. */
  problems: string[]
  /** True when more commits exist than MAX_COMMITS. */
  commitsTruncated?: boolean
}

// ─── Mentioned files ────────────────────────────────────────

// A path-ish token: at least one slash, a plausible extension, no spaces.
// The optional :line suffix is what `file.ts:42` references look like.
const PATH_PATTERN = /(?:^|[\s(`'"[])([A-Za-z0-9._@-]+(?:\/[A-Za-z0-9._@-]+)+\.[A-Za-z0-9]{1,8})(?::\d+)?/g

/**
 * Pull repo-relative file paths out of a note body.
 *
 * Deliberately conservative: a path needs a slash and an extension. Prose,
 * shell commands and bare words produce no matches. Over-matching would widen
 * the diffstat and defeat the point of scoping it to what the note talks about.
 */
export function extractMentionedFiles(body: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const match of body.matchAll(PATH_PATTERN)) {
    const candidate = match[1]
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    found.push(candidate)
    if (found.length >= MAX_MENTIONED_FILES) break
  }
  return found
}

// ─── resolveAnchorCommit ────────────────────────────────────

/**
 * Current HEAD of a repository, for stamping a handoff note as it is written.
 *
 * Returns null rather than throwing when the path is not a repository — a
 * handoff without an anchor is worth writing, it just cannot carry a delta.
 */
export async function resolveAnchorCommit(repoPath: string): Promise<string | null> {
  return resolveHeadCommit(repoPath)
}

// ─── computeHandoffDelta ────────────────────────────────────

export interface ComputeDeltaOptions {
  repoPath: string
  anchorCommit: string | null
  /** Note body — mentioned paths are extracted from it to scope the diffstat. */
  body: string
}

export async function computeHandoffDelta(opts: ComputeDeltaOptions): Promise<HandoffDelta> {
  const { repoPath, anchorCommit, body } = opts
  const problems: string[] = []

  const delta: HandoffDelta = {
    ok: false,
    repoPath,
    anchorCommit,
    anchorKnown: false,
    branch: null,
    commits: [],
    diffstat: null,
    dirty: [],
    mentionedFiles: [],
    problems,
  }

  // Is this a repo at all? Everything downstream depends on it.
  if (!(await isWorkTree(repoPath))) {
    problems.push(`Kein git-Repository unter ${repoPath} — kein Zustandsblock berechenbar.`)
    return delta
  }
  delta.ok = true

  // Branch is knowable even without a valid anchor.
  const branch = await gitOrNull(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  delta.branch = branch ? branch.trim() : null

  // Uncommitted third-party changes — the posten that bit every stale brief.
  const status = await gitOrNull(repoPath, ['status', '--porcelain'])
  if (status === null) {
    problems.push('Arbeitsbaum-Zustand nicht lesbar (git status fehlgeschlagen).')
  } else {
    delta.dirty = status
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => ({ status: line.slice(0, 2), path: line.slice(3).trim() }))
  }

  // Which of the mentioned paths does git actually know?
  const mentioned = extractMentionedFiles(body)
  if (mentioned.length > 0) {
    const tracked = await gitOrNull(repoPath, ['ls-files', '--', ...mentioned])
    if (tracked === null) {
      problems.push('Erwaehnte Dateien nicht gegen git pruefbar — Diffstat bleibt ungefiltert.')
    } else {
      const known = new Set(
        tracked.split('\n').map(l => l.trim()).filter(Boolean),
      )
      delta.mentionedFiles = mentioned.filter(m => known.has(m))
    }
  }

  if (!anchorCommit) {
    problems.push('Kein Anker-Commit in der Note — Delta seit der Übergabe nicht berechenbar.')
    return delta
  }

  // Validated before it ever reaches git — see COMMIT_HASH_PATTERN.
  if (!isCommitHash(anchorCommit)) {
    problems.push(
      'Anker-Commit hat kein gültiges Commit-Hash-Format (7–64 Hex-Zeichen) — '
      + 'Delta nicht berechenbar.',
    )
    return delta
  }

  // Does the anchor exist here? An unknown anchor is a real condition
  // (note from another repo, rebased history) and must be visible, not fatal.
  const anchorExists = await gitOrNull(repoPath, ['cat-file', '-e', `${anchorCommit}^{commit}`])
  if (anchorExists === null) {
    problems.push(
      `Anker-Commit ${anchorCommit.slice(0, 12)} in diesem Repository unbekannt `
      + '(anderes Repo oder umgeschriebene Historie) — Delta nicht berechenbar.',
    )
    return delta
  }
  delta.anchorKnown = true

  const range = `${anchorCommit}..HEAD`

  const log = await gitOrNull(repoPath, ['log', '--format=%h\t%s', range])
  if (log === null) {
    problems.push('Commit-Liste seit dem Anker nicht lesbar.')
  } else {
    const lines = log.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length > MAX_COMMITS) delta.commitsTruncated = true
    delta.commits = lines.slice(0, MAX_COMMITS).map(line => {
      const tab = line.indexOf('\t')
      return tab === -1
        ? { hash: line, subject: '' }
        : { hash: line.slice(0, tab), subject: line.slice(tab + 1) }
    })
  }

  const diffArgs = ['diff', '--stat', range]
  if (delta.mentionedFiles.length > 0) diffArgs.push('--', ...delta.mentionedFiles)
  const diffstat = await gitOrNull(repoPath, diffArgs)
  if (diffstat === null) {
    problems.push('Diffstat seit dem Anker nicht lesbar.')
  } else {
    const trimmed = diffstat.trim()
    delta.diffstat = trimmed.length > 0 ? trimmed : null
  }

  return delta
}

// ─── formatDeltaBlock ───────────────────────────────────────

/**
 * Render the delta as a markdown block to prepend to a handoff.
 *
 * It says out loud that it was computed at dispatch: the receiving session
 * should trust it over anything the note body claims about the current state.
 */
export function formatDeltaBlock(delta: HandoffDelta): string {
  const lines: string[] = ['## Zustand (berechnet beim Dispatch, nicht gespeichert)', '']

  lines.push(`- **Repository:** ${delta.repoPath}`)
  if (delta.branch) lines.push(`- **Branch:** ${delta.branch}`)
  if (delta.anchorCommit) {
    lines.push(
      `- **Anker:** ${delta.anchorCommit.slice(0, 7)}`
      + (delta.anchorKnown ? '' : ' — in diesem Repository nicht auffindbar'),
    )
  }

  if (delta.problems.length > 0) {
    lines.push('')
    lines.push('**Nicht berechenbar:**')
    for (const problem of delta.problems) lines.push(`- ${problem}`)
  }

  if (delta.anchorKnown) {
    lines.push('')
    if (delta.commits.length === 0) {
      lines.push('**Commits seit dem Anker:** keine — der Stand ist unverändert.')
    } else {
      const suffix = delta.commitsTruncated ? ` (gekappt bei ${MAX_COMMITS})` : ''
      lines.push(`**Commits seit dem Anker:** ${delta.commits.length}${suffix}`)
      lines.push('')
      for (const c of delta.commits) lines.push(`- \`${c.hash}\` ${c.subject}`)
    }

    if (delta.diffstat) {
      lines.push('')
      const scope = delta.mentionedFiles.length > 0
        ? 'beschränkt auf die in der Übergabe genannten Dateien'
        : 'gesamtes Repository — die Übergabe nennt keine Dateien'
      lines.push(`**Diff seit dem Anker** (${scope}):`)
      lines.push('')
      lines.push('```')
      lines.push(delta.diffstat)
      lines.push('```')
    }
  }

  lines.push('')
  if (delta.dirty.length === 0) {
    lines.push('**Arbeitsbaum:** sauber.')
  } else {
    // Deliberately makes no claim about where these came from. They may be the
    // handoff author's own unfinished work or somebody else's — git cannot tell
    // the difference, so neither may this block.
    lines.push(`**Arbeitsbaum:** ${delta.dirty.length} uncommittete Änderung(en), Herkunft ungeklärt:`)
    lines.push('')
    for (const d of delta.dirty) lines.push(`- \`${d.status}\` ${d.path}`)
  }

  return lines.join('\n')
}
