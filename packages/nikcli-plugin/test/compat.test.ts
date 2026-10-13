import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import plugin, { CadcamPlugin } from "../src/index.ts"

/**
 * The compatibility gate against nikcli's plugin SDK (spec 27 §2): the shapes this package relies on are read from the SDK's own
 * declarations in the repo's `.nikcli/` staging folder (`@nikcli-ai/plugin`), so a change there fails here and not in a user's
 * terminal. Skipped where that folder is not installed.
 */
const sdk = join(import.meta.dir, "../../../.nikcli/node_modules/@nikcli-ai/plugin/dist")
const declared = (file: string): string | undefined => existsSync(join(sdk, file)) ? readFileSync(join(sdk, file), "utf8") : undefined

describe("nikcli plugin SDK compatibility", () => {
  const index = declared("index.d.ts")
  const toolTypes = declared("tool.d.ts")
  const run = index === undefined || toolTypes === undefined ? test.skip : test

  run("a server plugin is `(input, options) => Promise<Hooks>`, and a module is `{ id, server }`", () => {
    expect(index).toContain("export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>")
    expect(index).toContain("export type PluginModule = {")
    expect(index).toMatch(/PluginModule = \{\s*id\?: string;\s*server: Plugin;/)
    expect(typeof CadcamPlugin).toBe("function")
    expect(plugin).toMatchObject({ id: "cadcamfun", server: CadcamPlugin })
  })

  run("the Hooks type has a `tool` record of tool definitions", () => {
    expect(index).toMatch(/tool\?: \{\s*\[key: string\]: ToolDefinition;\s*\}/)
  })

  run("a tool is `{ description, args: <zod raw shape>, execute(args, context) }` and `tool()` is the identity with zod attached", () => {
    expect(toolTypes).toContain("args: Args")
    expect(toolTypes).toContain("execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>")
    expect(toolTypes).toContain("export type ToolResult = string |")
    // The context carries the abort signal the plugin passes on to the HTTP call.
    expect(toolTypes).toContain("abort: AbortSignal")
    const tool = Object.assign((input: unknown) => input, { schema: z })
    const definition = tool({ description: "d", args: { a: z.string() }, execute: async () => "ok" }) as { args: Record<string, unknown> }
    expect(z.object(definition.args as never).safeParse({ a: "x" }).success).toBe(true)
  })

  test("a plugin without the application's url and token fails with what to set", async () => {
    const saved = { url: process.env["CADCAMFUN_URL"], token: process.env["CADCAMFUN_TOKEN"] }
    delete process.env["CADCAMFUN_URL"]; delete process.env["CADCAMFUN_TOKEN"]
    try { await expect(CadcamPlugin({}, {})).rejects.toThrow("CADCAMFUN_URL") } finally {
      if (saved.url !== undefined) process.env["CADCAMFUN_URL"] = saved.url
      if (saved.token !== undefined) process.env["CADCAMFUN_TOKEN"] = saved.token
    }
  })
})
