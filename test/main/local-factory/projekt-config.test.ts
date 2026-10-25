import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  parseProjektConfig,
  ladeProjektConfig,
  passtGlob,
  LEERE_PROJEKT_CONFIG,
  PROJEKT_CONFIG_PFAD,
} from '../../../src/main/local-factory/projekt-config'

describe('parseProjektConfig', () => {
  it('liest eine vollstaendige, gueltige Config ohne Hinweis', () => {
    const r = parseProjektConfig({
      testpfade: ['/src/testing/'],
      pflichtGates: [{ muster: 'src/**/*.py', befehl: 'pytest -q' }],
      vorpruefung: { befehl: 'python -c "import pkg; print(pkg.__file__)"', erwartet: '/worktree/' },
      worktreeVorbereitung: { befehl: 'npm ci' },
      sauberkeitIgnoriert: ['.venv', 'node_modules'],
      verboteneMuster: [{ pfad: 'test/**', regex: 'globalThis\\.__', grund: 'Test-Hilfsobjekt' }],
    })
    assert.deepEqual(r.hinweise, [])
    assert.deepEqual(r.config, {
      testpfade: ['/src/testing/'],
      pflichtGates: [{ muster: 'src/**/*.py', befehl: 'pytest -q' }],
      vorpruefung: { befehl: 'python -c "import pkg; print(pkg.__file__)"', erwartet: '/worktree/' },
      worktreeVorbereitung: { befehl: 'npm ci' },
      sauberkeitIgnoriert: ['.venv', 'node_modules'],
      verboteneMuster: [{ pfad: 'test/**', regex: 'globalThis\\.__', grund: 'Test-Hilfsobjekt' }],
    })
  })

  it('leeres Objekt = leere Config, kein Hinweis', () => {
    assert.deepEqual(parseProjektConfig({}), { config: LEERE_PROJEKT_CONFIG, hinweise: [] })
  })

  it('wirft nie — ein Nicht-Objekt wird leer plus Hinweis', () => {
    for (const raw of [null, undefined, 42, 'x', [], true]) {
      const r = parseProjektConfig(raw)
      assert.deepEqual(r.config, LEERE_PROJEKT_CONFIG, String(raw))
      assert.equal(r.hinweise.length, 1, String(raw))
    }
  })

  it('testpfade: nur Eintraege mit Testmerkmal, der Rest mit Hinweis', () => {
    const r = parseProjektConfig({ testpfade: ['/src/testing/', '/src/', 'lib', 'fixtures', 3] })
    assert.deepEqual(r.config.testpfade, ['/src/testing/'])
    assert.equal(r.hinweise.length, 4)
  })

  it('pflichtGates: unvollstaendige Eintraege werden verworfen', () => {
    const r = parseProjektConfig({
      pflichtGates: [{ muster: 'a/**', befehl: 'x' }, { muster: '', befehl: 'y' }, { befehl: 'z' }, 'q'],
    })
    assert.deepEqual(r.config.pflichtGates, [{ muster: 'a/**', befehl: 'x' }])
    assert.equal(r.hinweise.length, 3)
  })

  it('pflichtGates ohne Liste: leer plus Hinweis', () => {
    const r = parseProjektConfig({ pflichtGates: { muster: 'a', befehl: 'b' } })
    assert.deepEqual(r.config.pflichtGates, [])
    assert.equal(r.hinweise.length, 1)
  })

  it('vorpruefung braucht befehl und erwartet', () => {
    assert.equal(parseProjektConfig({ vorpruefung: { befehl: 'x' } }).config.vorpruefung, null)
    assert.equal(parseProjektConfig({ vorpruefung: 'x' }).hinweise.length, 1)
  })

  it('worktreeVorbereitung braucht einen befehl', () => {
    assert.equal(parseProjektConfig({ worktreeVorbereitung: {} }).config.worktreeVorbereitung, null)
    assert.equal(parseProjektConfig({ worktreeVorbereitung: { befehl: '  ' } }).hinweise.length, 1)
  })

  it('sauberkeitIgnoriert: Nicht-Texte fallen raus', () => {
    const r = parseProjektConfig({ sauberkeitIgnoriert: ['.venv', 1, '', 'dist/'] })
    assert.deepEqual(r.config.sauberkeitIgnoriert, ['.venv', 'dist/'])
    assert.equal(r.hinweise.length, 2)
  })

  it('verboteneMuster: ungueltige Regex wird verworfen, mit Hinweis', () => {
    const r = parseProjektConfig({
      verboteneMuster: [
        { pfad: 'src/**', regex: '(offen', grund: 'kaputt' },
        { pfad: 'src/**', regex: 'console\\.log', grund: 'kein Debug' },
        { pfad: 'src/**', regex: 'x' },
      ],
    })
    assert.deepEqual(r.config.verboteneMuster, [{ pfad: 'src/**', regex: 'console\\.log', grund: 'kein Debug' }])
    assert.equal(r.hinweise.length, 2)
    assert.ok(r.hinweise.some(h => h.includes('(offen')))
  })

  it('unbekannte Schluessel: Hinweis (Tippfehler), Rest gilt', () => {
    const r = parseProjektConfig({ testPfade: ['x'], sauberkeitIgnoriert: ['.venv'] })
    assert.deepEqual(r.config.sauberkeitIgnoriert, ['.venv'])
    assert.equal(r.hinweise.length, 1)
    assert.match(r.hinweise[0], /testPfade/)
  })
})

describe('ladeProjektConfig', () => {
  it('liest .cipher-mux/local-factory.json im Repo', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'))
    fs.mkdirSync(path.join(repo, '.cipher-mux'))
    fs.writeFileSync(path.join(repo, PROJEKT_CONFIG_PFAD), JSON.stringify({ sauberkeitIgnoriert: ['.venv'] }))
    assert.deepEqual(ladeProjektConfig(repo).config.sauberkeitIgnoriert, ['.venv'])
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('fehlende Datei: leer, kein Hinweis', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'))
    assert.deepEqual(ladeProjektConfig(repo), { config: LEERE_PROJEKT_CONFIG, hinweise: [] })
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('kaputtes JSON: leer plus Hinweis, kein Wurf', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'))
    fs.mkdirSync(path.join(repo, '.cipher-mux'))
    fs.writeFileSync(path.join(repo, PROJEKT_CONFIG_PFAD), '{kaputt')
    const r = ladeProjektConfig(repo)
    assert.deepEqual(r.config, LEERE_PROJEKT_CONFIG)
    assert.equal(r.hinweise.length, 1)
    fs.rmSync(repo, { recursive: true, force: true })
  })
})

describe('passtGlob', () => {
  it('* passt innerhalb eines Segments, nicht ueber /', () => {
    assert.equal(passtGlob('src/*.ts', 'src/a.ts'), true)
    assert.equal(passtGlob('src/*.ts', 'src/x/a.ts'), false)
  })

  it('** passt ueber Segmente, auch null Segmente', () => {
    assert.equal(passtGlob('src/**/*.ts', 'src/a.ts'), true)
    assert.equal(passtGlob('src/**/*.ts', 'src/x/y/a.ts'), true)
    assert.equal(passtGlob('src/**', 'src/x/y/a.ts'), true)
    assert.equal(passtGlob('**/*.test.ts', 'a/b/c.test.ts'), true)
    assert.equal(passtGlob('**/*.test.ts', 'c.test.ts'), true)
  })

  it('? passt genau ein Zeichen, kein /', () => {
    assert.equal(passtGlob('a?.ts', 'ab.ts'), true)
    assert.equal(passtGlob('a?.ts', 'a/.ts'), false)
    assert.equal(passtGlob('a?.ts', 'abc.ts'), false)
  })

  it('Regex-Zeichen im Muster sind woertlich', () => {
    assert.equal(passtGlob('src/(x)+.ts', 'src/(x)+.ts'), true)
    assert.equal(passtGlob('src/a.ts', 'src/abts'), false)
  })

  it('passt den ganzen Pfad, fuehrendes ./ zaehlt nicht', () => {
    assert.equal(passtGlob('src/*.ts', 'x/src/a.ts'), false)
    assert.equal(passtGlob('src/*.ts', './src/a.ts'), true)
  })
})

describe('sauberkeitIgnoriert: nur Pfade im Repo', () => {
  it('absolute Pfade, „..“ und die Repo-Wurzel selbst werden mit Hinweis verworfen', () => {
    const r = parseProjektConfig({ sauberkeitIgnoriert: ['/etc', '../nachbar', 'a/../../b', '.', './', 'node_modules'] })
    assert.deepEqual(r.config.sauberkeitIgnoriert, ['node_modules'])
    assert.equal(r.hinweise.filter(h => /sauberkeitIgnoriert/.test(h)).length, 5)
  })
})

describe('Testmerkmal acceptance (Konvention projekt-a)', () => {
  it('testpfade mit acceptance werden angenommen, ohne Hinweis', () => {
    const r = parseProjektConfig({ testpfade: ['dashboard-src/acceptance/**', '/src/acceptance-e2e/'] })
    assert.deepEqual(r.config.testpfade, ['dashboard-src/acceptance/**', '/src/acceptance-e2e/'])
    assert.deepEqual(r.hinweise, [])
  })
  it('acceptance zählt nur als ganzes Segment — „acceptancefoo“ ist kein Merkmal', () => {
    const r = parseProjektConfig({ testpfade: ['/src/acceptancefoo/', 'src/acceptance*/**'] })
    assert.deepEqual(r.config.testpfade, ['src/acceptance*/**'])
  })
  it('der Hinweis für verworfene Einträge nennt acceptance als Merkmal', () => {
    const r = parseProjektConfig({ testpfade: ['fixtures'] })
    assert.match(r.hinweise.join(), /acceptance/)
  })
})
