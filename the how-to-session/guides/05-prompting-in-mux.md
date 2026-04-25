# Prompting in cipher-mux — Getting the Systems to Work for You

This guide covers how to write effective input for cipher-mux's specialized systems: the Orchestrator, the MPO, the Launcher, voice input, bugreports, and inter-session communication.

**Type:** How-To Guide (task-oriented)
**Prerequisites:** Guide 03 (Power Moves), Guide 04 (Prompting Fundamentals)
**Time:** 15-20 minutes

---

## Writing Instructions for the Orchestrator

The Orchestrator breaks your request into sub-tasks and assigns them to workers. This means your instruction needs to be decomposable — it must be possible to split it into independent pieces.

### What the Orchestrator Expects

Clear scope, clear boundaries, clear success criteria. The Orchestrator thinks in terms of: "What sessions do I need to create? What does each one do? How do I know it is done?"

### Good vs. Bad Orchestrator Instructions

**Bad:** "Fix the auth stuff and make the frontend look better."

Two problems: "auth stuff" is vague (fix what?), and "look better" is subjective with no success criteria. The Orchestrator cannot decompose this into worker tasks.

**Good:** "Three tasks: 1. Extract the token validation logic from auth.ts into a new file token-validator.ts with unit tests. 2. Add rate limiting to the login endpoint — max 5 attempts per minute per IP. 3. Replace the inline styles in LoginForm.tsx with CSS modules. All tasks are independent."

The Orchestrator can immediately create three workers, each with a clear, self-contained task.

### Sizing Worker Tasks

Each worker gets its own context window. A task should use 60-80% of that window — enough room to work but not so large that the worker runs out of context mid-task.

Rules of thumb:
- One file change = one worker (usually)
- One feature across 2-3 tightly coupled files = one worker
- If a task would require reading more than 10 files to understand, it is too big — break it down further

### What to Watch For

In the sidebar Messages tab:
- **Progress updates** — workers report what they are doing
- **Questions** — sometimes a worker asks for clarification. The Orchestrator tries to answer, but may escalate to you
- **Warnings** — context usage above 80%, repeated errors, or stalled workers
- **Completion** — "All tasks complete. Summary: ..."

If a worker seems stuck (no progress for 10+ minutes), check the sidebar. The Orchestrator's monitoring catches most stalls, but you can also check manually by looking at cell context usage indicators.

---

## Writing Requirements for the Launcher

The Launcher scaffolds a project from a requirements document. The quality of the scaffold is directly proportional to the quality of the input.

### Structure of a Good Requirements Document

```
Goal: [one sentence — what does this project do?]

Target Audience: [who will use it?]

Functional Requirements:
1. [What it must do — be specific]
2. [Each requirement gets a number]
3. [Testable: you can tell if it works or not]

Constraints:
- [Tech stack preferences]
- [What it must NOT do]
- [Design guidelines]

Non-Functional Requirements:
- [Performance targets]
- [Security needs]
- [Accessibility requirements]
```

### Common Mistakes

**Too vague:** "Build an app for managing tasks." — What kind of tasks? For whom? Web, mobile, CLI? What does "managing" mean — create, assign, schedule, track?

**Too prescriptive:** "Use React 19.2 with Zustand for state, Tanstack Router for routing, Tailwind 4 with the oxide engine..." — You are making implementation decisions before understanding the problem. State what you need, not how to build it. Let the Launcher (and Claude) make the technical choices.

**Missing constraints:** No constraints means Claude will make its own choices — and they might not match your expectations. "No backend" or "must work offline" or "must run on Strato shared hosting" are constraints that shape the entire architecture.

**The sweet spot:** Enough detail that someone who knows nothing about your project could build the right thing. Enough freedom that the builder can make good technical decisions.

### The Quality Baseline

If cipher-mux has a quality baseline directory configured, the Launcher uses it as a reference for the depth and quality of the generated scaffold. This is like showing a new architect an example of work you consider excellent and saying "aim for this level."

---

## Writing for MPO Input Requests

When the MPO cannot make a decision autonomously, it sends a bubble to the sidebar. Your response drives the direction of multiple worker sessions.

### What a Bubble Looks Like

```
Question: The authentication sub-project needs a session storage
strategy. Two workers will depend on this decision.

Options:
  A) JWT tokens (stateless, no server storage needed) [recommended]
  B) Server-side sessions with Redis
  C) Cookie-based sessions with encrypted payload

Context: The requirements mention "no external dependencies beyond
the database." Redis would add a dependency. JWT aligns better with
the stated constraints.

[Custom answer field]
```

### How to Answer Effectively

- **Read the recommendation first.** The MPO has context you might not have — it knows what all workers are doing. The recommended option usually has the best reasoning.
- **If you agree:** click the recommended option. Done. Fast.
- **If you disagree:** click a different option, or write a custom answer with your reasoning: "Use B because we need session revocation, and JWT revocation is hard to get right."
- **If you need more info:** write "Explain the trade-offs in more detail" in the custom field. The MPO will elaborate and re-ask.
- **Speed matters.** Workers are paused. A 30-second decision keeps the pipeline moving. A 30-minute deliberation means 30 minutes of idle compute. If you genuinely need time, that is fine — but do not forget there are sessions waiting.

---

## Voice Input Patterns

Voice in cipher-mux is for natural language — instructions, descriptions, thinking out loud. Not for code.

### What Works Well

**Giving instructions:**
"Erstell eine neue React-Komponente die eine Tabelle rendert. Die Tabelle soll sortierbar sein nach jeder Spalte. Die Daten kommen als Array von Objekten rein."

**Describing bugs:**
"Der Save-Button in der NotesCell macht nichts wenn ich drauf klicke. In der Konsole steht irgendwas mit ENOENT. Das passiert nur bei neuen Notizen, nicht bei bestehenden."

**Thinking out loud:**
"Ich überlege ob wir die Authentifizierung als eigenes Modul auslagern oder im API-Gateway lassen. Absenden. Was meinst du?"

### What Does Not Work

**Dictating code:** "function open paren items close paren open curly brace return items dot map..." — Do not do this. Type code. Voice is for what you want, not how to write it.

**Rapid-fire short commands:** Voice needs a moment to detect end of speech. Single-word commands get lost. Use keyboard for quick interactions.

### The Review-Then-Submit Pattern

Text from voice input appears in the terminal but is NOT auto-submitted. This is intentional — it gives you a chance to review the transcription before sending.

1. Speak your instruction
2. Wait for transcription to appear
3. Read it. If correct: say "abschicken" (or "absenden" or "senden")
4. If wrong: use keyboard to correct, then say "abschicken"

This pattern catches Whisper's occasional mis-transcriptions before they become instructions.

---

## Writing Effective Bugreports

A bugreport feeds into the Orchestrator's bug queue. The better the report, the faster the fix.

### What the Orchestrator Needs

**Minimum:** What happened, what you expected, where it happened.

**Ideal:** Steps to reproduce, expected vs. actual behavior, error messages (exact text), affected component/file if known.

### Bad vs. Good

**Bad:** "The button doesn't work."

**Good:** "Steps: 1. Open NotesCell, 2. Create new note, 3. Click Save icon in tab bar. Expected: note saves, toast confirmation. Actual: nothing happens, console shows 'Error: ENOENT: no such file or directory'. Affects: NoteEditor component, save flow for new (unsaved) notes."

### Using Voice Interview Mode

The bugreport dialog has a voice interview option. Ollama asks you questions about the bug and enriches your answers into a structured report. This is great when you are frustrated and just want to vent — the AI turns your stream of consciousness into actionable information.

### Screenshot Capture

The bugreport dialog can capture a screenshot and attach it to the report. Use this for visual bugs — layout issues, missing elements, wrong colors. The screenshot is base64-encoded in the report's YAML frontmatter.

---

## Inter-Session Communication

Sessions in cipher-mux communicate through two channels:

### The Message Bus

A shared SQLite database where sessions post messages tagged with a topic. Anyone can read, anyone can write. The Orchestrator reads the bus regularly to monitor progress.

**Topics:**
- `chat` — user-facing messages, shown in sidebar Messages tab
- `status` — progress updates from workers
- `bug` — incoming bugreport notifications
- `system` — warnings (high context usage, errors)

The bus is asynchronous — you post a message, and other sessions pick it up when they check. There is no guarantee of immediate delivery.

### tmux send-keys (Direct Injection)

For immediate delivery, the Orchestrator uses tmux to type directly into a worker's terminal. This is how initial task instructions are sent — the message bus cannot deliver prompts to an idle Claude session (it is not reading the bus until it has a task).

**When to use which:**
- Status updates, reports, notifications → Message Bus
- Initial task instructions, urgent redirects → tmux send-keys (handled by Orchestrator automatically)

As a user, you rarely interact with either directly. The Orchestrator handles routing. But understanding the distinction helps when debugging communication issues: if a worker did not receive an instruction, it is usually a timing issue with tmux send-keys (the worker was not ready yet), not a bus problem.

---

## Quick Reference: Prompt Patterns for cipher-mux

| System | Key principle |
|---|---|
| Orchestrator | Decomposable tasks with clear boundaries and success criteria |
| MPO | Complete requirements doc with goal, audience, features, constraints |
| MPO Input Requests | Fast decisions, trust recommendations, ask for detail when unsure |
| Voice | Natural language only, review before submit, no code dictation |
| Bugreports | Steps to reproduce > vague descriptions. Use voice interview when frustrated |
| Workers | Standard prompting (Guide 04) — one topic, specific, constrained |

**Next step:** Guide 06 (Token Craft) covers how to work efficiently with context windows, choose the right model, and keep sessions productive.
