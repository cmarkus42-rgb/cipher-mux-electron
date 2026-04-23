# Adapter Test Protocol

This document describes how to validate a new agent adapter implementation. The goal: a contributor can clone the repo on Saturday morning, implement an adapter, test it with this protocol, and open a PR by Sunday evening.

## Prerequisites

- Working development setup (see [CONTRIBUTING.md](../../CONTRIBUTING.md))
- The agent CLI you are adapting (e.g., Codex, Copilot CLI) installed and working
- tmux running

## Step 1: Scaffold

Copy the reference stub and rename it:

```bash
cp src/main/agent/adapters/_reference-stub.ts src/main/agent/adapters/my-agent.ts
```

Implement the required interface methods. At minimum:

- `id` — unique identifier (e.g., `'codex'`)
- `displayName` — shown in the UI (e.g., `'Codex'`)
- `tier` — `'tier-2'` for community adapters
- `buildLaunchCommand(opts)` — the shell command to start a session
- `getProjectMarkers()` — files that identify projects for this agent
- `supports(feature)` — capability declarations

## Step 2: Unit Tests

Create `test/main/agent/adapters/my-agent.test.ts` with at minimum:

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MyAgentAdapter } from '../../../../src/main/agent/adapters/my-agent'

describe('MyAgentAdapter', () => {
  const adapter = new MyAgentAdapter()

  it('has correct id and tier', () => {
    assert.equal(adapter.id, 'my-agent')
    assert.equal(adapter.tier, 'tier-2')
  })

  it('builds a valid launch command', () => {
    const cmd = adapter.buildLaunchCommand({
      projectPath: '/tmp/test-project',
      sessionName: 'Test',
    })
    assert.equal(typeof cmd.cmd, 'string')
    assert.ok(Array.isArray(cmd.args))
  })

  it('declares capabilities correctly', () => {
    // Most Tier-2 adapters will not support these
    assert.equal(adapter.supports('mcp-injection'), false)
    assert.equal(adapter.supports('status-line'), false)
    assert.equal(adapter.supports('message-bus-participant'), false)
  })

  it('returns project markers', () => {
    const markers = adapter.getProjectMarkers()
    assert.ok(Array.isArray(markers))
    assert.ok(markers.length > 0)
  })
})
```

Run: `npm run test`

## Step 3: Integration Smoke Test

This is a manual test. Start cipher-mux in dev mode and verify:

### 3a: Session Launch

1. Start cipher-mux: `npm run dev`
2. Start a new session with your adapter (via config or UI)
3. Verify: the agent CLI launches in the tmux pane
4. Verify: the session appears in the activity rail

### 3b: UI Degradation

For each capability your adapter does **not** support, verify the UI degrades correctly:

| Capability | Expected UI when unsupported |
|-----------|------------------------------|
| `status-line` | Context % shows `—` (dash), not 0% |
| `mcp-injection` | Badge "MCP not active" on pane header |
| `message-bus-participant` | Badge "Read-only Bus", no send button in chatroom |
| `skip-permissions` | No auto-accept; user must interact in terminal |

### 3c: Session Lifecycle

1. Start a session with your adapter
2. Send a prompt via the terminal pane (type directly)
3. Verify the agent responds
4. Close the session via the UI
5. Verify the tmux pane is cleaned up
6. Restart cipher-mux
7. Verify recovery dialog does not show phantom sessions

### 3d: Project Scanner

1. Create a test project directory with your adapter's marker file
2. Add the directory to cipher-mux scan paths
3. Verify the project appears in the cockpit with the correct adapter badge

## Step 4: Document

In your PR, include:

- Which capabilities are supported and why
- Known limitations of the agent CLI that affect the adapter
- Any special configuration the user needs (environment variables, config files)

## Checklist

Before opening your PR:

- [ ] All unit tests pass (`npm run test`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Integration smoke test completed (all 4 sections)
- [ ] TSDoc comments on all public methods
- [ ] CHANGELOG entry added
- [ ] Adapter registered in registry

## FAQ

### My agent does not have a `--skip-permissions` equivalent

Set `supports('skip-permissions')` to `false`. The UI will show a note that users need to manually confirm prompts.

### My agent uses a config file instead of CLI flags

Implement `readProjectInstructions()` to parse your agent's config format and return a normalized `ProjectInstructions` object.

### My agent does not have a CLI

cipher-mux requires a CLI that runs in a terminal. If your agent only has an API, you would need to write a thin CLI wrapper first. This is out of scope for cipher-mux itself.
