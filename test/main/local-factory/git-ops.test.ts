import { describe, it, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import {
  runShell, dirtyFiles, headCommit, commitPaths, commitAll, changedSince,
  checksums, savePatchAndReset, toRepoRelative, currentBranch, loginShell, diffStat, istIgnoriert, hinzugefuegteZeilen,
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
  it('runShell: Timeout trifft auch Enkelprozesse', async () => {
    const t0 = Date.now()
    const r = await runShell('sleep 5; echo x', repo, 200)
    assert.equal(r.exitCode, null)
    assert.ok(Date.now() - t0 < 2000)
    const marker = path.join(repo, 'marker.tmp')
    await runShell(`sh -c 'sleep 3 && touch ${marker}'`, repo, 200)
    await new Promise(r2 => setTimeout(r2, 3500))
    assert.equal(fs.existsSync(marker), false)
  })
  it('savePatchAndReset verweigert ein Unterverzeichnis und fasst die Wurzel nicht an', async () => {
    fs.mkdirSync(path.join(repo, 'sub'))
    fs.writeFileSync(path.join(repo, 'sub', 's.txt'), 's')
    git('add', '.')
    git('commit', '-qm', 'sub')
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'dirty\n')
    await assert.rejects(savePatchAndReset(path.join(repo, 'sub'), base, path.join(os.tmpdir(), `lf-s-${Date.now()}.patch`)), /nicht die Wurzel/)
    assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8'), 'dirty\n')
  })
  it('savePatchAndReset sichert Binärdateien', async () => {
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'b.bin'), Buffer.from([0, 1, 2, 255]))
    const patch = path.join(os.tmpdir(), `lf-b-${Date.now()}.patch`)
    await savePatchAndReset(repo, base, patch)
    assert.match(fs.readFileSync(patch, 'utf-8'), /GIT binary patch/)
  })
  it('commitAll nimmt auch neue Dateien mit', async () => {
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'neu.txt'), 'n')
    await commitAll(repo, base, 'alles')
    assert.deepEqual(await dirtyFiles(repo), [])
  })
  it('commitAll faltet eigene Commits seit der Basis in genau einen ein (R14)', async () => {
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'w1.txt'), '1')
    git('add', '.'); git('commit', '-qm', 'worker 1')
    fs.writeFileSync(path.join(repo, 'w2.txt'), '2')
    await commitAll(repo, base, 'lf: zusammen')
    assert.equal(git('rev-parse', 'HEAD~1'), base)
    assert.equal(git('log', '-1', '--format=%s'), 'lf: zusammen')
    assert.deepEqual(git('show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['w1.txt', 'w2.txt'])
  })
  it('pre-commit-Hook mit exit 1 hält commitPaths und commitAll nicht auf (R14)', async () => {
    const hook = path.join(repo, '.git', 'hooks', 'pre-commit')
    fs.mkdirSync(path.dirname(hook), { recursive: true })
    fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 't.txt'), 't')
    await commitPaths(repo, ['t.txt'], 'lf: Abnahmetest #1')
    fs.writeFileSync(path.join(repo, 'a.txt'), 'neu\n')
    await commitAll(repo, base, 'lf: gruen')
    assert.equal(git('log', '-1', '--format=%s'), 'lf: gruen')
    assert.deepEqual(await dirtyFiles(repo), [])
  })
  it('currentBranch nennt den ausgecheckten Branch', async () => {
    git('checkout', '-qb', 'feature')
    assert.equal(await currentBranch(repo), 'feature')
  })
  it('Nicht-ASCII-Dateinamen kommen unmaskiert zurück (core.quotepath=off)', async () => {
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'grün.txt'), 'g')
    fs.writeFileSync(path.join(repo, 'a.txt'), 'b\n')
    git('add', 'a.txt')
    git('mv', 'a.txt', 'ä.txt')
    assert.ok((await dirtyFiles(repo)).includes('grün.txt'))
    assert.ok((await dirtyFiles(repo)).includes('ä.txt'))
    assert.ok((await changedSince(repo, base)).includes('ä.txt'))
  })
  it('savePatchAndReset schreibt den Patch byte-genau (kein UTF-8-Umweg)', async () => {
    const base = await headCommit(repo)
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]) // "café" in Latin-1
    fs.writeFileSync(path.join(repo, 'a.txt'), latin1)
    const patch = path.join(os.tmpdir(), `lf-l1-${Date.now()}.patch`)
    await savePatchAndReset(repo, base, patch)
    git('apply', patch)
    assert.deepEqual(fs.readFileSync(path.join(repo, 'a.txt')), latin1)
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

describe('diffStat', () => {
  it('zählt Dateien und geänderte Zeilen zwischen zwei Commits', async () => {
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'b.txt'), 'x\ny\n'); git('add', '.'); git('commit', '-qm', 'b')
    const head = git('rev-parse', 'HEAD')
    assert.deepEqual(await diffStat(repo, base, head), { dateien: 1, zeilen: 2 })
  })
})

describe('loginShell', () => {
  it('zsh, wo es sie gibt; sonst /bin/sh (Linux-CI hat keine zsh)', () => {
    assert.equal(loginShell(() => true), '/bin/zsh')
    assert.equal(loginShell(() => false), '/bin/sh')
  })
})

describe('L15 sauberkeitIgnoriert in git-ops', () => {
  it('istIgnoriert: Datei, Verzeichnis, Symlink-Name; Eintrag mit oder ohne Schrägstrich', () => {
    assert.equal(istIgnoriert('node_modules', ['node_modules']), true)
    assert.equal(istIgnoriert('node_modules', ['node_modules/']), true)
    assert.equal(istIgnoriert('node_modules/x/y.js', ['./node_modules']), true)
    assert.equal(istIgnoriert('.venv', ['.venv']), true)
    assert.equal(istIgnoriert('node_modules_alt/x', ['node_modules']), false)
    assert.equal(istIgnoriert('src/a.ts', []), false)
  })
  it('Symlink ohne Schrägstrich: gitignore „node_modules/“ erfasst ihn nicht — dirtyFiles sieht ihn', async () => {
    const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-nm-'))
    fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n'); git('add', '.'); git('commit', '-qm', 'gi')
    fs.symlinkSync(ziel, path.join(repo, 'node_modules'))
    assert.deepEqual(await dirtyFiles(repo), ['node_modules'])
  })
  it('commitAll und savePatchAndReset lassen ignorierte Einträge liegen und nehmen sie nicht auf', async () => {
    const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-nm-'))
    fs.symlinkSync(ziel, path.join(repo, 'node_modules'))
    fs.mkdirSync(path.join(repo, '.venv')); fs.writeFileSync(path.join(repo, '.venv', 'x'), 'x')
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'neu\n')
    await commitAll(repo, base, 'gruen', ['node_modules', '.venv/'])
    assert.equal(git('show', '--name-only', '--format=', 'HEAD'), 'a.txt')

    const base2 = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'rot\n')
    fs.writeFileSync(path.join(repo, 'neu.txt'), 'n\n')
    const patch = path.join(os.tmpdir(), `lf-ign-${Date.now()}.patch`)
    await savePatchAndReset(repo, base2, patch, ['node_modules', '.venv'])
    assert.equal(fs.lstatSync(path.join(repo, 'node_modules')).isSymbolicLink(), true)
    assert.equal(fs.existsSync(path.join(repo, '.venv', 'x')), true)
    assert.equal(fs.existsSync(path.join(repo, 'neu.txt')), false)
    const p = fs.readFileSync(patch, 'utf-8')
    assert.match(p, /neu\.txt/)
    assert.doesNotMatch(p, /node_modules|\.venv/)
  })
})

describe('L16b hinzugefuegteZeilen', () => {
  it('nur +-Zeilen mit Zeilennummer, ohne +++-Kopf und ohne gelöschte; neue Dateien ganz; Ignoriertes nicht', async () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'eins\nzwei\ndrei\n'); git('commit', '-qam', 'drei')
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'eins\nZWEI\ndrei\nvier\n')
    fs.mkdirSync(path.join(repo, 'src'))
    fs.writeFileSync(path.join(repo, 'src', 'neu.js'), 'x = 1\n+++ kein Kopf\n')
    fs.mkdirSync(path.join(repo, '.cache')); fs.writeFileSync(path.join(repo, '.cache', 'c.js'), 'geheim\n')
    const z = await hinzugefuegteZeilen(repo, base, ['.cache'])
    assert.deepEqual(z.sort((x, y) => (x.datei + x.zeile).localeCompare(y.datei + y.zeile)), [
      { datei: 'a.txt', zeile: 2, text: 'ZWEI' },
      { datei: 'a.txt', zeile: 4, text: 'vier' },
      { datei: 'src/neu.js', zeile: 1, text: 'x = 1' },
      { datei: 'src/neu.js', zeile: 2, text: '+++ kein Kopf' },
    ])
  })
})

describe('L16b hinzugefuegteZeilen: nicht zu umgehen', () => {
  it('.gitattributes „binary“ versteckt keine Zeilen', async () => {
    fs.writeFileSync(path.join(repo, '.gitattributes'), '*.js binary\n')
    fs.mkdirSync(path.join(repo, 'src')); fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'alt\n')
    git('add', '.'); git('commit', '-qm', 'attr')
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'alt\nglobalThis.__x = 1\n')
    const z = await hinzugefuegteZeilen(repo, base)
    assert.deepEqual(z, [{ datei: 'src/a.js', zeile: 2, text: 'globalThis.__x = 1' }])
  })
  it('NUL-Byte in einer neuen Datei versteckt sie nicht', async () => {
    const base = await headCommit(repo)
    fs.mkdirSync(path.join(repo, 'src')); fs.writeFileSync(path.join(repo, 'src', 'b.js'), 'globalThis.__y = 1\n\u0000\n')
    const z = await hinzugefuegteZeilen(repo, base)
    assert.ok(z.some(x => x.datei === 'src/b.js' && x.text === 'globalThis.__y = 1'))
  })
  it('Pfad mit Anführungszeichen (git quotet ihn) wird richtig gelesen', async () => {
    fs.mkdirSync(path.join(repo, 'src')); fs.writeFileSync(path.join(repo, 'src', 'a"b.js'), 'x\n')
    git('add', '.'); git('commit', '-qm', 'quote')
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'src', 'a"b.js'), 'x\nglobalThis.__z = 1\n')
    const z = await hinzugefuegteZeilen(repo, base)
    assert.deepEqual(z, [{ datei: 'src/a"b.js', zeile: 2, text: 'globalThis.__z = 1' }])
  })
})

describe('L16b hinzugefuegteZeilen: Diff-Kopf eindeutig', () => {
  it('eine hinzugefügte Zeile „++ …“ ist Inhalt, kein +++-Kopf', async () => {
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n++ globalThis.__x = 1\nweiter\n')
    const z = await hinzugefuegteZeilen(repo, base)
    assert.deepEqual(z, [
      { datei: 'a.txt', zeile: 2, text: '++ globalThis.__x = 1' },
      { datei: 'a.txt', zeile: 3, text: 'weiter' },
    ])
  })
  it('diff.noprefix im Repo ändert nichts am gelesenen Pfad', async () => {
    git('config', 'diff.noprefix', 'true')
    fs.mkdirSync(path.join(repo, 'b')); fs.writeFileSync(path.join(repo, 'b', 'c.js'), 'x\n')
    git('add', '.'); git('commit', '-qm', 'b')
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'b', 'c.js'), 'x\ny\n')
    assert.deepEqual(await hinzugefuegteZeilen(repo, base), [{ datei: 'b/c.js', zeile: 2, text: 'y' }])
  })
})
