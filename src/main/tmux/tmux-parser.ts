/**
 * tmux Control Mode (-C) event parser.
 *
 * Control mode emits structured text lines prefixed with `%`.
 * This module decodes octal-encoded data and parses each line
 * into a typed TmuxEvent discriminated union.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TmuxEvent =
  | { type: 'output'; paneId: string; data: string }
  | { type: 'begin'; time: number; number: number; flags: number }
  | { type: 'end'; time: number; number: number; flags: number }
  | { type: 'error'; time: number; number: number; flags: number }
  | { type: 'sessions-changed' }
  | { type: 'session-changed'; sessionId: string; name: string }
  | { type: 'window-add'; windowId: string }
  | { type: 'window-close'; windowId: string }
  | { type: 'window-renamed'; windowId: string; name: string }
  | { type: 'pane-mode-changed'; paneId: string }
  | { type: 'exit'; reason: string }
  | { type: 'layout-change'; windowId: string; layout: string }
  | { type: 'unknown'; line: string };

// ---------------------------------------------------------------------------
// Octal decoding
// ---------------------------------------------------------------------------

const OCTAL_RE = /\\(\d{3})/g;
const BACKSLASH_RE = /\\\\/g;

/**
 * Decode tmux octal-encoded sequences in a string.
 *
 * tmux encodes non-printable bytes as three-digit octal escapes
 * (e.g. `\015` for CR, `\012` for LF, `\033` for ESC).
 * Literal backslashes are encoded as `\\`.
 */
export function decodeOctal(str: string): string {
  // First pass: decode octal sequences like \015 → char
  const decoded = str.replace(OCTAL_RE, (_match, digits: string) => {
    return String.fromCharCode(parseInt(digits, 8));
  });
  // Second pass: unescape literal backslashes
  return decoded.replace(BACKSLASH_RE, '\\');
}

// ---------------------------------------------------------------------------
// Line parser
// ---------------------------------------------------------------------------

/**
 * Parse a single tmux control-mode line into a TmuxEvent.
 *
 * Lines that don't match any known pattern are returned as `{ type: 'unknown' }`.
 */
export function parseLine(line: string): TmuxEvent {
  // %output %<pane-id> <data>
  const outputMatch = line.match(/^%output (%\d+) (.*)$/);
  if (outputMatch) {
    return {
      type: 'output',
      paneId: outputMatch[1],
      data: decodeOctal(outputMatch[2]),
    };
  }

  // %begin <time> <number> <flags>
  const beginMatch = line.match(/^%begin (\d+) (\d+) (\d+)$/);
  if (beginMatch) {
    return {
      type: 'begin',
      time: parseInt(beginMatch[1], 10),
      number: parseInt(beginMatch[2], 10),
      flags: parseInt(beginMatch[3], 10),
    };
  }

  // %end <time> <number> <flags>
  const endMatch = line.match(/^%end (\d+) (\d+) (\d+)$/);
  if (endMatch) {
    return {
      type: 'end',
      time: parseInt(endMatch[1], 10),
      number: parseInt(endMatch[2], 10),
      flags: parseInt(endMatch[3], 10),
    };
  }

  // %error <time> <number> <flags>
  const errorMatch = line.match(/^%error (\d+) (\d+) (\d+)$/);
  if (errorMatch) {
    return {
      type: 'error',
      time: parseInt(errorMatch[1], 10),
      number: parseInt(errorMatch[2], 10),
      flags: parseInt(errorMatch[3], 10),
    };
  }

  // %sessions-changed
  if (line === '%sessions-changed') {
    return { type: 'sessions-changed' };
  }

  // %session-changed $<id> <name>
  const sessionChangedMatch = line.match(/^%session-changed \$(\d+) (.+)$/);
  if (sessionChangedMatch) {
    return {
      type: 'session-changed',
      sessionId: `$${sessionChangedMatch[1]}`,
      name: sessionChangedMatch[2],
    };
  }

  // %window-add @<id>
  const windowAddMatch = line.match(/^%window-add (@\d+)$/);
  if (windowAddMatch) {
    return { type: 'window-add', windowId: windowAddMatch[1] };
  }

  // %window-close @<id>
  const windowCloseMatch = line.match(/^%window-close (@\d+)$/);
  if (windowCloseMatch) {
    return { type: 'window-close', windowId: windowCloseMatch[1] };
  }

  // %window-renamed @<id> <name>
  const windowRenamedMatch = line.match(/^%window-renamed (@\d+) (.+)$/);
  if (windowRenamedMatch) {
    return {
      type: 'window-renamed',
      windowId: windowRenamedMatch[1],
      name: windowRenamedMatch[2],
    };
  }

  // %pane-mode-changed %<id>
  const paneModeMatch = line.match(/^%pane-mode-changed (%\d+)$/);
  if (paneModeMatch) {
    return { type: 'pane-mode-changed', paneId: paneModeMatch[1] };
  }

  // %exit [reason]
  const exitMatch = line.match(/^%exit(?: (.+))?$/);
  if (exitMatch) {
    return { type: 'exit', reason: exitMatch[1] ?? '' };
  }

  // %layout-change @<id> <layout>
  const layoutMatch = line.match(/^%layout-change (@\d+) (.+)$/);
  if (layoutMatch) {
    return {
      type: 'layout-change',
      windowId: layoutMatch[1],
      layout: layoutMatch[2],
    };
  }

  return { type: 'unknown', line };
}

// ---------------------------------------------------------------------------
// Streaming parser
// ---------------------------------------------------------------------------

export type TmuxEventHandler = (event: TmuxEvent) => void;

/**
 * Streaming parser for tmux control-mode output.
 *
 * Buffers incoming data chunks, splits on newlines, and emits
 * parsed TmuxEvents via the registered handler. Partial lines
 * are held in the buffer until a newline arrives.
 */
export class TmuxParser {
  private buffer = '';
  private handler: TmuxEventHandler | null = null;

  /** Register a handler that will be called for each parsed event. */
  onEvent(handler: TmuxEventHandler): void {
    this.handler = handler;
  }

  /**
   * Feed a chunk of raw data from the tmux control-mode stream.
   *
   * Complete lines (terminated by `\n`) are parsed and emitted
   * immediately. Any trailing partial line is retained in the
   * internal buffer until the next `feed()` call completes it.
   */
  feed(chunk: string): void {
    this.buffer += chunk;

    const lines = this.buffer.split('\n');
    // The last element is either '' (if chunk ended with \n) or a partial line
    this.buffer = lines.pop()!;

    for (const line of lines) {
      if (line.length === 0) continue;
      const event = parseLine(line);
      this.handler?.(event);
    }
  }

  /** Reset the internal buffer. */
  reset(): void {
    this.buffer = '';
  }
}
