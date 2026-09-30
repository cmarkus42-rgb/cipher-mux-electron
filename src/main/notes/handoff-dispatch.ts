/**
 * Handoff dispatch — hand a note to a session, with the world state computed
 * on the way out.
 *
 * Two things existed side by side before this: the handoff as an artefact
 * (`NoteManager.createHandoff`) and the handoff as an act (`executeHandoff`
 * in the MCP handoff kernel). This joins them. The note carries the durable
 * part; the delta against its anchor commit is computed here, at dispatch,
 * and prepended.
 *
 * Delivery itself is injected (`DeliverFn`) so this logic is testable without
 * tmux, a live session or the MCP layer.
 */
import type { NoteManager } from './note-manager'
import { computeHandoffDelta, formatDeltaBlock } from './handoff-delta'

export interface DeliverConfig {
  targetEntityId: string
  senderEntityId: string
  sessionName: string
  projectPath?: string
  payload: Record<string, unknown>
}

export type DeliverResult =
  | { ok: true; targetSessionId: string; wasExisting: boolean }
  | { ok: false; error: string }

export type DeliverFn = (config: DeliverConfig) => Promise<DeliverResult>

export interface DispatchDeps {
  noteManager: NoteManager
  deliver: DeliverFn
}

export interface DispatchArgs {
  noteId: string
  /** Overrides the note's `to_entity`. Required when that is "any". */
  toEntity?: string
  /** Overrides the note's `anchor_repo` as the tree the delta is computed against. */
  projectPath?: string
  /** Re-dispatch a handoff that is already marked consumed. */
  force?: boolean
}

export type DispatchOutcome =
  | {
      ok: true
      noteId: string
      title: string
      targetEntityId: string
      targetSessionId: string
      wasExisting: boolean
      /** Parts of the state block that could not be computed. Empty is good. */
      deltaProblems: string[]
    }
  | { ok: false; error: string }

/**
 * Build the message body: state block first, then the note itself.
 *
 * The state block goes first on purpose. It is the part the receiving session
 * must trust over anything the note claims about the current tree.
 */
function buildContent(stateBlock: string, title: string, body: string): string {
  return [stateBlock, '', '---', '', `# ${title}`, '', body].join('\n')
}

export async function dispatchHandoffNote(
  deps: DispatchDeps,
  args: DispatchArgs,
): Promise<DispatchOutcome> {
  const { noteManager, deliver } = deps

  const note = await noteManager.read(args.noteId)
  if (!note) {
    return { ok: false, error: `Note nicht gefunden: ${args.noteId}` }
  }

  if (!note.info.tags.includes('handoff')) {
    return {
      ok: false,
      error: `Note ${args.noteId} ist keine Übergabe (Tag "handoff" fehlt) — nicht dispatchbar.`,
    }
  }

  if (note.info.handoffStatus === 'consumed' && !args.force) {
    return {
      ok: false,
      error:
        `Übergabe "${note.info.title}" ist bereits zugestellt (consumed). `
        + 'Mit force erneut zustellen, wenn das gewollt ist.',
    }
  }

  const targetEntityId = args.toEntity ?? note.info.toEntity ?? 'any'
  if (targetEntityId === 'any') {
    return {
      ok: false,
      error:
        `Übergabe "${note.info.title}" nennt kein konkretes Ziel ("any"). `
        + 'Zielentity beim Dispatch angeben.',
    }
  }

  // ─── State block ───────────────────────────────────────────
  // Computed, never stored. Every failure below degrades to a visible note
  // in the payload rather than a failed dispatch: a handoff delivered without
  // its state block beats one that never arrives.
  const repoPath = args.projectPath ?? note.info.anchorRepo ?? null
  let stateBlock: string
  let deltaProblems: string[] = []

  if (!repoPath) {
    stateBlock = [
      '## Zustand (berechnet beim Dispatch, nicht gespeichert)',
      '',
      '**Nicht berechenbar:**',
      '- Kein Anker-Repository in der Übergabe hinterlegt — kein Delta bestimmbar.',
    ].join('\n')
    deltaProblems = ['Kein Anker-Repository in der Übergabe hinterlegt.']
  } else {
    try {
      const delta = await computeHandoffDelta({
        repoPath,
        anchorCommit: note.info.anchorCommit ?? null,
        body: note.body,
      })
      stateBlock = formatDeltaBlock(delta)
      deltaProblems = delta.problems
    } catch (err) {
      // computeHandoffDelta is written not to throw; this is the belt to that
      // braces, so an unforeseen failure still lets the handoff through.
      const message = err instanceof Error ? err.message : String(err)
      stateBlock = [
        '## Zustand (berechnet beim Dispatch, nicht gespeichert)',
        '',
        '**Nicht berechenbar:**',
        `- Delta-Berechnung fehlgeschlagen: ${message}`,
      ].join('\n')
      deltaProblems = [`Delta-Berechnung fehlgeschlagen: ${message}`]
    }
  }

  // ─── Deliver ───────────────────────────────────────────────
  const senderEntityId = note.info.fromSession ?? 'mux'
  const result = await deliver({
    targetEntityId,
    senderEntityId,
    sessionName: targetEntityId,
    ...(repoPath ? { projectPath: repoPath } : {}),
    payload: {
      note_id: note.info.id,
      content: buildContent(stateBlock, note.info.title, note.body),
    },
  })

  if (!result.ok) {
    // Deliberately no status change — the handoff is still waiting.
    return { ok: false, error: result.error }
  }

  await noteManager.markHandoffConsumed(note.info.id, result.targetSessionId)

  return {
    ok: true,
    noteId: note.info.id,
    title: note.info.title,
    targetEntityId,
    targetSessionId: result.targetSessionId,
    wasExisting: result.wasExisting,
    deltaProblems,
  }
}
