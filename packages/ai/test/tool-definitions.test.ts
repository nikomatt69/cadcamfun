import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import { z } from "zod"
import { BUILT_IN_TOOLS, TOOL_IDS, buildTools, defineTool } from "../src/tools/catalogue.ts"

const dir = new URL("../src/tools/", import.meta.url).pathname
const calls: Array<{ method: string; args: unknown[] }> = []
const handlers = new Proxy({} as never, {
  get: (_t, method: string) => async (...args: unknown[]) => { calls.push({ method, args }); return { ok: true, method } }
})

describe("one definition per tool (nikcli style)", () => {
  test("every tool id has a tools/<id>.ts that defines it, next to prompts/<id>.txt", () => {
    for (const id of TOOL_IDS) {
      expect(existsSync(`${dir}${id}.ts`), `${id}.ts`).toBe(true)
      expect(existsSync(`${dir}prompts/${id}.txt`), `${id}.txt`).toBe(true)
    }
    const files = readdirSync(dir).filter((f) => /^(cad|cam|lib|memory)_.*\.ts$/.test(f)).map((f) => f.slice(0, -3)).sort()
    expect(files).toEqual([...TOOL_IDS].sort())
  })

  test("the registry has unique ids and every definition carries its prompt", () => {
    expect(new Set(TOOL_IDS).size).toBe(TOOL_IDS.length)
    for (const tool of BUILT_IN_TOOLS) expect(tool.description.length).toBeGreaterThan(200)
  })

  test("a tool runs its action on the handlers of the active project and answers JSON text", async () => {
    calls.length = 0
    const tool = buildTools(handlers, "project-1").find((t) => t.id === "cam_list_operations")!
    const out = await tool.execute({}, { sessionId: "s", projectId: "project-1", signal: new AbortController().signal })
    expect(JSON.parse(out)).toEqual({ ok: true, method: "listOperations" })
    expect(calls).toEqual([{ method: "listOperations", args: ["project-1"] }])
  })

  test("an extension tool is registered next to the built-in ones; a duplicate id is refused", async () => {
    const extra = defineTool("ext_ping", {
      description: "Ping.",
      parameters: z.object({ n: z.number() }),
      execute: async ({ n }, { projectId }) => ({ pong: n, projectId })
    })
    const specs = buildTools(handlers, "p", [extra])
    expect(specs).toHaveLength(TOOL_IDS.length + 1)
    const spec = specs.find((s) => s.id === "ext_ping")!
    expect(JSON.parse(await spec.execute({ n: 2 }, { sessionId: "s", projectId: "p", signal: new AbortController().signal }))).toEqual({ pong: 2, projectId: "p" })
    expect(() => buildTools(handlers, "p", [defineTool("cam_list_operations", { parameters: z.object({}), execute: async () => ({}) })])).toThrow("Duplicate tool id")
  })

  test("a tool without a prompt file and without a description cannot be defined", () => {
    expect(() => defineTool("ext_nothing", { parameters: z.object({}), execute: async () => ({}) })).toThrow("has no prompt")
  })
})
