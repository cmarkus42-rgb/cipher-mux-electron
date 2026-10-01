# Contributing to cipher-mux

Thank you for considering a contribution. This document covers the development setup, conventions, and PR process.

## Maintenance Status

**Current status: active**

This tool is maintained by a single person as an open-source side project. The maintenance mode is visible in the README (`active` / `on hold` / `archived`).

- **Active:** PRs are reviewed, issues are triaged, releases happen.
- **On hold:** PRs are welcome but response times are not guaranteed. The tool works, but active development is paused.
- **Archived:** No further development. Forks are encouraged; the README will link to recommended alternatives.

The status is updated honestly and promptly. If it changes, a CHANGELOG entry and README update accompany it.

## Development Setup

### Prerequisites

- **Node.js 22.** `package.json` declares `engines.node: ">=22 <23"` and `.nvmrc` pins `22`. npm evaluates neither, so this is on you: under a newer Node, `better-sqlite3` does not compile, `rebuild:node` aborts, and the `&&` chain in `npm run test` runs **zero** tests while looking like a clean pass. No test output means the wrong Node.
- **tmux** (macOS: `brew install tmux`, Linux: `sudo apt install tmux`)
- **At least one agent CLI.** For full-functionality testing use the **Claude Code CLI**
  (`npm install -g @anthropic-ai/claude-code`) — it is the Tier-1 adapter and the only one for
  which every capability has been measured. **Codex CLI** and **opencode** are supported at
  Tier 2; install them only if you are working on those adapters. The setup wizard does not
  install or check them.

### Getting Started

```bash
git clone https://github.com/cmarkus42/cipher-mux-electron.git
cd cipher-mux-electron
npm install
npm run dev
```

`npm run dev` runs the TypeScript compiler (watch mode) and Vite dev server concurrently. The Electron window opens with hot-reload for the renderer.

### Key Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev mode (watch + Vite) |
| `npm run build` | Full production build |
| `npm run test` | Run test suite (Node.js test runner) |
| `npm run lint` | ESLint (includes TSDoc checks) |
| `npm run dist` | Package as DMG (macOS) or AppImage (Linux) |
| `npm run format` | Prettier formatting |

### Native Module Rebuilds

The project uses `better-sqlite3` (native module). If you switch between Node.js and Electron contexts:

```bash
npm run rebuild:node      # For running tests (Node.js)
npm run rebuild:electron  # For running the app (Electron)
```

`npm run test` handles this automatically.

## Running Tests

```bash
npm run test
```

Tests use the built-in Node.js test runner with `tsx` for TypeScript support. Test files live in `test/` mirroring the `src/` structure.

**Write tests for:**
- All business logic in `src/main/`
- New MCP tools
- Adapter implementations
- State transitions (session lifecycle, task state machine)

**You do not need tests for:**
- Pure UI components (unless they contain logic beyond rendering)
- Type definitions
- Configuration files

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests
- `chore` — build process, CI, dependencies
- `perf` — performance improvement

**Scopes** (optional): `agent`, `tmux`, `mcp`, `session`, `voice`, `task`, `grid`, `renderer`, `ci`

**Examples:**
```
feat(mcp): add mux_tasks_list tool
fix(session): handle tmux pane exit during recovery
docs: update ARCHITECTURE.md with adapter contract
```

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Make your changes. Keep commits focused and atomic.
3. Run `npm run lint` and `npm run test` locally before pushing.
4. Open a PR against `main`.

### PR Checklist

Every PR should address these items (also in the PR template):

- [ ] Tests added or updated for changed behavior
- [ ] `npm run lint` passes (includes TSDoc checks)
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds
- [ ] CHANGELOG.md updated (if user-facing change)
- [ ] TSDoc comments on new public APIs
- [ ] ADR written if an architectural decision was made (in `docs/decisions/`)

### What Makes a Good PR

- **Small scope.** One feature or fix per PR. If your change touches more than ~10 files, consider splitting it.
- **Clear description.** Explain *what* changed and *why*. Link to issues if applicable.
- **No unrelated changes.** Resist the urge to fix formatting or rename variables in files you are not otherwise changing.

## Writing an Adapter

cipher-mux supports pluggable agent adapters. Three ship today:

| Adapter | id | Tier | Capabilities declared `false` |
|---------|----|------|------------------------------|
| Claude Code | `claude-code` | Tier-1, the default | none |
| Codex CLI | `codex` | Tier-2 | `sub-agents` |
| opencode | `opencode` | Tier-2 | `status-line`, `sub-agents` |

Beyond those flags, both Tier-2 adapters were run against their real CLI, and both enforce role boundaries — Codex through a `PreToolUse` hook, opencode through a plugin on `tool.execute.before`. Either is a usable template. What `opencode` demonstrates and `codex` does not is that the boundary has to be generated **where the file that registers it is written**: Codex shipped for half a day with a boundary that was configured but never passed in.

To write a new adapter:

1. **Read the interface** at `src/main/agent/agent-adapter.ts`.
2. **Copy the reference stub** at `src/main/agent/adapters/_reference-stub.ts` as your starting point.
3. **Read `adapters/codex.ts` and `adapters/opencode.ts` before you write anything.** Their file headers are not commentary — they list the CLI properties that were measured, and name the ones that were not. That is the shape your own header should take.
4. **Implement the required methods.** At minimum: `buildLaunchCommand`, `getProjectMarkers`, `readProjectInstructions`, `supports`, `getCapabilities`, `sendPrompt`, and the three prompt-fragment builders. `postLaunchInjection`, `getContextUsage` and `attachStatusHook` are optional — and if you declare `status-line: false`, leave the latter two out entirely rather than stubbing them to return nothing.
5. **Register your adapter** in `src/main/agent/registry.ts`.
6. **Follow the adapter test protocol** at [`docs/contributing/adapter-test-protocol.md`](docs/contributing/adapter-test-protocol.md) to validate your work.

### Measure, do not assume

This is the single most important rule in adapter work, and it comes out of building the second and third adapter rather than out of theory.

**A CLI's behaviour is not what its documentation says, and a wrong guess usually fails silently.** Three properties of codex-cli 0.155.1 each failed quietly when assumed:

1. Without `--dangerously-bypass-hook-trust` a freshly written hook does not fire — no warning, no log line, the tool call simply goes through.
2. The hook `matcher` carries the *Claude Code* tool name: the input reports `tool_name: "Bash"` although the output shows `exec` and `/bin/zsh -lc`. `matcher = "shell"` matches nothing and skips the hook.
3. `hooks.<Event>` entries are **not validated at all** — `{bogus=1}` and an invented event name both pass. Writing the file proves nothing; only observing the hook fire does.

The lesson generalises: **prove the effect, not the file.** And a corollary that applies to every adapter — four of the Codex findings only surfaced in the running app, and *none* of them in the test suite. Three of those let the session come up and look like a success: a `-C` flag that pulled the CLI out of the directory holding its own config (no MCP tools, no usage hook, no boundary — silently), an adapter resolution that diverged across three call sites, a blocking update dialog that an unattended session simply hangs in. A green suite is necessary and nowhere near sufficient. Budget a manual acceptance pass against the live CLI and write down what you saw.

### Capability System

Adapters declare capabilities via `supports(feature)` and `getCapabilities()`. The UI and orchestration layers check capabilities before using optional features. If your adapter does not support a capability, the UI degrades gracefully (placeholder badges, disabled features) and the preset editor names the gap *before* the session starts.

**Declare `false` for anything you have not measured.** `false` in this codebase means "unproven", not "impossible", and that is the honest value: a gate that says `true` on a hunch makes the Mux call a tool that grabs at nothing. Say so in a comment next to the flag, with what you tried — both Tier-2 adapters do.

There are **seven** features. See the capability matrix in [ARCHITECTURE.md](ARCHITECTURE.md#adapter-capabilities-adapterfeature) for the full list and the UI degradation behaviour, and [ARCHITECTURE.md §"Where the three CLIs diverge structurally"](ARCHITECTURE.md#where-the-three-clis-diverge-structurally) for the two places where a CLI difference is a mechanism and not a parameter — MCP binding and role boundaries. If your CLI cannot send custom HTTP headers, read `src/main/mcp/bound-token.ts` before inventing anything.

### Settings your adapter inherits

Once registered, your adapter appears in the **CLI** field of the preset editor and in **Default CLI** in Settings → General. Resolution is `app.entityAdapters[<role>]` > the role's own `adapterId` > `agent.defaultAdapter`, implemented in `src/main/session/entity-runtime.ts` with the mapping functions in `src/main/agent/entity-adapter-map.ts`.

Those keys live in `~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json` (that is `app.getPath('userData')`). **Not** in `~/.config/cipher-mux/config.json` — that file exists, the Mux does not read it, and editing it to test your adapter will waste an afternoon.

### The Weekend Test

A new adapter should pass the "weekend test": a contributor can clone the repo on Saturday morning, read the docs, implement the adapter, test it, and open a PR by Sunday evening. If the adapter interface or test protocol is too complex for that, it is a bug in our docs.

Note what the weekend covers and what it does not: the unit tests and the structural work fit. The *measurement* pass against the live CLI is separate work, and skipping it is how a Tier-2 adapter ends up claiming capabilities it does not have.

## Code Style

- **TypeScript strict mode** throughout
- **Preact** for renderer components (`.tsx`)
- **ESLint + Prettier** for formatting
- **TSDoc** on all public exports (enforced by CI)
- `camelCase` for variables and functions, `PascalCase` for components and classes
- `contextIsolation: true`, `nodeIntegration: false` in Electron
- IPC via typed channel constants in `src/shared/ipc-channels.ts`

## Architecture Decisions

Significant technical decisions are recorded as ADRs in `docs/decisions/`. If your change involves a new pattern, a new dependency, or a structural shift, write an ADR first. Use the existing ADRs (001-008) as templates.

## Questions?

Open a [question issue](https://github.com/cmarkus42/cipher-mux-electron/issues/new?template=question.md) or start a discussion. No question is too basic.
