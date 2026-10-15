import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { cam } from "@cadcamfun/core"
import { Context, Effect } from "effect"
import { DrawingRepo, drawingContentHash } from "../src/repos/drawing-repo.ts"
import { ToolpathRepo } from "../src/repos/toolpath-repo.ts"
import { LocalProfile } from "../src/services/local-profile.ts"
import { makeApp } from "./helpers.ts"

/**
 * AI-11 Step 8: verification reads the program generation stored and never makes one; its report is bound to that program
 * and to the inputs it was checked with, so a change of either leaves the report stale even when the NC text is identical.
 */
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
let drawingId: string
let operationId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = async (id: string, input: unknown) => JSON.parse(await buildTools(handlers, projectId).find((t) => t.id === id)!.execute(input, ctx))
const stock = { width: 60, height: 50, depth: 10, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }

beforeAll(async () => {
  app = await makeApp()
  handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Verify binding" } })).body.id
  const added = await handlers.addEntities(projectId, [{ type: "rectangle", origin: { x: -15, y: -10 }, width: 30, height: 20 }]) as { drawingId: string }
  drawingId = added.drawingId
  expect((await run("cam_edit", { action: "stock_set", stock })).ok).toBe(true)
  operationId = ((await handlers.createOperation(projectId, { type: "contour", params: { toolDiameter: 6, depth: 3, stepdown: 1 } })) as { operationId: string }).operationId
})
afterAll(async () => { await app.dispose() })

const toolpaths = async () => Context.get(await app.services(), ToolpathRepo)
const program = async () => {
  const services = await app.services()
  const found = await Effect.runPromise(Context.get(services, ToolpathRepo).find(Context.get(services, LocalProfile).user.id, operationId))
  return found?.row.gcode
}

describe("verification is separate from generation (AI-11 Step 8)", () => {
  test("verifying leaves the program's bytes as generated and binds the report to their hash", async () => {
    const generated = await run("cam_edit", { action: "generate", operationId })
    const before = await program()
    expect(typeof before).toBe("string")
    const report = await run("cam_edit", { action: "verify", operationId, resolution: 0.5 })
    expect(await program()).toBe(before)
    expect(report.programHash).toBe(cam.kernel.sha256(before!))
    expect(report.programHash).toBe(generated.programHash)
    expect(report.coverage).toMatchObject({ resolutionMm: expect.any(Number), requestedResolutionMm: 0.5, issuesOmitted: expect.any(Number) })
    expect(await run("cam", { action: "review", operationId })).toMatchObject({ status: report.ok ? "pass" : "failed" })
  }, 60_000)

  test("a setup change with the NC text unchanged makes the report stale, and verification will not replay it", async () => {
    const before = await program()
    // Another writer moves the stock without touching the operation: the stored program is byte for byte the same.
    const drawings = Context.get(await app.services(), DrawingRepo)
    const current = (await app.call(`/api/drawings/${drawingId}`)).body.data
    const written = await Effect.runPromise(drawings.writeIfUnchanged(drawingId, drawingContentHash(current), { ...current, stock: { ...current.stock, topZ: 2 } }))
    expect(written.ok).toBe(true)
    expect(await program()).toBe(before)

    expect(await run("cam", { action: "review", operationId })).toMatchObject({ status: "stale" })
    expect((await handlers.operationProgram!(projectId, operationId)).ok).toBe(false)
    const again = await run("cam_edit", { action: "verify", operationId })
    expect(again).toMatchObject({ ok: false, status: "stale" })
    expect(await program()).toBe(before)

    // A program generated for the new setup is verified on its own, and the review follows it.
    const regenerated = await run("cam_edit", { action: "generate", operationId })
    const fresh = await run("cam_edit", { action: "verify", operationId })
    expect(fresh.programHash).toBe(regenerated.programHash)
    expect(await run("cam", { action: "review", operationId })).toMatchObject({ status: fresh.ok ? "pass" : "failed" })
  }, 60_000)

  test("a changed program invalidates the report even when every input is the same", async () => {
    await run("cam_edit", { action: "verify", operationId })
    // Replace the stored NC only (as an import or a hand edit would), keeping request and drawing untouched.
    await Effect.runPromise((await toolpaths()).update(operationId, { gcode: `${await program()}\n(edited)` }))
    expect(await run("cam", { action: "review", operationId })).toMatchObject({ status: "stale" })
  }, 60_000)
})
