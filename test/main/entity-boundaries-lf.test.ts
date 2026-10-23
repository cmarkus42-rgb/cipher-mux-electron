import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  getEntityBoundary,
  boundaryRules,
  decideBoundaryPath,
  decideBoundaryCommand,
  normalizeBoundaryCommand,
  checkTestPaths,
  buildBoundaryHookScript,
  buildBoundaryHookSettings,
  buildOpenCodeBoundaryPlugin,
  writeClaudeBoundaryHook,
  PROJECT_CONFIG_RELPATH,
} from '../../src/main/session/entity-boundaries'

// ─── Grenzen der Local Factory (Paket 2a, L1/L5/L9) ─────────
//
// L1: Die Sperre `/src/` traf auch Tests unter `src/` (SvelteKit, vitest
// `src/**/*.test.ts`) — die Factory konnte dort keine Abnahmetests schreiben.
// L5/L9: `git stash` im Worktree benutzt das gemeinsame `refs/stash`, und ein
// "nur lesender" Unteragent hat per `git checkout` den Haupt-Checkout umgestellt.
//
// Eine Entscheidung, drei Orte: die Funktion hier, der gebackene Claude-Hook und
// das opencode-Plugin. Der Paritaetstest unten schickt dieselben Faelle durch
// alle drei — eine Abweichung ist genau die stille Luecke, um die es geht.

const LF = getEntityBoundary('local-factory')!

describe('local-factory: Testpfade sind von der Codesperre ausgenommen', () => {
  let tmp: string
  let repo: string
  before(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lf-grenze-')))
    repo = path.join(tmp, 'repo')
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
  })
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  const denied = (p: string) => decideBoundaryPath(p, boundaryRules(LF)).denied

  it('sperrt Produktionscode weiterhin', () => {
    assert.equal(denied(`${repo}/src/app.ts`), true)
    assert.equal(denied(`${repo}/lib/main.dart`), true)
    assert.equal(denied(`${repo}/src/routes/+page.svelte`), true)
  })

  it('erlaubt Testdateien und Testverzeichnisse unter src/ und lib/', () => {
    for (const p of [
      'src/app.test.ts', 'src/app.spec.tsx', 'lib/main.test.dart',
      'src/tests/a.ts', 'src/__tests__/a.ts', 'src/test/a.ts', 'lib/x/tests/b.py',
    ]) {
      assert.equal(denied(`${repo}/${p}`), false, p)
    }
  })

  it('.test./.spec. zaehlen nur im Dateinamen, nicht in einem Verzeichnisnamen', () => {
    assert.equal(denied(`${repo}/src/x.test.d/app.ts`), true)
    assert.equal(denied(`${repo}/lib/a.spec.helpers/b.ts`), true)
  })

  it('ein Wort, das nur "test" ENTHAELT, ist kein Testpfad', () => {
    assert.equal(denied(`${repo}/src/attestation.ts`), true)
    assert.equal(denied(`${repo}/src/contest/x.ts`), true)
  })

  it('ein Testverzeichnis OBERHALB des Repos oeffnet nichts', () => {
    // Liegt das Repo selbst unter /test/, traefe ein Teilstring-Vergleich auf
    // dem absoluten Pfad jede Datei. Verglichen wird ab der Repo-Wurzel.
    const r = path.join(tmp, 'test', 'repo2')
    fs.mkdirSync(path.join(r, '.git'), { recursive: true })
    assert.equal(denied(`${r}/src/app.ts`), true)
    assert.equal(denied(`${r}/src/app.test.ts`), false)
  })

  it('die Projekt-Config ist fuer local-factory gesperrt — auch unter einem Testpfad', () => {
    assert.equal(denied(`${repo}/${PROJECT_CONFIG_RELPATH}`), true)
    assert.equal(denied(`${repo}/test/${PROJECT_CONFIG_RELPATH}`), true)
  })

  it('andere Rollen bekommen die Ausnahmen nicht', () => {
    // Workshop & Co. sperren /src/ ohne Ausnahme — das ist ihre eigene Regel.
    const ws = boundaryRules(getEntityBoundary('workshop')!)
    assert.equal(decideBoundaryPath(`${repo}/src/a.test.ts`, ws).denied, true)
  })

  it('die Begruendung ist die der Rolle', () => {
    const d = decideBoundaryPath(`${repo}/src/app.ts`, boundaryRules(LF))
    assert.ok(d.reason?.includes(LF.reason))
  })
})

describe('local-factory: gepruefte testpfade aus .cipher-mux/local-factory.json', () => {
  let repo: string
  before(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lf-testpfade-')))
    fs.mkdirSync(path.join(repo, '.git'))
    fs.mkdirSync(path.join(repo, '.cipher-mux'))
    fs.writeFileSync(path.join(repo, PROJECT_CONFIG_RELPATH), JSON.stringify({
      testpfade: ['/src/testing/', '/src/', 'fixtures', 'lib/', 42, 'integration_test/'],
    }))
  })
  after(() => { fs.rmSync(repo, { recursive: true, force: true }) })

  const decide = (p: string) => decideBoundaryPath(p, boundaryRules(LF))

  it('ein Eintrag mit Testmerkmal wird angenommen — zur Laufzeit vom Dateipfad aufwaerts gefunden', () => {
    assert.equal(decide(`${repo}/src/testing/helper.ts`).denied, false)
    assert.equal(decide(`${repo}/lib/integration_test/a.dart`).denied, false)
  })

  it('ein Eintrag ohne Testmerkmal oder nur /src/ wird ignoriert und als Hinweis gemeldet', () => {
    const d = decide(`${repo}/src/fixtures/x.ts`)
    assert.equal(d.denied, true)
    assert.match(d.reason ?? '', /Hinweis/)
    assert.match(d.reason ?? '', /fixtures/)
    assert.equal(decide(`${repo}/src/app.ts`).denied, true, '"/src/" darf die Sperre nicht aufheben')
  })

  it('eine kaputte Config hebt nichts auf und blockiert nichts zusaetzlich', () => {
    const r = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lf-kaputt-')))
    fs.mkdirSync(path.join(r, '.git'))
    fs.mkdirSync(path.join(r, '.cipher-mux'))
    fs.writeFileSync(path.join(r, PROJECT_CONFIG_RELPATH), '{kaputt')
    assert.equal(decide(`${r}/src/app.ts`).denied, true)
    assert.equal(decide(`${r}/src/app.test.ts`).denied, false)
    assert.equal(decide(`${r}/docs/a.md`).denied, false)
    fs.rmSync(r, { recursive: true, force: true })
  })
})

describe('checkTestPaths', () => {
  it('nimmt nur Eintraege mit Testmerkmal an', () => {
    const r = checkTestPaths(['/src/testing/', 'src/**/__tests__/', 'spec/', 'tests', '/src/', '/lib/', 'src', 'fixtures', '', 7])
    assert.deepEqual(r.accepted, ['/src/testing/', 'src/**/__tests__/', 'spec/', 'tests'])
    assert.equal(r.hints.length, 6)
  })

  it('keine Liste: leer plus Hinweis, nie ein Wurf', () => {
    assert.deepEqual(checkTestPaths(undefined), { accepted: [], hints: [] })
    const r = checkTestPaths('src/test')
    assert.deepEqual(r.accepted, [])
    assert.equal(r.hints.length, 1)
  })
})

describe('normalizeBoundaryCommand', () => {
  it('fasst Leerraum zusammen und streicht globale git-Optionen', () => {
    assert.equal(normalizeBoundaryCommand('git   -C  /x   stash   pop'), 'git stash pop')
    assert.equal(normalizeBoundaryCommand('git -C "a b" --no-pager -c user.name=x checkout y'), 'git checkout y')
    assert.equal(normalizeBoundaryCommand('/usr/bin/git --git-dir=/r/.git --work-tree /r stash'), 'git stash')
    assert.equal(normalizeBoundaryCommand('git\tstash\n'), 'git stash')
  })
})

describe('local-factory: gesperrte git-Befehle', () => {
  const denied = (c: string) => decideBoundaryCommand(c, boundaryRules(LF)).denied

  it('sperrt stash, checkout, switch und reset --hard — auch ueber -C und mit Leerraum', () => {
    for (const c of [
      'git stash', 'git stash pop', 'git -C . stash', 'git  -C  /x   stash  pop',
      'git checkout main', 'git -C ../main checkout -q --detach', 'git switch -c x',
      'git reset --hard HEAD', 'git reset -q --hard', 'git -C x reset --hard origin/main',
      'cd /r && git stash', 'npm test; git checkout .', '/usr/bin/git stash',
      'git -c user.name=x checkout y', 'git --no-pager -C "a b" stash',
    ]) {
      assert.equal(denied(c), true, c)
    }
  })

  it('erlaubt worktree add, Lesebefehle und archive', () => {
    for (const c of [
      'git -C x worktree add ../w -b b', 'git log --oneline', 'git show HEAD:src/a.ts',
      'git diff main...HEAD', 'git archive HEAD | tar -x -C /tmp/s', 'git status -sb',
      'git reset --soft HEAD~1', 'git reset HEAD a.ts && git status --hard-wrap', 'npm test',
      'git commit -m x', 'git restore --staged a.ts',
    ]) {
      assert.equal(denied(c), false, c)
    }
  })

  it('andere Rollen haben keine Befehlssperre', () => {
    assert.equal(decideBoundaryCommand('git stash', boundaryRules(getEntityBoundary('workshop')!)).denied, false)
  })

  it('die Ablehnung nennt den Grund', () => {
    assert.match(decideBoundaryCommand('git stash', boundaryRules(LF)).reason ?? '', /git archive/)
  })
})

describe('buildBoundaryHookSettings', () => {
  it('haengt den Hook an Bash, wenn die Rolle Befehle sperrt', () => {
    const s = buildBoundaryHookSettings('/r/.claude/role-boundary.js', { commands: true })
    assert.ok(s.PreToolUse.some(h => h.matcher === 'Bash'))
    assert.ok(s.PreToolUse.some(h => h.matcher.includes('Edit')))
  })

  it('ohne Befehlssperre kein Bash-Matcher', () => {
    const s = buildBoundaryHookSettings('/r/.claude/role-boundary.js')
    assert.ok(!s.PreToolUse.some(h => h.matcher.includes('Bash')))
  })
})

describe('writeClaudeBoundaryHook — wie beim Entity-Start', () => {
  it('schreibt Skript und settings.local.json mit Bash-Matcher fuer local-factory', () => {
    const run = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-run-'))
    fs.mkdirSync(path.join(run, '.claude'))
    fs.writeFileSync(path.join(run, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['x'] } }))
    const hookPath = writeClaudeBoundaryHook(run, 'local-factory')
    assert.ok(hookPath && fs.existsSync(hookPath))
    const settings = JSON.parse(fs.readFileSync(path.join(run, '.claude', 'settings.local.json'), 'utf-8'))
    assert.deepEqual(settings.permissions, { allow: ['x'] }, 'bestehende Schluessel bleiben')
    const matchers = settings.hooks.PreToolUse.map((h: { matcher: string }) => h.matcher)
    assert.ok(matchers.includes('Bash'))
    fs.rmSync(run, { recursive: true, force: true })
  })

  it('eine Rolle ohne Grenze verliert Hook und Skript', () => {
    const run = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-run-'))
    const hookPath = writeClaudeBoundaryHook(run, 'local-factory')!
    assert.equal(writeClaudeBoundaryHook(run, 'cyber-factory'), null)
    assert.ok(!fs.existsSync(hookPath))
    const settings = JSON.parse(fs.readFileSync(path.join(run, '.claude', 'settings.local.json'), 'utf-8'))
    assert.equal(settings.hooks, undefined)
    fs.rmSync(run, { recursive: true, force: true })
  })
})

// ─── Paritaet: Funktion ↔ Claude-Hook ↔ opencode-Plugin ─────

interface Fall { art: 'pfad' | 'befehl'; wert: string; gesperrt: boolean }

describe('Paritaet: dieselben Faelle gegen Funktion, Claude-Hook und opencode-Plugin', () => {
  let tmp: string
  let repo: string
  let unterTest: string
  let hookFile: string
  let pluginHook: (event: unknown) => Promise<void> | void

  before(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lf-paritaet-')))
    repo = path.join(tmp, 'repo')
    unterTest = path.join(tmp, 'test', 'repo')
    for (const r of [repo, unterTest]) fs.mkdirSync(path.join(r, '.git'), { recursive: true })
    fs.mkdirSync(path.join(repo, '.cipher-mux'))
    fs.writeFileSync(path.join(repo, PROJECT_CONFIG_RELPATH), JSON.stringify({ testpfade: ['/src/testing/', '/src/', 'fixtures'] }))

    hookFile = path.join(tmp, 'role-boundary.js')
    fs.writeFileSync(hookFile, buildBoundaryHookScript(LF))

    const pluginFile = path.join(tmp, 'plugin.js')
    fs.writeFileSync(pluginFile, buildOpenCodeBoundaryPlugin(LF))
    const mod = await import(`file://${pluginFile}`)
    await mod.default.setup({
      location: { directory: repo },
      tool: { hook: async (_n: string, cb: typeof pluginHook) => { pluginHook = cb } },
    })
  })
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  function faelle(): Fall[] {
    const p = (wert: string, gesperrt: boolean): Fall => ({ art: 'pfad', wert, gesperrt })
    const b = (wert: string, gesperrt: boolean): Fall => ({ art: 'befehl', wert, gesperrt })
    return [
      p(`${repo}/src/app.ts`, true),
      p(`${repo}/lib/main.dart`, true),
      p(`${repo}/src/app.test.ts`, false),
      p(`${repo}/src/app.spec.tsx`, false),
      p(`${repo}/src/tests/a.ts`, false),
      p(`${repo}/src/__tests__/a.ts`, false),
      p(`${repo}/src/test/a.ts`, false),
      p(`${repo}/test/a.ts`, false),
      p(`${repo}/src/testing/helper.ts`, false),
      p(`${repo}/src/fixtures/x.ts`, true),
      p(`${repo}/src/attestation.ts`, true),
      p(`${repo}/${PROJECT_CONFIG_RELPATH}`, true),
      p(`${repo}/docs/x.md`, false),
      p(`${unterTest}/src/app.ts`, true),
      b('git stash', true),
      b('git -C . stash', true),
      b('git  -C  /x   stash  pop', true),
      b('git checkout main', true),
      b('git switch -c x', true),
      b('git reset --hard HEAD', true),
      b('cd /r && git -C "a b" --no-pager stash', true),
      b('git reset --soft HEAD~1', false),
      b('git -C x worktree add ../w -b b', false),
      b('git log --oneline', false),
      b('git show HEAD', false),
      b('git diff', false),
      b('git archive HEAD | tar -x -C /tmp/s', false),
      b('npm test', false),
    ]
  }

  function funktion(f: Fall): boolean {
    const rules = boundaryRules(LF)
    return f.art === 'pfad' ? decideBoundaryPath(f.wert, rules).denied : decideBoundaryCommand(f.wert, rules).denied
  }

  function claudeHook(f: Fall): boolean {
    const input = f.art === 'pfad'
      ? { tool_name: 'Edit', tool_input: { file_path: f.wert }, cwd: repo }
      : { tool_name: 'Bash', tool_input: { command: f.wert }, cwd: repo }
    const r = spawnSync(process.execPath, [hookFile], { input: JSON.stringify(input), encoding: 'utf-8' })
    assert.equal(r.status, 0, r.stderr)
    if (!r.stdout.trim()) return false
    return JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision === 'deny'
  }

  async function plugin(f: Fall, shellTool = 'shell'): Promise<boolean> {
    const event = f.art === 'pfad'
      ? { tool: 'edit', input: { path: f.wert, oldString: 'a', newString: 'b' } }
      : { tool: shellTool, input: { command: f.wert } }
    try { await pluginHook(event); return false } catch { return true }
  }

  it('alle drei entscheiden jeden Fall gleich — und richtig', async () => {
    for (const f of faelle()) {
      const erwartet = f.gesperrt
      assert.equal(funktion(f), erwartet, `Funktion: ${f.wert}`)
      assert.equal(claudeHook(f), erwartet, `Claude-Hook: ${f.wert}`)
      assert.equal(await plugin(f), erwartet, `opencode-Plugin: ${f.wert}`)
      if (f.art === 'befehl') assert.equal(await plugin(f, 'bash'), erwartet, `opencode-Plugin (bash): ${f.wert}`)
    }
  })

  it('der Claude-Hook prueft auch MultiEdit, Write und NotebookEdit (notebook_path)', () => {
    for (const input of [
      { tool_name: 'Write', tool_input: { file_path: `${repo}/src/a.ts` } },
      { tool_name: 'MultiEdit', tool_input: { file_path: `${repo}/src/a.ts` } },
      { tool_name: 'NotebookEdit', tool_input: { notebook_path: `${repo}/src/a.ipynb` } },
    ]) {
      const r = spawnSync(process.execPath, [hookFile], { input: JSON.stringify(input), encoding: 'utf-8' })
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny', input.tool_name)
    }
  })

  it('der Claude-Hook loest einen relativen Pfad gegen cwd auf', () => {
    const input = { tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' }, cwd: repo }
    const r = spawnSync(process.execPath, [hookFile], { input: JSON.stringify(input), encoding: 'utf-8' })
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny')
  })

  it('ein erlaubter Bash-Aufruf bekommt KEIN allow — der Hook winkt die Shell nicht durch', () => {
    const r = spawnSync(process.execPath, [hookFile], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git log' } }), encoding: 'utf-8',
    })
    assert.equal(r.stdout.trim(), '')
  })

  it('opencode: ein shell-Aufruf ohne lesbaren Befehl wird abgelehnt (fail-closed)', async () => {
    await assert.rejects(async () => pluginHook({ tool: 'shell', input: {} }), /nicht lesbar/)
  })
})
