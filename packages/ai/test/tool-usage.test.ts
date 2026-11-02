import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { buildTools } from "../src/tools/registry.ts"
import { defineTool, toSpec } from "../src/tools/define.ts"
import { actionUsage, narrowingParameters } from "../src/tools/usage.ts"
import { toolOutput } from "../src/tools/tool-output.ts"
import { BUILT_IN_TOOLS } from "../src/tools/registry.ts"
import { modSourceProblems } from "../src/nikcli/mods.ts"
import { continuationFor } from "../src/nikcli/chat.ts"
import { permissionAgents } from "../src/nikcli/permission-modes.ts"

const handlers = new Proxy({} as never, { get: () => async () => ({ ok: true }) })
const specs = buildTools(handlers, "p")
const ctl = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const spec = (id: string) => specs.find((s) => s.id === id)!

describe("a rejected call teaches the action it meant", () => {
  test("the direct path states the fields, the required ones first, and a call shape", async () => {
    const out = JSON.parse(await spec("cad_edit").execute({ action: "surface", operation: "patch" }, ctl)) as { problems: string[]; recovery: string }
    expect(out.problems.join(" ")).toContain("patches")
    expect(out.recovery).toContain('Action "surface" takes required operation')
    expect(out.recovery).toContain("patches (array")
    expect(out.recovery).toContain('"action":"surface"')
    expect(out.recovery).toContain("do not repeat unchanged arguments")
  })

  test("the host path, which only receives the zod error, names the same action", () => {
    const tool = spec("cad_edit")
    const parsed = (tool.parameters as z.ZodType).safeParse({ action: "surface", operation: "patch" })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const text = tool.formatValidationError!(parsed.error)
    expect(text).toContain("- patches:")
    expect(text).toContain('Action "surface" takes required operation')
    expect(text).toContain("No mutation was applied by this call.")
  })

  test("every action of every built-in tool has a usage line naming its own required fields", () => {
    for (const tool of BUILT_IN_TOOLS) {
      const options = (tool.parameters as unknown as { def: { options: Array<{ shape: Record<string, z.ZodType> }> } }).def.options
      for (const option of options) {
        const action = (option.shape["action"] as unknown as { def: { values: string[] } }).def.values[0]!
        const usage = actionUsage(tool.parameters, action)
        expect(usage, `${tool.id}.${action}`).toBeDefined()
        expect(usage).toContain(`Action "${action}" takes`)
        expect(narrowingParameters(tool.parameters, action), `${tool.id}.${action}`).toBeArray()
      }
    }
  })

  test("an unknown action gets the list of actions and no invented usage", async () => {
    const out = JSON.parse(await spec("cam_edit").execute({ action: "nope" }, ctl)) as { problems: string[]; recovery: string }
    expect(out.problems[0]).toContain("action:")
    expect(out.recovery).not.toContain("takes")
    expect(actionUsage(BUILT_IN_TOOLS[0]!.parameters, "nope")).toBeUndefined()
    expect(actionUsage(z.object({ n: z.number() }), "x")).toBeUndefined()
  })

  test("a tool that is not an action union keeps the generic report", async () => {
    const plain = toSpec(defineTool("ext_plain", { description: "x", parameters: z.object({ n: z.number() }), execute: async () => ({ ok: true }) }), { handlers: handlers as never, projectId: "p" })
    const out = JSON.parse(await plain.execute({ n: "abc" }, ctl)) as { recovery: string }
    expect(out.recovery.startsWith("Correct the named fields")).toBe(true)
  })
})

describe("a bounded result says how to read the rest", () => {
  const big = { ok: true, items: Array.from({ length: 4000 }, (_, i) => ({ id: `i${i}`, text: "x".repeat(30) })) }

  test("the note names the narrowing parameters of the action that answered", () => {
    const out = toolOutput(big, 3000, ["ids", "offset", "limit"])
    expect(out.bounded).toBe(true)
    expect((JSON.parse(out.text) as { _preview: { note: string } })._preview.note).toContain("call this action again with ids, offset, limit")
  })

  test("an action without any says so instead of promising paging", () => {
    const note = (JSON.parse(toolOutput(big, 3000, []).text) as { _preview: { note: string } })._preview.note
    expect(note).toContain("has no id, offset or limit parameter")
  })

  test("a tool without an action union keeps the generic note", async () => {
    const wide = defineTool("ext_wide", {
      description: "x", parameters: z.object({ action: z.literal("list"), limit: z.number().optional() }),
      execute: async () => big
    })
    const tool = toSpec(wide, { handlers: handlers as never, projectId: "p" })
    expect(JSON.parse(await tool.execute({ action: "list" }, ctl))._preview.note).toContain("Narrow the request")
  })
})

describe("a mod that cannot parse is refused before it is stored", () => {
  test("a syntax error names its line", () => {
    const problems = modSourceProblems("export const register = (on) => {\n  on('x', () => {\n}")
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("syntax error at line 3")
    expect(problems[0]).toContain("nothing was stored")
  })

  test("a valid module has no problem", () => {
    expect(modSourceProblems("export const register = (on) => { on('x', async ($, e, next) => next(e)) }")).toEqual([])
  })
})

describe("a denied call in Auto is final for the turn", () => {
  test("the Auto role says not to retry or route around, and what to tell the user", () => {
    const agents = permissionAgents({ build: { prompt: "Base.", permission: { cad_edit: "allow" } } }, ["cad_edit"])
    const prompt = agents["build-auto"]!["prompt"] as string
    expect(prompt).toContain("A denied call is final for this turn")
    expect(prompt).toContain("do not retry it")
    expect(prompt).toContain("switch to Ask or Standard mode")
    expect(agents["build-ask"]!["prompt"]).toBe("Base.")
  })
})

describe("a refusal by the permission mode is not retried by the continuation nudge", () => {
  const rule = "The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules [{\"permission\":\"cad_edit\"}]"
  test("the host's rule and rejection texts both stop the nudge", () => {
    expect(continuationFor({ todos: [{ content: "Delete the old bracket", status: "pending" }], lastToolError: rule }, "I could not delete it.")).toBeUndefined()
    expect(continuationFor({ todos: [{ content: "Delete", status: "pending" }], lastToolError: "The user rejected permission to use this specific tool call." }, "Ok.")).toBeUndefined()
  })

  test("a denial from earlier in the turn is carried into the nudge of the remaining items", () => {
    const nudge = continuationFor({
      todos: [{ content: "Delete the old bracket", status: "pending" }, { content: "Cut the new bracket", status: "pending" }],
      lastToolError: "The drawing is locked.", toolErrors: new Map([["cad_edit", rule], ["cam", "The drawing is locked."]])
    }, "Working.")
    expect(nudge).toContain("Cut the new bracket")
    expect(nudge).toContain("cad_edit call(s) were refused by the permission mode")
    expect(nudge).toContain("do not retry them")
  })
})
