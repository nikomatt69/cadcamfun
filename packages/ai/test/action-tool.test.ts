import { expect, test } from "bun:test"
import { Effect } from "effect"
import { z } from "zod"
import { ActionExecutionError, defineActionTool } from "../src/tools/action.ts"
import { toSpec } from "../src/tools/define.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const context = { handlers: {} as ToolHandlersShape, projectId: "p" }
const call = () => ({ signal: new AbortController().signal, sessionId: "s", projectId: "p" })

test("action tools reject mixed read/write groups and discriminator collisions", () => {
  const read = { parameters: z.object({}), kind: "read" as const, execute: () => Effect.succeed({ ok: true }) }
  expect(() => defineActionTool("mixed", { inspect: read, save: { ...read, kind: "write" } }, "mixed")).toThrow("mixes read and write")
  expect(() => defineActionTool("empty", {}, "empty")).toThrow("no actions")
  expect(() => defineActionTool("invalid", { inspect: { ...read, parameters: z.object({ action: z.string() }) } }, "invalid")).toThrow("discriminator")
})

test("host action adapter validates inputs before execution and preserves typed failures", async () => {
  let executions = 0
  const tool = defineActionTool("inspect", {
    find: { kind: "read", parameters: z.object({ limit: z.number().int().min(1).max(5).default(2) }), execute: (input) => {
      executions++
      return Effect.succeed({ ok: true, limit: input.limit })
    } },
    denied: { kind: "read", parameters: z.object({}), execute: () => Effect.fail(new ActionExecutionError({ actionId: "inspect.denied", message: "Denied" })) }
  }, "Inspect saved data")
  const host = toSpec(tool, context)
  expect(JSON.parse(await host.execute({ action: "find" }, call()))).toEqual({ ok: true, limit: 2 })
  expect(JSON.parse(await host.execute({ action: "find", limit: 9 }, call())).ok).toBe(false)
  expect(JSON.parse(await host.execute({ action: "unknown" }, call())).ok).toBe(false)
  expect(executions).toBe(1)
  expect(JSON.parse(await host.execute({ action: "denied" }, call()))).toEqual({ ok: false, _tag: "ActionExecutionError", actionId: "inspect.denied", message: "Denied" })
})

test("cancelled host calls never enter action execution", async () => {
  let executions = 0
  const tool = defineActionTool("edit", {
    save: { kind: "write", parameters: z.object({}), execute: () => Effect.sync(() => { executions++; return { ok: true } }) }
  }, "Save")
  const controller = new AbortController()
  controller.abort()
  expect(JSON.parse(await toSpec(tool, context).execute({ action: "save" }, { signal: controller.signal, sessionId: "s", projectId: "p" })).ok).toBe(false)
  expect(executions).toBe(0)
})

test("host cancellation interrupts an in-flight Effect before its write", async () => {
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  let writes = 0
  let finalized = 0
  const tool = defineActionTool("edit", {
    save: {
      kind: "write", parameters: z.object({}),
      execute: () => Effect.gen(function*() {
        yield* Effect.sync(entered)
        yield* Effect.never
        yield* Effect.sync(() => { writes++ })
        return { ok: true }
      }).pipe(Effect.ensuring(Effect.sync(() => { finalized++ })))
    }
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
  const action = { kind: "read" as const, parameters: z.object({}), execute: () => Effect.succeed({ ok: true, original: true }) }
  const actions = { inspect: action }
  const tool = defineActionTool("cad", actions, "Inspect")
  action.execute = () => Effect.succeed({ ok: true, original: false })
  expect(Object.isFrozen(tool.actions)).toBe(true)
  expect(Object.isFrozen(tool.actions.inspect)).toBe(true)
  expect(JSON.parse(await toSpec(tool, context).execute({ action: "inspect" }, call()))).toEqual({ ok: true, original: true })
})
