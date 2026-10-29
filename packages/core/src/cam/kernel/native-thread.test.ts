import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import { threadMillMoves } from "../operations/thread-mill.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { DEFAULT_CUTTERS, findCutter, planOnly, runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(100_000)

// An M3 thread in the clearance hole of a small plate, on a TNC machine (spec 69 G4c.2, cycles 262 and 267).
const recipe = buildRecipe("mounting_plate", { width: 40, depth: 30, thickness: 8, fastener: "M3", counterbore: false })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: recipe.history }
const stock = { min: { x: -2, y: -2, z: 0 }, max: { x: 42, y: 32, z: 9 } }
const machine = findMachine("kern-micro-hd-hsk40")!
const base = (over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({ schemaVersion: 1, id: "t", name: "Thread", material: "6061", machine, part: { kind: "elements", elements: [plate] }, stock, ...over })
const ok = (r: ReturnType<typeof runJob>): CamArtifact => { if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; ")); return r.value }
const hole = (() => {
  const plan = planOnly(base())
  if (plan.status !== "ok") throw new Error("no plan")
  const drill = plan.value.operations.find((o) => o.strategy === "drill")
  if (drill === undefined || drill.strategy !== "drill") throw new Error("no drilled hole")
  return drill.points[0]!
})()
const op = (extra: Record<string, unknown> = {}): OperationSpec => ({ id: "thread", strategy: "thread", tool: "threadmill-p0.5", center: hole, diameter: 3, pitch: 0.5, internal: true, top: 8, length: 6, ...extra }) as OperationSpec
const native = (extra: Record<string, unknown> = {}, over: Partial<ManufacturingJob> = {}) => ok(runJob(base({ operations: [op(extra)], post: { options: { nativeCycles: true } }, ...over })))

describe("thread milling is cycle 262 / 267 on a Heidenhain machine when asked", () => {
  const moves = ok(runJob(base({ operations: [op()] })))
  const cycle = native()

  test("the NC holds the control's cycle: pitch, depth and nominal diameter, called with M99", () => {
    expect(cycle.nc).toMatch(/CYCL DEF 262 THREAD MILLING ~/)
    expect(cycle.nc).toMatch(/Q335=\+3 ;NOMINAL DIAMETER ~/)
    expect(cycle.nc).toMatch(/Q239=\+0\.5 ;PITCH ~/)
    expect(cycle.nc).toMatch(/Q201=-6 ;DEPTH OF THREAD ~/)
    expect(cycle.nc).toMatch(/L X[+-][\d.]+ Y[+-][\d.]+ R0 FMAX M99/)
    expect(moves.nc).not.toMatch(/CYCL DEF 262/)
  })

  test("the replay agrees with the program: the NC the control would run has the extents of the planned motion", () => {
    // (The kernel\'s own multi-pass thread moves fail this claim on this part: its replayed arcs reach 0.29 mm beyond the planned motion.)
    const claim = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)!.status
    expect(claim(cycle, "nc-replay")).toBe("passed")
    expect(claim(cycle, "no-gouge")).toBe("passed")
    expect(claim(cycle, "no-rapid-in-stock")).toBe("passed")
    expect(moves.nc).not.toMatch(/CYCL DEF 262/)
  })

  test("the tool centre turns on a helix of pitch 0.5, rising counter-clockwise for a right-hand thread", () => {
    const radius = cycle.tools[0]!.diameter / 2
    const run = interpretGcode(cycle.nc, { toolRadius: () => radius })
    const arcs = run.segments.flatMap((s) => (s.kind === "arc" ? [s] : []))
    expect(arcs.length).toBe(12)
    for (const a of arcs) {
      expect(a.radiusStart).toBeCloseTo(3 / 2 - radius, 6)
      expect(a.clockwise).toBe(false)
      expect(a.to.z - a.from.z).toBeCloseTo(0.5, 6)
    }
    // Work Z is measured from the stock top (9 mm): the thread runs from -7 up to -1.
    expect(arcs[0]!.from.z).toBeCloseTo(-7, 6)
    expect(arcs[arcs.length - 1]!.to.z).toBeCloseTo(-1, 6)
  })

  test("a left-hand thread, or up-cut milling, turns the other way", () => {
    const left = native({ rightHand: false })
    expect(left.nc).toMatch(/Q239=-0\.5 ;PITCH/)
    const run = interpretGcode(left.nc, { toolRadius: () => left.tools[0]!.diameter / 2 })
    const arcs = run.segments.flatMap((s) => (s.kind === "arc" ? [s] : []))
    // Left-hand with counter-clockwise (climb) travel descends from the top.
    expect(arcs[0]!.clockwise).toBe(false)
    expect(arcs[0]!.to.z - arcs[0]!.from.z).toBeCloseTo(-0.5, 6)
    expect(left.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
  })

  test("another post, or a cutter that does not fit the minor diameter, keeps the moves", () => {
    expect(native({}, { machine: findMachine("vmc-standard")! }).nc).not.toMatch(/CYCL DEF/)
    const big = findCutter(DEFAULT_CUTTERS, "threadmill-p1.5")!
    expect(big.diameter).toBeGreaterThan(2.46)
    expect(ok(runJob(base({ operations: [op({ tool: "threadmill-p1.5" })], post: { options: { nativeCycles: true } } }))).nc).not.toMatch(/CYCL DEF 262/)
  })
})

describe("the path of the cycle, on its own", () => {
  const t = { center: { x: 0, y: 0 }, surface: 0, clearance: 2, secondClearance: 10, length: 5.25, diameter: 10, pitch: 1.5, toolRadius: 3, internal: true, rightHand: true, climb: true, feed: 200 }
  test("a thread that is not a whole number of pitches ends with a partial turn at the exact depth", () => {
    const arcs = threadMillMoves(t).flatMap((m) => (m._tag === "Arc" ? [m] : []))
    expect(arcs).toHaveLength(4)
    expect(arcs[3]!.to.z).toBeCloseTo(0, 9)
    const angle = Math.atan2(arcs[3]!.to.y, arcs[3]!.to.x)
    expect(angle).toBeCloseTo(Math.PI, 9) // 5.25 / 1.5 = 3.5 turns: the last arc is half a turn
  })
  test("an external thread runs at (D + d) / 2 and a cutter that cannot enter is refused", () => {
    const m = threadMillMoves({ ...t, internal: false, climb: true })
    const arcs = m.flatMap((x) => (x._tag === "Arc" ? [x] : []))
    expect(arcs[0]!.clockwise).toBe(true)
    expect(Math.hypot(arcs[0]!.to.x, arcs[0]!.to.y)).toBeCloseTo(10 / 2 + 3, 9)
    expect(() => threadMillMoves({ ...t, toolRadius: 6 })).toThrow(/does not fit/)
  })
})
