import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import { z } from "zod"
import { BUILT_IN_TOOLS, TOOL_IDS, buildTools, defineTool } from "../src/tools/catalogue.ts"
import { ACTION_CATALOGUE, ACTION_EXPOSURES, REPLACED_TOOL_IDS, actionsOf, toolOf } from "../src/actions/catalogue.ts"

const dir = new URL("../src/tools/", import.meta.url).pathname
const calls: Array<{ method: string; args: unknown[] }> = []
const handlers = new Proxy({} as never, {
  get: (_t, method: string) => async (...args: unknown[]) => { calls.push({ method, args }); return method === "listOperations" ? [{ id: "op-1", name: "Pocket", generated: false }] : { ok: true, method } }
})

describe("one action tool per capability boundary (nikcli style)", () => {
  test("every tool id has a tools/<id>.ts that defines it, next to prompts/<id>.txt", () => {
    for (const id of TOOL_IDS) {
      expect(existsSync(`${dir}${id}.ts`), `${id}.ts`).toBe(true)
      expect(existsSync(`${dir}prompts/${id}.txt`), `${id}.txt`).toBe(true)
    }
    const files = readdirSync(dir)
      .filter((f) => /^(cad|cam|lib|memory|vcs|research|agent|parts)_?[a-z_]*\.ts$/.test(f) && f !== "catalogue.ts" && f !== "action.ts" && f !== "define.ts" && f !== "handlers.ts" && f !== "lenient-arguments.ts" && f !== "project-tools.ts" && f !== "registry.ts" && f !== "wire-schema.ts")
      .map((f) => f.slice(0, -3)).sort()
    expect(files).toEqual([...TOOL_IDS].sort())
  })

  test("the registry has unique ids and every definition carries its prompt", () => {
    expect(new Set(TOOL_IDS).size).toBe(TOOL_IDS.length)
    for (const tool of BUILT_IN_TOOLS) expect(tool.description.length).toBeGreaterThan(200)
  })

  test("every capability is declared once: the catalogue is the only source of tool ids", () => {
    const ids = new Set(ACTION_CATALOGUE.map((action) => action.id))
    expect(ids.size).toBe(ACTION_CATALOGUE.length)
    // An exposure (`cam_verify`) carries existing catalogue actions under another tool id; it declares nothing new.
    expect(TOOL_IDS.every((tool) => ACTION_CATALOGUE.some((action) => toolOf(action) === tool) || ACTION_EXPOSURES[tool] !== undefined)).toBe(true)
    expect(BUILT_IN_TOOLS.every((tool) => Object.keys(actionsOf(tool.id)).length > 0)).toBe(true)
    // Every retired per-verb id is mapped to the action that replaced it (spec 26 §6.2).
    for (const replaced of REPLACED_TOOL_IDS) expect(ACTION_CATALOGUE.some((action) => action.replaces === replaced), replaced).toBe(true)
  })

  test("a tool runs its action on the handlers of the active project and answers JSON text", async () => {
    calls.length = 0
    const tool = buildTools(handlers, "project-1").find((t) => t.id === "cam")!
    const out = await tool.execute({ action: "operations" }, { sessionId: "s", projectId: "project-1", signal: new AbortController().signal })
    expect(JSON.parse(out)).toEqual([{ id: "op-1", name: "Pocket", generated: false }])
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
    const clash = defineTool("cam", { description: "Clash.", parameters: z.object({}), execute: async () => ({}) })
    expect(() => buildTools(handlers, "p", [clash])).toThrow("Duplicate tool id")
  })

  test("a tool without a prompt file and without a description cannot be defined", () => {
    expect(() => defineTool("ext_nothing", { parameters: z.object({}), execute: async () => ({}) })).toThrow("has no prompt")
  })

  test("runtime input validation rejects bad arguments and tool failures never escape the bridge", async () => {
    let called = false
    const invalid = defineTool("ext_validate", {
      description: "Validate arguments.",
      parameters: z.object({ count: z.number().int().positive() }),
      execute: async () => { called = true; return { ok: true } }
    })
    const failure = defineTool("ext_failure", {
      description: "A tool that fails.",
      parameters: z.object({}),
      execute: async () => { throw new Error("API_KEY=private /Users/hidden/design.step") }
    })
    const invalidReply = JSON.parse(await buildTools(handlers, "p", [invalid]).find((t) => t.id === "ext_validate")!.execute({ count: -1 }, { sessionId: "s", projectId: "p", signal: new AbortController().signal })) as { ok: boolean; problems: string[] }
    expect(invalidReply.ok).toBe(false)
    expect(invalidReply.problems.length).toBeGreaterThan(0)
    expect(called).toBe(false)
    const failureReply = await buildTools(handlers, "p", [failure]).find((t) => t.id === "ext_failure")!.execute({}, { sessionId: "s", projectId: "p", signal: new AbortController().signal })
    expect(JSON.parse(failureReply)).toMatchObject({ ok: false })
    expect(failureReply).not.toContain("private")
    expect(failureReply).not.toContain("/Users/")
  })
})

describe("arguments written the XML way", () => {
  test("lists wrapped in item, text nodes and numbers as strings are put back into the shape the schema describes", async () => {
    const { sanitizeArguments, lenient } = await import("../src/tools/lenient-arguments.ts")
    expect(sanitizeArguments({ elements: { item: { type: "cube", width: "5", name: "7", profile: { item: [{ x: "0", y: "1.5" }] } } } })).toEqual({
      elements: [{ type: "cube", width: 5, name: "7", profile: [{ x: 0, y: 1.5 }] }]
    })
    expect(sanitizeArguments({ name: { $text: "Wheel" } })).toEqual({ name: "Wheel" })
    // Already well-formed arguments are untouched.
    const good = { elements: [{ type: "cube", width: 5, operands: [0, 1], name: "a" }] }
    expect(sanitizeArguments(good)).toEqual(good)
    const schema = lenient(z.object({ elements: z.array(z.looseObject({ type: z.string() })).min(1) }))
    expect(schema.safeParse({ elements: { item: { type: "cube", width: "5" } } }).success).toBe(true)
    expect(z.toJSONSchema(schema, { io: "input" })).toBeDefined()
    // A structure sent as JSON text (seen in real sessions: `"shapes": "[...]"`) is the structure; text and code are left alone.
    expect(sanitizeArguments({ history: { features: [{ id: "s", sketch: { shapes: '[{"id":"r","kind":"rectangle","at":[0,0],"width":"40"}]' } }] } })).toEqual({
      history: { features: [{ id: "s", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 40 }] } }] }
    })
    expect(sanitizeArguments({ history: '{"parameters":{"w":"5"},"features":[]}' })).toEqual({ history: { parameters: { w: 5 }, features: [] } })
    const text = { text: "[not parsed]", code: "{ return 1 }", sketch: "s1", name: "{x}", shapes: "[broken" }
    expect(sanitizeArguments(text)).toEqual(text)
  })
})

describe("assemblies without nesting", () => {
  test("elements that name the same component become one component, booleans and their operands stay out", async () => {
    const { groupIntoComponents } = await import("../src/actions/cad-edit.ts")
    const { normalizeElement } = await import("../src/element-catalog.ts")
    const entry = (index: number, input: Record<string, unknown>) => { const r = normalizeElement(input); if (!r.ok) throw new Error(r.error); return { index, element: r.element } }
    const kept = [
      entry(0, { type: "cylinder", x: 100, y: 5, z: 0, component: "Wheel", layer: "wheels" }),
      entry(1, { type: "cube", x: 110, y: 5, z: 0, component: "Wheel", layer: "wheels" }),
      entry(2, { type: "cube", x: 0, y: 0, z: 0 }),
      entry(3, { type: "boolean-subtract", operands: [2, 0] })
    ]
    const out = groupIntoComponents(kept)
    // Element 0 is a Boolean operand: it stays; only element 1 names the component, so a single member is still wrapped.
    expect(out.map((e) => e.element["type"])).toEqual(["cylinder", "component", "cube", "boolean-subtract"])
    const grouped = groupIntoComponents([kept[0]!, kept[1]!].map((k, i) => ({ ...k, index: i + 10 })))
    expect(grouped).toHaveLength(1)
    const component = grouped[0]!.element
    expect(component).toMatchObject({ type: "component", name: "Wheel", x: 100, y: 5, layer: "wheels" })
    expect((component["elements"] as Array<Record<string, unknown>>).map((c) => [c["type"], c["x"]])).toEqual([["cylinder", 0], ["cube", 10]])
  })
})

describe("cad_edit editor actions", () => {
  test("section_on needs a position; section_off needs nothing", async () => {
    const { cadEditTool } = await import("../src/tools/cad_edit.ts")
    const ctx = { handlers: {} as never, projectId: "p" }
    const run = (actions: unknown) => cadEditTool.execute(cadEditTool.parameters.parse({ action: "editor", actions }), ctx) as Promise<{ ok: boolean; problems?: string[] }>
    expect((await run([{ action: "section_on", axis: "z" }])).ok).toBe(false)
    expect((await run([{ action: "section_on", axis: "z" }])).problems?.[0]).toContain("position")
    expect((await run([{ action: "section_on", axis: "x", position: 40, inverted: true }])).ok).toBe(true)
    expect((await run([{ action: "section_off" }])).ok).toBe(true)
    expect(() => cadEditTool.parameters.parse({ action: "editor", actions: [{ action: "section_on", axis: "w", position: 1 }] })).toThrow()
  })
})