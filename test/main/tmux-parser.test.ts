import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TmuxParser, parseLine, decodeOctal } from '../../src/main/tmux/tmux-parser';
import type { TmuxEvent } from '../../src/main/tmux/tmux-parser';

// ---------------------------------------------------------------------------
// decodeOctal
// ---------------------------------------------------------------------------

describe('decodeOctal', () => {
  it('decodes \\015 as CR', () => {
    assert.equal(decodeOctal('\\015'), '\r');
  });

  it('decodes \\012 as LF', () => {
    assert.equal(decodeOctal('\\012'), '\n');
  });

  it('decodes \\033 as ESC', () => {
    assert.equal(decodeOctal('\\033'), '\x1b');
  });

  it('decodes \\\\ as literal backslash', () => {
    assert.equal(decodeOctal('\\\\'), '\\');
  });

  it('decodes multiple octal sequences in one string', () => {
    assert.equal(decodeOctal('hello\\015\\012world'), 'hello\r\nworld');
  });

  it('passes through strings without escape sequences', () => {
    assert.equal(decodeOctal('plain text'), 'plain text');
  });

  it('decodes mixed content with octal and literal backslash', () => {
    assert.equal(decodeOctal('path\\\\to\\015file'), 'path\\to\rfile');
  });

  it('decodes \\000 as NUL', () => {
    assert.equal(decodeOctal('\\000'), '\x00');
  });
});

// ---------------------------------------------------------------------------
// parseLine — output
// ---------------------------------------------------------------------------

describe('parseLine — %output', () => {
  it('parses output with pane ID and decoded data', () => {
    const event = parseLine('%output %0 hello\\015\\012');
    assert.deepEqual(event, {
      type: 'output',
      paneId: '%0',
      data: 'hello\r\n',
    });
  });

  it('parses output with higher pane ID', () => {
    const event = parseLine('%output %42 data');
    assert.equal(event.type, 'output');
    if (event.type === 'output') {
      assert.equal(event.paneId, '%42');
      assert.equal(event.data, 'data');
    }
  });

  it('decodes octal in output data', () => {
    const event = parseLine('%output %1 \\033[1mBold\\033[0m');
    assert.equal(event.type, 'output');
    if (event.type === 'output') {
      assert.equal(event.data, '\x1b[1mBold\x1b[0m');
    }
  });
});

// ---------------------------------------------------------------------------
// parseLine — begin/end/error
// ---------------------------------------------------------------------------

describe('parseLine — %begin/%end/%error', () => {
  it('parses %begin with time, number, flags', () => {
    const event = parseLine('%begin 1681234567 1 0');
    assert.deepEqual(event, {
      type: 'begin',
      time: 1681234567,
      number: 1,
      flags: 0,
    });
  });

  it('parses %end with time, number, flags', () => {
    const event = parseLine('%end 1681234567 1 0');
    assert.deepEqual(event, {
      type: 'end',
      time: 1681234567,
      number: 1,
      flags: 0,
    });
  });

  it('parses %error with time, number, flags', () => {
    const event = parseLine('%error 1681234567 2 1');
    assert.deepEqual(event, {
      type: 'error',
      time: 1681234567,
      number: 2,
      flags: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// parseLine — session events
// ---------------------------------------------------------------------------

describe('parseLine — session events', () => {
  it('parses %sessions-changed', () => {
    assert.deepEqual(parseLine('%sessions-changed'), {
      type: 'sessions-changed',
    });
  });

  it('parses %session-changed', () => {
    const event = parseLine('%session-changed $1 my-session');
    assert.deepEqual(event, {
      type: 'session-changed',
      sessionId: '$1',
      name: 'my-session',
    });
  });

  it('parses %session-changed with spaces in name', () => {
    const event = parseLine('%session-changed $0 session with spaces');
    assert.equal(event.type, 'session-changed');
    if (event.type === 'session-changed') {
      assert.equal(event.name, 'session with spaces');
    }
  });
});

// ---------------------------------------------------------------------------
// parseLine — window events
// ---------------------------------------------------------------------------

describe('parseLine — window events', () => {
  it('parses %window-add', () => {
    assert.deepEqual(parseLine('%window-add @0'), {
      type: 'window-add',
      windowId: '@0',
    });
  });

  it('parses %window-close', () => {
    assert.deepEqual(parseLine('%window-close @3'), {
      type: 'window-close',
      windowId: '@3',
    });
  });

  it('parses %window-renamed', () => {
    const event = parseLine('%window-renamed @1 my-window');
    assert.deepEqual(event, {
      type: 'window-renamed',
      windowId: '@1',
      name: 'my-window',
    });
  });
});

// ---------------------------------------------------------------------------
// parseLine — pane, exit, layout
// ---------------------------------------------------------------------------

describe('parseLine — pane, exit, layout', () => {
  it('parses %pane-mode-changed', () => {
    assert.deepEqual(parseLine('%pane-mode-changed %5'), {
      type: 'pane-mode-changed',
      paneId: '%5',
    });
  });

  it('parses %exit with reason', () => {
    assert.deepEqual(parseLine('%exit server exited'), {
      type: 'exit',
      reason: 'server exited',
    });
  });

  it('parses %exit without reason', () => {
    assert.deepEqual(parseLine('%exit'), {
      type: 'exit',
      reason: '',
    });
  });

  it('parses %layout-change', () => {
    const event = parseLine('%layout-change @0 b]a4,177x42,0,0,0');
    assert.deepEqual(event, {
      type: 'layout-change',
      windowId: '@0',
      layout: 'b]a4,177x42,0,0,0',
    });
  });
});

// ---------------------------------------------------------------------------
// parseLine — unknown
// ---------------------------------------------------------------------------

describe('parseLine — unknown', () => {
  it('returns unknown for unrecognized lines', () => {
    assert.deepEqual(parseLine('some random line'), {
      type: 'unknown',
      line: 'some random line',
    });
  });

  it('returns unknown for empty string', () => {
    assert.deepEqual(parseLine(''), {
      type: 'unknown',
      line: '',
    });
  });
});

// ---------------------------------------------------------------------------
// TmuxParser — streaming / chunked data
// ---------------------------------------------------------------------------

describe('TmuxParser', () => {
  it('parses complete lines from a single chunk', () => {
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    parser.feed('%sessions-changed\n%window-add @0\n');

    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'sessions-changed');
    assert.equal(events[1].type, 'window-add');
  });

  it('buffers partial lines across chunks', () => {
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    parser.feed('%output %0 hel');
    assert.equal(events.length, 0);

    parser.feed('lo\\015\\012\n');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'output');
    if (events[0].type === 'output') {
      assert.equal(events[0].data, 'hello\r\n');
    }
  });

  it('handles multiple lines split across chunks', () => {
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    parser.feed('%begin 100 1 0\nsome-respo');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'begin');

    parser.feed('nse-data\n%end 100 1 0\n');
    assert.equal(events.length, 3);
    assert.equal(events[1].type, 'unknown'); // response body line
    assert.equal(events[2].type, 'end');
  });

  it('ignores empty lines in stream', () => {
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    parser.feed('\n\n%sessions-changed\n\n');

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'sessions-changed');
  });

  it('does not emit events without a handler', () => {
    const parser = new TmuxParser();
    // Should not throw
    parser.feed('%sessions-changed\n');
  });

  it('reset clears the buffer', () => {
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    parser.feed('%output %0 partial');
    parser.reset();
    parser.feed(' more data\n');

    // After reset, the partial was discarded, so " more data" is parsed alone
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'unknown');
  });

  it('handles chunk that ends exactly on newline boundary', () => {
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    parser.feed('%exit\n');
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: 'exit', reason: '' });
  });
});
