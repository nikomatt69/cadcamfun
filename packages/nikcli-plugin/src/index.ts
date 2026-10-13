/**
 * `@cadcamfun/nikcli-plugin` (RM-11, spec 27 §4.4): the application's CAD/CAM action catalogue as tools of a standalone nikcli.
 *
 * Install it in nikcli's config next to a running CADCAMFUN:
 *
 *   { "plugin": [["file:///path/to/packages/nikcli-plugin/src/index.ts", { "url": "http://127.0.0.1:PORT", "token": "...", "projectId": "..." }]] }
 *
 * (or `CADCAMFUN_URL`, `CADCAMFUN_TOKEN`, `CADCAMFUN_PROJECT` in the environment). nikcli then has the same tool ids as the in-app
 * assistant (`cad`, `cad_edit`, `cam`, `cam_edit`, `library`, `memory`, `research`, `vcs`, `vcs_edit`, ...), each carrying its
 * actions behind `action`, with the application's own descriptions. The list is read from the running application, so the plugin
 * never carries a second copy of the catalogue: a new action there is a new action here.
 *
 * What it will not do, by design: delete or replace work (the application asks a person first; an outside client has no such
 * prompt) and delegate to the specialist agents (those run inside the application).
 */
import { BridgeClient, type BridgeOptions, type BridgeTool } from "./client.ts"
import { toolShape, type Zod } from "./schema.ts"

export { BridgeClient, BridgeError, type BridgeTool } from "./client.ts"
export { toZod, toolShape } from "./schema.ts"

/** nikcli's `tool()` helper and the zod it validates with (`@nikcli-ai/plugin/tool`); injected so nikcli's own copy is used. */
export interface ToolFactory {
  (input: { description: string; args: Record<string, unknown>; execute: (args: any, context: any) => Promise<unknown> }): unknown
  schema: Zod
}

export interface CadcamPluginOptions extends BridgeOptions {
  /** The project the tools act on, unless a call names another with `projectId`. */
  readonly projectId?: string
}

const textOf = (value: unknown): string => typeof value === "string" ? value : JSON.stringify(value) ?? "null"

/** One nikcli tool per catalogue tool of the running application. */
export const createCadcamTools = async (options: CadcamPluginOptions & { readonly tool: ToolFactory }): Promise<Record<string, unknown>> => {
  const client = new BridgeClient(options)
  const z = options.tool.schema
  const tools: ReadonlyArray<BridgeTool> = await client.tools()
  return Object.fromEntries(tools.map((entry) => {
    const { shape, summary } = toolShape(entry.parameters, z)
    const refused = entry.actions.filter((action) => action.kind === "destructive").map((action) => action.name)
    const description = [
      entry.description.trim(),
      summary ? `\nActions (required fields): ${summary}.` : "",
      refused.length > 0 ? `\nNot available from outside the application (they need a person's approval there): ${refused.join(", ")}.` : "",
      "\nThis tool runs in the open CADCAMFUN project; pass projectId to act on another."
    ].join("")
    return [entry.id, options.tool({
      description,
      args: { ...shape, projectId: z.string().optional().describe("The CADCAMFUN project id; defaults to the plugin's project") },
      execute: async (args: Record<string, unknown>, context: { abort?: AbortSignal }) => {
        const { projectId: named, ...input } = args
        const projectId = typeof named === "string" && named !== "" ? named : options.projectId
        if (!projectId) return JSON.stringify({ ok: false, error: "No CADCAMFUN project: set the plugin's projectId option (or CADCAMFUN_PROJECT) or pass projectId." })
        try { return textOf(await client.invoke(projectId, entry.id, input, context?.abort)) }
        catch (cause) { return JSON.stringify({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
      }
    })]
  }))
}

const fromEnvironment = (options: Record<string, unknown> = {}): CadcamPluginOptions => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  const url = String(options["url"] ?? env["CADCAMFUN_URL"] ?? "")
  const token = String(options["token"] ?? env["CADCAMFUN_TOKEN"] ?? "")
  if (!url || !token) throw new Error("@cadcamfun/nikcli-plugin needs the running application's url and token (plugin options, or CADCAMFUN_URL and CADCAMFUN_TOKEN).")
  const projectId = options["projectId"] ?? env["CADCAMFUN_PROJECT"]
  return { url, token, ...(typeof projectId === "string" && projectId !== "" ? { projectId } : {}) }
}

/** The nikcli server plugin: `{ tool }` hook with the catalogue's tools. */
export const CadcamPlugin = async (_input: unknown, options?: Record<string, unknown>): Promise<{ tool: Record<string, unknown> }> => {
  // The configuration is checked first, so a missing url or token is reported as that and not as a missing SDK.
  const configuration = fromEnvironment(options)
  // nikcli supplies the SDK; a variable specifier keeps this package free of a dependency on it (and of its types).
  const specifier = "@nikcli-ai/plugin/tool"
  const { tool } = (await import(specifier)) as { tool: unknown }
  return { tool: await createCadcamTools({ ...configuration, tool: tool as unknown as ToolFactory }) }
}

export default { id: "cadcamfun", server: CadcamPlugin }
