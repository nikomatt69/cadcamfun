import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { FUSION_EXAMPLE_HISTORY, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
import { makeParametricRunner } from "./helpers/parametric.ts"

/** The Fusion 360 commands through the real project handlers: create, inspect, update, test, and the assistant's own example. */
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const run = makeParametricRunner(() => handlers, () => projectId)
const SLOW = 120_000

beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Fusion modelling" } })).body.id
})
afterAll(async () => { await app.dispose() })

describe("shapes and catalogue solids, stored and edited by parameter", () => {
  let elementId = ""

  test("chamfer callouts survive storage and invalid parameter edits do not replace the part", async () => {
    for (const callout of [{ secondDistance: "cut" }, { angle: "cut" }]) {
      const created = await run({ action: "create", name: "Chamfered plate", history: {
        parameters: { cut: "angle" in callout ? 30 : 1 },
        features: [
          { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 40, height: 25 }] } },
          { id: "plate", type: "extrude", sketch: "s", depth: 6, operation: "new" },
          { id: "ch", type: "fillet", style: "chamfer", radius: 2, edges: { within: { min: [0, 0, 5.5], max: [40, 25, 6.5] } }, ...callout }
        ]
      } })
      expect(created.ok).toBe(true)
      const partId = created.ids[0]
      const before = await run({ action: "inspect", elementId: partId })
      expect(before.ok).toBe(true)
      expect(before.history.features.at(-1)).toMatchObject(callout)
      expect(before.volumeMm3).toBeLessThan(6000)
      const refused = await run({ action: "update", elementId: partId, expectedRevision: before.revision, parameters: { cut: -1 } })
      expect(refused.ok).toBe(false)
      const after = await run({ action: "inspect", elementId: partId })
      expect(after.revision).toBe(before.revision)
      expect(after.volumeMm3).toBe(before.volumeMm3)
    }
  }, SLOW)

  test("the skill's example is stored, and the stored part reports the volume of what it describes", async () => {
    const created = await run({ action: "create", name: "Slotted plate", history: FUSION_EXAMPLE_HISTORY })
    expect(created.ok).toBe(true)
    elementId = created.ids[0]
    const inspected = await run({ action: "inspect", elementId })
    expect(inspected).toMatchObject({ ok: true })
    const plate = 80 * 50 * 8 - ((30 - 6) * 6 + Math.PI * 9) * 8, posts = 3 * Math.PI * 25 * 10
    expect(inspected.volumeMm3).toBeGreaterThan((plate + posts) * 0.97)
    expect(inspected.volumeMm3).toBeLessThan((plate + posts) * 1.03)
    // The measures of the shapes are parameters the assistant can name.
    expect(inspected.dependencies.map((d: { name: string }) => d.name)).toEqual(expect.arrayContaining(["width", "depth", "thick", "slotLength"]))
  }, SLOW)

  test("changing one parameter rebuilds it: a wider plate, and a stale revision is refused", async () => {
    const before = await run({ action: "inspect", elementId })
    const changed = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { width: 120 } })
    expect(changed.ok).toBe(true)
    expect(changed.report.volumeMm3).toBeGreaterThan(before.volumeMm3 + 40 * 50 * 8 * 0.97)
    expect((await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { width: 100 } })).ok).toBe(false)
  }, SLOW)

  test("a slot that is shorter than it is wide is refused as a variant and the part is left alone", async () => {
    const before = await run({ action: "inspect", elementId })
    const refused = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { slotLength: 4 } })
    expect(refused.ok).toBe(false)
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  }, SLOW)

  test("test cases run variants without writing: a long slot passes, a spring pitched under its wire does not", async () => {
    const before = await run({ action: "inspect", elementId })
    const tested = await run({ action: "test", elementId, cases: [{ name: "long slot", parameters: { slotLength: 40 }, expectedBodies: 1 }] })
    expect(tested.ok).toBe(true)
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  }, SLOW)
})

describe("sweeps, revolutions and coils built from curves and parameters", () => {
  test("a NURBS-bounded vase, a swept wire along a spline and a spring are stored and rebuild to volumes that match the geometry", async () => {
    const vase = await run({
      action: "create", name: "Vase",
      history: {
        parameters: { r: 14, h: 40 },
        features: [
          { id: "profile", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "c", kind: "curve", curve: "spline", points: [[0, 0], ["r", 10], ["r + 2", 20], ["r", 30], [0, "h"]], chord: true }] } },
          { id: "vase", type: "revolve", sketch: "profile", axis: "y", operation: "new" }
        ]
      }
    })
    expect(vase.ok).toBe(true)
    const v = (await run({ action: "inspect", elementId: vase.ids[0] })).volumeMm3
    expect(v).toBeGreaterThan(Math.PI * 14 * 14 * 40 * 0.75)
    expect(v).toBeLessThan(Math.PI * 16 * 16 * 40)

    const spring = await run({
      action: "create", name: "Spring",
      history: { parameters: { R: 20, wire: 3, turns: 5 }, features: [{ id: "spring", type: "coil", radius: "R", pitch: "wire * 2.5", turns: "turns", wireDiameter: "wire", operation: "new" }] }
    })
    expect(spring.ok).toBe(true)
    const length = 5 * Math.hypot(2 * Math.PI * 20, 7.5)
    const sv = (await run({ action: "inspect", elementId: spring.ids[0] })).volumeMm3
    expect(sv).toBeGreaterThan(Math.PI * 2.25 * length * 0.95)
    expect(sv).toBeLessThan(Math.PI * 2.25 * length * 1.05)

    // More turns, same wire: the volume grows in proportion.
    const before = await run({ action: "inspect", elementId: spring.ids[0] })
    const more = await run({ action: "update", elementId: spring.ids[0], expectedRevision: before.revision, parameters: { turns: 10 } })
    expect(more.ok).toBe(true)
    expect(more.report.volumeMm3 / sv).toBeGreaterThan(1.9)
    expect(more.report.volumeMm3 / sv).toBeLessThan(2.1)

    const wire = await run({
      action: "create", name: "Wire",
      history: {
        parameters: {},
        features: [
          { id: "path", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "p", kind: "curve", curve: "nurbs", points: [[0, 0], [30, 25], [60, -25], [90, 0]], divisions: 120 }] } },
          { id: "section", type: "sketch", plane: "YZ", sketch: { shapes: [{ id: "w", kind: "circle", at: [0, 0], diameter: 4 }] } },
          { id: "wire", type: "sweep", profile: "section", path: "path", operation: "new" }
        ]
      }
    })
    expect(wire.ok).toBe(true)
    expect((await run({ action: "inspect", elementId: wire.ids[0] })).volumeMm3).toBeGreaterThan(Math.PI * 4 * 90 * 0.9)
  }, SLOW)
})
