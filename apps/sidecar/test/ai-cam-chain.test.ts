import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"

/** The CAM read actions the inventory had no test for (AI-11 Step 11): machine, chain_suggest, chain_status, vision. */
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = async (id: string, input: unknown) => JSON.parse(await buildTools(handlers, projectId).find((t) => t.id === id)!.execute(input, ctx))

beforeAll(async () => {
  app = await makeApp()
  handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Chain" } })).body.id
  await handlers.addEntities(projectId, [{ type: "rectangle", origin: { x: -15, y: -10 }, width: 30, height: 20 }])
})
afterAll(async () => { await app.dispose() })

describe("cam read actions", () => {
  test("cam.machine describes each machine kind from the kinematics table", async () => {
    const mill = await run("cam", { action: "machine", machineType: "mill" })
    expect(mill.origins).toBeDefined()
    const lathe = await run("cam", { action: "machine", machineType: "lathe" })
    expect(JSON.stringify(lathe)).not.toEqual(JSON.stringify(mill))
    expect((await run("cam", { action: "machine", machineType: "warp-drive" })).ok).toBe(false)
  })

  test("cam.chain_suggest starts with facing and continues a roughing pass that has depth left", async () => {
    const first = await run("cam", { action: "chain_suggest" })
    expect(first).toMatchObject({ ok: true, recommendation: { operationType: "face" }, after: null })
    const rough = (await handlers.createOperation(projectId, { type: "pocket", params: { toolDiameter: 6, depth: 5, stepdown: 1 } })) as { operationId: string }
    const next = await run("cam", { action: "chain_suggest", fromOperationId: rough.operationId })
    expect(next).toMatchObject({ ok: true, recommendation: { operationType: "pocket", params: { toolDiameter: 6, depth: 5 } }, after: rough.operationId })
    expect(next.recommendation.reason).toContain("4.00 mm")
  })

  test("cam.chain_status follows creation order: the predecessor, generation and the rest reference", async () => {
    const a = (await handlers.createOperation(projectId, { type: "contour", params: { toolDiameter: 10, depth: 2, stepdown: 1 } })) as { operationId: string }
    await Bun.sleep(5)
    const b = (await handlers.createOperation(projectId, { type: "contour", params: { toolDiameter: 6, depth: 2, stepdown: 1, useRestMachining: true, restToolDiameter: 10 } })) as { operationId: string }
    await Bun.sleep(5)
    const c = (await handlers.createOperation(projectId, { type: "contour", params: { toolDiameter: 6, depth: 2, stepdown: 1, useRestMachining: true, restToolDiameter: 4 } })) as { operationId: string }
    const status = await run("cam", { action: "chain_status", operationId: b.operationId })
    expect(status).toMatchObject({ ok: true, operationId: b.operationId, restFrom: a.operationId, prevTool: 10, generated: false, warnings: [] })
    // A rest pass after a smaller tool has nothing to clean up after.
    const orphan = await run("cam", { action: "chain_status", operationId: c.operationId })
    expect(orphan).toMatchObject({ ok: true, restFrom: b.operationId })
    expect(orphan.warnings.join(" ")).toContain("OrphanRef")
    // Without a starting point, the suggestion continues the newest operation, not the oldest.
    expect(await run("cam", { action: "chain_suggest" })).toMatchObject({ ok: true, after: c.operationId })
    expect(await run("cam", { action: "chain_status", operationId: "nope" })).toMatchObject({ ok: false })
  })

  test("cam.vision refuses a project the acting user cannot see", async () => {
    const out = await buildTools(handlers, "not-a-project").find((t) => t.id === "cam")!.execute({ action: "vision", focus: "the toolpath" }, ctx)
    expect(JSON.parse(out)).toMatchObject({ ok: false })
  })
})

describe("cam.manufacture in the kernel worker", () => {
  beforeAll(async () => { await handlers.addElements(projectId, [{ type: "cube", width: 30, height: 20, depth: 5, name: "Plate" }]) })
  test("the assistant's abort stops the run with a typed Cancelled issue instead of an artifact", async () => {
    const controller = new AbortController()
    const call = handlers.manufacture!(projectId, { material: "6061" } as never, controller.signal)
    controller.abort()
    const result = await call as { ok: boolean; issues?: ReadonlyArray<{ tag: string }> }
    expect(result.ok).toBe(false)
    expect(result.issues?.map((i) => i.tag)).toEqual(["Cancelled"])
  })

  test("without an abort the run completes in the worker and reports its release", async () => {
    const result = await handlers.manufacture!(projectId, { material: "6061" } as never) as { ok: boolean; release?: string }
    expect(result.ok).toBe(true)
    expect(result.release).toBeDefined()
  })
})

