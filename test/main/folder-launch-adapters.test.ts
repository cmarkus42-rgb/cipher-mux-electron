/**
 * Startkommandos fuer Ordner-Sessions — die zwei Schalter, die der Launcher pro
 * Start setzt und die Entity-Sessions nicht brauchen:
 *
 * - `forkLatest`: die letzte Unterhaltung dieses Verzeichnisses als neuen Zweig
 *   fortsetzen. Jede CLI schreibt das anders, gemessen am 2026-10-09:
 *   `claude --continue --fork-session` (claude 2.1.295 kennt kein `--fork` —
 *   „error: unknown option '--fork'"), `codex fork --last` (codex-cli 0.160.1),
 *   `opencode --continue --fork` (1.18.35; `--fork` allein ist ungueltig).
 * - `skipPermissions`: die Wahl im Launcher schlaegt die globale Einstellung.
 *   Fehlt sie, gilt weiter die Config — Entity-Sessions setzen sie nie.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import { CodexAdapter } from '../../src/main/agent/adapters/codex'
import { OpenCodeAdapter } from '../../src/main/agent/adapters/opencode'

const base = { projectPath: '/tmp/proj', sessionName: 'proj' }

const claude = (skip: boolean) => new ClaudeCodeAdapter({ getSkipPermissions: () => skip })
const codex = (skip: boolean) =>
  new CodexAdapter({ getSkipPermissions: () => skip, getTrustRunDirs: () => false })
const opencode = (skip: boolean) => new OpenCodeAdapter({ getSkipPermissions: () => skip })

describe('Ordner-Start: die letzte Unterhaltung abzweigen', () => {
  it('Claude Code: --continue --fork-session, nie das unbekannte --fork', () => {
    const { args } = claude(false).buildLaunchCommand({ ...base, forkLatest: true })
    assert.ok(args.includes('--continue'))
    assert.ok(args.includes('--fork-session'))
    assert.ok(!args.includes('--fork'))
    assert.ok(!args.includes('--resume'), 'Abzweigen schlaegt Fortsetzen')
  })

  it('Claude Code: Abzweigen schlaegt auch ein gleichzeitig gesetztes resume', () => {
    const { args } = claude(false).buildLaunchCommand({ ...base, resume: true, forkLatest: true })
    assert.deepEqual(args.filter(a => a.startsWith('--') && a !== '--dangerously-skip-permissions'),
      ['--continue', '--fork-session'])
  })

  it('Codex: Unterkommando fork --last, kein resume', () => {
    const { args } = codex(false).buildLaunchCommand({ ...base, resume: true, forkLatest: true })
    assert.deepEqual(args.slice(0, 2), ['fork', '--last'])
    assert.ok(!args.includes('resume'))
  })

  it('opencode: --continue --fork', () => {
    const { args } = opencode(false).buildLaunchCommand({ ...base, forkLatest: true })
    assert.ok(args.includes('--continue'))
    assert.ok(args.includes('--fork'))
  })

  it('eine bekannte ID schlaegt forkLatest — sie benennt, was geforkt wird', () => {
    const { args } = claude(false).buildLaunchCommand({
      ...base, forkLatest: true, forkFromClaudeSessionId: 'abc',
    })
    assert.ok(args.includes('abc'))
    assert.ok(!args.includes('--continue'))
  })
})

describe('Ordner-Start: Rueckfragen pro Start statt global', () => {
  const cases = [
    { name: 'Claude Code', make: claude, flag: '--dangerously-skip-permissions' },
    { name: 'Codex', make: codex, flag: '--dangerously-bypass-approvals-and-sandbox' },
    { name: 'opencode', make: opencode, flag: '--auto' },
  ]
  for (const c of cases) {
    it(`${c.name}: false im Launcher schlaegt true in der Config`, () => {
      const { args } = c.make(true).buildLaunchCommand({ ...base, skipPermissions: false })
      assert.ok(!args.includes(c.flag))
    })
    it(`${c.name}: true im Launcher schlaegt false in der Config`, () => {
      const { args } = c.make(false).buildLaunchCommand({ ...base, skipPermissions: true })
      assert.ok(args.includes(c.flag))
    })
    it(`${c.name}: ohne Angabe gilt die Config`, () => {
      assert.ok(c.make(true).buildLaunchCommand(base).args.includes(c.flag))
      assert.ok(!c.make(false).buildLaunchCommand(base).args.includes(c.flag))
    })
  }

  it('Codex: ohne Rueckfragen heisst auch Hook-Vertrauen — sonst feuert die Grenze nicht', () => {
    const { args } = codex(false).buildLaunchCommand({ ...base, skipPermissions: true })
    assert.ok(args.includes('--dangerously-bypass-hook-trust'))
  })
})
