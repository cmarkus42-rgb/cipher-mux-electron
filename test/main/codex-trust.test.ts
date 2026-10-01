import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  isRunDirectory,
  hasTrustEntry,
  withTrustEntry,
  trustRunDirectory,
  codexConfigPath,
} from '../../src/main/agent/adapters/codex-trust'

describe('isRunDirectory — die Schutzlinie', () => {
  const base = '/home/u/.config/cipher-mux/runs'

  it('nimmt ein Run-Verzeichnis an', () => {
    assert.equal(isRunDirectory(`${base}/ws-1/companion`, base), true)
    assert.equal(isRunDirectory(`${base}/_global/debugger`, base), true)
  })

  it('weist das Basisverzeichnis selbst ab', () => {
    // Das gesamte runs/ zu vertrauen waere mehr, als eine Session braucht.
    assert.equal(isRunDirectory(base, base), false)
  })

  it('weist ein Projektverzeichnis des Nutzers ab', () => {
    // Der Kern: einem fremden Verzeichnis automatisch zu vertrauen ist genau das,
    // wovor der Codex-Dialog schuetzt.
    assert.equal(isRunDirectory('/home/u/projects/irgendwas', base), false)
    assert.equal(isRunDirectory('/home/u', base), false)
    assert.equal(isRunDirectory('/', base), false)
  })

  it('weist einen Pfad ab, der nur mit demselben Text beginnt', () => {
    // `runs-woanders` ist nicht `runs/…`. Ohne den Separator waere es eines.
    assert.equal(isRunDirectory(`${base}-woanders/x`, base), false)
    assert.equal(isRunDirectory(`${base}woanders`, base), false)
  })

  it('laesst sich nicht mit .. hinausschreiben', () => {
    assert.equal(isRunDirectory(`${base}/ws-1/../../../etc`, base), false)
    assert.equal(isRunDirectory(`${base}/../entities/companion`, base), false)
  })

  it('akzeptiert .. solange das Ergebnis drin bleibt', () => {
    assert.equal(isRunDirectory(`${base}/ws-1/../ws-2/companion`, base), true)
  })
})

describe('hasTrustEntry', () => {
  const dir = '/home/u/.config/cipher-mux/runs/ws-1/companion'

  it('findet einen Eintrag mit trust_level im eigenen Abschnitt', () => {
    const text = `[projects."${dir}"]\ntrust_level = "trusted"\n`
    assert.equal(hasTrustEntry(text, dir), true)
  })

  it('findet nichts, wenn der Abschnitt fehlt', () => {
    assert.equal(hasTrustEntry('[projects."/anderer/pfad"]\ntrust_level = "trusted"\n', dir), false)
    assert.equal(hasTrustEntry('', dir), false)
  })

  it('zaehlt ein trust_level aus einem FREMDEN Abschnitt nicht mit', () => {
    // Der Abschnitt endet am naechsten Tabellenkopf. Ohne diese Grenze waere ein
    // leerer eigener Abschnitt vor einem fremden trust_level ein Falsch-Positiv —
    // und der Mux wuerde glauben, er habe vertraut.
    const text = `[projects."${dir}"]\n\n[projects."/woanders"]\ntrust_level = "trusted"\n`
    assert.equal(hasTrustEntry(text, dir), false)
  })

  it('ist unabhaengig von nicht-normalisierten Pfaden', () => {
    const text = `[projects."${dir}"]\ntrust_level = "trusted"\n`
    assert.equal(hasTrustEntry(text, `${dir}/`), true)
    assert.equal(hasTrustEntry(text, `${dir}/../companion`), true)
  })
})

describe('withTrustEntry', () => {
  const dir = '/home/u/.config/cipher-mux/runs/ws-1/companion'

  it('haengt Kopf und trust_level an', () => {
    const out = withTrustEntry('', dir)
    assert.match(out, /\[projects\."\/home\/u\/\.config\/cipher-mux\/runs\/ws-1\/companion"\]/)
    assert.match(out, /trust_level = "trusted"/)
  })

  it('ist idempotent — zweimal aendert nichts', () => {
    const once = withTrustEntry('', dir)
    assert.equal(withTrustEntry(once, dir), once)
  })

  it('laesst bestehenden Inhalt stehen und trennt mit einer Leerzeile', () => {
    const existing = 'model = "gpt-6-astra"\n\n[projects."/woanders"]\ntrust_level = "trusted"\n'
    const out = withTrustEntry(existing, dir)
    assert.ok(out.startsWith('model = "gpt-6-astra"'))
    assert.ok(out.includes('[projects."/woanders"]'))
    assert.ok(out.includes(`[projects."${dir}"]`))
    assert.ok(!out.includes('\n\n\n'), 'keine dreifachen Leerzeilen')
  })

  it('sagt im Kommentar, wer den Eintrag gesetzt hat', () => {
    // Die Datei gehoert dem Nutzer. Was der Mux darin anstellt, soll er sehen.
    assert.match(withTrustEntry('', dir), /cipher-mux/)
  })
})

describe('trustRunDirectory — gegen echte Dateien', () => {
  let tmp: string
  let base: string
  let configPath: string

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-trust-'))
    base = path.join(tmp, 'runs')
    configPath = path.join(tmp, 'codex', 'config.toml')
    fs.mkdirSync(path.join(base, 'ws-1', 'companion'), { recursive: true })
  })
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('legt die Config an, wenn Codex noch nie lief', () => {
    const dir = path.join(base, 'ws-1', 'companion')
    const res = trustRunDirectory(dir, { configPath, base })
    assert.deepEqual(res, { trusted: true, written: true })
    assert.ok(hasTrustEntry(fs.readFileSync(configPath, 'utf-8'), dir))
  })

  it('schreibt beim zweiten Mal nicht erneut', () => {
    const dir = path.join(base, 'ws-1', 'companion')
    const before = fs.readFileSync(configPath, 'utf-8')
    const res = trustRunDirectory(dir, { configPath, base })
    assert.deepEqual(res, { trusted: true, written: false })
    assert.equal(fs.readFileSync(configPath, 'utf-8'), before)
  })

  it('verweigert ein Verzeichnis ausserhalb von runs/ und schreibt nichts', () => {
    const before = fs.readFileSync(configPath, 'utf-8')
    const res = trustRunDirectory(path.join(tmp, 'fremdes-projekt'), { configPath, base })
    assert.equal(res.trusted, false)
    assert.equal(res.written, false)
    assert.match(res.reason ?? '', /kein Mux-Run-Verzeichnis/)
    assert.equal(fs.readFileSync(configPath, 'utf-8'), before)
  })

  it('traegt einen zweiten Workspace daneben ein, ohne den ersten zu verlieren', () => {
    const a = path.join(base, 'ws-1', 'companion')
    const b = path.join(base, 'ws-2', 'debugger')
    fs.mkdirSync(b, { recursive: true })
    trustRunDirectory(b, { configPath, base })
    const text = fs.readFileSync(configPath, 'utf-8')
    assert.ok(hasTrustEntry(text, a), 'erster Eintrag verloren')
    assert.ok(hasTrustEntry(text, b), 'zweiter Eintrag fehlt')
  })

  it('wirft nicht, wenn die Config nicht schreibbar ist', () => {
    // Ein Wurf hier liegt in der Init-Kette einer Session. Nicht erteiltes
    // Vertrauen kostet einen Dialog; ein Wurf kostet die Session.
    const dir = path.join(base, 'ws-3', 'audit')
    fs.mkdirSync(dir, { recursive: true })
    const blocked = path.join(tmp, 'nicht-schreibbar')
    fs.writeFileSync(blocked, 'ich bin eine Datei, kein Verzeichnis')
    const res = trustRunDirectory(dir, { configPath: path.join(blocked, 'config.toml'), base })
    assert.equal(res.trusted, false)
    assert.ok(res.reason && res.reason.length > 0)
  })
})

describe('codexConfigPath', () => {
  it('folgt CODEX_HOME, wenn gesetzt', () => {
    const saved = process.env.CODEX_HOME
    process.env.CODEX_HOME = '/woanders/.codex'
    try {
      assert.equal(codexConfigPath(), path.join('/woanders/.codex', 'config.toml'))
    } finally {
      if (saved === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = saved
    }
  })

  it('nimmt sonst ~/.codex', () => {
    const saved = process.env.CODEX_HOME
    delete process.env.CODEX_HOME
    try {
      assert.equal(codexConfigPath(), path.join(os.homedir(), '.codex', 'config.toml'))
    } finally {
      if (saved !== undefined) process.env.CODEX_HOME = saved
    }
  })

  it('behandelt ein leeres CODEX_HOME wie nicht gesetzt', () => {
    const saved = process.env.CODEX_HOME
    process.env.CODEX_HOME = '   '
    try {
      assert.equal(codexConfigPath(), path.join(os.homedir(), '.codex', 'config.toml'))
    } finally {
      if (saved === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = saved
    }
  })
})
