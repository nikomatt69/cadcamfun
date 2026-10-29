import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { findCutter, DEFAULT_CUTTERS, planOnly, runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(100_000)

// A small plate with M3 clearance holes, machined on a TNC machine; the bore of one hole is milled (spec 69 G4c.2, cycle 208).
const recipe = buildRecipe("mounting_plate", { width: 40, depth: 30, thickness: 8, fastener: "M3", counterbore: false })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: recipe.history }
const stock = { min: { x: -2, y: -2, z: 0 }, max: { x: 42, y: 32, z: 9 } }
const machine = findMachine("kern-micro-hd-hsk40")!
const base = (over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({ schemaVersion: 1, id: "b", name: "Bore", material: "6061", machine, part: { kind: "elements", elements: [plate] }, stock, ...over })
const ok = (r: ReturnType<typeof runJob>): CamArtifact => { if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; ")); return r.value }

const holeOf = () => {
  const plan = planOnly(base())
  if (plan.status !== "ok") throw new Error("no plan")
  const drill = plan.value.operations.find((o) => o.strategy === "drill")
  if (drill === undefined || drill.strategy !== "drill") throw new Error("the plate has no drilled hole")
  return { at: drill.points[0]!, diameter: findCutter(DEFAULT_CUTTERS, drill.tool)!.diameter }
}

describe("bore milling is cycle 208 on a Heidenhain machine when asked", () => {
  const hole = holeOf()
  const op = (): OperationSpec => ({ id: "bore", strategy: "bore", tool: "flat-3", center: hole.at, diameter: hole.diameter, top: 8, bottom: 0 })
  const moves = ok(runJob(base({ operations: [op()] })))
  const native = ok(runJob(base({ operations: [op()], post: { options: { nativeCycles: true } } })))

  test("the NC holds the control's cycle and its call, not the helix moves", () => {
    expect(native.nc).toMatch(/CYCL DEF 208 BORE MILLING ~/)
    expect(native.nc).toMatch(/Q335=\+[\d.]+ ;NOMINAL DIAMETER/)
    expect(native.nc).toMatch(/L X[+-][\d.]+ Y[+-][\d.]+ R0 FMAX M99/)
    expect(moves.nc).not.toMatch(/CYCL DEF 208/)
    expect(native.nc.split("\n").length).toBeLessThan(moves.nc.split("\n").length)
  })

  test("the program keeps the cycle\'s expansion between markers, and the other post writes those moves", () => {
    const tags = native.program.toolpaths[0]!.moves.map((m) => m._tag)
    expect(tags.filter((t) => t === "CycleBegin")).toHaveLength(1)
    expect(tags.filter((t) => t === "CycleEnd")).toHaveLength(1)
    expect(tags.indexOf("CycleBegin")).toBeLessThan(tags.indexOf("Arc"))
    expect(tags.indexOf("Arc")).toBeLessThan(tags.indexOf("CycleEnd"))
    // Without the option the markers are absent and a post that does not know the cycle writes the helix as G2 / G3 moves.
    expect(moves.program.toolpaths[0]!.moves.some((m) => m._tag === "CycleBegin")).toBe(false)
  })

  test("the replay of the cycle opens the same hole: same removed volume, same claims", () => {
    expect(native.stock.finalVolume).toBeCloseTo(moves.stock.finalVolume, -1)
    expect(Math.abs(native.stock.finalVolume - moves.stock.finalVolume)).toBeLessThan(0.02 * moves.stock.initialVolume - 0)
    for (const claim of native.claims) expect(claim.status, claim.id).toBe(moves.claims.find((c) => c.id === claim.id)!.status)
    expect(native.release).toBe(moves.release)
  })

  test("the replay reads the tool centre on a helix whose radius leaves the nominal diameter", () => {
    const radius = (native.tools[0]!.diameter) / 2
    const run = interpretGcode(native.nc, { toolRadius: () => radius })
    const arcs = run.segments.filter((s) => s.kind === "arc")
    expect(arcs.length).toBeGreaterThan(0)
    for (const a of arcs) if (a.kind === "arc") expect(a.radiusStart).toBeCloseTo(hole.diameter / 2 - radius, 6)
    // Work Z is measured from the stock top (9 mm): the bore bottom is at -9.
    expect(run.minZ).toBeCloseTo(-9, 6)
  })

  test("another post, or a bore wider than twice the cutter radius (it would leave a core), keeps the moves", () => {
    const fanuc = ok(runJob(base({ machine: findMachine("vmc-standard")!, operations: [op()], post: { options: { nativeCycles: true } } })))
    expect(fanuc.nc).not.toMatch(/CYCL DEF/)
    const wide = ok(runJob(base({ operations: [{ ...op(), diameter: 14, bottom: 3 } as OperationSpec], post: { options: { nativeCycles: true } } })))
    expect(wide.nc).not.toMatch(/CYCL DEF 208/)
  })
})
