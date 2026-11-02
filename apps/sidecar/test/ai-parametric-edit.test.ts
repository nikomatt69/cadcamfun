/**
 * Structural edits of a stored part through the assistant's `cad_edit.parametric_edit`, over the real sidecar and its database:
 * what is stored is read back by inspection, and the exact model of the stored part follows every edit.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { plateTemplate, type History } from "@cadcamfun/core"
import type { ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
import { makeParametricRunner } from "./helpers/parametric.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
let elementId: string
const run = makeParametricRunner(() => handlers, () => projectId)
const PLATE = 60 * 40 * 8
const HOLE = Math.PI * 5 ** 2 * 8

beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Edit test" } })).body.id
  const created = await run({ action: "create", name: "Plate", history: plateTemplate() })
  expect(created.ok).toBe(true); elementId = created.ids[0]
})
afterAll(async () => { await app.dispose() })

const exactVolume = async (): Promise<number> => {
  const exact = await run({ action: "exact", elementId })
  expect(exact.bodies[0].exact).toBe(true)
  return exact.bodies[0].volumeMm3
}

describe("structural edits of a stored part", () => {
  test("inspection lists every feature with the dimension paths an edit can bind", async () => {
    const inspected = await run({ action: "inspect", elementId })
    const hole = inspected.features.find((f: { id: string }) => f.id === "hole1")
    expect(hole.dimensions.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(["at.0", "diameter", "depth"]))
    const only = await run({ action: "inspect", elementId, feature: "plate" })
    expect(only.features.map((f: { id: string }) => f.id)).toEqual(["plate"])
  })

  test("a new parameter is bound to a dimension, the stored part follows it, and a later parameter edit regenerates the model", async () => {
    expect(await exactVolume()).toBeCloseTo(PLATE - HOLE, 1)
    const before = await run({ action: "inspect", elementId })
    const edited = await run({
      action: "edit", elementId, expectedRevision: before.revision,
      edits: [{ op: "set_parameter", name: "plate_t", value: 10 }, { op: "set_dimension", feature: "plate", path: "depth", value: "plate_t" }, { op: "set_dimension", feature: "hole1", path: "offset", value: "plate_t" }, { op: "set_dimension", feature: "hole1", path: "depth", value: "plate_t" }]
    })
    expect(edited.ok).toBe(true)
    expect(edited.mutation).toBe("edit")
    expect(edited.applied[0]).toContain("plate_t added")
    expect(edited.elements[0].history.parameters.plate_t).toBe(10)
    const stored = await run({ action: "inspect", elementId })
    expect(stored.revision).toBe(edited.revision)
    expect(await exactVolume()).toBeCloseTo((60 * 40 - Math.PI * 25) * 10, 1)
    // Edit by parameter: one number moves the plate and its hole together.
    const resized = await run({ action: "update", elementId, expectedRevision: stored.revision, parameters: { plate_t: 20 } })
    expect(resized.ok).toBe(true)
    expect(await exactVolume()).toBeCloseTo((60 * 40 - Math.PI * 25) * 20, 1)
  })

  test("a feature is inserted, then removed; a feature with dependents needs cascade", async () => {
    const before = await run({ action: "inspect", elementId })
    const volume = await exactVolume()
    const inserted = await run({
      action: "edit", elementId, expectedRevision: before.revision,
      edits: [{ op: "insert_feature", feature: { id: "edge1", type: "fillet", style: "chamfer", radius: 1, edges: { parallel: "z" } } }]
    })
    expect(inserted.ok).toBe(true)
    expect(await exactVolume()).toBeLessThan(volume)
    const refused = await run({ action: "edit", elementId, expectedRevision: inserted.revision, edits: [{ op: "remove_feature", id: "sketch1" }] })
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain("cascade:true")
    const removed = await run({ action: "edit", elementId, expectedRevision: inserted.revision, edits: [{ op: "remove_feature", id: "edge1" }] })
    expect(removed.ok).toBe(true)
    expect(await exactVolume()).toBeCloseTo(volume, 1)
  })

  test("a refused list stores nothing: unknown feature, a rebuild error, a stale revision", async () => {
    const before = await run({ action: "inspect", elementId })
    const unknown = await run({ action: "edit", elementId, expectedRevision: before.revision, edits: [{ op: "set_parameter", name: "extra", value: 1 }, { op: "set_dimension", feature: "ghost", path: "depth", value: 3 }] })
    expect(unknown.ok).toBe(false)
    expect(unknown.error).toContain("edits[1]")
    const broken = await run({ action: "edit", elementId, expectedRevision: before.revision, edits: [{ op: "set_dimension", feature: "hole1", path: "diameter", value: "no_such + 1" }] })
    expect(broken.ok).toBe(false)
    expect(broken.problems.join(" ")).toContain("no_such")
    const stale = await run({ action: "edit", elementId, expectedRevision: "0".repeat(64), edits: [{ op: "set_parameter", name: "w2", value: 1 }] })
    expect(stale.ok).toBe(false)
    expect(stale.error).toContain("changed since inspection")
    const after = await run({ action: "inspect", elementId })
    expect(after.revision).toBe(before.revision)
    expect(after.history.parameters.extra).toBeUndefined()
  })
})

describe("what the kernel stores on a hole survives the assistant's own edits", () => {
  test("a threaded, toleranced hole keeps thread, tolerance and fit through a parameter update and a timeline edit", async () => {
    const history = structuredClone(plateTemplate()) as History
    const features = history.features.map((f) => f.type === "hole"
      ? { ...f, diameter: 6.8, thread: { designation: "M8", depth: 6, fit: "6H" }, tolerance: { upper: 0.02, lower: 0 }, fit: "H7" }
      : f)
    const created = await run({ action: "create", name: "Tapped plate", history: { ...history, features } })
    expect(created.ok).toBe(true)
    const id = created.ids[0]
    const first = await run({ action: "inspect", elementId: id })
    const updated = await run({ action: "update", elementId: id, expectedRevision: first.revision, parameters: { thick: 12 } })
    expect(updated.ok).toBe(true)
    const timeline = await run({ action: "timeline", elementId: id, expectedRevision: updated.revision, suppress: ["hole1"] })
    expect(timeline.ok).toBe(true)
    const released = await run({ action: "timeline", elementId: id, expectedRevision: timeline.revision, release: ["hole1"] })
    expect(released.ok).toBe(true)
    const stored = (await run({ action: "inspect", elementId: id })).history.features.find((f: { id: string }) => f.id === "hole1")
    expect(stored).toMatchObject({ thread: { designation: "M8", depth: 6, fit: "6H" }, tolerance: { upper: 0.02, lower: 0 }, fit: "H7" })
  })
})
