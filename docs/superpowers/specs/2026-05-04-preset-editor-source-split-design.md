# Preset Editor UX Redesign: Source-of-Truth Split

**Ticket:** T-BF.4
**Date:** 2026-05-04
**Status:** Approved

## Problem

The Preset Editor shows the assembled CLAUDE.md (including Global Rules, Persona, Workspace Prompt, Context Directories) instead of only the preset-owned content. This leads to:

1. Injected content mixed with preset content in the editor
2. H2 navigation cluttered with 10+ sections from injected content
3. Global Rules appearing both in the editor and in the dedicated Global Rules panel
4. Users accidentally editing injected sections that get overwritten on next session start

**Root cause:** The session-manager writes injected sections directly into the entity's `CLAUDE.md` file. The same file serves as both source-of-truth for preset content and assembly target for runtime injection. The editor reads the assembly result, not the source.

## Solution: Source-of-Truth Split (Ansatz B)

Separate the preset-owned content from the assembly result by introducing a `preset.md` file.

### File Structure

```
~/.config/cipher-mux/entities/<id>/
  preset.md          <- Source-of-truth (preset-owned content only)
  CLAUDE.md          <- Generated at session start (preset.md + injected layers)
```

- `preset.md` is what the editor reads and writes
- `CLAUDE.md` is regenerated on every session start (overwritten)
- Manual edits to `CLAUDE.md` are lost on next session start (by design)

### Assembly Order

The session-manager builds `CLAUDE.md` at session start:

```
1. preset.md content              <- Base, copied verbatim
2. ## Persona                     <- Injected after first H1 (existing behavior)
3. ## Global Rules                <- Appended at end
4. ## Workspace Prompt            <- Optional, when workspace active
5. ## Context Directories         <- Optional, when workspace active
```

The assembly logic simplifies: no more "inject or replace" with regex matching. Each session start writes CLAUDE.md from scratch by concatenating layers.

### Migration

**Trigger:** App start, once per installation.

**Logic per entity directory:**
1. Check if `preset.md` exists
2. If not: read `CLAUDE.md`, strip known injected sections (`## Global Rules`, `## Persona`, `## Workspace Prompt`, `## Context Directories`), write remainder as `preset.md`
3. Leave `CLAUDE.md` untouched (gets regenerated on next session start)
4. Set `presetMigrationDone: true` in config-store after all entities processed

**Strip logic:** Same regex pattern as existing `injectSection()` — match `## <SectionName>` until next `## ` or EOF.

**Edge case:** Entity dirs where sections were never injected — `preset.md` becomes a copy of `CLAUDE.md`. Harmless.

### IPC Changes (ipc-hub.ts)

**`PRESETS_READ`:**
- Reads `entities/<id>/preset.md` instead of `CLAUDE.md`
- Fallback: if `preset.md` missing but `CLAUDE.md` exists, strip on-the-fly and return (defensive, covers pre-migration state)

**`PRESETS_SAVE`:**
- Writes `entities/<id>/preset.md` instead of `CLAUDE.md`
- Does NOT regenerate `CLAUDE.md` (happens at next session start)

**`PRESETS_READ_INJECTED` (new):**
- Returns metadata about injected sections: `{ sections: Array<{ name: string, source: string }> }`
- Example: `[{ name: "Global Rules", source: "global-rules.md" }, { name: "Persona", source: "Mimir (character)" }]`
- No content — just names and origin for the preview UI

### Editor Changes (PresetEditor.tsx)

**What changes:**
- Reads/writes `preset.md` via updated IPC handlers
- Label changes from "CLAUDE.md" to "preset.md", hint text updated
- H2 navigation only shows preset-owned sections (automatic, since injected content is no longer in the file)
- New: collapsed read-only "Injected Layers" preview below the editor, showing which sections get added at session start (uses `PRESETS_READ_INJECTED`)

**What stays the same:**
- GlobalRulesEditor (already reads/writes `global-rules.md` directly)
- Persona dropdown (controls persona-resolver, not the file)
- Edit lock, Revert, Save, Sort, Visibility, Delete — unchanged

### Session-Manager Changes (session-manager.ts)

**`startEntity()` flow:**
1. Read `preset.md` (instead of reading existing `CLAUDE.md`)
2. Concatenate injected layers (Persona, Global Rules, Workspace sections)
3. Write result as `CLAUDE.md`

**Simplified methods:**
- `injectGlobalRulesSection()` no longer needs "find existing section and replace" logic — just appends
- `injectPersonaSection()` — same simplification
- `injectSection()` with regex-replace only needed for non-entity project paths (workspace sections on generic projects)

## Affected Files

| File | Change |
|---|---|
| `src/main/ipc-hub.ts` | PRESETS_READ/SAVE target `preset.md`; new PRESETS_READ_INJECTED |
| `src/main/session/session-manager.ts` | Assembly reads `preset.md`, writes `CLAUDE.md` from scratch |
| `src/renderer/components/PresetEditor.tsx` | Label/hint update, injected-layers preview |
| `src/shared/ipc-channels.ts` | New PRESETS_READ_INJECTED channel |
| `src/main/preload.ts` | Expose new IPC channel |
| Migration code (new file or in app startup) | One-time CLAUDE.md -> preset.md extraction |

## Out of Scope

- Changing the injection mechanism itself (CLAUDE.md remains the file Claude Code reads)
- Rich markdown editor (stays plain textarea)
- Live preview of assembled CLAUDE.md
