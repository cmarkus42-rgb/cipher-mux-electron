/**
 * Small, shared git probes.
 *
 * Both the handoff delta (state of a repository since an anchor) and the
 * mirror drift (state of one file since a mirror point) ask git the same
 * kinds of question. They share these helpers so there is one place where
 * "how do we call git, and what happens when it fails" is decided.
 *
 * Every probe returns null instead of throwing. A missing answer is a fact to
 * report, not a reason to abort the surrounding operation.
 */
import { execFile } from 'child_process'
import { promisify } from 'util'

const run = promisify(execFile)

/**
 * A commit hash and nothing else.
 *
 * Commit references reach git as argv elements, and git accepts options
 * anywhere in argv — a reference beginning with `-` smuggles a flag in.
 * `git diff --output=<path>` creates and truncates a file of the caller's
 * choosing, so an unvalidated reference is an arbitrary file write. These
 * references come from note frontmatter (an editable file) and from MCP tool
 * arguments, so the path is reachable, not theoretical.
 *
 * Hex-only is also the honest constraint for the concept: an anchor is the
 * immutable commit something was written against. A branch name would move
 * and defeat the purpose.
 */
export const COMMIT_HASH_PATTERN = /^[0-9a-fA-F]{7,64}$/

export function isCommitHash(value: string | null | undefined): value is string {
  return typeof value === 'string' && COMMIT_HASH_PATTERN.test(value)
}

/** Run a git command in a repository. Throws on failure. */
export async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', repoPath, ...args], {
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout
}

/** Run a git command, returning null instead of throwing. */
export async function gitOrNull(repoPath: string, args: string[]): Promise<string | null> {
  try {
    return await git(repoPath, args)
  } catch {
    return null
  }
}

/** True when the path is inside a git work tree. */
export async function isWorkTree(repoPath: string): Promise<boolean> {
  const inside = await gitOrNull(repoPath, ['rev-parse', '--is-inside-work-tree'])
  return inside !== null && inside.trim() === 'true'
}

/**
 * Current HEAD of a repository.
 *
 * Returns null rather than throwing when the path is not a repository — a
 * note without an anchor is worth writing, it just cannot carry a delta.
 */
export async function resolveHeadCommit(repoPath: string): Promise<string | null> {
  const head = await gitOrNull(repoPath, ['rev-parse', 'HEAD'])
  const trimmed = head?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}
