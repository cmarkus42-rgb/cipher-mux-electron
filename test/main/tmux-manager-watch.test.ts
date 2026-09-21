import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TmuxManager } from '../../src/main/tmux/tmux-manager';

/**
 * Integration test against a real, isolated tmux server.
 *
 * Regression guard for: "no Claude sessions can be started, no input possible".
 *
 * Root cause was that `watchSession()` attached its output watcher with `-r`
 * (read-only). Since tmux 3.7, a command issued from outside tmux (no own
 * client) resolves its target client to the best attached client — if that is
 * a read-only one, tmux rejects the command with "client is read-only".
 * That killed EVERY `tmux send-keys` the app makes, for ALL sessions:
 * the Claude launch command never ran and keystrokes never arrived.
 *
 * The watcher must therefore be writable, but keep `ignore-size` so it does
 * not dictate the session dimensions (it would otherwise force 80x24).
 */

const TMUX_TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-tmux-test-'));
const SESSION = 'cmux-watch-test';

/** Run a tmux CLI command against the isolated test server. */
function tmux(args: string[]): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('tmux', args, {
    encoding: 'utf-8',
    env: { ...process.env, TMUX_TMPDIR },
  });
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
    await new Promise((r) => setTimeout(r, 50));
  }
  return pred();
}

describe('TmuxManager.watchSession', { skip: !tmuxAvailable() && 'tmux not installed' }, () => {
  let mgr: TmuxManager;
  let prevTmpdir: string | undefined;

  before(() => {
    // TmuxManager spawns `tmux` with process.env — point it at the isolated server
    // so the test never touches the user's real tmux sessions.
    prevTmpdir = process.env.TMUX_TMPDIR;
    process.env.TMUX_TMPDIR = TMUX_TMPDIR;

    mgr = new TmuxManager();
    tmux(['new-session', '-d', '-s', SESSION, '-x', '200', '-y', '50']);
  });

  after(() => {
    mgr.unwatchSession(SESSION);
    mgr.disconnect();
    tmux(['kill-server']);
    if (prevTmpdir === undefined) delete process.env.TMUX_TMPDIR;
    else process.env.TMUX_TMPDIR = prevTmpdir;
    fs.rmSync(TMUX_TMPDIR, { recursive: true, force: true });
  });

  it('attaches a watcher that does not block send-keys', async () => {
    mgr.watchSession(SESSION, 'emit-id');

    const attached = await waitFor(() => tmux(['list-clients']).stdout.includes(SESSION));
    assert.ok(attached, 'watcher client did not attach');

    const res = tmux(['send-keys', '-t', SESSION, 'echo MARKER_OK', 'Enter']);
    assert.equal(
      res.status,
      0,
      `send-keys failed while watcher attached: ${res.stderr.trim()}`,
    );

    const landed = await waitFor(() =>
      tmux(['capture-pane', '-t', SESSION, '-p']).stdout.includes('MARKER_OK'),
    );
    assert.ok(landed, 'keystrokes never reached the pane');
  });

  it('keeps the watcher client writable', () => {
    const flags = tmux(['list-clients', '-F', '#{client_readonly}']).stdout.trim();
    assert.ok(
      flags.split('\n').every((v) => v === '0'),
      `watcher must not be read-only, got client_readonly=${flags}`,
    );
  });

  it('does not let the watcher dictate the session size', () => {
    const size = tmux([
      'display-message', '-t', SESSION, '-p', '#{window_width}x#{window_height}',
    ]).stdout.trim();
    assert.equal(size, '200x50', 'watcher must attach with ignore-size');
  });

  it('still receives pane output', async () => {
    const received: string[] = [];
    mgr.on('output', (paneId: string, data: string) => {
      if (paneId === 'emit-id') received.push(data);
    });

    tmux(['send-keys', '-t', SESSION, 'echo STREAMED', 'Enter']);

    const got = await waitFor(() => received.join('').includes('STREAMED'));
    assert.ok(got, 'watcher stopped streaming output');
  });
});
