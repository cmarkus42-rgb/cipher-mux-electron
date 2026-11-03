import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TmuxManager } from '../../src/main/tmux/tmux-manager';

/**
 * Der Schnappschuss steht an einer festen Stelle im Livestream.
 *
 * Bis zum 2026-10-16 lief er als eigener `tmux`-Aufruf neben dem Watcher her, und
 * was der Renderer danach noch bekam, konnte schon im Schnappschuss stecken oder
 * fehlen. Im Mux blieben dadurch Zeilen im Eingabefeld von Claude Code stehen, die
 * tmux laengst geloescht hatte.
 *
 * Geprueft wird gegen einen **echten**, isolierten tmux-Server mit einem Zaehler,
 * der so schnell schreibt, dass jeder Schnappschuss mitten in laufende Ausgabe
 * faellt. Fuer jeden gilt: die Stuecke bis `seq` enden genau dort, wo der
 * Schnappschuss endet, und das naechste Stueck setzt genau dahinter fort — nichts
 * doppelt, nichts verloren. Ein Mock wuerde genau die Annahme festschreiben, die
 * zu pruefen ist: dass tmux Ausgabe und Befehlsantwort in einem Strom ordnet.
 *
 * Isolation wie in `tmux-manager-watch.test.ts` — dort steht, warum `TMUX` weg muss.
 */

const TMUX_TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-snap-test-'));
const SESSION = 'cmux-snap-order';
const EMIT = 'emit-snap';

function isolatedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, TMUX_TMPDIR };
  delete env.TMUX;
  return env;
}

function tmux(args: string[]): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('tmux', args, { encoding: 'utf-8', env: isolatedEnv() });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function tmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(pred: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return pred();
}

/** Letzte vollstaendige Zaehlerzeile `L<n>` in einem Text, oder -1. */
function lastComplete(text: string): number {
  const all = [...text.matchAll(/(?<=^|\n)L(\d+) *\r?\n/g)];
  return all.length ? Number(all[all.length - 1][1]) : -1;
}

describe('Schnappschuss in Reihenfolge mit dem Livestream', { skip: !tmuxAvailable() && 'tmux not installed' }, () => {
  let mgr: TmuxManager;
  let prevTmpdir: string | undefined;
  let prevTmux: string | undefined;
  let isolated = false;
  const chunks: Array<{ seq: number; data: string }> = [];

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

    mgr = new TmuxManager();
    mgr.on('output', (paneId: string, data: string, seq: number) => {
      if (paneId === EMIT) chunks.push({ seq, data });
    });
    // Zaehler: ab Sekunde 1 schnell hochzaehlen, alle 50 Zeilen kurz Luft holen.
    const loop =
      "sleep 1; i=0; while [ $i -lt 20000 ]; do i=$((i+1)); echo L$i; " +
      "[ $((i % 50)) -eq 0 ] && sleep 0.01; done; sleep 60";
    tmux(['new-session', '-d', '-s', SESSION, '-x', '80', '-y', '20', 'sh', '-c', loop]);
    mgr.watchSession(SESSION, EMIT);
    assert.ok(await waitFor(() => tmux(['list-clients']).stdout.includes(SESSION)), 'Watcher nicht verbunden');
  });

  after(() => {
    mgr?.unwatchSession(SESSION);
    mgr?.disconnect();
    if (isolated) tmux(['kill-server']);
    if (prevTmpdir === undefined) delete process.env.TMUX_TMPDIR;
    else process.env.TMUX_TMPDIR = prevTmpdir;
    if (prevTmux !== undefined) process.env.TMUX = prevTmux;
    fs.rmSync(TMUX_TMPDIR, { recursive: true, force: true });
  });

  it('nichts doppelt, nichts verloren — bei jedem Schnappschuss mitten im Strom', async () => {
    assert.ok(await waitFor(() => lastComplete(chunks.map((c) => c.data).join('')) > 200), 'Zaehler laeuft nicht');

    let geprueft = 0;
    for (let n = 0; n < 12; n++) {
      const snap = await mgr.snapshotPane(SESSION, undefined, SESSION);
      const pre = chunks.filter((c) => c.seq <= snap.seq).map((c) => c.data).join('');

      // Vollstaendige Zeilen im Schnappschuss: alles oberhalb der Cursorzeile.
      const zeilen = snap.content.split('\n').slice(0, snap.cursorY);
      const imSnap = lastComplete(zeilen.join('\n') + '\n');
      assert.equal(lastComplete(pre), imSnap, `Schnitt ${n}: Strom bis seq ${snap.seq} endet nicht dort, wo der Schnappschuss endet`);

      // Und es geht genau dahinter weiter.
      await waitFor(() => chunks.some((c) => c.seq > snap.seq && /\n/.test(c.data)), 2000);
      const tail = pre.slice(pre.lastIndexOf('\n') + 1);
      const post = tail + chunks.filter((c) => c.seq > snap.seq).map((c) => c.data).join('');
      const erste = /L(\d+)\r?\n/.exec(post);
      if (imSnap > 0 && erste) {
        assert.equal(Number(erste[1]), imSnap + 1, `Schnitt ${n}: nach L${imSnap} kam L${erste[1]}`);
        geprueft++;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.ok(geprueft >= 8, `zu wenige Schnitte mitten im Strom geprueft: ${geprueft}`);
  });

  it('liefert leere Zeilen und Cursor wie der getrennte Aufruf', async () => {
    const ueberWatcher = await mgr.snapshotPane(SESSION, undefined, SESSION);
    assert.equal(ueberWatcher.content.split('\n').length, 20, 'ein Bildschirm hat 20 Zeilen');
    assert.ok(ueberWatcher.cursorY >= 0 && ueberWatcher.cursorY < 20);
  });

  it('weicht ohne Watcher auf den getrennten Aufruf aus', async () => {
    const snap = await mgr.snapshotPane(SESSION, undefined, 'gibt-es-nicht');
    assert.equal(snap.seq, 0);
    assert.equal(snap.content.split('\n').length, 20);
  });
});
