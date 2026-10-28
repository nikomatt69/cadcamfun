/**
 * Spec 64 Phase 4: the `agent` tool's start action takes an optional structured brief (objective, ids, values with units,
 * limits, expected report). One pure function renders it into the specialist's prompt; the free prompt still works; a
 * brief without an objective is refused. Nothing here reads project state, so no id is checked against the project.
 */
import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { VCS_ACTION_INPUTS } from "@cadcamfun/api"
import { actionById } from "../src/actions/catalogue.ts"
import { executeActionOutcome } from "../src/actions/action.ts"
import { SUBAGENT_IDS } from "../src/nikcli/agents.ts"
import { BackgroundTaskManager, type BackgroundTaskRunnerInput } from "../src/nikcli/background-tasks.ts"
import { agentJobPrompt, backgroundToolContributions } from "../src/nikcli/background-tools.ts"
import { specialistPrompt } from "../src/nikcli/prompts/index.ts"
import { nikcliWireSchema } from "../src/tools/wire-schema.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import { toolPrompt } from "../src/tools/prompts/index.ts"

const input = VCS_ACTION_INPUTS["agent.start"] as unknown as Schema.Codec<unknown, unknown>
const decodes = (value: unknown) => Effect.runPromise(Schema.decodeUnknownEffect(input)(value).pipe(Effect.isSuccess))

const brief = {
  objective: "Raise the base plate to 12 mm and keep the four holes on their circle.",
  ids: ["element base-plate-1", "layer Plates"],
  values: [{ name: "thickness", value: 12, unit: "mm" }, { name: "hole circle", value: "Ø60", unit: "mm" }, { name: "holes", value: 4 }],
  limits: ["Do not move the plate", "Keep the hole diameter"],
  report: "The old and new thickness, and the ids of the four holes."
}

const golden = [
  "Objective: Raise the base plate to 12 mm and keep the four holes on their circle.",
  "",
  "Ids:",
  "- element base-plate-1",
  "- layer Plates",
  "",
  "Values:",
  "- thickness: 12 mm",
  "- hole circle: Ø60 mm",
  "- holes: 4",
  "",
  "Limits:",
  "- Do not move the plate",
  "- Keep the hole diameter",
  "",
  "Expected report, in addition to your usual final message: The old and new thickness, and the ids of the four holes."
].join("\n")

describe("agentJobPrompt", () => {
  test("a free prompt alone is passed on as written", () => {
    expect(agentJobPrompt({ prompt: "move box-1 up 20" })).toEqual({ ok: true, prompt: "move box-1 up 20" })
  })

  test("a brief renders into labelled sections, in a fixed order", () => {
    expect(agentJobPrompt({ brief })).toEqual({ ok: true, prompt: golden })
  })

  test("a brief with only an objective renders the objective alone", () => {
    expect(agentJobPrompt({ brief: { objective: "  List the open operations.  " } })).toEqual({ ok: true, prompt: "Objective: List the open operations." })
  })

  test("a free prompt given with a brief follows it as details", () => {
    const job = agentJobPrompt({ brief: { objective: "Check the part" }, prompt: "Start with the holes." })
    expect(job).toEqual({ ok: true, prompt: "Objective: Check the part\n\nDetails:\nStart with the holes." })
  })

  test("a brief without an objective is refused, whatever else it carries", () => {
    for (const bad of [{}, { objective: "" }, { objective: "   " }, { objective: 3 }, { ids: ["a"] }]) {
      const job = agentJobPrompt({ brief: bad, prompt: "a free prompt does not rescue it" })
      expect(job.ok, JSON.stringify(bad)).toBe(false)
      expect((job as { error: string }).error).toContain("objective")
    }
  })

  test("no brief and no prompt is refused with the shape of a brief", () => {
    for (const empty of [{}, { prompt: "  " }, { brief: null }]) {
      const job = agentJobPrompt(empty)
      expect(job.ok).toBe(false)
      expect((job as { error: string }).error).toContain("objective")
    }
  })

  test("a malformed brief is refused, not guessed at", () => {
    const bad: ReadonlyArray<Record<string, unknown>> = [
      { objective: "o", ids: "element-1" }, { objective: "o", ids: [1] }, { objective: "o", limits: [{}] },
      { objective: "o", values: "12 mm" }, { objective: "o", values: [{ value: 12 }] }, { objective: "o", values: [{ name: "w", value: Number.NaN }] }
    ]
    for (const b of bad) expect(agentJobPrompt({ brief: b }).ok, JSON.stringify(b)).toBe(false)
    expect(agentJobPrompt({ brief: "do it" }).ok).toBe(false)
    expect(agentJobPrompt({ brief: ["do it"] }).ok).toBe(false)
  })
})

describe("the agent.start input", () => {
  test("accepts a brief, a prompt, or both, and refuses neither", async () => {
    expect(await decodes({ description: "d", brief })).toBe(true)
    expect(await decodes({ description: "d", prompt: "p" })).toBe(true)
    expect(await decodes({ description: "d", prompt: "p", brief: { objective: "o" } })).toBe(true)
    expect(await decodes({ description: "d" })).toBe(false)
  })

  test("refuses a brief that names no objective, or whose lists or values are malformed", async () => {
    for (const bad of [{}, { objective: "" }, { objective: "   " }, { ids: ["a"] }, { objective: "o", ids: "a" }, { objective: "o", values: [{ name: "w" }] }, { objective: "o", values: [{ name: "w", value: 1, unit: "" }] }]) {
      expect([JSON.stringify(bad), await decodes({ description: "d", brief: bad })]).toEqual([JSON.stringify(bad), false])
    }
  })

  test("the schema the model sees lists the brief and requires its objective", () => {
    const wire = nikcliWireSchema(input)
    expect(wire.safeParse({ description: "d", brief }).success).toBe(true)
    expect(wire.safeParse({ description: "d", brief: { ids: ["a"] } }).success).toBe(false)
  })

  test("the action layer refuses an objective-less brief before the delegation runs", async () => {
    let entered = 0
    const run = (args: unknown) => executeActionOutcome(actionById("agent.start")!, args, {
      handlers: {} as ToolHandlersShape, projectId: "p", contributions: { "agent.start": async () => { entered++; return {} } }
    })
    const refused = await run({ description: "d", brief: { objective: "   " } })
    expect(refused).toMatchObject({ kind: "refused", value: { _tag: "ActionInvalidInput", actionId: "agent.start" } })
    expect(String((refused.value as { error: string }).error)).toContain("objective")
    expect(await run({ description: "d" })).toMatchObject({ kind: "refused", value: { _tag: "ActionInvalidInput" } })
    expect(entered).toBe(0)
  })
})

describe("agent.start with a brief", () => {
  const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal, handlers: {} as never }
  const start = (manager: BackgroundTaskManager) => backgroundToolContributions(manager)["agent.start"]!

  test("the specialist receives the rendered brief, and the call still returns at once", async () => {
    const seen: BackgroundTaskRunnerInput[] = []
    let open!: () => void
    const hold = new Promise<void>((resolve) => { open = resolve })
    const manager = new BackgroundTaskManager({ runner: async (task) => (seen.push(task), await hold, "done") })
    const queued = await start(manager)({ description: "thicken", agent: "editor", brief } as never, ctx)
    expect(queued).toMatchObject({ agent: "editor", background: true, prompt: golden })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen[0]).toMatchObject({ agent: "editor", prompt: golden })
    open()
    await manager.dispose()
  })

  test("a call that names no objective is refused and nothing is queued", async () => {
    const manager = new BackgroundTaskManager({ runner: async () => "done" })
    const refused = await start(manager)({ description: "x", agent: "editor", brief: { ids: ["a"] } } as never, ctx)
    expect(refused).toMatchObject({ ok: false })
    expect((refused as { error: string }).error).toContain("objective")
    expect(manager.list({ projectId: "p", parentSessionId: "s" })).toEqual([])
    await manager.dispose()
  })

  test("a free prompt still works unchanged", async () => {
    const manager = new BackgroundTaskManager({ runner: async () => "done" })
    const queued = await start(manager)({ description: "x", agent: "researcher", prompt: "describe the drawing" } as never, ctx)
    expect(queued).toMatchObject({ agent: "researcher", prompt: "describe the drawing" })
    await manager.dispose()
  })
})

describe("what the model and the specialists read", () => {
  test("the tool description says start returns at once, independent jobs start together, and do not wait", () => {
    const text = toolPrompt("agent")
    const first = text.split("\n")[0]!
    expect(first.length).toBeLessThanOrEqual(100)
    expect(text).toContain("start returns at once")
    expect(text).toContain("Do not wait")
    expect(text).toContain("ONE block")
    expect(text).toContain("brief")
    expect(text).toContain("objective")
  })

  test("every specialist knows the brief format and keeps its final message headings", () => {
    for (const id of SUBAGENT_IDS) {
      const prompt = specialistPrompt(id)
      expect(prompt, id).toContain("A brief has Objective")
      expect(prompt, id).toContain("Final message")
      expect(prompt, id).not.toContain("{{report}}")
    }
  })
})
