/**
 * Timeline edits of a stored part through the assistant's `cad_edit.parametric_timeline` (spec 58 T7), over the real sidecar and its
 * database: what is stored is read back by inspection, and the exact model of the stored part follows the timeline.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { plateTemplate } from "@cadcamfun/core"
import type { ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
import { makeParametricRunner } from "./helpers/parametric.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
let elementId: string
const run = makeParametricRunner(() => handlers, () => projectId)
/** The starting plate: 60 x 40 x 8 with a 10 mm through hole. */
const PLATE = 60 * 40 * 8
const HOLE = Math.PI * 5 ** 2 * 8

beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Timeline test" } })).body.id
  const created = await run({ action: "create", name: "Plate", history: plateTemplate() })
  expect(created.ok).toBe(true); elementId = created.ids[0]
})
afterAll(async () => { await app.dispose() })

const exactVolume = async (): Promise<number> => {
  const exact = await run({ action: "exact", elementId })
  expect(exact.bodies[0].exact).toBe(true)
  return exact.bodies[0].volumeMm3
}

describe("timeline edits of a stored part", () => {
  test("suppressing the hole is stored, read back, and the exact model leaves it out; releasing restores the stored history", async () => {
    expect(await exactVolume()).toBeCloseTo(PLATE - HOLE, 1)
    const before = await run({ action: "inspect", elementId })
    const suppressed = await run({ action: "timeline", elementId, expectedRevision: before.revision, suppress: ["hole1"] })
    expect(suppressed.ok).toBe(true)
    expect(suppressed.mutation).toBe("timeline")
    expect(suppressed.report.timeline.notBuilt).toEqual([{ id: "hole1", state: "suppressed" }])
    const stored = await run({ action: "inspect", elementId })
    expect(stored.revision).toBe(suppressed.revision)
    expect(stored.history.version).toBe(2)
    expect(stored.timeline.notBuilt).toEqual([{ id: "hole1", state: "suppressed" }])
    expect(stored.history.features.find((f: { id: string }) => f.id === "hole1").suppressed).toBe(true)
    expect(await exactVolume()).toBeCloseTo(PLATE, 1)
    const released = await run({ action: "timeline", elementId, expectedRevision: stored.revision, release: ["hole1"] })
    expect(released.ok).toBe(true)
    const back = await run({ action: "inspect", elementId })
    expect(back.revision).toBe(before.revision)
    expect(back.timeline).toBeUndefined()
  })

  test("rolling back and forward through the assistant", async () => {
    const before = await run({ action: "inspect", elementId })
    const rolled = await run({ action: "timeline", elementId, expectedRevision: before.revision, rollback: "plate" })
    expect(rolled.ok).toBe(true)
    expect(rolled.report.timeline).toEqual({ rollback: "plate", notBuilt: [{ id: "hole1", state: "rolled-back" }] })
    expect(await exactVolume()).toBeCloseTo(PLATE, 1)
    const forward = await run({ action: "timeline", elementId, expectedRevision: rolled.revision, rollForward: true })
    expect(forward.ok).toBe(true)
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  })

  test("a move across a dependency, an unknown feature and a stale revision are refused, and nothing is stored", async () => {
    const before = await run({ action: "inspect", elementId })
    const moved = await run({ action: "timeline", elementId, expectedRevision: before.revision, move: { feature: "hole1", to: 0 } })
    expect(moved.ok).toBe(false)
    expect(moved.error).toContain("'plate'")
    const unknown = await run({ action: "timeline", elementId, expectedRevision: before.revision, suppress: ["ghost"] })
    expect(unknown.ok).toBe(false)
    expect(unknown.error).toContain("ghost")
    const stale = await run({ action: "timeline", elementId, expectedRevision: "0".repeat(64), suppress: ["hole1"] })
    expect(stale.ok).toBe(false)
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  })

  test("an empty edit is refused by the schema", async () => {
    const before = await run({ action: "inspect", elementId })
    const empty = await run({ action: "timeline", elementId, expectedRevision: before.revision })
    expect(empty.ok).toBe(false)
  })
})
