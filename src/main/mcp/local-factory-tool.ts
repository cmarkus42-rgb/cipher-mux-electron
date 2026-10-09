import * as path from 'path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from './mcp-tools'
import { registerMuxTool } from './register-tool'
import { LocalFactoryRunner, type DispatchArgs } from '../local-factory/runner'
import { createWorkerHost } from '../local-factory/worker-host'
import { resolveRunDir } from '../session/entity-run-dir'
import { LOCAL_WORKER_DISPATCH_TOOL } from '../local-factory/presets'

/** Ein Läufer pro Workspace; er überlebt die MCP-Verbindung, nicht den App-Neustart. */
const runners = new Map<string, LocalFactoryRunner>()

export function getRunner(ctx: ToolContext): LocalFactoryRunner {
  const key = ctx.workspaceId ?? '__unbound__'
  let r = runners.get(key)
  if (!r) {
    r = new LocalFactoryRunner({
      host: createWorkerHost(ctx),
      laufDir: path.join(resolveRunDir(ctx.workspaceId ?? null, 'local-factory'), 'laeufe'),
    })
    runners.set(key, r)
  }
  return r
}

type ToolArgs = DispatchArgs & { accept?: boolean }

const text = (v: unknown) => [{ type: 'text' as const, text: JSON.stringify(v) }]

export function registerLocalFactoryTool(server: McpServer, ctx: ToolContext): void {
  registerMuxTool(server, LOCAL_WORKER_DISPATCH_TOOL, {
    description:
      'Local Cyber Factory: start a fresh local worker (opencode + local model) on ONE work item. '
      + 'Write the acceptance test first (must be red); do not commit it. Returns immediately; '
      + 'you are woken with one line "[local-factory] #N ..." when the gate has run. Do not poll. '
      + 'Retry: same laufId + haeppchen. Max 2 attempts, then escalate to the user. '
      + 'accept=true marks a green item as accepted after you reviewed the commit.',
    inputSchema: {
      projekt: z.string().describe('Absolute path of the target git repo'),
      ziel: z.string(),
      dateien: z.array(z.string()),
      akzeptanzkriterium: z.string(),
      geschuetzteTests: z.array(z.string()).describe('Acceptance tests, repo-relative or absolute'),
      testBefehl: z.string().describe('Shell command run in the repo; exit 0 = green'),
      nichtZiele: z.array(z.string()),
      laufId: z.string().optional(),
      haeppchen: z.number().int().positive().optional(),
      accept: z.boolean().optional(),
    },
  }, async (args: ToolArgs) => {
    try {
      const runner = getRunner(ctx)
      if (args.accept && args.laufId && args.haeppchen) {
        runner.accept(args.laufId, args.haeppchen)
        return { content: text({ ok: true, abgenommen: args.haeppchen }) }
      }
      const res = await runner.dispatch(args)
      return { content: text(res), ...(res.ok ? {} : { isError: true }) }
    } catch (err) {
      return { content: text({ ok: false, error: String(err) }), isError: true }
    }
  })
}
