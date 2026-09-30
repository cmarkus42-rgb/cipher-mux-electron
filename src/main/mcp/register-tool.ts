/**
 * One place for the MCP tool registration workaround.
 *
 * `server.registerTool(...)` cannot be called directly here. Its generics
 * infer the handler's argument type from the zod input schema, and with
 * schemas of this size TypeScript gives up:
 *
 *   TS2589: Type instantiation is excessively deep and possibly infinite.
 *
 * That is a compiler limit, not a mistake in the call. The project worked
 * around it with `(server.registerTool as any)(...)` at every single
 * registration — 56 of them, none saying why, and each one an `any` that lint
 * counted as a code smell rather than as the deliberate exception it is.
 *
 * Collecting it here means the reason is written down once, the call sites
 * read as ordinary calls, and a future SDK or TypeScript version only has to
 * be re-checked in one place: delete the cast below, run the typecheck, and
 * see whether TS2589 still appears.
 *
 * The cast goes through `unknown` rather than `any` so nothing downstream
 * silently inherits an `any`.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'

/** What a tool declares about itself. */
export interface McpToolConfig {
  description: string
  inputSchema?: Record<string, z.ZodTypeAny>
}

/**
 * A tool handler.
 *
 * The argument is `never` on purpose: parameters are checked
 * contravariantly, so every concrete handler — `(args: { id: string })` and
 * friends — is assignable to this, while nothing here claims to know the
 * shape. The shape lives in the zod schema next to each registration, which
 * is where it belongs.
 */
export type McpToolHandler = (args: never) => unknown

type RegisterToolFn = (name: string, config: McpToolConfig, handler: McpToolHandler) => void

/** Register an MCP tool. See the file comment for why this indirection exists. */
export function registerMuxTool(
  server: McpServer,
  name: string,
  config: McpToolConfig,
  handler: McpToolHandler,
): void {
  ;(server.registerTool as unknown as RegisterToolFn)(name, config, handler)
}
