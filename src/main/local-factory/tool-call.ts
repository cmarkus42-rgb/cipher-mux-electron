import type { DispatchArgs, LocalFactoryRunner } from './runner'

/**
 * Die Weiche des Werkzeugs `mux_local_worker_dispatch`, ohne MCP und Electron —
 * damit sie sich testen lässt.
 *
 * Das Schema hält die Dispatch-Felder optional, weil ein `accept` sie nicht
 * braucht; Pflicht sind sie trotzdem — `validateAuftrag` erzwingt sie beim
 * Dispatch. Ein `accept` ohne `laufId` und `haeppchen` ist ein Fehler und fällt
 * nicht still in einen Dispatch durch.
 */

export type ToolArgs = Partial<DispatchArgs> & { accept?: boolean }

export async function handleLocalFactoryCall(
  runner: Pick<LocalFactoryRunner, 'dispatch' | 'accept'>,
  args: ToolArgs,
): Promise<{ result: unknown; isError: boolean }> {
  if (args.accept) {
    if (!args.laufId || args.haeppchen === undefined) {
      return {
        result: { ok: false, error: 'accept braucht laufId und haeppchen (beide aus der Weckzeile bzw. dem ersten Dispatch).' },
        isError: true,
      }
    }
    const r = runner.accept(args.laufId, args.haeppchen)
    return r.ok
      ? { result: { ok: true, abgenommen: args.haeppchen }, isError: false }
      : { result: r, isError: true }
  }
  const res = await runner.dispatch(args as DispatchArgs)
  return { result: res, isError: !res.ok }
}
