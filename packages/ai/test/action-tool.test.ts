import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { z } from "zod"
import { ActionInvalidInput, ActionInterrupted } from "@cadcamfun/api"
import { defineAction, defineActionTool } from "../src/tools/action.ts"
import { contributedAction } from "../src/actions/action.ts"
import { toSpec } from "../src/tools/define.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const context = { handlers: {} as ToolHandlersShape, projectId: "p" }
const call = () => ({ signal: new AbortController().signal, sessionId: "s", projectId: "p" })
const read = defineAction({ id: "probe.read", kind: "read", parameters: z.object({}), run: () => ({ ok: true }) })
const write = defineAction({ id: "probe.write", kind: "write", parameters: z.object({}), run: () => ({ ok: true }) })

describe("defineActionTool", () => {
  test("rejects a group that mixes read and write effects, an empty group and a redefined discriminator", () => {
    expect(() => defineActionTool("mixed", { inspect: read, save: write }, "mixed")).toThrow("mixes read and write")
    expect(() => defineActionTool("empty", {}, "empty")).toThrow("no actions")
    expect(() => defineActionTool("invalid", { inspect: defineAction({ id: "probe.read", kind: "read", parameters: z.object({ action: z.string() }), run: () => ({ ok: true }) }) }, "invalid")).toThrow("discriminator")
  })

  test("the host adapter validates the arguments before execution and keeps typed failures readable", async () => {
    let executions = 0
    const tool = defineActionTool("inspect", {
      find: defineAction({
        id: "inspect.find", kind: "read", parameters: z.object({ limit: z.number().int().min(1).max(5).default(2) }),
        run: (input) => { executions++; return { ok: true, limit: input.limit } }
      }),
      denied: defineAction({
        id: "inspect.denied", kind: "read", parameters: z.object({}),
        // A failing effect is a refusal the model reads, never a thrown error it must interpret as a crash.
        run: () => Effect.fail(new ActionInvalidInput({ actionId: "inspect.denied", message: "Denied" }))
      })
    }, "Inspect saved data")
    const host = toSpec(tool, context)
    expect(JSON.parse(await host.execute({ action: "find" }, call()))).toEqual({ ok: true, limit: 2 })
    expect(JSON.parse(await host.execute({ action: "find", limit: 9 }, call())).ok).toBe(false)
    expect(JSON.parse(await host.execute({ action: "unknown" }, call())).ok).toBe(false)
    expect(executions).toBe(1)
    expect(JSON.parse(await host.execute({ action: "denied" }, call()))).toEqual({ ok: false, _tag: "ActionInvalidInput", actionId: "inspect.denied", error: "Denied" })
  })

  test("a thrown exception becomes a tagged failure of the shared contract", async () => {
    const tool = defineActionTool("probe", {
      boom: defineAction({ id: "probe.boom", kind: "read", parameters: z.object({}), run: () => { throw new Error("kernel is down") } })
    }, "Probe")
    const reply = JSON.parse(await toSpec(tool, context).execute({ action: "boom" }, call()))
    expect(reply).toMatchObject({ ok: false, _tag: "ActionFailed", actionId: "probe.boom", error: "kernel is down" })
  })

  test("a cancelled call never enters action execution", async () => {
    let executions = 0
    const tool = defineActionTool("edit", {
      save: defineAction({ id: "edit.save", kind: "write", parameters: z.object({}), run: () => { executions++; return { ok: true } } })
    }, "Save")
    const controller = new AbortController()
    controller.abort()
    const reply = JSON.parse(await toSpec(tool, context).execute({ action: "save" }, { signal: controller.signal, sessionId: "s", projectId: "p" }))
    expect(reply).toMatchObject({ ok: false })
    expect(executions).toBe(0)
  })

  test("cancellation interrupts an in-flight Effect before its write", async () => {
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    let writes = 0
    let finalized = 0
    const tool = defineActionTool("edit", {
      save: defineAction({
        id: "edit.save", kind: "write", parameters: z.object({}),
        run: () => Effect.gen(function*() {
          yield* Effect.sync(entered)
          yield* Effect.never
          yield* Effect.sync(() => { writes++ })
          return { ok: true }
        }).pipe(Effect.ensuring(Effect.sync(() => { finalized++ })))
      })
    }, "Save")
    const controller = new AbortController()
    const pending = toSpec(tool, context).execute({ action: "save" }, { signal: controller.signal, sessionId: "s", projectId: "p" })
    await started
    controller.abort()
    expect(JSON.parse(await pending).ok).toBe(false)
    expect(writes).toBe(0)
    expect(finalized).toBe(1)
  })

  test("action declarations are captured immutably before host execution", async () => {
    const action = defineAction({ id: "probe.read", kind: "read", parameters: z.object({}), run: () => ({ ok: true, original: true }) })
    const tool = defineActionTool("probe", { inspect: action }, "Probe")
    expect(Object.isFrozen(tool.actions)).toBe(true)
    expect(Object.isFrozen(tool.actions["inspect"])).toBe(true)
    expect(JSON.parse(await toSpec(tool, context).execute({ action: "inspect" }, call()))).toEqual({ ok: true, original: true })
  })

  test("a tool's kind is its effect, and a group that mixes effects is refused", () => {
    expect(defineActionTool("probe", { read }, "Probe").kind).toBe("read")
    expect(defineActionTool("probe", { write }, "Probe").kind).toBe("write")
    const destructive = defineAction({ id: "probe.drop", kind: "destructive", parameters: z.object({}), run: () => ({ ok: true }) })
    expect(defineActionTool("probe", { drop: destructive }, "Probe").kind).toBe("destructive")
    expect(() => defineActionTool("probe", { read, drop: destructive }, "Probe")).toThrow("mixes read and write")
  })

  test("a contributed action without an implementation refuses instead of guessing", async () => {
    const action = contributedAction({ id: "library.lookup_tool", kind: "read", contribution: "library.lookup_tool", parameters: z.object({ query: z.string() }) })
    expect(action.contributed).toBe("library.lookup_tool")
    const tool = defineActionTool("library", { lookup_tool: action as never }, "Library")
    const refused = JSON.parse(await toSpec(tool, context).execute({ action: "lookup_tool", query: "6mm" }, call()))
    expect(refused).toMatchObject({ ok: false, _tag: "ActionUnavailable" })
    const served = JSON.parse(await toSpec(tool, { ...context, contributions: { "library.lookup_tool": async () => ({ ok: true, rows: [] }) } }).execute({ action: "lookup_tool", query: "6mm" }, call()))
    expect(served).toEqual({ ok: true, rows: [] })
  })

  test("the shared failure contracts carry every tag the adapter can answer with", () => {
    expect(new ActionInterrupted({ actionId: "a", message: "m" })).toMatchObject({ _tag: "ActionInterrupted", actionId: "a" })
    expect(new ActionInvalidInput({ actionId: "a", message: "m" })).toMatchObject({ _tag: "ActionInvalidInput", actionId: "a" })
  })
})