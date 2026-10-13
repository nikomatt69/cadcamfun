import { describe, expect, test } from "bun:test"
import { Effect, Exit, Option, Scope } from "effect"
import { z } from "zod"
import { CONTRIBUTION_KEYS } from "../src/tools/project-tools.ts"
import { defineTool, type ToolDefinition } from "../src/tools/define.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import { TOOL_IDS } from "../src/tools/registry.ts"
import { RESERVED_TOOL_IDS, ToolRegistry, compareToolIds, lastWins, makeToolRegistry } from "../src/tools/tool-registry.ts"

const handlers = {} as ToolHandlersShape
const call = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const probe = (id: string, answer: string, approval = false): ToolDefinition => ({
  ...defineTool(id, { description: `Probe ${id} answering ${answer}.`, parameters: z.object({}) as z.ZodType, execute: async () => ({ answer }) }),
  ...(approval ? { approval: true } : {})
})
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)
const answerOf = async (registry: ReturnType<typeof makeToolRegistry>, id: string) => {
  const spec = Option.getOrThrow(await run(registry.tool("p", id)))
  return (JSON.parse(await spec.execute({}, call)) as { answer: string }).answer
}

describe("the central tool registry (nikcli ToolRegistry.Service)", () => {
  test("resolves the catalogue's tools in canonical id order, whatever order they were declared in", async () => {
    const registry = makeToolRegistry({ handlers })
    const ids = await run(registry.ids("p"))
    expect(ids).toEqual([...TOOL_IDS].sort(compareToolIds))
    expect(await run(registry.revision)).toBe(0)
  })

  test("a runtime registration joins every project, shadows a contributed tool of its id, and closing it reveals that tool again", async () => {
    const registry = makeToolRegistry({ handlers, contributed: () => [probe("ext_gear", "plugin")] })
    expect(await answerOf(registry, "ext_gear")).toBe("plugin")
    const first = await run(registry.register(probe("ext_gear", "first")))
    const second = await run(registry.register(probe("ext_gear", "second")))
    expect(await answerOf(registry, "ext_gear")).toBe("second")
    await run(second.close)
    expect(await answerOf(registry, "ext_gear")).toBe("first")
    await run(first.close)
    await run(first.close) // closing twice is harmless
    expect(await answerOf(registry, "ext_gear")).toBe("plugin")
    expect((await run(registry.ids("other"))).filter((id) => id === "ext_gear")).toHaveLength(1)
  })

  test("the catalogue's and the host's ids are reserved, and a malformed id is refused", async () => {
    for (const id of ["cad_edit", "cam", "agent", "code_mode", "question", "search_tools"]) {
      expect(RESERVED_TOOL_IDS.has(id)).toBe(true)
      const exit = await Effect.runPromiseExit(makeToolRegistry({ handlers }).register(probe(id, "x")))
      expect(Exit.isFailure(exit)).toBe(true)
    }
    const exit = await Effect.runPromiseExit(makeToolRegistry({ handlers }).register({ ...probe("ext_ok", "x"), id: "Bad-Id" }))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  test("two contributed tools may not claim one id", async () => {
    const registry = makeToolRegistry({ handlers, contributed: () => [probe("ext_dup", "a"), probe("ext_dup", "b")] })
    await expect(run(registry.tools("p"))).rejects.toThrow("Duplicate tool id")
  })

  test("contributed sources are read again after a reload, not on every read", async () => {
    let reads = 0
    let tools: ReadonlyArray<ToolDefinition> = []
    const registry = makeToolRegistry({ handlers, contributed: () => { reads++; return tools } })
    await run(registry.ids("p"))
    await run(registry.ids("p"))
    expect(reads).toBe(1)
    tools = [probe("ext_late", "late")]
    expect(await run(registry.ids("p"))).not.toContain("ext_late")
    await run(registry.reload)
    expect(await run(registry.ids("p"))).toContain("ext_late")
    expect(reads).toBe(2)
  })

  test("approval tools and the catalogue with the host's natives come from the same resolution", async () => {
    const registry = makeToolRegistry({ handlers, contributed: () => [probe("ext_write", "w", true)] })
    expect(await run(registry.approvalIds("p"))).toEqual(["ext_write"])
    const catalogue = await run(registry.catalogue("p"))
    expect(catalogue.map((entry) => entry.id)).toEqual(expect.arrayContaining(["ext_write", "cad", "code_mode", "skill"]))
  })

  test("a scoped contribution lives as long as its scope, and every change reaches the attached sinks", async () => {
    const seen: number[] = []
    const registry = makeToolRegistry({ handlers })
    const scope = Effect.runSync(Scope.make())
    await run(registry.attach((revision) => Effect.sync(() => { seen.push(revision) })).pipe(Scope.provide(scope)))
    const inner = Effect.runSync(Scope.make())
    const key = CONTRIBUTION_KEYS[0]!
    await run(registry.contributeScoped({ [key]: async () => ({ ok: true }) }).pipe(Scope.provide(inner)))
    expect(Object.keys(await run(registry.contributions))).toEqual([key])
    await run(Scope.close(inner, Exit.void))
    expect(Object.keys(await run(registry.contributions))).toEqual([])
    await run(Scope.close(scope, Exit.void))
    await run(registry.reload)
    // Sinks run on their own fibers; give them a turn.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(seen).toEqual([1, 2])
  })

  test("is provided as a layer and read like any other service", async () => {
    const ids = await Effect.runPromise(Effect.gen(function* () {
      const registry = yield* ToolRegistry
      yield* registry.register(probe("ext_layer", "x"))
      return yield* registry.ids("p")
    }).pipe(Effect.provide(ToolRegistry.layer({ handlers }))))
    expect(ids).toContain("ext_layer")
  })

  test("lastWins keeps the last entry of an id at its last position", () => {
    expect(lastWins([{ id: "a", v: 1 }, { id: "b", v: 1 }, { id: "a", v: 2 }])).toEqual([{ id: "b", v: 1 }, { id: "a", v: 2 }])
  })
})
