import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  computeHandoffDelta,
  extractMentionedFiles,
  formatDeltaBlock,
  resolveAnchorCommit,
} from '../../src/main/notes/handoff-delta'

const runGit = promisify(execFile)

// ─── Helpers ────────────────────────────────────────────────
//
// These tests run against a real throwaway git repository rather than a
// mocked git. A mock would only prove that the code matches our assumption
// about git's output — which is exactly the assumption under test.

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await runGit('git', ['-C', repo, ...args])
  return stdout.trim()
}

async function commit(repo: string, message: string): Promise<string> {
  await git(repo, ['add', '-A'])
  await git(repo, [
    '-c', 'user.email=test@example.com',
    '-c', 'user.name=Test',
    'commit', '-m', message,
  ])
  return git(repo, ['rev-parse', 'HEAD'])
}

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'handoff-delta-test-'))
  await git(dir, ['init', '-b', 'main'])
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(path.join(dir, 'src', 'alpha.ts'), 'export const a = 1\n')
  await fs.writeFile(path.join(dir, 'src', 'beta.ts'), 'export const b = 1\n')
  await fs.writeFile(path.join(dir, 'README.md'), '# repo\n')
  return dir
}

// ─── extractMentionedFiles ──────────────────────────────────

describe('extractMentionedFiles', () => {
  it('picks up backticked paths', () => {
    const files = extractMentionedFiles(
      'Der Umbau betrifft `src/alpha.ts` und `src/beta.ts`.',
    )
    assert.deepEqual(files.sort(), ['src/alpha.ts', 'src/beta.ts'])
  })

  it('picks up bare paths in prose', () => {
    const files = extractMentionedFiles('Siehe src/alpha.ts fuer den Kern.')
    assert.deepEqual(files, ['src/alpha.ts'])
  })

  it('strips a file:line suffix', () => {
    const files = extractMentionedFiles('Der Fehler sitzt in `src/alpha.ts:42`.')
    assert.deepEqual(files, ['src/alpha.ts'])
  })

  it('ignores prose, commands and bare words', () => {
    const files = extractMentionedFiles(
      'Fuehre `npm run test` aus. Die Entscheidung steht fest. Kein Pfad hier.',
    )
    assert.deepEqual(files, [])
  })

  it('deduplicates repeated mentions', () => {
    const files = extractMentionedFiles('`src/alpha.ts` und nochmal `src/alpha.ts`.')
    assert.deepEqual(files, ['src/alpha.ts'])
  })
})

// ─── resolveAnchorCommit ────────────────────────────────────

describe('resolveAnchorCommit', () => {
  it('returns the current HEAD of a repository', async () => {
    const repo = await makeRepo()
    try {
      const head = await commit(repo, 'initial')
      const resolved = await resolveAnchorCommit(repo)
      assert.equal(resolved, head)
    } finally {
      await fs.rm(repo, { recursive: true, force: true })
    }
  })

  it('returns null for a directory that is not a repository', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'handoff-anchor-norepo-'))
    try {
      assert.equal(await resolveAnchorCommit(plain), null)
    } finally {
      await fs.rm(plain, { recursive: true, force: true })
    }
  })

  it('returns null for a nonexistent path', async () => {
    assert.equal(await resolveAnchorCommit('/definitely/not/here'), null)
  })
})

// ─── computeHandoffDelta ────────────────────────────────────

describe('computeHandoffDelta', () => {
  let repo: string
  let anchor: string

  before(async () => {
    repo = await makeRepo()
    anchor = await commit(repo, 'initial')
  })

  after(async () => {
    await fs.rm(repo, { recursive: true, force: true })
  })

  it('reports no movement when the anchor is HEAD', async () => {
    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor,
      body: 'Betrifft `src/alpha.ts`.',
    })

    assert.equal(delta.ok, true)
    assert.equal(delta.branch, 'main')
    assert.deepEqual(delta.commits, [])
    assert.deepEqual(delta.dirty, [])
    assert.equal(delta.diffstat, null)
  })

  it('lists commits made since the anchor', async () => {
    await fs.writeFile(path.join(repo, 'src', 'alpha.ts'), 'export const a = 2\n')
    await commit(repo, 'alpha angepasst')

    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor,
      body: 'Betrifft `src/alpha.ts`.',
    })

    assert.equal(delta.ok, true)
    assert.equal(delta.commits.length, 1)
    assert.equal(delta.commits[0].subject, 'alpha angepasst')
    assert.ok(delta.commits[0].hash.length >= 7)
    assert.ok(delta.diffstat?.includes('src/alpha.ts'), 'diffstat should name the changed file')
  })

  it('limits the diffstat to files the note mentions', async () => {
    await fs.writeFile(path.join(repo, 'src', 'beta.ts'), 'export const b = 99\n')
    await commit(repo, 'beta angepasst')

    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor,
      body: 'Betrifft nur `src/alpha.ts`.',
    })

    assert.deepEqual(delta.mentionedFiles, ['src/alpha.ts'])
    assert.ok(delta.diffstat?.includes('src/alpha.ts'))
    assert.ok(
      !delta.diffstat?.includes('src/beta.ts'),
      'a file the note does not mention must stay out of the block',
    )
  })

  it('falls back to the full diffstat when the note mentions no files', async () => {
    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor,
      body: 'Reiner Prosatext ohne jeden Pfad.',
    })

    assert.deepEqual(delta.mentionedFiles, [])
    assert.ok(delta.diffstat?.includes('src/alpha.ts'))
    assert.ok(delta.diffstat?.includes('src/beta.ts'))
  })

  it('drops mentioned paths that git does not know', async () => {
    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor,
      body: 'Betrifft `src/alpha.ts` und `src/gibtsnicht.ts`.',
    })

    assert.deepEqual(delta.mentionedFiles, ['src/alpha.ts'])
  })

  it('reports uncommitted third-party changes in the worktree', async () => {
    await fs.writeFile(path.join(repo, 'README.md'), '# repo\n\nfremde Aenderung\n')

    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor,
      body: 'Betrifft `src/alpha.ts`.',
    })

    const readme = delta.dirty.find(d => d.path === 'README.md')
    assert.ok(readme, 'uncommitted change must be reported')
    assert.equal(readme.status.trim(), 'M')

    // Clean up so later tests see a clean tree
    await git(repo, ['checkout', '--', 'README.md'])
  })

  it('reports an unknown anchor as a problem instead of throwing', async () => {
    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: 'ffffffffffffffffffffffffffffffffffffffff',
      body: 'Body.',
    })

    assert.equal(delta.ok, true, 'an unknown anchor must not fail the whole delta')
    assert.equal(delta.anchorKnown, false)
    assert.ok(delta.problems.length > 0)
    assert.equal(delta.branch, 'main', 'branch is still knowable without a valid anchor')
  })

  // An anchor commit reaches git as an argv element. git accepts options
  // anywhere in argv, so an anchor starting with "-" smuggles a flag in —
  // `git diff --output=<path>` creates and truncates a file of the caller's
  // choosing. Anchors come from note frontmatter, which is an editable file
  // and an MCP tool argument, so this is reachable input.
  it('rejects an anchor that would smuggle a git flag, without touching the filesystem', async () => {
    const marker = path.join(os.tmpdir(), `handoff-delta-flag-smuggle-${process.pid}`)
    await fs.rm(marker, { force: true })

    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: `--output=${marker}`,
      body: 'Body.',
    })

    assert.equal(delta.anchorKnown, false)
    assert.ok(
      delta.problems.some(p => /format/i.test(p)),
      'the rejection must be stated as a problem',
    )
    assert.equal(
      await fs.access(marker).then(() => true, () => false),
      false,
      'no file may be created by a crafted anchor',
    )
  })

  it('rejects anchors that are not plain hex', async () => {
    for (const bad of ['HEAD~3', 'main..main', 'v1.0.0', 'abc', 'abc def123', '-abcdef1', '']) {
      const delta = await computeHandoffDelta({ repoPath: repo, anchorCommit: bad, body: 'Body.' })
      assert.equal(delta.anchorKnown, false, `anchor "${bad}" must not be accepted`)
      assert.ok(delta.problems.length > 0, `anchor "${bad}" must produce a problem`)
    }
  })

  it('accepts a short hash and an uppercase hash', async () => {
    const short = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor.slice(0, 7),
      body: 'Body.',
    })
    assert.equal(short.anchorKnown, true, 'a 7-char hash is a legitimate anchor')

    const upper = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor.toUpperCase(),
      body: 'Body.',
    })
    assert.equal(upper.anchorKnown, true, 'git resolves uppercase hashes')
  })

  it('reports a missing anchor as a problem instead of throwing', async () => {
    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: null,
      body: 'Body.',
    })

    assert.equal(delta.ok, true)
    assert.equal(delta.anchorKnown, false)
    assert.ok(delta.problems.some(p => p.toLowerCase().includes('anker')))
  })

  it('reports a non-repository as not ok instead of throwing', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'handoff-delta-norepo-'))
    try {
      const delta = await computeHandoffDelta({
        repoPath: plain,
        anchorCommit: 'abc1234',
        body: 'Body.',
      })
      assert.equal(delta.ok, false)
      assert.ok(delta.problems.length > 0)
    } finally {
      await fs.rm(plain, { recursive: true, force: true })
    }
  })

  it('reports a nonexistent directory as not ok instead of throwing', async () => {
    const delta = await computeHandoffDelta({
      repoPath: '/definitely/not/here/at/all',
      anchorCommit: 'abc1234',
      body: 'Body.',
    })
    assert.equal(delta.ok, false)
    assert.ok(delta.problems.length > 0)
  })
})

// ─── formatDeltaBlock ───────────────────────────────────────

describe('formatDeltaBlock', () => {
  let repo: string
  let anchor: string

  before(async () => {
    repo = await makeRepo()
    anchor = await commit(repo, 'initial')
    await fs.writeFile(path.join(repo, 'src', 'alpha.ts'), 'export const a = 3\n')
    await commit(repo, 'alpha erneut angepasst')
  })

  after(async () => {
    await fs.rm(repo, { recursive: true, force: true })
  })

  it('renders a block naming branch, anchor and commits', async () => {
    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: anchor,
      body: 'Betrifft `src/alpha.ts`.',
    })
    const block = formatDeltaBlock(delta)

    assert.ok(block.includes('Zustand'), 'block should be labelled')
    assert.ok(block.includes('main'), 'branch missing')
    assert.ok(block.includes(anchor.slice(0, 7)), 'anchor missing')
    assert.ok(block.includes('alpha erneut angepasst'), 'commit subject missing')
    assert.ok(block.includes('berechnet'), 'block should say it was computed, not stored')
  })

  it('states plainly when nothing moved', async () => {
    const head = await git(repo, ['rev-parse', 'HEAD'])
    const delta = await computeHandoffDelta({
      repoPath: repo,
      anchorCommit: head,
      body: 'Betrifft `src/alpha.ts`.',
    })
    const block = formatDeltaBlock(delta)
    assert.ok(/unver|keine/i.test(block), 'should say nothing changed')
  })

  it('renders problems instead of pretending the delta is complete', () => {
    const block = formatDeltaBlock({
      ok: false,
      repoPath: '/nope',
      anchorCommit: null,
      anchorKnown: false,
      branch: null,
      commits: [],
      diffstat: null,
      dirty: [],
      mentionedFiles: [],
      problems: ['Kein git-Repository unter /nope'],
    })
    assert.ok(block.includes('Kein git-Repository'), 'problem must be visible in the block')
  })
})
