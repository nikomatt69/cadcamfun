import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { massProperties } from "../cad/brep/index.ts"
import { historyToStep, rebuildExact } from "../cad/history-brep.ts"
import type { Feature, History } from "../cad/history.ts"
import { buildRecipe } from "../cad/recipes.ts"
import { elementBrep, stepToElements } from "../cad/scene-step.ts"
import { signedArea } from "../cad/shapes.ts"
import { brepFeatures, exactFeatures } from "./brep-part.ts"
import { historyFeatures } from "./generator/history-features.ts"
import { DEFAULT_CUTTERS, planOnly, runJob, type ManufacturingJob } from "./kernel/index.ts"

setDefaultTimeout(100_000)

const rect = (id: string, x: number, y: number, width: number, height: number, offset = 0): Feature => ({
  id, type: "sketch", plane: "XY", ...(offset !== 0 ? { offset } : {}), sketch: { entities: [], constraints: [], shapes: [{ id: `${id}r`, kind: "rectangle", at: [x, y], width, height }] }
})
const history = (features: Feature[]): History => ({ parameters: {}, features })
const brepOf = (h: History) => {
  const placed = elementBrep({ id: "p", type: "parametric", x: 0, y: 0, z: 0, history: h })
  if (placed.brep === undefined) throw new Error(placed.reason)
  return placed.brep
}
const area = (loop: ReadonlyArray<{ x: number; y: number }>) => Math.abs(signedArea(loop))

/** Plate 100x60x10 with a boss 40x30 on top, a pocket 30x40 down to z 6, and a Ø5 hole through the pocket floor. */
const stepped = history([
  rect("base", 0, 0, 100, 60), { id: "plate", type: "extrude", sketch: "base", depth: 10, operation: "new" },
  rect("bossSketch", 10, 10, 40, 30, 10), { id: "boss", type: "extrude", sketch: "bossSketch", depth: 8, operation: "union" },
  rect("pocketSketch", 60, 10, 30, 40, 10), { id: "pocket", type: "extrude", sketch: "pocketSketch", depth: 4, direction: "down", operation: "subtract" },
  { id: "drill", type: "hole", plane: "XY", offset: 10, at: [75, 30], diameter: 5, depth: 10 }
])

describe("features of an exact solid", () => {
  test("a multi-level part gives its outlines, its pocket and its hole with the heights of the model", () => {
    const f = brepFeatures(brepOf(stepped), "stepped")
    expect(f.reason).toBeUndefined()
    const { outlines, pockets, holes } = f.features!
    expect(outlines.map((o) => [o.bottom, o.top])).toEqual([[10, 18], [0, 10]])
    expect(area(outlines[0]!.outer)).toBeCloseTo(40 * 30, 6)
    expect(area(outlines[1]!.outer)).toBeCloseTo(100 * 60, 6)
    expect(pockets).toHaveLength(1)
    expect([pockets[0]!.floor, pockets[0]!.top]).toEqual([6, 10])
    expect(area(pockets[0]!.loop)).toBeCloseTo(30 * 40, 6)
    expect(holes).toHaveLength(1)
    expect(holes[0]!.entry.x).toBeCloseTo(75, 6)
    expect(holes[0]!.entry.y).toBeCloseTo(30, 6)
    expect(holes[0]!.entry.z).toBeCloseTo(6, 6)
    expect(holes[0]!.depth).toBeCloseTo(6, 6)
    expect(holes[0]!.diameter).toBeCloseTo(5, 6)
    expect(holes[0]!.direction.z).toBeCloseTo(-1, 9)
  })

  test("the sections explain the volume: outline layers minus pocket minus hole equal the exact mass properties", () => {
    const b = brepOf(stepped)
    const f = brepFeatures(b, "stepped").features!
    const layers = f.outlines.reduce((v, o) => v + area(o.outer) * (o.top - o.bottom), 0)
    const pocket = f.pockets.reduce((v, p) => v + area(p.loop) * (p.top - p.floor), 0)
    const hole = f.holes.reduce((v, h) => v + Math.PI * (h.diameter / 2) ** 2 * h.depth, 0)
    expect(layers - pocket - hole).toBeCloseTo(massProperties(b).volume, 0)
  })

  test("a parametric plate gives the holes and the counterbores its history derives", () => {
    const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
    const element = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: recipe.history }
    const fromHistory = historyFeatures(element)!
    const exact = exactFeatures(element)!.features!
    expect(exact.holes).toHaveLength(fromHistory.holes.length)
    for (const h of fromHistory.holes) {
      const e = exact.holes.find((x) => Math.hypot(x.entry.x - h.entry.x, x.entry.y - h.entry.y) < 1e-3)!
      expect(e).toBeDefined()
      expect(e.kind).toBe(h.kind)
      expect(e.diameter).toBeCloseTo(h.diameter, 6)
      expect(e.depth).toBeCloseTo(h.depth, 6)
      expect(e.headDiameter).toBeCloseTo(h.headDiameter!, 6)
      expect(e.headDepth).toBeCloseTo(h.headDepth!, 6)
    }
    expect(exact.outlines).toHaveLength(1)
    expect(area(exact.outlines[0]!.outer)).toBeCloseTo(120 * 80, 6)
    expect(exact.pockets).toHaveLength(0)
  })

  test("a part turned by the editor keeps its features, where the history derivation gives up", () => {
    const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: false })
    const element = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, rotation: { x: 0, y: 0, z: 90 }, history: recipe.history }
    expect(historyFeatures(element)).toBeUndefined()
    const f = exactFeatures(element)!.features!
    expect(f.holes).toHaveLength(4)
    // Turned 90 degrees about the centre of its box: 80 wide, 120 deep.
    const xs = f.outlines[0]!.outer.map((p) => p.x), ys = f.outlines[0]!.outer.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(80, 6)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(120, 6)
    for (const h of f.holes) {
      expect(h.entry.x).toBeGreaterThan(Math.min(...xs))
      expect(h.entry.x).toBeLessThan(Math.max(...xs))
      expect(h.direction.z).toBeCloseTo(-1, 9)
    }
  })

  test("a STEP solid (brep element) is read like the part it was exported from", () => {
    const b = brepOf(stepped)
    const f = exactFeatures({ id: "stp", type: "brep", name: "Imported", brep: b, x: 0, y: 0, z: 0 })!.features!
    expect(f.holes).toHaveLength(1)
    expect(f.pockets).toHaveLength(1)
    expect(f.outlines).toHaveLength(2)
  })
})

describe("what is refused, and why", () => {
  test("a chamfered edge needs the surface strategies", () => {
    const h = history([rect("s", 0, 0, 40, 30), { id: "x", type: "extrude", sketch: "s", depth: 10, operation: "new", edge: { style: "chamfer", size: 1.5 } }])
    const f = brepFeatures(brepOf(h), "chamfered")
    expect(f.features).toBeUndefined()
    expect(f.reason).toMatch(/chamfered: .*(sloped|cone|surface)/)
  })

  test("a sphere has no 2.5D features", () => {
    const placed = elementBrep({ id: "s", type: "sphere", x: 0, y: 0, z: 0, radius: 10 })
    expect(placed.brep).toBeDefined()
    expect(brepFeatures(placed.brep!, "ball").reason).toMatch(/sphere/)
  })

  test("material that overhangs the level below is refused", () => {
    const h = history([
      rect("a", 0, 0, 40, 40), { id: "low", type: "extrude", sketch: "a", depth: 10, operation: "new" },
      rect("b", -10, 10, 60, 20, 10), { id: "high", type: "extrude", sketch: "b", depth: 10, operation: "union" }
    ])
    expect(brepFeatures(brepOf(h), "overhang").reason).toMatch(/overhang/)
  })

  test("elements without an exact model are not this module's business", () => {
    expect(exactFeatures({ id: "c", type: "circle", x: 0, y: 0, radius: 5 })).toBeUndefined()
    expect(exactFeatures({ id: "b", type: "brep", x: 0, y: 0, z: 0 })!.reason).toMatch(/no exact model/)
  })
})

describe("the planner uses them", () => {
  const stock = { min: { x: -3, y: -3, z: 0 }, max: { x: 103, y: 63, z: 19 } }
  const job = (element: Record<string, unknown>): ManufacturingJob => ({ schemaVersion: 1, id: "j", name: "J", material: "6061", part: { kind: "elements", elements: [element] }, stock })

  test("a STEP solid is drilled, pocketed and profiled; it was a pure surface job before", () => {
    const b = brepOf(stepped)
    const r = planOnly(job({ id: "stp", type: "brep", name: "Imported", brep: b, x: 0, y: 0, z: 0 }))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    const strategies = r.value.operations.map((o) => o.strategy)
    expect(strategies).toContain("drill")
    expect(strategies).toContain("profile")
    expect(strategies.some((s) => s === "pocket" || s === "adaptive")).toBe(true)
    expect(strategies).not.toContain("surface")
    const drill = r.value.operations.find((o) => o.strategy === "drill")!
    if (drill.strategy !== "drill") throw new Error("not a drill")
    expect(drill.points[0]!.x).toBeCloseTo(75, 6)
    expect(drill.points[0]!.y).toBeCloseTo(30, 6)
  })

  test("a STEP file written by the kernel and read back is planned like the part it came from", () => {
    const out = historyToStep(stepped, "stepped")
    expect(out.step).toMatch(/^ISO-10303-21;/)
    const imported = stepToElements(out.step!)
    expect(imported.elements).toHaveLength(1)
    expect(imported.report[0]!.valid).toBe(true)
    const element = { id: "stp", ...imported.elements[0]! }
    const f = exactFeatures(element)!.features!
    expect(f.holes).toHaveLength(1)
    expect(f.pockets).toHaveLength(1)
    expect(f.outlines.map((o) => [o.bottom, o.top])).toEqual([[10, 18], [0, 10]])
    expect(f.holes[0]!.diameter).toBeCloseTo(5, 6)
    const r = planOnly(job(element))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    expect(r.value.operations.map((o) => o.strategy)).toContain("drill")
    expect(r.value.operations.map((o) => o.strategy)).not.toContain("surface")
  })

  test("a part the exact kernel cannot read is still planned, with the reason in the notes", () => {
    const h = history([rect("s", 0, 0, 40, 30), { id: "x", type: "extrude", sketch: "s", depth: 10, operation: "new", edge: { style: "chamfer", size: 1.5 } }])
    const element = { id: "stp", type: "brep", name: "Chamfered", brep: brepOf(h), x: 0, y: 0, z: 0 }
    const r = planOnly({ ...job(element), stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 43, y: 33, z: 11 } } })
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    expect(r.value.operations.some((o) => o.strategy === "surface")).toBe(true)
    expect(r.value.notes.some((n) => /Chamfered: .*surface/.test(n))).toBe(true)
  })

  test("the program for a STEP plate runs through the kernel and passes its own replay", () => {
    const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
    const placed = rebuildExact(recipe.history).bodies[0]!.brep!
    const result = runJob({
      ...job({ id: "stp", type: "brep", name: "Plate", brep: placed, x: 0, y: 0, z: 0 }),
      stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 123, y: 83, z: 13 } }
    })
    if (result.status !== "ok") throw new Error(result.issues.map((i) => i.message).join("; "))
    const a = result.value
    expect(a.release).not.toBe("blocked")
    expect(a.claims.find((c) => c.id === "no-gouge")!.status).toBe("passed")
    expect(a.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
    expect(a.operations.some((o) => o.strategy === "drill" && o.status === "ok")).toBe(true)
    expect(a.nc).toMatch(/G8[13]/)
  })
})

describe("islands standing in a pocket", () => {
  /** Plate 100x60x10, a 60x40 pocket 6 deep (floor at z 4), and a 20x20 island on its floor `h` high (the rim is at z 10). */
  const islandPart = (h: number, extra: Feature[] = []) => history([
    rect("base", 0, 0, 100, 60), { id: "plate", type: "extrude", sketch: "base", depth: 10, operation: "new" },
    rect("pocketSketch", 20, 10, 60, 40, 10), { id: "pocket", type: "extrude", sketch: "pocketSketch", depth: 6, direction: "down", operation: "subtract" },
    rect("islandSketch", 40, 20, 20, 20, 4), { id: "island", type: "extrude", sketch: "islandSketch", depth: h, operation: "union" },
    ...extra
  ])
  const volume = (f: NonNullable<ReturnType<typeof brepFeatures>["features"]>) =>
    f.outlines.reduce((v, o) => v + area(o.outer) * (o.top - o.bottom), 0) -
    f.pockets.reduce((v, p) => v + (area(p.loop) - (p.islands ?? []).reduce((a, i) => a + area(i), 0)) * (p.top - p.floor), 0)

  test("an island as tall as the rim is an island of the pocket, and the sections explain the exact volume", () => {
    const b = brepOf(islandPart(6))
    const f = brepFeatures(b, "island")
    expect(f.reason).toBeUndefined()
    const { pockets, outlines } = f.features!
    expect(outlines).toHaveLength(1)
    expect(pockets).toHaveLength(1)
    expect([pockets[0]!.floor, pockets[0]!.top]).toEqual([4, 10])
    expect(pockets[0]!.islands).toHaveLength(1)
    expect(area(pockets[0]!.islands![0]!)).toBeCloseTo(20 * 20, 6)
    expect(area(pockets[0]!.loop)).toBeCloseTo(60 * 40, 6)
    // Closed form: plate - pocket + island.
    expect(massProperties(b).volume).toBeCloseTo(100 * 60 * 10 - 60 * 40 * 6 + 20 * 20 * 6, 6)
    expect(volume(f.features!)).toBeCloseTo(massProperties(b).volume, 0)
  })

  test("an island lower than the rim splits the pocket in two: the channel around it and the open pocket above", () => {
    const b = brepOf(islandPart(3))
    const f = brepFeatures(b, "low-island").features!
    expect(f.pockets.map((p) => [p.floor, p.top, (p.islands ?? []).length])).toEqual([[7, 10, 0], [4, 7, 1]])
    expect(massProperties(b).volume).toBeCloseTo(100 * 60 * 10 - 60 * 40 * 6 + 20 * 20 * 3, 6)
    expect(volume(f)).toBeCloseTo(massProperties(b).volume, 0)
  })

  test("the history walk declines a boss standing in a pocket, the exact model gives its island; a boss on top of the plate is still derived from the history", () => {
    const element = (h: History) => ({ id: "p", type: "parametric", name: "P", x: 0, y: 0, z: 0, history: h })
    expect(historyFeatures(element(islandPart(6)))).toBeUndefined()
    expect(exactFeatures(element(islandPart(6)))!.features!.pockets[0]!.islands).toHaveLength(1)
    // `stepped` adds its boss on top of the plate before cutting a pocket elsewhere: nothing stands inside a pocket.
    expect(historyFeatures(element(stepped))).toBeDefined()
  })

  test("a part without islands is reported exactly as before: no islands key at all", () => {
    const f = brepFeatures(brepOf(stepped), "stepped").features!
    expect(f.pockets.every((p) => !("islands" in p))).toBe(true)
  })

  test("a pocket cut into the island is refused with its reason", () => {
    const h = islandPart(6, [rect("inner", 45, 25, 10, 10, 10), { id: "dimple", type: "extrude", sketch: "inner", depth: 2, direction: "down", operation: "subtract" }])
    expect(brepFeatures(brepOf(h), "nested").reason).toMatch(/nested: has a pocket cut into an island/)
  })

  test("the planner roughs around the island and finishes its walls; the program passes gouge check and replay", () => {
    const element = { id: "stp", type: "brep", name: "Island", brep: brepOf(islandPart(6)), x: 0, y: 0, z: 0 }
    const j: ManufacturingJob = { schemaVersion: 1, id: "j", name: "J", material: "6061", part: { kind: "elements", elements: [element] }, stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 103, y: 63, z: 11 } } }
    const plan = planOnly(j)
    if (plan.status !== "ok") throw new Error(plan.issues.map((i) => i.message).join("; "))
    const rough = plan.value.operations.find((o) => o.id === "rough-pocket-1")!
    expect(rough).toBeDefined()
    if (rough.strategy !== "adaptive" && rough.strategy !== "pocket") throw new Error(`unexpected ${rough.strategy}`)
    expect(rough.region.islands).toHaveLength(1)
    const wall = plan.value.operations.find((o) => o.id === "finish-pocket-1-island1")!
    expect(wall).toMatchObject({ strategy: "profile", side: "outside", top: 10, bottom: 4 })
    const result = runJob(j)
    if (result.status !== "ok") throw new Error(result.issues.map((i) => i.message).join("; "))
    expect(result.value.release).not.toBe("blocked")
    expect(result.value.claims.find((c) => c.id === "no-gouge")!.status).toBe("passed")
    expect(result.value.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
    // What is left is the corner remnants of a round cutter in the four inside corners of the pocket, (1 - pi/4) r^2 x depth each:
    // the island itself is not left standing in a cut region nor cut away.
    const radius = DEFAULT_CUTTERS.find((c) => c.id === rough.tool)!.diameter / 2
    const left = Number(/([0-9.]+) mm³ left/.exec(result.value.claims.find((c) => c.id === "material-removed")!.detail ?? "")?.[1] ?? 0)
    expect(left).toBeLessThanOrEqual(4 * (1 - Math.PI / 4) * radius * radius * 6 + 1)
  })

  test("an island close to the wall: the cutter is chosen for the narrow gap and no lead-in swings into the island", () => {
    // 60x40 pocket, 20x20 island 4 mm from the left wall: the gap is 4 mm, so the cutter is at most 4 - 2 x allowance.
    const h = history([
      rect("base", 0, 0, 100, 60), { id: "plate", type: "extrude", sketch: "base", depth: 10, operation: "new" },
      rect("pocketSketch", 20, 10, 60, 40, 10), { id: "pocket", type: "extrude", sketch: "pocketSketch", depth: 6, direction: "down", operation: "subtract" },
      rect("islandSketch", 24, 20, 20, 20, 4), { id: "island", type: "extrude", sketch: "islandSketch", depth: 6, operation: "union" }
    ])
    const element = { id: "stp", type: "brep", name: "Tight", brep: brepOf(h), x: 0, y: 0, z: 0 }
    const j: ManufacturingJob = { schemaVersion: 1, id: "j", name: "J", material: "6061", part: { kind: "elements", elements: [element] }, stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 103, y: 63, z: 11 } } }
    const plan = planOnly(j)
    if (plan.status !== "ok") throw new Error(plan.issues.map((i) => i.message).join("; "))
    const rough = plan.value.operations.find((o) => o.id === "rough-pocket-1")!
    const tool = DEFAULT_CUTTERS.find((c) => c.id === rough.tool)!
    expect(tool.diameter).toBeLessThan(4)
    const wall = plan.value.operations.find((o) => o.id === "finish-pocket-1")!
    expect(wall.strategy === "profile" && wall.within?.islands).toHaveLength(1)
    const result = runJob(j)
    if (result.status !== "ok") throw new Error(result.issues.map((i) => i.message).join("; "))
    expect(result.value.claims.find((c) => c.id === "no-gouge")!.status).toBe("passed")
    expect(result.value.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
  })
})
