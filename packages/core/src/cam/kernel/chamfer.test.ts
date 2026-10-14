import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { buildRecipe } from "../../cad/recipes.ts"
import { signedArea } from "../../cad/shapes.ts"
import { distanceToChain } from "../geometry.ts"
import { ChamferParams, chamferGeometry, generateChamfer } from "../operations/chamfer.ts"
import { CutterSchema, DEFAULT_CUTTERS, OperationSpecSchema, findCutter, jobOfSnapshot, legacyTool, planOnly, runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"

setDefaultTimeout(120_000)

const cone = { radius: 6, tipRadius: 0.25, halfAngle: Math.PI / 4 }
const rect = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }]
const params = (width: number, extra: Record<string, unknown> = {}) => Schema.decodeUnknownSync(ChamferParams)({ id: "c", name: "c", totalDepth: 1, stepdown: 1, width, tipOffset: 0.2, feed: 600, plungeFeed: 200, ...extra })
const chamferMill = legacyTool(findCutter(DEFAULT_CUTTERS, "chamfer-12")!)

describe("2D chamfer geometry", () => {
  test("a 90° cone with a Ø0.5 tip: 0.5 mm chamfer at 0.7 mm tip depth, centre 0.45 mm off the edge", () => {
    const g = chamferGeometry(cone, 0.5, 0.2)
    expect(g.depth).toBeCloseTo(0.5, 12)
    expect(g.tipDepth).toBeCloseTo(0.7, 12)
    expect(g.topRadius).toBeCloseTo(0.95, 12)
    expect(g.offset).toBeCloseTo(0.45, 12)
    expect(g.fits).toBe(true)
    // A 60° engraver cuts deeper for the same width.
    expect(chamferGeometry({ ...cone, halfAngle: Math.PI / 6 }, 0.5, 0.2).depth).toBeCloseTo(0.5 / Math.tan(Math.PI / 6), 12)
  })

  test("the outside of a rectangle: every cut at the tip depth, the centre on the offset edge, climb (clockwise)", () => {
    const r = generateChamfer(params(0.5), [{ points: rect, side: "outside" }], cone, chamferMill, 0)
    expect(r.skipped).toEqual([])
    const cuts = r.toolpath.moves.filter((m) => m._tag === "Linear").map((m) => (m as { to: { x: number; y: number; z: number } }).to)
    expect(cuts.length).toBeGreaterThan(5)
    for (const p of cuts) expect(p.z).toBeCloseTo(-0.7, 9)
    // The loop itself (between the lead in and the lead out) runs 0.45 mm outside the edge; corners are rounded by the offset.
    const loop = cuts.slice(1, -1)
    for (const p of loop) expect(distanceToChain(p, rect, true)).toBeCloseTo(0.45, 3)
    expect(signedArea(loop)).toBeLessThan(0)
    // The plunge happens outside the chamfer reach.
    expect(distanceToChain(cuts[0]!, rect, true)).toBeGreaterThan(0.95)
    // No rapid below the retract plane in XY.
    const rapids = r.toolpath.moves.filter((m) => m._tag === "Rapid").map((m) => (m as { to: { z: number } }).to.z)
    expect(Math.min(...rapids)).toBeGreaterThanOrEqual(0)
  })

  test("inside a hole the centre runs inside, counter-clockwise", () => {
    const hole = Array.from({ length: 64 }, (_, k) => ({ x: 5 * Math.cos((2 * Math.PI * k) / 64), y: 5 * Math.sin((2 * Math.PI * k) / 64) }))
    const r = generateChamfer(params(0.5), [{ points: hole, side: "inside" }], cone, chamferMill, 0)
    const loop = r.toolpath.moves.filter((m) => m._tag === "Linear").map((m) => (m as { to: { x: number; y: number } }).to).slice(1, -1)
    for (const p of loop) expect(Math.hypot(p.x, p.y)).toBeCloseTo(5 - 0.45, 1)
    expect(signedArea(loop)).toBeGreaterThan(0)
  })

  test("a chamfer wider than the cone reaches is refused, never cut shallower", () => {
    const r = generateChamfer(params(8), [{ points: rect, side: "outside" }], cone, chamferMill, 0)
    expect(r.geometry.fits).toBe(false)
    expect(r.skipped[0]).toMatch(/needs Ø/)
    expect(r.toolpath.moves.some((m) => m._tag === "Linear")).toBe(false)
  })
})

describe("deburring a part through the kernel", () => {
  const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
  const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: recipe.history }
  const job: ManufacturingJob = { schemaVersion: 1, id: "deburr", name: "Deburr", material: "6061", part: { kind: "elements", elements: [plate] }, stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 123, y: 83, z: 13 } }, quality: { deburr: 0.5 } }

  test("the plan breaks the outline and the holes with the smallest cone that reaches 0.5 mm", () => {
    const plan = planOnly(job)
    if (plan.status !== "ok") throw new Error(plan.issues.map((i) => i.message).join("; "))
    const chamfers = plan.value.operations.filter((o) => o.strategy === "chamfer")
    expect(chamfers.length).toBeGreaterThan(0)
    for (const c of chamfers) {
      if (c.strategy !== "chamfer") continue
      expect(c.width).toBe(0.5)
      expect(["spot-6", "chamfer-12"]).toContain(c.tool)
      expect(c.loops.some((l) => l.side === "outside") || c.loops.some((l) => l.side === "inside")).toBe(true)
    }
    // The chamfers come after the wall finishing.
    const ids = plan.value.operations.map((o) => o.strategy)
    expect(ids.lastIndexOf("profile")).toBeLessThan(ids.indexOf("chamfer"))
    // Without deburr there is no chamfer operation.
    const plain = planOnly({ ...job, quality: {} })
    expect(plain.status === "ok" && plain.value.operations.some((o) => o.strategy === "chamfer")).toBe(false)
  })

  test("the deburred program replays without gouge: the chamfer band is declared removal and material is removed there", () => {
    const run = runJob(job)
    if (run.status !== "ok") throw new Error(run.issues.map((i) => i.message).join("; "))
    const a: CamArtifact = run.value
    const chamfers = a.operations.filter((o) => o.strategy === "chamfer")
    expect(chamfers.length).toBeGreaterThan(0)
    for (const c of chamfers) {
      expect(c.status).toBe("ok")
      expect(c.cutting?.cut).toBe("chamfer")
      expect(c.removedVolume).toBeGreaterThan(0)
    }
    expect(a.issues.filter((i) => i.tag === "Gouge")).toEqual([])
    expect(a.claims.find((c) => c.id === "no-gouge")?.status).toBe("passed")
    expect(a.claims.find((c) => c.id === "nc-replay")?.status).toBe("passed")
  })
})

describe("caller-supplied jobs", () => {
  test("the schemas accept the planner's operations and the default crib unchanged", () => {
    const recipe = buildRecipe("mounting_plate", { width: 60, depth: 40, thickness: 8, fastener: "M4", counterbore: false })
    const plan = planOnly({ schemaVersion: 1, id: "s", name: "s", material: "6061", part: { kind: "elements", elements: [{ id: "p", type: "parametric", x: 0, y: 0, z: 0, history: recipe.history }] }, quality: { deburr: 0.3 } })
    if (plan.status !== "ok") throw new Error("plan failed")
    const decoded = Schema.decodeUnknownSync(Schema.Array(OperationSpecSchema))(JSON.parse(JSON.stringify(plan.value.operations)))
    expect(decoded).toEqual(JSON.parse(JSON.stringify(plan.value.operations)))
    expect(Schema.decodeUnknownSync(Schema.Array(CutterSchema))(DEFAULT_CUTTERS)).toEqual([...DEFAULT_CUTTERS])
    expect(() => Schema.decodeUnknownSync(OperationSpecSchema)({ id: "x", tool: "flat-6", strategy: "warp", top: 0 })).toThrow()
  })

  test("a snapshot becomes the job the sidecar runs: stock standing on the part bottom, presets resolved", () => {
    const recipe = buildRecipe("mounting_plate", { width: 60, depth: 40, thickness: 8, fastener: "M4", counterbore: false })
    const elements = [{ id: "p", type: "parametric", x: 0, y: 0, z: 5, history: recipe.history }]
    const r = jobOfSnapshot({ schemaVersion: 1, id: "j", name: "j", material: "6061", machine: "haas-vf2", elements, stock: { x: 30, y: 20, width: 66, height: 46, depth: 10 }, deburr: 0.4, tools: DEFAULT_CUTTERS.slice(0, 3) })
    if (r.status !== "ok") throw new Error("snapshot failed")
    expect(r.value.stock?.min.z).toBeCloseTo(5, 6)
    expect(r.value.stock?.max.z).toBeCloseTo(15, 6)
    expect(r.value.machine?.id).toBe("haas-vf2")
    expect(r.value.quality?.deburr).toBe(0.4)
    expect(r.value.tools).toHaveLength(3)
    const bad = jobOfSnapshot({ schemaVersion: 1, id: "j", name: "j", material: "6061", machine: "nope", elements })
    expect(bad.status).toBe("failed")
  })
})
