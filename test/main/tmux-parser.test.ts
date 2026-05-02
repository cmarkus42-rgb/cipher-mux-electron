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

  it('decodes multi-byte UTF-8: ä (\\303\\244)', () => {
    assert.equal(decodeOctal('\\303\\244'), 'ä');
  });

  it('decodes multi-byte UTF-8: ü (\\303\\274)', () => {
    assert.equal(decodeOctal('\\303\\274'), 'ü');
  });

  it('decodes multi-byte UTF-8: ö (\\303\\266)', () => {
    assert.equal(decodeOctal('\\303\\266'), 'ö');
  });

  it('decodes UTF-8 umlauts embedded in text', () => {
    // "läuft" with ä encoded as \303\244
    assert.equal(decodeOctal('l\\303\\244uft'), 'läuft');
  });

  it('decodes 3-byte UTF-8: € (\\342\\202\\254)', () => {
    assert.equal(decodeOctal('\\342\\202\\254'), '€');
  });

  it('decodes 4-byte UTF-8 emoji: 🚀 (\\360\\237\\232\\200)', () => {
    assert.equal(decodeOctal('\\360\\237\\232\\200'), '🚀');
  });

  // --- Raw UTF-8 pass-through (tmux 3.3+ with UTF-8 locale) ---------------

  it('passes through raw ä without corruption', () => {
    assert.equal(decodeOctal('ä'), 'ä');
  });

  it('passes through raw öüß without corruption', () => {
    assert.equal(decodeOctal('öüß'), 'öüß');
  });

  it('handles mixed raw UTF-8 and octal escapes', () => {
    // tmux 3.6a sends: raw ä + octal backspace + raw äöü
    assert.equal(decodeOctal('ä\\010äöü'), 'ä\bäöü');
  });

  it('handles raw UTF-8 mixed with octal CR/LF', () => {
    assert.equal(decodeOctal('Ärger\\015\\012'), 'Ärger\r\n');
  });

  it('handles raw 3-byte UTF-8 (€) without corruption', () => {
    assert.equal(decodeOctal('€100'), '€100');
  });

  it('handles raw 4-byte UTF-8 emoji without corruption', () => {
    assert.equal(decodeOctal('🚀launch'), '🚀launch');
  });

  it('handles raw emoji mixed with octal escapes', () => {
    assert.equal(decodeOctal('🎉\\015\\012done'), '🎉\r\ndone');
  });

  it('handles full tmux output line with raw Umlaute', () => {
    // Real tmux 3.6a control mode output for "zsh: command not found: äöü"
    assert.equal(
      decodeOctal('zsh: command not found: äöü\\015\\012'),
      'zsh: command not found: äöü\r\n'
    );
  });

  it('handles Japanese characters passed through raw', () => {
    assert.equal(decodeOctal('日本語\\015\\012'), '日本語\r\n');
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

  it('handles raw UTF-8 in output lines', () => {
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    // Simulate what tmux 3.6a actually sends (raw UTF-8 for printable chars)
    parser.feed('%output %42 zsh: command not found: äöü\\015\\012\n');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'output');
    if (events[0].type === 'output') {
      assert.equal(events[0].data, 'zsh: command not found: äöü\r\n');
    }
  });

  it('handles raw UTF-8 split across chunks at line level', () => {
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    // Line split mid-word with Umlaut — safe because TmuxParser buffers lines
    parser.feed('%output %0 Ärg');
    assert.equal(events.length, 0);

    parser.feed('er\\015\\012\n');
    assert.equal(events.length, 1);
    if (events[0].type === 'output') {
      assert.equal(events[0].data, 'Ärger\r\n');
    }
  });
});

// ---------------------------------------------------------------------------
// StringDecoder integration (chunk boundary safety)
// ---------------------------------------------------------------------------

describe('StringDecoder chunk boundary safety', () => {
  it('StringDecoder handles UTF-8 split at byte boundary', () => {
    // This tests the pattern used in tmux-manager.ts
    const { StringDecoder } = require('string_decoder');
    const decoder = new StringDecoder('utf-8');
    const parser = new TmuxParser();
    const events: TmuxEvent[] = [];
    parser.onEvent((e) => events.push(e));

    // ä in UTF-8 is [0xC3, 0xA4] — split across two chunks
    const fullLine = Buffer.from('%output %0 ä\\015\\012\n', 'utf-8');
    // Find position of 0xC3 (first byte of ä)
    const splitPos = fullLine.indexOf(0xc3) + 1; // split after first byte of ä

    const chunk1 = fullLine.subarray(0, splitPos);
    const chunk2 = fullLine.subarray(splitPos);

    // Without StringDecoder: chunk1.toString('utf-8') would produce \uFFFD
    // With StringDecoder: it holds the incomplete byte and completes with chunk2
    parser.feed(decoder.write(chunk1));
    parser.feed(decoder.write(chunk2));

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'output');
    if (events[0].type === 'output') {
      assert.equal(events[0].data, 'ä\r\n');
    }
  });

  it('toString corrupts but StringDecoder preserves at boundary', () => {
    const { StringDecoder } = require('string_decoder');
    // Prove the bug: toString('utf-8') corrupts, StringDecoder doesn't
    const aBuf = Buffer.from('ä', 'utf-8'); // [0xC3, 0xA4]
    assert.equal(aBuf.length, 2);

    // Corrupt path: split and toString each half
    const half1 = aBuf.subarray(0, 1).toString('utf-8');
    const half2 = aBuf.subarray(1).toString('utf-8');
    assert.notEqual(half1 + half2, 'ä'); // CORRUPTED

    // Safe path: StringDecoder
    const decoder = new StringDecoder('utf-8');
    const safe1 = decoder.write(aBuf.subarray(0, 1));
    const safe2 = decoder.write(aBuf.subarray(1));
    assert.equal(safe1 + safe2, 'ä'); // CORRECT
  });
});
