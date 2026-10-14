import { expect, test } from "bun:test"
import { Schema } from "effect"
import { CAM_ACTION_INPUTS } from "@cadcamfun/api"
import { actionById, runAction } from "../src/actions/catalogue.ts"
import { buildTools } from "../src/tools/registry.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const handlers = {} as ToolHandlersShape

test("CAM action inputs derive from the shared Effect contracts, including bounds and geometry", () => {
  const fixtures: ReadonlyArray<readonly [keyof typeof CAM_ACTION_INPUTS, unknown]> = [
    ["cam.cutting_data", { material: "6061", cut: "slot", tool: { kind: "flat", diameter: 10, flutes: 3 } }],
    ["cam.cutting_data", { material: "6061", cut: "slot", tool: { kind: "flat", diameter: 0, flutes: 3 } }],
    ["cam.cutting_data", { material: "6061", cut: "slot", tool: { kind: "flat", diameter: 10, flutes: 1.5 } }],
    ["cam.manufacture", { material: "C45", scallop: Infinity }],
    ["cam.compare_setups", { candidates: [] }],
    ["cam_edit.generate", { operationId: "o", maxLines: 201 }],
    ["cam_edit.verify", { operationId: "o", targetSolids: [{ type: "invented" }] }],
    ["cam_edit.verify", { operationId: "o", fixtures: [{ id: "f", bounds: { minX: Infinity } }] }],
    ["cam_edit.verify", { operationId: "o", tolerance: 0 }],
    ["cam_edit.stock_set", { stock: { width: 40, height: 30, depth: 10, allowance: 0 } }],
    ["cam_edit.stock_set", { stock: { width: 40, height: 30, depth: 0 } }],
    ["cam.operations", {}], ["cam.operations", []], ["cam.stock", null]
  ]
  for (const [id, input] of fixtures) {
    const schema = CAM_ACTION_INPUTS[id]
    expect(actionById(id)!.parameters.safeParse(input).success, id).toBe(Schema.decodeUnknownResult(schema)(input)._tag === "Success")
  }
  for (const id of Object.keys(CAM_ACTION_INPUTS)) expect(actionById(id), id).toBeDefined()
})

test("the host passes core stock defaults once and rejects invalid target geometry before the handler", async () => {
  const writes: unknown[] = []
  let verifications = 0
  const tools = buildTools({ ...handlers,
    stock: async (_project, input) => { writes.push(input); return { ok: true } },
    verifyOperation: async () => { verifications++; return { ok: true } }
  }, "p")
  const tool = tools.find((spec) => spec.id === "cam_edit")!
  const call = { projectId: "p", sessionId: "s", signal: new AbortController().signal }
  await tool.execute({ action: "stock_set", stock: { width: 40, height: 30, depth: 10, allowance: 0 } }, call)
  expect(writes).toEqual([{ action: "set", stock: { width: 40, height: 30, depth: 10, allowance: 0, radius: 0, x: 0, y: 0, topZ: 0 } }])
  expect(JSON.parse(await tool.execute({ action: "verify", operationId: "o", targetSolids: [{ type: "invented" }] }, call)).ok).toBe(false)
  expect(verifications).toBe(0)
})

test("generation preserves conflicts, refusals and committed receipts through catalogue and host without retries", async () => {
  const outcomes = [
    { ok: false, _tag: "ActionConflict", actionId: "cam_edit.generate", projectId: "p", drawingId: "d", expectedRevision: 1, actualRevision: 2, message: "Changed" },
    { ok: false, _tag: "ActionDenied", actionId: "cam_edit.generate", message: "Denied" },
    { ok: true, _tag: "ActionCommitted", receipt: { receiptId: "r", actionId: "cam_edit.generate", actorId: "u", projectId: "p", drawingId: "d", callId: "c", previousRevision: 1, revision: 2, committedAt: "2026-10-14T10:00:00Z", result: { operationId: "o" } } }
  ]
  for (const value of outcomes) {
    let calls = 0
    const supplied = { ...handlers, generateGcode: async () => { calls++; return value } } as ToolHandlersShape
    expect(await runAction("cam_edit.generate", { operationId: "o" }, { handlers: supplied, projectId: "p" })).toEqual(value)
    const host = buildTools(supplied, "p").find((spec) => spec.id === "cam_edit")!
    expect(JSON.parse(await host.execute({ action: "generate", operationId: "o" }, { projectId: "p", sessionId: "s", signal: new AbortController().signal }))).toEqual(value)
    expect(calls).toBe(2)
  }
})

test("a cancelled direct catalogue invocation returns a typed interruption and never enters its handler", async () => {
  let entries = 0
  const signal = new AbortController()
  signal.abort()
  const result = await runAction("cam_edit.create", { type: "pocket" }, { handlers: { ...handlers, createOperation: async () => { entries++; return { ok: true } } }, projectId: "p", signal: signal.signal })
  expect(result).toMatchObject({ ok: false, _tag: "ActionInterrupted", actionId: "cam_edit.create" })
  expect(entries).toBe(0)
})

test("numeric material grades stay textual through the host's lenient argument adapter", async () => {
  let received: unknown
  const host = buildTools({ ...handlers, manufactureOperation: async (_project, input) => { received = input; return { ok: true, operationId: "o", release: "verified-program", identity: {}, drawingId: "d", projectId: "p" } } }, "p").find((spec) => spec.id === "cam_edit")!
  expect(JSON.parse(await host.execute({ action: "manufacture", material: "6061" }, { projectId: "p", sessionId: "s", signal: new AbortController().signal })).ok).toBe(true)
  expect(received).toEqual({ material: "6061" })
})
