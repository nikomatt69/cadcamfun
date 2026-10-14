import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { z } from "zod"
import { createCadcamTools, type ToolFactory } from "@nikoemme_/cadcamfun-nikcli-plugin"
import { makeApp, TOKEN } from "./helpers.ts"

/**
 * RM-11, both faces end to end: a standalone nikcli's plugin (`@nikoemme_/cadcamfun-nikcli-plugin`) building its tools from the running
 * application's catalogue and calling them over HTTP, against the real sidecar routes. nikcli's own `tool()` is injected: it is
 * the identity function with zod attached.
 */
let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
let tools: Record<string, { description: string; args: Record<string, z.ZodType>; execute: (args: Record<string, unknown>, context: { abort?: AbortSignal }) => Promise<string> }>

const tool = Object.assign((input: unknown) => input, { schema: z }) as unknown as ToolFactory

beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Standalone" } })).body.id
  // The plugin's `fetch` is the in-process handler, so the real routes, authorization and handlers answer.
  tools = await createCadcamTools({ url: "http://sidecar.test", token: TOKEN, projectId, tool, fetch: (input, init) => app.transport(input, init) }) as typeof tools
})
afterAll(async () => { await app.dispose() })

const run = async (id: string, args: Record<string, unknown>) => JSON.parse(await tools[id]!.execute(args, {})) as Record<string, any>

describe("the plugin on the real sidecar", () => {
  test("registers the in-app tool ids with the application's own descriptions and a shape nikcli can validate with", () => {
    for (const id of ["cad", "cad_edit", "cam", "cam_edit", "library", "memory", "research", "vcs", "vcs_edit"]) expect(Object.keys(tools), id).toContain(id)
    expect(Object.keys(tools)).not.toContain("agent")
    expect(tools["cad_edit"]!.description).toContain("Not available from outside the application")
    expect(tools["cad_edit"]!.description).toContain("delete")
    expect(tools["cad_edit"]!.description).toContain("Actions (required fields)")
    const args = z.object(tools["cad_edit"]!.args as Record<string, z.ZodType>)
    expect(args.safeParse({ action: "add", elements: [{ type: "cube" }] }).success).toBe(true)
    expect(args.safeParse({ action: "frobnicate" }).success).toBe(false)
  })

  test("a call builds in the open project and the next call reads it back", async () => {
    const added = await run("cad_edit", { action: "add", elements: [{ type: "cylinder", radius: 6, height: 20, name: "Pin" }] })
    expect(added["ok"]).toBe(true)
    const id = added["ids"][0] as string
    const described = await run("cad", { action: "describe" })
    expect(JSON.stringify(described)).toContain(id)
  })

  test("a refusal reaches the agent as a result it can read and recover from", async () => {
    const destructive = await run("cad_edit", { action: "delete", ids: ["x"], confirm: true })
    expect(destructive["ok"]).toBe(false)
    expect(destructive["error"]).toContain("person's approval")
    const invalid = await run("cad_edit", { action: "add", elements: [{ type: "cube", width: -1, height: 2, depth: 3 }] })
    expect(invalid["ok"]).toBe(false)
  })

  test("a project can be named per call, and a call without any project says so", async () => {
    const other = (await app.call("/api/projects", { method: "POST", json: { name: "Second" } })).body.id as string
    await run("cad_edit", { action: "add", projectId: other, elements: [{ type: "cube", width: 5, height: 5, depth: 5, name: "Elsewhere" }] })
    expect(JSON.stringify((await app.call(`/api/projects/${other}/drawings`)).body)).toContain("Elsewhere")
    expect(JSON.stringify((await app.call(`/api/projects/${projectId}/drawings`)).body)).not.toContain("Elsewhere")
    const bare = await createCadcamTools({ url: "http://sidecar.test", token: TOKEN, tool, fetch: (input, init) => app.transport(input, init) }) as typeof tools
    expect(JSON.parse(await bare["cad"]!.execute({ action: "describe" }, {}))["error"]).toContain("No CADCAMFUN project")
  })

  test("a wrong token is reported as such, never retried or leaked", async () => {
    await expect(createCadcamTools({ url: "http://sidecar.test", token: "wrong", tool, fetch: (input, init) => app.transport(input, init) })).rejects.toThrow("refused the token")
  })
})
