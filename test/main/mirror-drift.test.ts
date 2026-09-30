import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { computeMirrorDrift, formatMirrorDrift } from '../../src/main/notes/mirror-drift'

const runGit = promisify(execFile)

// ─── Helpers ────────────────────────────────────────────────

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await runGit('git', ['-C', repo, ...args])
  return stdout.trim()
}

async function commit(repo: string, msg: string): Promise<string> {
  await git(repo, ['add', '-A'])
  await git(repo, ['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', msg])
  return git(repo, ['rev-parse', 'HEAD'])
}

// ─── Mirror drift ───────────────────────────────────────────
//
// A note that mirrors a file must show whether the file has moved on since.
// Declaring the mirror non-authoritative is not enough: a stale mirror that
// looks current gets read anyway. This is the same anchor mechanism as the
// handoff delta, applied to one file rather than a whole repository.

describe('computeMirrorDrift', () => {
  let repo: string
  let mirrorPoint: string

  before(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-drift-'))
    await git(repo, ['init', '-b', 'main'])
    await fs.mkdir(path.join(repo, 'docs'), { recursive: true })
    await fs.writeFile(path.join(repo, 'docs', 'spec.md'), '# Spec\n\nerste Fassung\n')
    await fs.writeFile(path.join(repo, 'docs', 'other.md'), '# Anderes\n')
    mirrorPoint = await commit(repo, 'spec angelegt')
  })

  after(async () => {
    await fs.rm(repo, { recursive: true, force: true })
  })

  it('reports a mirror that is still current', async () => {
    const drift = await computeMirrorDrift({
      repoPath: repo,
      filePath: 'docs/spec.md',
      mirrorCommit: mirrorPoint,
    })

    assert.equal(drift.ok, true)
    assert.equal(drift.current, true)
    assert.deepEqual(drift.commits, [])
    assert.equal(drift.fileMissing, false)
  })

  it('ignores commits that do not touch the mirrored file', async () => {
    await fs.writeFile(path.join(repo, 'docs', 'other.md'), '# Anderes\n\ngeaendert\n')
    await commit(repo, 'other angefasst')

    const drift = await computeMirrorDrift({
      repoPath: repo,
      filePath: 'docs/spec.md',
      mirrorCommit: mirrorPoint,
    })

    assert.equal(drift.current, true, 'a foreign commit must not age this mirror')
  })

  it('reports commits that touched the mirrored file', async () => {
    await fs.writeFile(path.join(repo, 'docs', 'spec.md'), '# Spec\n\nzweite Fassung\n')
    await commit(repo, 'spec ueberarbeitet')

    const drift = await computeMirrorDrift({
      repoPath: repo,
      filePath: 'docs/spec.md',
      mirrorCommit: mirrorPoint,
    })

    assert.equal(drift.current, false)
    assert.equal(drift.commits.length, 1)
    assert.equal(drift.commits[0].subject, 'spec ueberarbeitet')
  })

  it('flags a file that no longer exists', async () => {
    await fs.rm(path.join(repo, 'docs', 'other.md'))
    await commit(repo, 'other geloescht')

    const drift = await computeMirrorDrift({
      repoPath: repo,
      filePath: 'docs/other.md',
      mirrorCommit: mirrorPoint,
    })

    assert.equal(drift.fileMissing, true, 'a vanished original must not pass as current')
    assert.equal(drift.current, false)
  })

  it('rejects a mirror commit that is not a plain hash', async () => {
    const drift = await computeMirrorDrift({
      repoPath: repo,
      filePath: 'docs/spec.md',
      mirrorCommit: '--output=/tmp/pwned',
    })

    assert.equal(drift.current, false)
    assert.ok(drift.problems.some(p => /format/i.test(p)))
  })

  it('reports a missing mirror commit as a problem', async () => {
    const drift = await computeMirrorDrift({
      repoPath: repo,
      filePath: 'docs/spec.md',
      mirrorCommit: null,
    })

    assert.equal(drift.current, false)
    assert.ok(drift.problems.length > 0)
  })

  it('reports a non-repository instead of throwing', async () => {
    const drift = await computeMirrorDrift({
      repoPath: '/definitely/not/here',
      filePath: 'docs/spec.md',
      mirrorCommit: 'abc1234',
    })

    assert.equal(drift.ok, false)
    assert.ok(drift.problems.length > 0)
  })
})

describe('formatMirrorDrift', () => {
  it('states plainly when the mirror is current', () => {
    const line = formatMirrorDrift({
      ok: true,
      current: true,
      repoPath: '/repo',
      filePath: 'docs/spec.md',
      mirrorCommit: 'abc1234def',
      commits: [],
      fileMissing: false,
      problems: [],
    })
    assert.ok(line.includes('docs/spec.md'))
    assert.ok(/aktuell/i.test(line))
  })

  it('names the file, the mirror point and how far it has drifted', () => {
    const line = formatMirrorDrift({
      ok: true,
      current: false,
      repoPath: '/repo',
      filePath: 'docs/spec.md',
      mirrorCommit: 'abc1234def',
      commits: [
        { hash: '111aaaa', subject: 'spec ueberarbeitet' },
        { hash: '222bbbb', subject: 'abschnitt ergaenzt' },
      ],
      fileMissing: false,
      problems: [],
    })
    assert.ok(line.includes('docs/spec.md'))
    assert.ok(line.includes('abc1234'))
    assert.ok(line.includes('2'), 'the number of commits since must be visible')
    assert.ok(line.includes('spec ueberarbeitet'))
  })

  it('says outright when the original is gone', () => {
    const line = formatMirrorDrift({
      ok: true,
      current: false,
      repoPath: '/repo',
      filePath: 'docs/weg.md',
      mirrorCommit: 'abc1234def',
      commits: [],
      fileMissing: true,
      problems: [],
    })
    assert.ok(/nicht mehr|entfernt|fehlt/i.test(line))
  })
})
