import { describe, expect, test } from "bun:test"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { offsetContour, revolvedVolume, turningEnvelope } from "./geometry.ts"
import { checkContour, parseInsert, toolLimits, type TurningTool } from "./insert.ts"
import { planLathe, threadDepths, threadHeight, type LatheJob } from "./plan.ts"
import { emitLathe, type LatheDialect } from "./post.ts"
import { verifyLathe } from "./verify.ts"

const rough: TurningTool = { id: "T1", number: 1, kind: "turning", insert: "CNMG120408", approach: 95 }
const finish: TurningTool = { id: "T2", number: 2, kind: "turning", insert: "DNMG150604", approach: 93 }
const groove: TurningTool = { id: "T3", number: 3, kind: "grooving", bladeWidth: 3, bladeLength: 12 }
const threadTool: TurningTool = { id: "T4", number: 4, kind: "threading", insert: "TNMG160408", noseRadius: 0.1 }
const parting: TurningTool = { id: "T5", number: 5, kind: "parting", bladeWidth: 3, bladeLength: 15 }
const boring: TurningTool = { id: "B1", number: 6, kind: "boring", insert: "DCMT11T304", approach: 93 }

const shaft: LatheJob = {
  stock: { diameter: 30, length: 60 },
  contour: [
    { diameter: 18, z: 0 }, { diameter: 20, z: -1 }, { diameter: 20, z: -18 }, { diameter: 26, z: -24 }, { diameter: 26, z: -28 },
    { diameter: 22, z: -28 }, { diameter: 22, z: -32 }, { diameter: 26, z: -32 }, { diameter: 26, z: -45 }
  ],
  tools: [rough, finish, groove, threadTool, parting],
  operations: [
    { kind: "face", tool: "T1" },
    { kind: "rough", tool: "T1", depth: 2, allowance: { x: 0.4, z: 0.2 } },
    { kind: "finish", tool: "T2" },
    { kind: "groove", tool: "T3", z: -28, width: 4, diameter: 22 },
    { kind: "thread", tool: "T4", diameter: 20, pitch: 1.5, zStart: 3, zEnd: -16 },
    { kind: "part", tool: "T5", z: -45 }
  ],
  machine: { maxRpm: 4000 }
}

describe("ISO 1832 inserts and holder limits (spec 52 T1)", () => {
  test("CNMG120408 reads as 80 degree rhombic, 12.7 inscribed circle, 4.76 thick, R0.8", () => {
    const d = parseInsert("CNMG120408")
    expect([d.angle, d.inscribedCircle, d.thickness, d.noseRadius, d.clearance]).toEqual([80, 12.7, 4.76, 0.8, 0])
    expect(parseInsert("DCMT11T304").angle).toBe(55)
    expect(parseInsert("VNMG160408").angle).toBe(35)
    expect(parseInsert("TNMG160408").angle).toBe(60)
    expect(() => parseInsert("XXXX")).toThrow(/ISO 1832/)
  })
  test("limit angles follow the geometry: 55 degree insert at 93 degrees approach profiles 32 degrees down, 80 degree at 95 only 5", () => {
    expect(toolLimits(55, 93).maxDescend).toBeCloseTo(32, 9)
    expect(toolLimits(80, 95).maxDescend).toBeCloseTo(5, 9)
    expect(toolLimits(80, 95).maxClimb).toBe(95)
    const wall = [{ z: 0, r: 10 }, { z: -5, r: 10 }, { z: -5, r: 5 }]
    expect(checkContour(wall, toolLimits(55, 93)).violations).toHaveLength(1)
  })
})

describe("contour geometry", () => {
  test("revolved volume is the closed-form frustum", () => {
    expect(revolvedVolume([{ z: 0, r: 5 }, { z: -12, r: 10 }])).toBeCloseTo((Math.PI * 12 * (25 + 50 + 100)) / 3, 9)
  })
  test("the offset of a straight line is parallel at the nose radius and a convex corner is a nose arc", () => {
    const line = offsetContour([{ z: 0, r: 10 }, { z: -20, r: 10 }], 0.8, "above")
    expect(line.every((p) => Math.abs(p.r - 10.8) < 1e-12)).toBe(true)
    const corner = offsetContour([{ z: 0, r: 10 }, { z: -10, r: 10 }, { z: -10, r: 5 }], 0.8, "above")
    const around = corner.filter((p) => Math.hypot(p.z + 10, p.r - 10) < 1.5)
    expect(around.length).toBeGreaterThan(5)
    for (const p of around) expect(Math.hypot(p.z + 10, p.r - 10)).toBeCloseTo(0.8, 9)
  })
  test("a pocket the tool cannot enter is bridged at the radius it left", () => {
    const e = turningEnvelope([{ z: 0, r: 13 }, { z: -28, r: 13 }, { z: -28, r: 11 }, { z: -32, r: 11 }, { z: -32, r: 13 }, { z: -45, r: 13 }], 32)
    expect(e.bridged).toHaveLength(1)
    expect(e.profile.some((p) => p.r === 11)).toBe(false)
  })
})

describe("thread data (ISO 262 / DIN 103)", () => {
  test("depths: metric external 0.6134 P, internal 0.5413 P; Tr 0.5 P + ac", () => {
    expect(threadHeight("metric", 1.5, false)).toBeCloseTo(0.9201, 4)
    expect(threadHeight("metric", 1.5, true)).toBeCloseTo(0.81195, 4)
    expect(threadHeight("trapezoidal", 4, false)).toBeCloseTo(2.25, 9)
  })
  test("the pass schedule shrinks its steps, ends at the full height and has the spring passes", () => {
    const d = threadDepths(0.92, 0.3, 0.05, 0.05, 2)
    expect(d[0]).toBeCloseTo(0.3, 9)
    expect(d[1]! - d[0]!).toBeLessThan(d[0]!)
    expect(d.slice(-2)).toEqual([0.92, 0.92])
  })
})

describe("lathe plan, NC and stock-removal replay", () => {
  const plan = planLathe(shaft)
  test("the plan has no issues and carries the closed-form volumes", () => {
    expect(plan.issues).toEqual([])
    expect(plan.analytic.stockVolume).toBeCloseTo(Math.PI * 15 * 15 * 45, 6)
    expect(plan.analytic.partVolume).toBeCloseTo(revolvedVolume(plan.contour), 6)
  })
  for (const dialect of ["fanuc", "siemens"] as LatheDialect[]) {
    test(`${dialect}: the replay removes the analytic volume, gouges nothing, leaves nothing, no rapid hits the part`, () => {
      const { nc } = emitLathe(plan, { dialect })
      const v = verifyLathe(plan, nc)
      expect(v.errors).toEqual([])
      expect(v.rapidCollisions).toBe(0)
      expect(v.gougeVolume).toBeLessThanOrEqual(v.volumeBound)
      expect(v.leftVolume).toBeLessThanOrEqual(v.volumeBound)
      expect(Math.abs(v.removedVolume - v.expectedRemoved)).toBeLessThanOrEqual(v.volumeBound)
      expect(Math.abs(v.partVolume - plan.analytic.partVolume)).toBeLessThanOrEqual(v.volumeBound)
    })
  }
  test("fanuc writes the canned cycles, siemens writes explicit moves with G33", () => {
    const f = emitLathe(plan, { dialect: "fanuc" })
    expect(f.cycles).toEqual(["G71", "G75", "G76"])
    expect(f.nc).toMatch(/G71 U2\.000 R0\.500/)
    expect(f.nc).toMatch(/G76 X/)
    const s = emitLathe(plan, { dialect: "siemens" })
    expect(s.cycles).toEqual([])
    expect(s.nc).toMatch(/DIAMON/)
    expect(s.nc).toMatch(/G33 X[\d.]+ Z-?[\d.]+ K1\.500/)
  })
  test("the replayed thread has the programmed lead and the planned passes", () => {
    const v = verifyLathe(plan, emitLathe(plan, { dialect: "siemens" }).nc)
    expect(v.threads).toHaveLength(1)
    expect(v.threads[0]!.lead).toBeCloseTo(1.5, 4)
    const op = plan.operations.find((o) => o.kind === "thread")!
    expect(v.threads[0]!.passes).toBe(op.moves.filter((m) => m.kind === "thread").length)
    expect(v.threads[0]!.radiusMin).toBeCloseTo(10 - threadHeight("metric", 1.5, false), 2)
  })
  test("a fake program fails: a finish cut too deep gouges, a missing finish leaves material", () => {
    const { nc } = emitLathe(plan, { dialect: "siemens" })
    const good = verifyLathe(plan, nc)
    const deep = nc.replace(/G1 X26\.8\d\d/g, "G1 X25.700")
    expect(deep).not.toBe(nc)
    expect(verifyLathe(plan, deep).gougeVolume).toBeGreaterThan(good.volumeBound)
    const noFinish = emitLathe(planLathe({ ...shaft, operations: shaft.operations.filter((o) => o.kind !== "finish") }), { dialect: "siemens" })
    expect(verifyLathe(plan, noFinish.nc).leftVolume).toBeGreaterThan(good.volumeBound)
  })
  test("a rapid through the part is a collision", () => {
    const { nc } = emitLathe(plan, { dialect: "siemens" })
    const crash = nc.replace("M8\n", "M8\nG0 X12.000 Z-10.000\n")
    expect(verifyLathe(plan, crash).rapidCollisions).toBeGreaterThan(0)
  })
  test("cycle text and explicit text remove the same volume", () => {
    const f = verifyLathe(plan, emitLathe(plan, { dialect: "fanuc" }).nc)
    const e = verifyLathe(plan, emitLathe(plan, { dialect: "fanuc", cycles: false }).nc)
    expect(Math.abs(f.removedVolume - e.removedVolume)).toBeLessThanOrEqual(f.volumeBound)
    expect(interpretGcode(emitLathe(plan, { dialect: "fanuc" }).nc, { lathe: true }).errors).toEqual([])
  })
  test("boring a straight bore with a boring bar removes the bore exactly", () => {
    const bore = planLathe({
      stock: { diameter: 40, length: 60, bore: 12 }, faceAllowance: 0.5, bore: [{ diameter: 24, z: 0 }, { diameter: 24, z: -25 }],
      tools: [rough, boring],
      operations: [{ kind: "face", tool: "T1" }, { kind: "rough", tool: "B1", side: "internal", depth: 1.5 }, { kind: "finish", tool: "B1", side: "internal" }],
      machine: { maxRpm: 4000 }
    })
    expect(bore.issues).toEqual([])
    const v = verifyLathe(bore, emitLathe(bore, { dialect: "fanuc" }).nc)
    expect(v.errors).toEqual([])
    expect(v.gougeVolume).toBeLessThanOrEqual(v.volumeBound)
    expect(Math.abs(v.removedVolume - v.expectedRemoved)).toBeLessThanOrEqual(v.volumeBound)
  })
  test("refusals: a profile above the bar, a missing tool, a bore without a pilot", () => {
    expect(planLathe({ ...shaft, stock: { diameter: 24, length: 60 } }).issues.join(";")).toMatch(/larger than/)
    expect(planLathe({ ...shaft, operations: [{ kind: "face", tool: "nope" }] }).issues.join(";")).toMatch(/nope/)
    expect(planLathe({ stock: { diameter: 30, length: 50 }, bore: [{ diameter: 10, z: 0 }, { diameter: 10, z: -10 }], tools: [boring], operations: [] }).issues.join(";")).toMatch(/pilot bore/)
  })
})
