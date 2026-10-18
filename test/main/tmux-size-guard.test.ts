import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TmuxManager } from '../../src/main/tmux/tmux-manager';

/**
 * tmux behaelt die Groesse, die die Zelle zuletzt verlangt hat.
 *
 * Nachgestellt am 2026-10-18 mit echter Claude-Code-Ausgabe in einem
 * nachgebauten xterm: bei gleicher Groesse von Zelle und tmux bleibt nach acht
 * Resizes kein Rest stehen; hat tmux zwei Zeilen mehr als die Zelle, landen die
 * ueberzaehligen Zeilen alle in der letzten Zeile der Zelle — die Reste im
 * Eingabefeld. Die Zelle schickt ihre Groesse nur, wenn **sie** sich aendert;
 * aendert etwas anderes die Groesse von tmux, merkte das bis dahin niemand.
 *
 * Gegen einen echten, isolierten tmux-Server — die Frage ist gerade, ob tmux die
 * Aenderung von aussen ueber die Watcher-Verbindung meldet.
 */

const TMUX_TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-size-test-'));
const SESSION = 'cmux-size-guard';

function isolatedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, TMUX_TMPDIR };
  delete env.TMUX;
  return env;
}

function tmux(args: string[]): { status: number; stdout: string } {
  const res = spawnSync('tmux', args, { encoding: 'utf-8', env: isolatedEnv() });
  return { status: res.status ?? -1, stdout: res.stdout ?? '' };
}

function tmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function paneSize(): string {
  return tmux(['display-message', '-t', SESSION, '-p', '#{pane_width}x#{pane_height}']).stdout.trim();
}

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return pred();
}

describe('tmux behaelt die Groesse der Zelle', { skip: !tmuxAvailable() && 'tmux not installed' }, () => {
  let mgr: TmuxManager;
  let prevTmpdir: string | undefined;
  let prevTmux: string | undefined;
  let isolated = false;
  const warn = console.warn;
  const warnungen: string[] = [];

  before(async () => {
    prevTmpdir = process.env.TMUX_TMPDIR;
    prevTmux = process.env.TMUX;
    process.env.TMUX_TMPDIR = TMUX_TMPDIR;
    delete process.env.TMUX;

    const probe = tmux(['display-message', '-p', '#{socket_path}']);
    assert.ok(
      probe.status !== 0 || probe.stdout.startsWith(fs.realpathSync(TMUX_TMPDIR)),
      `tmux is not isolated, socket: ${probe.stdout.trim()}`,
    );
    isolated = true;
    console.warn = (...a: unknown[]) => { warnungen.push(a.join(' ')); };

    tmux(['new-session', '-d', '-s', SESSION, '-x', '80', '-y', '24', 'sleep', '120']);
    mgr = new TmuxManager();
    mgr.watchSession(SESSION, 'emit-size');
    assert.ok(await waitFor(() => tmux(['list-clients']).stdout.includes(SESSION), 5000), 'Watcher nicht verbunden');
  });

  after(() => {
    console.warn = warn;
    mgr?.unwatchSession(SESSION);
    mgr?.disconnect();
    if (isolated) tmux(['kill-server']);
    if (prevTmpdir === undefined) delete process.env.TMUX_TMPDIR;
    else process.env.TMUX_TMPDIR = prevTmpdir;
    if (prevTmux !== undefined) process.env.TMUX = prevTmux;
    fs.rmSync(TMUX_TMPDIR, { recursive: true, force: true });
  });

  it('eine Aenderung von aussen wird zurueckgestellt und gemeldet', async () => {
    await mgr.resizePane(SESSION, 81, 33, SESSION);
    assert.equal(paneSize(), '81x33');

    tmux(['resize-window', '-t', SESSION, '-x', '81', '-y', '31']);
    assert.ok(await waitFor(() => paneSize() === '81x33', 3000), `tmux blieb bei ${paneSize()}`);
    assert.ok(warnungen.some((w) => w.includes('81x31') && w.includes('81x33')), `keine Meldung: ${warnungen.join(' | ')}`);
  });

  it('eigene Resizes in schneller Folge loesen keine Korrektur aus', async () => {
    warnungen.length = 0;
    for (const [c, r] of [[70, 20], [90, 30], [81, 33], [75, 25], [81, 33]]) {
      void mgr.resizePane(SESSION, c, r, SESSION);
    }
    await mgr.resizePane(SESSION, 81, 33, SESSION);
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(paneSize(), '81x33');
    assert.deepEqual(warnungen.filter((w) => w.includes('weicht ab')), []);
  });

  it('wer staendig dagegen haelt, bekommt kein Pingpong — nach wenigen Korrekturen ist Schluss', async () => {
    warnungen.length = 0;
    for (let n = 0; n < 12; n++) {
      tmux(['resize-window', '-t', SESSION, '-x', '60', '-y', String(15 + (n % 2))]);
      await new Promise((r) => setTimeout(r, 450));
    }
    const korrekturen = warnungen.filter((w) => w.includes('weicht ab')).length;
    assert.ok(korrekturen > 0 && korrekturen <= 5, `Korrekturen: ${korrekturen}`);
  });
});
