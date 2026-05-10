# Testcase Resolution Status

**Date:** 2026-05-09
**Status:** Approved
**Scope:** TestcaseView, testcase-parser, mux_testcase_update MCP tool

## Problem

Testcase items currently support only three states: open, pass, fail. For failed tests, there is no way to track what happened after the failure was recognized — whether a bug report was filed, whether the issue is under investigation, or whether it was deliberately accepted. This makes it hard to manage a structured testing process.

## Solution

Add a `resolution` sub-status to failed testcase items. Resolution is orthogonal to the test status and only applies when `status === 'fail'`.

## Resolution Values

| Value | Meaning |
|---|---|
| `unresolved` | Fail recognized, nothing done yet (implicit default) |
| `in_review` | Under investigation, needs more time or info |
| `addressed` | Bug report filed or fix initiated |
| `fixed` | Fix is in, verified — terminal state for this testcase |
| `wont_fix` | Deliberately accepted, no action needed |

A fail stays a fail. `fixed` does not flip the status to `pass` — it means the fail has been resolved. A retest happens in a new testcase (new sheet).

## Data Model

### New Type

```typescript
export type TestcaseResolution = 'unresolved' | 'in_review' | 'addressed' | 'fixed' | 'wont_fix'
```

### TestcaseItem Extension

```typescript
export interface TestcaseItem {
  id: string
  description: string
  status: TestcaseStatus
  comment: string
  screenshotRef?: string
  lineIndex: number
  resolution?: TestcaseResolution  // only relevant when status === 'fail'
}
```

### Implicit Default

`undefined` = `unresolved`. Existing testcases require no migration.

### Markdown Serialization

Resolution is stored as a `{value}` marker at the end of the line:

```markdown
- [-] **T-UI.3** Copy-paste broken // comment {addressed}
- [-] **T-UI.4** Layout issue {fixed}
- [-] **T-UI.5** Unhandled fail
```

- `{resolution}` always at end of line, after comment if present
- `{unresolved}` is never written — absence = unresolved
- Parser regex: `\{(in_review|addressed|fixed|wont_fix)\}$` at line end

## UI

### Cycle-Button

- Second cycle-button next to the existing tri-state checkbox
- Only visible when `status === 'fail'`
- Cycle order: unresolved -> in_review -> addressed -> fixed -> wont_fix -> unresolved
- Color-coded per resolution value

### Statusbar

Existing: `pass: X | fail: X | open: X | progress: X%`

Extended: fail count broken down by resolution when fails exist:

```
pass: 5 | fail: 3 (1 fixed, 1 addressed, 1 unresolved) | open: 2 | 60%
```

### Filter

- Resolution filters in the filter bar, same tri-mode logic as existing status filters (neutral/positive/negative)
- Only visible when fail items exist

## MCP Tool

### New Operation in `mux_testcase_update`

```typescript
{ op: 'set_resolution', itemId: string, resolution: 'unresolved' | 'in_review' | 'addressed' | 'fixed' | 'wont_fix' }
```

**Validation:** Returns error if the target item does not have `status: fail`. Resolution can only be set on failed items.

### Tool Description Update

Update the `mux_testcase_update` tool description so Testing-Assistent and Companion know about `set_resolution` and when to use which value.

## Affected Files

| File | Changes |
|---|---|
| `src/main/notes/testcase-parser.ts` | New type, parse `{resolution}`, serialize `{resolution}` |
| `src/renderer/components/TestcaseView.tsx` | Resolution cycle-button, statusbar breakdown, resolution filters |
| `src/renderer/components/NotesCell.tsx` | Pass resolution updates through to save |
| `src/main/mcp/mcp-tools.ts` | New `set_resolution` operation in `mux_testcase_update` |
| Entity instructions (Testing-Assistent, Companion) | Document `set_resolution` usage |
| `test/main/testcase-parser.test.ts` | Tests for resolution parse/serialize |
| `test/main/testcase-update.test.ts` | Tests for `set_resolution` operation |

## No Migration Required

Existing testcases work unchanged. Missing `resolution` field = `unresolved`.
