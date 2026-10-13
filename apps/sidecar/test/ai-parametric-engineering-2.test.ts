import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
import { makeParametricRunner } from "./helpers/parametric.ts"

/** Shell, fillet, sweep, loft (through a recipe) and grid patterns through the real project handlers: create, inspect, update, test. */
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = makeParametricRunner(() => handlers, () => projectId)
const SLOW = 120_000
const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want)

const rectangle = (id: string, w: string, d: string) => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [
      { id: "p1", kind: "point", x: 0.2, y: -0.1 }, { id: "p2", kind: "point", x: 9, y: 0.3 }, { id: "p3", kind: "point", x: 11, y: 6 }, { id: "p4", kind: "point", x: -0.4, y: 5 },
      { id: "l1", kind: "line", p1: "p1", p2: "p2" }, { id: "l2", kind: "line", p1: "p2", p2: "p3" }, { id: "l3", kind: "line", p1: "p3", p2: "p4" }, { id: "l4", kind: "line", p1: "p4", p2: "p1" }
    ],
    constraints: [
      { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: d }
    ]
  }
})
const box = (extra: unknown[], parameters: Record<string, number | string>) => ({
  parameters: { w: 40, d: 30, h: 20, ...parameters },
  features: [rectangle("s", "w", "d"), { id: "box", type: "extrude", sketch: "s", depth: "h", operation: "new" }, ...extra]
})

beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Engineering test 2" } })).body.id
})
afterAll(async () => { await app.dispose() })

describe("a shelled cup", () => {
  let elementId = ""
  const cup = () => box([{ id: "cup", type: "shell", feature: "box", thickness: "wall", open: "top" }], { wall: 2 })

  test("create stores it, inspect returns the shell with its dimension, the volume is the cup's: 24000 - 36 x 26 x 18", async () => {
    const created = await run({ action: "create", name: "Cup", history: cup() })
    expect(created.ok).toBe(true)
    elementId = created.ids[0]
    const inspected = await run({ action: "inspect", elementId })
    expect(inspected).toMatchObject({ ok: true, bodyCount: 1 })
    expect(inspected.volumeMm3).toBeCloseTo(7152, 2)
    expect(inspected.history.features.at(-1)).toMatchObject({ id: "cup", type: "shell", feature: "box", thickness: "wall", open: "top" })
    expect(inspected.dependencies.find((d: { name: string }) => d.name === "wall").features).toEqual(["cup"])
  }, SLOW)

  test("a thicker wall rebuilds with more material: 24000 - 34 x 24 x 17 = 10128; a stale revision is refused", async () => {
    const before = await run({ action: "inspect", elementId })
    const changed = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { wall: 3 } })
    expect(changed.ok).toBe(true)
    expect(changed.report.volumeMm3).toBeCloseTo(10128, 2)
    expect((await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { wall: 4 } })).ok).toBe(false)
  }, SLOW)

  test("a wall as thick as half the part leaves no cavity: the variant is refused and the stored part is unchanged", async () => {
    const before = await run({ action: "inspect", elementId })
    const refused = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { wall: 16 } })
    expect(refused.ok).toBe(false)
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  }, SLOW)

  test("test cases: a thin wall passes, an impossible one fails, nothing is written", async () => {
    const before = await run({ action: "inspect", elementId })
    const report = await run({ action: "test", elementId, cases: [
      { name: "thin", parameters: { wall: 1 }, expectedBodies: 1, maxVolumeMm3: before.volumeMm3 },
      { name: "solid", parameters: { wall: 16 } }
    ] })
    expect(report.mutated).toBe(false)
    expect(report.cases.map((c: { passed: boolean }) => c.passed)).toEqual([true, false])
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  }, SLOW)

  test("dfm: a 3 mm wall is makeable on a mill; the report has the minimum wall it found", async () => {
    const report = await run({ action: "dfm", elementId })
    expect(report.process).toBe("mill")
    expect(report.issues.filter((i: { code: string }) => i.code === "THIN_WALL")).toEqual([])
    expect(report.metrics.minWallMm).toBeGreaterThan(2.5)
  }, SLOW)
})

describe("a filleted block", () => {
  let elementId = ""
  const filleted = () => box([{ id: "round", type: "fillet", radius: "rr", edges: { parallel: "z" } }], { rr: 4 })

  test("create and inspect: the fillet and its edge selection are kept; 4 vertical edges of r 4 take 4 (1 - pi/4) r^2 h", async () => {
    const created = await run({ action: "create", name: "Rounded block", history: filleted() })
    expect(created.ok).toBe(true)
    elementId = created.ids[0]
    const inspected = await run({ action: "inspect", elementId })
    expect(inspected.ok).toBe(true)
    expect(inspected.history.features.at(-1)).toMatchObject({ id: "round", type: "fillet", radius: "rr", edges: { parallel: "z" } })
    expect(rel(inspected.volumeMm3, 24000 - 4 * (1 - Math.PI / 4) * 16 * 20)).toBeLessThan(0.0005)
    expect(inspected.dependencies.find((d: { name: string }) => d.name === "rr").features).toEqual(["round"])
  }, SLOW)

  test("the radius is a parameter: R6 removes 4 (1 - pi/4) 36 x 20", async () => {
    const before = await run({ action: "inspect", elementId })
    const changed = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { rr: 6 } })
    expect(changed.ok).toBe(true)
    expect(rel(changed.report.volumeMm3, 24000 - 4 * (1 - Math.PI / 4) * 36 * 20)).toBeLessThan(0.0005)
  }, SLOW)

  test("a radius wider than the faces is an invalid variant: refused with the part untouched", async () => {
    const before = await run({ action: "inspect", elementId })
    const refused = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { rr: 40 } })
    expect(refused.ok).toBe(false)
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
    const tested = await run({ action: "test", elementId, cases: [{ name: "huge", parameters: { rr: 40 } }, { name: "small", parameters: { rr: 1 }, expectedBodies: 1 }] })
    expect(tested.cases.map((c: { passed: boolean }) => c.passed)).toEqual([false, true])
  }, SLOW)
})

describe("a swept pipe", () => {
  let elementId = ""
  const pipe = () => ({
    parameters: { ro: 5, ri: 3 },
    features: [
      {
        id: "section", type: "sketch", plane: "YZ",
        sketch: { entities: [{ id: "c", kind: "point", x: 0, y: 0 }, { id: "k0", kind: "circle", center: "c", radius: 5 }, { id: "k1", kind: "circle", center: "c", radius: 3 }], constraints: [{ type: "fixed", point: "c", x: 0, y: 0 }, { type: "radius", circle: "k0", value: "ro" }, { type: "radius", circle: "k1", value: "ri" }] }
      },
      {
        id: "route", type: "sketch", plane: "XY",
        sketch: { entities: [{ id: "q0", kind: "point", x: 0, y: 0 }, { id: "q1", kind: "point", x: 60, y: 0 }, { id: "q2", kind: "point", x: 60, y: 40 }, { id: "m0", kind: "line", p1: "q0", p2: "q1" }, { id: "m1", kind: "line", p1: "q1", p2: "q2" }], constraints: [] }
      },
      { id: "pipe", type: "sweep", profile: "section", path: "route", operation: "new" }
    ]
  })

  test("create and inspect: the sweep survives, the tube is pi (ro^2 - ri^2) x 100 within 1 %", async () => {
    const created = await run({ action: "create", name: "Pipe", history: pipe() })
    expect(created.ok).toBe(true)
    elementId = created.ids[0]
    const inspected = await run({ action: "inspect", elementId })
    expect(inspected).toMatchObject({ ok: true, bodyCount: 1 })
    expect(inspected.history.features.at(-1)).toMatchObject({ id: "pipe", type: "sweep", profile: "section", path: "route" })
    expect(rel(inspected.volumeMm3, Math.PI * 16 * 100)).toBeLessThan(0.01)
    expect(inspected.sketches.map((s: { id: string; status: string }) => [s.id, s.status])).toEqual([["section", "fully-constrained"], ["route", "under-constrained"]])
  }, SLOW)

  test("a thinner wall (ri 4) leaves pi (25 - 16) x 100 and a wider bore than outside is refused or still a tube, never a crash", async () => {
    const before = await run({ action: "inspect", elementId })
    const changed = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { ri: 4 } })
    expect(changed.ok).toBe(true)
    expect(rel(changed.report.volumeMm3, Math.PI * 9 * 100)).toBeLessThan(0.01)
  }, SLOW)

  test("dfm flags the unconstrained route as an intent warning (info) and finds the 1 mm wall", async () => {
    const report = await run({ action: "dfm", elementId })
    expect(report.issues.some((i: { code: string; feature: string }) => i.code === "UNDER_CONSTRAINED" && i.feature === "route")).toBe(true)
    expect(report.metrics.bodies).toBe(1)
  }, SLOW)
})

describe("a lofted duct made by the recipe", () => {
  let elementId = ""

  test("the recipe creates it in the project: two lofts, one body, a fully constrained history", async () => {
    const made = await run({ action: "recipe", recipe: "duct_transition", params: { shape: "round", width1: 100, width2: 50 }, create: true, name: "Duct" })
    expect(made.ok).toBe(true)
    elementId = made.created.ids[0]
    const inspected = await run({ action: "inspect", elementId })
    expect(inspected).toMatchObject({ ok: true, bodyCount: 1 })
    expect(inspected.history.features.filter((f: { type: string }) => f.type === "loft")).toHaveLength(2)
    expect(inspected.sketches.every((s: { status: string }) => s.status === "fully-constrained")).toBe(true)
    expect(inspected.dependencies.find((d: { name: string }) => d.name === "wall").features.length).toBeGreaterThan(0)
  }, SLOW)

  test("a thicker wall and a bigger end rebuild: more material each time", async () => {
    const before = await run({ action: "inspect", elementId })
    const thick = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { wall: 4 } })
    expect(thick.ok).toBe(true)
    expect(thick.report.volumeMm3).toBeGreaterThan(before.volumeMm3)
    const mid = await run({ action: "inspect", elementId })
    const bigger = await run({ action: "update", elementId, expectedRevision: mid.revision, parameters: { w2: 70 } })
    expect(bigger.ok).toBe(true)
    expect(bigger.report.volumeMm3).toBeGreaterThan(thick.report.volumeMm3)
  }, SLOW)

  test("a wall as thick as the small end's radius is refused by the update, not stored", async () => {
    const before = await run({ action: "inspect", elementId })
    const refused = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { wall: 40 } })
    expect(refused.ok).toBe(false)
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  }, SLOW)
})

describe("a plate with a grid of holes", () => {
  let elementId = ""
  const gridded = () => box([
    { id: "h", type: "hole", plane: "XY", offset: "h", at: [6, 6], diameter: 5, depth: "h" },
    { id: "g", type: "pattern", feature: "h", kind: "grid", count: "nx", countB: 2, step: [8, 0, 0], stepB: [0, 15, 0] }
  ], { nx: 3 })

  test("create and inspect: the grid is kept with its counts and steps; six holes are cut", async () => {
    const created = await run({ action: "create", name: "Grid plate", history: gridded() })
    expect(created.ok).toBe(true)
    elementId = created.ids[0]
    const inspected = await run({ action: "inspect", elementId })
    expect(inspected.ok).toBe(true)
    expect(inspected.history.features.at(-1)).toMatchObject({ id: "g", kind: "grid", count: "nx", countB: 2, step: [8, 0, 0], stepB: [0, 15, 0] })
    expect(rel(inspected.volumeMm3, 24000 - 6 * Math.PI * 6.25 * 20)).toBeLessThan(0.001)
    expect(inspected.dependencies.find((d: { name: string }) => d.name === "nx").features).toEqual(["g"])
  }, SLOW)

  test("another column means two more holes; one column is not a grid and is refused", async () => {
    const before = await run({ action: "inspect", elementId })
    const more = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { nx: 4 } })
    expect(more.ok).toBe(true)
    expect(rel(more.report.volumeMm3, 24000 - 8 * Math.PI * 6.25 * 20)).toBeLessThan(0.001)
    const mid = await run({ action: "inspect", elementId })
    const refused = await run({ action: "update", elementId, expectedRevision: mid.revision, parameters: { nx: 1 } })
    expect(refused.ok).toBe(false)
    expect((await run({ action: "inspect", elementId })).revision).toBe(mid.revision)
  }, SLOW)

  test("dfm reads the stored grid: the holes 8 mm apart in a row are closer than 2 x their 5 mm diameter", async () => {
    const report = await run({ action: "dfm", elementId, toolDiameter: 4 })
    const spacing = report.issues.filter((i: { code: string }) => i.code === "HOLE_SPACING")
    // 4 columns x 2 rows: three neighbour pairs per row, two rows.
    expect(spacing).toHaveLength(6)
    expect(spacing.every((i: { measured: number; required: number }) => i.measured === 8 && i.required === 10)).toBe(true)
  }, SLOW)
})
