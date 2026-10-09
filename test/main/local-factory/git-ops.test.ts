import { describe, it, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import {
  runShell, dirtyFiles, headCommit, commitPaths, commitAll, changedSince,
  checksums, savePatchAndReset, toRepoRelative,
} from '../../../src/main/local-factory/git-ops'

let repo: string
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf-8' }).trim()

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-git-'))
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
  git('add', '.')
  git('commit', '-qm', 'init')
})

describe('git-ops', () => {
  it('runShell: Exitcode und Ausgabe, Timeout → null', async () => {
    assert.deepEqual(await runShell('echo hi; exit 3', repo, 5000), { exitCode: 3, output: 'hi\n' })
    assert.equal((await runShell('sleep 5', repo, 200)).exitCode, null)
  })
  it('dirtyFiles sieht geänderte und neue Dateien', async () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'b\n')
    fs.mkdirSync(path.join(repo, 'test'))
    fs.writeFileSync(path.join(repo, 'test', 'x.test.ts'), 'x')
    assert.deepEqual((await dirtyFiles(repo)).sort(), ['a.txt', 'test/x.test.ts'])
  })
  it('commitPaths committet nur die genannten Pfade', async () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'b\n')
    fs.writeFileSync(path.join(repo, 'n.txt'), 'n')
    const h = await commitPaths(repo, ['n.txt'], 'nur n')
    assert.equal(h, await headCommit(repo))
    assert.deepEqual(await dirtyFiles(repo), ['a.txt'])
  })
  it('changedSince inkl. untracked; savePatchAndReset stellt die Basis her', async () => {
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'b\n')
    fs.writeFileSync(path.join(repo, 'neu.txt'), 'n')
    assert.deepEqual((await changedSince(repo, base)).sort(), ['a.txt', 'neu.txt'])
    const patch = path.join(os.tmpdir(), `lf-${Date.now()}.patch`)
    await savePatchAndReset(repo, base, patch)
    assert.match(fs.readFileSync(patch, 'utf-8'), /neu\.txt/)
    assert.deepEqual(await dirtyFiles(repo), [])
    assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8'), 'a\n')
  })
  it('changedSince nennt bei einem Rename alt und neu', async () => {
    const base = await headCommit(repo)
    git('mv', 'a.txt', 'b.txt')
    git('commit', '-qm', 'rename')
    assert.deepEqual((await changedSince(repo, base)).sort(), ['a.txt', 'b.txt'])
  })
  it('commitAll nimmt auch neue Dateien mit', async () => {
    fs.writeFileSync(path.join(repo, 'neu.txt'), 'n')
    await commitAll(repo, 'alles')
    assert.deepEqual(await dirtyFiles(repo), [])
  })
  it('checksums: fehlende Datei fehlt im Ergebnis', () => {
    const c = checksums(repo, ['a.txt', 'fehlt.txt'])
    assert.equal(Object.keys(c).length, 1)
    assert.equal(c['a.txt'].length, 64)
  })
  it('toRepoRelative', () => {
    assert.equal(toRepoRelative('/p', '/p/test/x.ts'), 'test/x.ts')
    assert.equal(toRepoRelative('/p', 'test/x.ts'), 'test/x.ts')
    assert.equal(toRepoRelative('/p', './test/x.ts'), 'test/x.ts')
  })
})
