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

- **Node.js** >= 18
- **tmux** (macOS: `brew install tmux`, Linux: `sudo apt install tmux`)
- **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code`) for full functionality testing

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

**Scopes** (optional): `tmux`, `mcp`, `session`, `voice`, `task`, `grid`, `renderer`, `ci`

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

cipher-mux supports pluggable agent adapters. Claude Code is the Tier-1 adapter with full feature support. Aider is the Tier-2 adapter with reduced capabilities.

To write a new adapter:

1. **Read the interface** at `src/main/agent/agent-adapter.ts`.
2. **Copy the reference stub** at `src/main/agent/adapters/_reference-stub.ts` as your starting point.
3. **Implement the required methods.** At minimum: `buildLaunchCommand`, `getProjectMarkers`, `supports`.
4. **Register your adapter** in `src/main/agent/registry.ts`.
5. **Follow the adapter test protocol** at [`docs/contributing/adapter-test-protocol.md`](docs/contributing/adapter-test-protocol.md) to validate your work.

### Capability System

Adapters declare capabilities via `supports(feature)`. The UI and orchestration layers check capabilities before using optional features. If your adapter does not support a capability, the UI degrades gracefully (shows placeholder badges, disables features).

See the capability matrix in [ARCHITECTURE.md](ARCHITECTURE.md#adapter-capabilities) for the full list and UI degradation behavior.

### The Weekend Test

A new adapter should pass the "weekend test": a contributor can clone the repo on Saturday morning, read the docs, implement the adapter, test it, and open a PR by Sunday evening. If the adapter interface or test protocol is too complex for that, it is a bug in our docs.

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
