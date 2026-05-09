# Built with Itself

cipher-mux was built with cipher-mux. The test suite, audit reports, and code quality are a direct result of the entity pipeline it ships.

This is not a marketing claim. It is verifiable by reading the commit history and the code.

---

## The Numbers

| Metric | Value |
|--------|-------|
| Source files | 201 |
| Lines of code | ~39.500 |
| Test files | 124 |
| Test cases | 1.207 |
| Test suites | 246 |
| Test ratio | 1 test per ~33 LOC |
| Pass rate | 100% |
| Test runtime | ~90 seconds |
| Production dependencies | 14 |
| Main process modules | 27 |
| Renderer components | 33 |
| MCP tools | 57 |
| IPC channels | ~97 |
| CSS themes | 15 |
| Entity types | 13 |
| Development waves | 7 |
| Commits (public) | 100 |

## How the Entity Pipeline Produced This

cipher-mux ships entity types that form a development pipeline. During its own development, these entities did the work:

**Ideation Partner** explored features before implementation — requirements, trade-offs, scope. No code was written before the idea was refined.

**Refinement** turned approved ideas into structured specs: REQ-IDs, acceptance criteria, handoff to the Cyber Factory. The same entity runs a second pass after implementation — checking that what was built matches what was specified.

**Cyber Factory** broke approved specs into sub-tasks, classified complexity, routed to the right model tier (haiku for boilerplate, sonnet for business logic, opus for architecture), and tracked worker sessions.

**Testing Assistant** wrote tests for every module. Not because someone said "write tests" — because the entity's CLAUDE.md says: run tests, check coverage, probe adversarially, hand off failures to the debugger. The growth tells the story:

| Wave | Tests | What happened |
|------|-------|---------------|
| Welle 0 (baseline) | ~400 | Initial hub copy |
| Welle 5 (cutover) | 841 | Entity system, cyber factory, debugger |
| Welle 7 (pre-release) | 1.207 | Testing assistant + audit pipeline active |

366 tests were added in the last two waves — after the testing assistant entity was wired into the pipeline. It wrote tests, found bugs, handed findings to the debugger, and the debugger fixed them. The human approved PRs.

**Debugger** received findings from the testing assistant, diagnosed root causes, planned fixes, verified them with tests, and produced walkthrough documents explaining what went wrong and why.

**Audit** (that's me) ran the final quality gate: OWASP security check, ADR consistency, credential scanning, cognitive debt scoring, release recommendation. The [AUDIT-REPORT.md](../AUDIT-REPORT.md) in this repo was produced by this entity.

## What This Means for You

When you use cipher-mux, you get the same pipeline. The entities that built this codebase are the entities you launch in your grid. The CLAUDE.md templates, the MCP tool permissions, the handoff protocols — they are not theoretical. They were load-tested on a 39.500-line Electron app.

The quality is not the result of a disciplined developer manually writing 1.207 tests. It is the result of a process where the testing assistant writes tests because that is what it does, the debugger fixes failures because that is what it does, and the audit entity blocks releases with unresolved high-severity findings because that is what it does.

The developer's job was to design the process and stay out of its way.

## Test Coverage by Subsystem

| Subsystem | Test Files | What is tested |
|-----------|-----------|----------------|
| Cyber Factory | 8 | Manager, diagnostics, escalation, model routing, risk review, worker monitoring |
| Debugger | 9 | Findings parsing, fix planning, verification, walkthrough rendering, worker lifecycle |
| Hub | 9 | Integration, inventory, migration plans, apply, verify, release, rollback |
| Testing Assistant | 7 | Test runner, quality audit, adversarial probing, findings reporting, handoff |
| Ideation Partner | 4 | Brain manager, skill registry, requirements generator, templates |
| Refinement | 4 | Purpose check, re-audit, requirement ID builder, templates |
| Companion Memory | 3 | CRUD, FTS5 search, credential filtering, workspace scoping |
| Audit | 2 | Manager lifecycle, release recommender |
| Task System | 6 | Manager, schema, hooks, watcher, integration, types |
| Notes | 8 | Manager, search index, tagging, tag repository, tree view, bulk ops |
| MCP | 4 | Server lifecycle, tool registration, handoff kernel, handoff tools |
| Voice | 4 | Input router, state machine, STT engine, audio utils |
| Session | 5 | Recovery, resume/fork/orphan, statusline env, entity assets, entity registry |
| Core | 8 | Config store, tmux parser, output batcher, shell escape, project scanner, brand |

## The Constraint That Matters

cipher-mux is built by one person. Not a team. Not a company. One developer with a cockpit.

The entity pipeline does not replace the developer. It replaces the parts of development that are mechanical, repetitive, and error-prone: writing test boilerplate, checking for credential leaks, verifying that a fix actually passes, scanning for OWASP issues, producing structured bug reports from voice recordings.

The developer focuses on architecture, product decisions, and reviewing what the entities produce. That is the workflow cipher-mux is designed for.
