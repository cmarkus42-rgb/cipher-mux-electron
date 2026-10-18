import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createSizeLog } from '../../src/main/tmux/size-log';

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-sizelog-')), 'sub', 'terminal-size.jsonl');
}

describe('Groessen-Mitschrift', () => {
  it('schreibt eine JSON-Zeile pro Eintrag, mit Zeitstempel, und legt das Verzeichnis an', () => {
    const f = tmpFile();
    const log = createSizeLog(f);
    log({ kind: 'zelle', session: 's', cols: 81, rows: 33 });
    log({ kind: 'korrektur', session: 's', cols: 81, rows: 31, wantCols: 81, wantRows: 33 });
    const zeilen = fs.readFileSync(f, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(zeilen.length, 2);
    assert.equal(zeilen[1].kind, 'korrektur');
    assert.equal(zeilen[1].wantRows, 33);
    assert.ok(!Number.isNaN(Date.parse(zeilen[0].ts)));
  });

  it('kuerzt ueber der Grenze auf die juengere Haelfte', () => {
    const f = tmpFile();
    const log = createSizeLog(f, 2000);
    for (let i = 0; i < 100; i++) log({ kind: 'tmux', session: 's', cols: i, rows: 1 });
    assert.ok(fs.statSync(f).size <= 2000);
    const zeilen = fs.readFileSync(f, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(zeilen[zeilen.length - 1].cols, 99, 'der juengste Eintrag fehlt');
  });

  it('wirft nie — auch wenn die Datei nicht schreibbar ist', () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const log = createSizeLog('/dev/null/geht/nicht.jsonl');
      assert.doesNotThrow(() => log({ kind: 'zelle', session: 's', cols: 1, rows: 1 }));
    } finally {
      console.warn = warn;
    }
  });
});
