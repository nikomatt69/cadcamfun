import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildRecipe, plateTemplate } from "@cadcamfun/core"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
import { makeParametricRunner } from "./helpers/parametric.ts"

/** The engineering features (edge / corner treatments, counterbored holes, mirror) and the recipe / dfm / fastener actions through the real project handlers. */
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = makeParametricRunner(() => handlers, () => projectId)
const SLOW = 120_000

const base = plateTemplate()
const engineered = () => ({
  parameters: { ...base.parameters, c: 1, head: 16 },
  features: [
    base.features[0]!,
    { id: "plate", type: "extrude", sketch: "sketch1", depth: "thick", operation: "new", edge: { style: "chamfer", size: "c" }, corner: { style: "fillet", size: 4 } },
    { id: "hole1", type: "hole", plane: "XY", offset: "thick", at: ["width / 4", "depth / 2"], diameter: "hole", depth: "thick", kind: "counterbore", headDiameter: "head", headDepth: 3 },
    { id: "twin", type: "mirror", feature: "hole1", plane: "YZ", offset: "width / 2" }
  ]
})

beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Engineering test" } })).body.id
})
afterAll(async () => { await app.dispose() })

describe("engineering features survive the project round trip", () => {
  let elementId = ""
  let firstVolume = 0

  test("create stores a part with edge, corner, counterbore and mirror; inspect returns the same history", async () => {
    const created = await run({ action: "create", name: "Engineered plate", history: engineered() })
    expect(created.ok).toBe(true)
    elementId = created.ids[0]
    const inspected = await run({ action: "inspect", elementId })
    expect(inspected.ok).toBe(true)
    expect(inspected.bodyCount).toBe(1)
    expect(inspected.history.features.map((f: { id: string; type: string }) => [f.id, f.type])).toEqual([["sketch1", "sketch"], ["plate", "extrude"], ["hole1", "hole"], ["twin", "mirror"]])
    expect(inspected.history.features[1]).toMatchObject({ edge: { style: "chamfer", size: "c" }, corner: { style: "fillet", size: 4 } })
    expect(inspected.history.features[2]).toMatchObject({ kind: "counterbore", headDiameter: "head", headDepth: 3 })
    expect(inspected.history.features[3]).toMatchObject({ feature: "hole1", plane: "YZ", offset: "width / 2" })
    firstVolume = inspected.volumeMm3
    // the plate 60 x 40 x 8 less the rounded corners, the chamfer, two counterbored holes
    expect(firstVolume).toBeLessThan(60 * 40 * 8 - 2 * Math.PI * 25 * 8 * 0.95)
    expect(firstVolume).toBeGreaterThan(60 * 40 * 8 - 3000)
    expect(inspected.issues).toEqual([])
  }, SLOW)

  test("the dependencies include the new dimension: c drives the chamfer, head the recess", async () => {
    const inspected = await run({ action: "inspect", elementId })
    const dep = (name: string) => inspected.dependencies.find((d: { name: string }) => d.name === name)
    expect(dep("c").features).toEqual(["plate"])
    expect(dep("head").features).toEqual(["hole1"])
    expect(dep("width").features).toContain("twin")
  })

  test("updating the chamfer parameter rebuilds the part: a bigger chamfer removes more material", async () => {
    const before = await run({ action: "inspect", elementId })
    const changed = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { c: 2 } })
    expect(changed.ok).toBe(true)
    expect(changed.ids).toEqual([elementId])
    expect(changed.report.volumeMm3).toBeLessThan(firstVolume)
    expect((await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { c: 3 } })).ok).toBe(false) // stale
    firstVolume = changed.report.volumeMm3
  }, SLOW)

  test("a chamfer as deep as the plate is an invalid variant: refused, and the stored part is unchanged", async () => {
    const before = await run({ action: "inspect", elementId })
    const refused = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { c: 4 } }) // 8 mm plate, both ends
    expect(refused.ok).toBe(false)
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  }, SLOW)

  test("test cases run the variants without mutating anything", async () => {
    const before = await run({ action: "inspect", elementId })
    const report = await run({ action: "test", elementId, cases: [
      { name: "wider", parameters: { width: 90 }, expectedBodies: 1, minVolumeMm3: firstVolume },
      { name: "chamfer eats the plate", parameters: { c: 4 } },
      { name: "recess smaller than the hole", parameters: { head: 5 } }
    ] })
    expect(report.mutated).toBe(false)
    expect(report.cases.map((c: { passed: boolean }) => c.passed)).toEqual([true, false, false])
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  }, SLOW)

  test("dfm by elementId reads the stored part through the handler and checks it", async () => {
    const report = await run({ action: "dfm", elementId, toolDiameter: 4 })
    expect(report.process).toBe("mill")
    expect(report.metrics.bodies).toBe(1)
    expect(report.metrics.volumeMm3).toBeCloseTo(firstVolume, 0)
    // the counterbore sits 15 mm from the edge in a 40 mm wide plate: fine; the hole is 5 mm above a 3 mm recess floor: the wall is 5 mm
    expect(report.issues.filter((i: { code: string }) => i.code === "THIN_WALL")).toEqual([])
    expect((await run({ action: "dfm", elementId: "missing" })).ok).toBe(false)
  }, SLOW)
})

describe("invalid engineering histories are refused before they are stored", () => {
  test("a counterbore without its head diameter, and a mirror of nothing, never create a part", async () => {
    const bad = engineered()
    const noHead = { ...bad, features: bad.features.map((f) => (f.id === "hole1" ? { ...f, headDiameter: undefined } : f)) }
    const ghost = { ...bad, features: bad.features.map((f) => (f.id === "twin" ? { ...f, feature: "ghost" } : f)) }
    for (const history of [noHead, ghost]) {
      const result = await run({ action: "create", name: "Bad", history })
      expect(result.ok).toBe(false)
    }
  })

  test("a history whose rebuild fails (a chamfer larger than the depth) is refused by create", async () => {
    const history = engineered()
    history.parameters = { ...history.parameters, c: 6 }
    const result = await run({ action: "create", name: "Too deep", history })
    expect(result.ok).toBe(false)
  })
})

describe("recipes through the project", () => {
  test("recipe + create stores the generated part: inspect returns the recipe's history and the volume of the report", async () => {
    const result = await run({ action: "recipe", recipe: "mounting_plate", params: { counterbore: true, cornerRadius: 6 }, create: true, name: "Base plate", x: 5, y: 5, z: 0 })
    expect(result.ok).toBe(true)
    expect(result.created.ok).toBe(true)
    const id = result.created.ids[0]
    const inspected = await run({ action: "inspect", elementId: id })
    expect(inspected.ok).toBe(true)
    expect(inspected.history).toEqual(buildRecipe("mounting_plate", { counterbore: true, cornerRadius: 6 }).history)
    expect(inspected.volumeMm3).toBeCloseTo(result.report.volumeMm3, 3)
    expect(inspected.dependencies.find((d: { name: string }) => d.name === "inset").features.length).toBe(4)
    // editing a recipe parameter rebuilds the part like any other
    const wide = await run({ action: "update", elementId: id, expectedRevision: inspected.revision, parameters: { width: 140 } })
    expect(wide.ok).toBe(true)
    expect(wide.report.bounds.max.x).toBeCloseTo(140, 2)
    // the stored recipe part is makeable
    const dfm = await run({ action: "dfm", elementId: id })
    expect(dfm.issues.filter((i: { severity: string }) => i.severity === "error")).toEqual([])
  }, SLOW)

  test("a recipe that breaks a design rule creates nothing and says which", async () => {
    const result = await run({ action: "recipe", recipe: "flange", params: { boltCount: 30 }, create: true })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/neighbouring bolts/)
    expect(result.created).toBeUndefined()
  })

  test("fastener answers without a project and never touches it", async () => {
    const result = await run({ action: "fastener", size: "M5", fit: "fine" })
    expect(result).toMatchObject({ ok: true, clearanceHole: 5.3 })
    expect(result.thread.tapDrill).toBe(4.2)
  })
})
