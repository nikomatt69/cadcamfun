/**
 * AI-11 Step 1: every answer an action gives is classified before it crosses an adapter, and nothing outside the
 * action's contract is handed on as success. Crosses the same seam as the host: `executeActionOutcome` and `runAction`.
 */
import { describe, expect, test } from "bun:test"
import { ACTION_CONTRACTS } from "@cadcamfun/api"
import { ACTION_CATALOGUE, actionById, runAction } from "../src/actions/catalogue.ts"
import { z } from "zod"
import { defineAction, executeActionOutcome } from "../src/actions/action.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const drawing = { drawingId: "d", projectId: "p" }
const handlers = (overrides: Partial<ToolHandlersShape>): ToolHandlersShape => overrides as ToolHandlersShape
const outcome = (id: string, input: unknown, supplied: Partial<ToolHandlersShape>, signal?: AbortSignal) =>
  executeActionOutcome(actionById(id)!, input, { handlers: handlers(supplied), projectId: "p", ...(signal ? { signal } : {}) })

describe("action contracts", () => {
  test("every catalogue action has a contract and every contract names a catalogue action", () => {
    expect(Object.keys(ACTION_CONTRACTS).sort()).toEqual(ACTION_CATALOGUE.map((spec) => spec.id).sort())
  })

  test("reads of the open document declare no effect; every write declares what it touches or says it touches nothing", () => {
    for (const spec of ACTION_CATALOGUE) {
      if (spec.kind === "read") expect(spec.contract.effects.filter((effect) => effect !== "interface" && effect !== "external")).toEqual([])
    }
    // Kind `write` only so no read-only role holds the tool: recorded, and the subject of AI-11 Step 3.
    expect(ACTION_CATALOGUE.filter((spec) => spec.kind !== "read" && spec.contract.effects.length === 0).map((spec) => spec.id)).toEqual(["agent.list", "agent.read"])
  })

  test("every catalogue action declares its result", () => {
    expect(ACTION_CATALOGUE.filter((spec) => spec.contract.result === undefined).map((spec) => spec.id)).toEqual([])
  })
})

describe("outcome classification", () => {
  test("a value that matches the declared result succeeds, validated", async () => {
    const result = await outcome("cad.describe", {}, { describeDrawing: async () => ({ total: 1, counts: { cube: 1 }, ...drawing }) })
    expect(result).toMatchObject({ kind: "succeeded", validated: true })
  })

  test("a read answering outside its contract is uncertain and never success; it says nothing changed", async () => {
    const result = await outcome("cad.describe", {}, { describeDrawing: async () => ({ ok: true, count: 1 }) })
    expect(result.kind).toBe("uncertain")
    expect(result.value).toMatchObject({ ok: false, _tag: "ActionResultInvalid", actionId: "cad.describe" })
    expect(String((result.value as { error: string }).error)).toContain("Nothing was changed")
  })

  test("a write answering outside its contract is uncertain and tells the model to inspect before retrying", async () => {
    const result = await outcome("cad_edit.delete", { ids: ["a"], confirm: true }, { deleteEntities: async () => ({ ok: true }) })
    expect(result.kind).toBe("uncertain")
    expect(String((result.value as { error: string }).error)).toContain("inspect before retrying")
  })

  test("an add that skipped some elements is partial, and keeps what it skipped", async () => {
    const element = { type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }
    const result = await outcome("cad_edit.add", { elements: [element, { type: "cube", width: -1 }] }, {
      addElements: async (_project, batch) => ({ ok: true, ids: batch.map((_, i) => `e${i}`), elements: batch.map((e, i) => ({ ...e, id: `e${i}` })), ...drawing })
    })
    expect(result.kind).toBe("partial")
    expect((result.value as { skipped: unknown[] }).skipped).toHaveLength(1)
  })

  test("an untagged refusal gets the shared failure shape and keeps its details", async () => {
    const result = await outcome("cad_edit.modify", { changes: [{ id: "x", changes: { name: "n" } }] }, {
      modifyEntities: async () => ({ ok: false, error: "Unknown element ids: x.", ...drawing })
    })
    expect(result).toMatchObject({ kind: "refused", value: { ok: false, _tag: "ActionRefused", actionId: "cad_edit.modify", error: "Unknown element ids: x.", drawingId: "d" } })
  })

  test("a stale-revision answer is a conflict, not a refusal", async () => {
    const result = await outcome("cam_edit.create", { type: "pocket" }, { createOperation: async () => ({ ok: false, status: "stale", error: "The drawing changed since plan validation." }) })
    expect(result).toMatchObject({ kind: "conflict", value: { _tag: "ActionStale", actionId: "cam_edit.create" } })
  })

  test("a typed conflict passes through unchanged", async () => {
    const conflict = { ok: false, _tag: "ActionConflict", actionId: "cam_edit.generate", projectId: "p", drawingId: "d", expectedRevision: 1, actualRevision: 2, message: "Changed" }
    expect(await runAction("cam_edit.generate", { operationId: "o" }, { handlers: handlers({ generateGcode: async () => conflict as never }), projectId: "p" })).toEqual(conflict)
  })

  test("a write that throws may have committed: uncertain; a read that throws is a refusal", async () => {
    const write = await outcome("cad_edit.delete", { ids: ["a"], confirm: true }, { deleteEntities: async () => { throw new Error("disk full") } })
    expect(write).toMatchObject({ kind: "uncertain", value: { _tag: "ActionUncertain" } })
    const read = await outcome("cad.describe", {}, { describeDrawing: async () => { throw new Error("db closed") } })
    expect(read).toMatchObject({ kind: "refused", value: { _tag: "ActionFailed" } })
  })

  test("cancelled before entry never runs the handler; aborted while a write runs is uncertain", async () => {
    let entered = 0
    const before = new AbortController()
    before.abort()
    expect(await outcome("cad_edit.delete", { ids: ["a"], confirm: true }, { deleteEntities: async () => { entered++; return { ok: true } } }, before.signal)).toMatchObject({ kind: "cancelled" })
    expect(entered).toBe(0)
    const during = new AbortController()
    const result = await outcome("cad_edit.delete", { ids: ["a"], confirm: true }, {
      deleteEntities: () => new Promise(() => { entered++; during.abort() })
    }, during.signal)
    expect(entered).toBe(1)
    expect(result).toMatchObject({ kind: "uncertain", value: { _tag: "ActionUncertain" } })
  })

  test("a failed verdict is an answer, not a refusal", async () => {
    const check = await outcome("cad.check", {}, { checkDesign: async () => ({ ok: false, issues: [{ severity: "error", code: "open-shell" }], omitted: 0, stats: {}, ...drawing }) })
    expect(check).toMatchObject({ kind: "succeeded", validated: true, value: { ok: false, issues: [{ code: "open-shell" }] } })
    const verify = await outcome("cam_edit.verify", { operationId: "o" }, {
      verifyOperation: async () => ({ ok: false, status: "failed", revision: "r1", issues: [{ kind: "gouge" }], stats: {} })
    })
    expect(verify).toMatchObject({ kind: "succeeded", value: { ok: false, status: "failed" } })
  })

  test("a failed generation is a refusal, never an empty program presented as success", async () => {
    const failed = await outcome("cam_edit.generate", { operationId: "o" }, { generateGcode: async () => ({ gcode: "", stats: { error: "Tool larger than the pocket." } }) })
    expect(failed).toMatchObject({ kind: "refused", value: { ok: false, _tag: "ActionRefused", actionId: "cam_edit.generate", error: "Tool larger than the pocket." } })
    const made = await outcome("cam_edit.generate", { operationId: "o", maxLines: 1 }, { generateGcode: async () => ({ gcode: "G0 Z5\nG1 Z-1", stats: { lines: 2 } }) })
    expect(made).toMatchObject({ kind: "succeeded", validated: true, value: { ok: true, preview: "G0 Z5" } })
  })

  test("a delegated task that stopped in error is an answer about the task; an unknown agent is a refusal", async () => {
    const failedTask = { id: "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f", description: "Check", prompt: "p", status: "error", error: "Model unavailable", projectId: "p", parentSessionId: "s" }
    const read = await executeActionOutcome(actionById("agent.read")!, { taskId: "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f" }, {
      handlers: handlers({}), projectId: "p", contributions: { "agent.read": async () => failedTask }
    })
    expect(read).toMatchObject({ kind: "succeeded", validated: true, value: { status: "error" } })
    const unknown = await executeActionOutcome(actionById("agent.start")!, { agent: "nobody", description: "d", prompt: "p" }, {
      handlers: handlers({}), projectId: "p", contributions: { "agent.start": async () => ({ ok: false, error: "Unknown agent \"nobody\"." }) }
    })
    expect(unknown).toMatchObject({ kind: "refused", value: { _tag: "ActionRefused", actionId: "agent.start" } })
  })

  test("an action with no declared result (a test probe outside the catalogue) passes unvalidated, and says so", async () => {
    const probe = defineAction({ id: "probe.read", kind: "read", parameters: z.object({}), run: async () => ({ anything: true }) })
    const result = await executeActionOutcome(probe, {}, { handlers: handlers({}), projectId: "p" })
    expect(result).toMatchObject({ kind: "succeeded", validated: false })
  })
})
