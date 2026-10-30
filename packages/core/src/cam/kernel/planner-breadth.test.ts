import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Feature } from "../../cad/history.ts"
import { elementBrep } from "../../cad/scene-step.ts"
import { exactFeatures } from "../brep-part.ts"
import { generateHoleCycle } from "../operations/hole-cycles.ts"
import { recognizeNamedFeatures, type NamedFeature } from "../model/features.ts"
import type { OperationSpec } from "./contracts.ts"
import { DEFAULT_CUTTERS, countersinkDepth, findCutter, type Cutter } from "./cutters.ts"
import { requireMaterial } from "./materials.ts"
import { planJob, type PlanBreadth, type PlanInput } from "./planner.ts"

setDefaultTimeout(100_000)

const rect = (id: string, x: number, y: number, width: number, height: number, offset = 0): Feature => ({
  id, type: "sketch", plane: "XY", ...(offset !== 0 ? { offset } : {}), sketch: { entities: [], constraints: [], shapes: [{ id: `${id}r`, kind: "rectangle", at: [x, y], width, height }] }
})
/** A 100 x 60 plate `t` thick with the extra features. */
const plate = (t: number, extra: Feature[]): Record<string, unknown> => ({
  id: "p", type: "parametric", name: "Plate", x: 0, y: 0, z: 0,
  history: { parameters: {}, features: [rect("base", 0, 0, 100, 60), { id: "plate", type: "extrude", sketch: "base", depth: t, operation: "new" }, ...extra] }
})
const plan = (t: number, extra: Feature[], breadth?: PlanBreadth, tools: ReadonlyArray<Cutter> = DEFAULT_CUTTERS, material = "6061", partExtra?: Record<string, unknown>) => planJob({
  elements: [{ ...plate(t, extra), ...(partExtra ?? {}) }], bounds: { min: [0, 0, 0], max: [100, 60, t] }, stock: { min: { x: -2, y: -2, z: 0 }, max: { x: 102, y: 62, z: t + 1 } },
  tools, material: requireMaterial(material), rigidity: "standard", finishAllowance: 0.2, scallop: 0.01, ...(breadth !== undefined ? { breadth } : {})
} satisfies PlanInput)
const drillOps = (ops: ReadonlyArray<OperationSpec>) => ops.filter((o): o is Extract<OperationSpec, { strategy: "drill" }> => o.strategy === "drill")
const hole = (id: string, x: number, y: number, t: number, diameter: number, depth: number, over: Partial<Extract<Feature, { type: "hole" }>> = {}): Feature =>
  ({ id, type: "hole", plane: "XY", offset: t, at: [x, y], diameter, depth, ...over } as Feature)

describe("countersinks (rule H1)", () => {
  const csk = (angle: number): Feature => hole("c", 30, 30, 12, 5, 12, { kind: "countersink", headDiameter: 10, angle })

  test("a countersink cutter of the cone angle is plunged to the depth for the finished diameter, and the decision names its rule", () => {
    const p = plan(12, [csk(90)], { holeCycles: true })
    const op = drillOps(p.operations).find((o) => o.cycle?.kind === "countersink")!
    expect(op).toBeDefined()
    expect(op.tool).toBe("csk-12-90")
    expect(op.cycle).toEqual({ kind: "countersink", diameter: 10 })
    expect(op.top).toBeCloseTo(12, 9)
    expect(op.bottom).toBeCloseTo(12 - countersinkDepth(findCutter(DEFAULT_CUTTERS, "csk-12-90")!, 10), 9)
    expect(p.decisions).toContainEqual(expect.objectContaining({ feature: "c", rule: "H1-countersink-cycle", outcome: "planned" }))
    // The drill for the Ø5 hole comes first, the cone after it.
    const ops = p.operations
    expect(ops.findIndex((o) => o.id === op.id)).toBeGreaterThan(ops.findIndex((o) => o.strategy === "drill" && o.cycle === undefined && o.cut === "drill"))
  })

  test("an 82 degree sink gets an 82 degree cutter; a 120 degree one has none and is refused with the reason, not cut with a 90 degree tool", () => {
    const p82 = plan(12, [csk(82)], { holeCycles: true })
    expect(drillOps(p82.operations).find((o) => o.cycle?.kind === "countersink")!.tool).toBe("csk-16-82")
    const p120 = plan(12, [csk(120)], { holeCycles: true })
    expect(drillOps(p120.operations).some((o) => o.cycle !== undefined)).toBe(false)
    expect(p120.unmachined.some((u) => /120° countersink needs a 120° countersink cutter/.test(u))).toBe(true)
    expect(p120.decisions).toContainEqual(expect.objectContaining({ rule: "H1b-countersink-with-cone-tool", outcome: "refused" }))
  })

  test("without a countersink cutter a 90 degree sink is cut with the chamfer tool and the decision says so", () => {
    const p = plan(12, [csk(90)], { holeCycles: true }, DEFAULT_CUTTERS.filter((t) => t.kind !== "countersink"))
    expect(drillOps(p.operations).some((o) => o.cycle !== undefined)).toBe(false)
    expect(p.decisions).toContainEqual(expect.objectContaining({ rule: "H1b-countersink-with-cone-tool", outcome: "planned" }))
  })

  test("with the breadth rules off the plan is the old one: no cycle, no decision", () => {
    const off = plan(12, [csk(90)])
    expect(off.decisions).toEqual([])
    expect(drillOps(off.operations).every((o) => o.cycle === undefined)).toBe(true)
    expect(plan(12, [csk(90)], {}).operations).toEqual(off.operations)
  })
})

describe("deep holes (rule H2)", () => {
  const long: Cutter = { ...findCutter(DEFAULT_CUTTERS, "drill-4")!, id: "drill-4-long", name: "Drill Ø4 long series", fluteLength: 70, stickout: 90 }

  test("5.5 x D is pecked with a chip-break retract; 4 x D stays a plain drill", () => {
    const p = plan(30, [hole("deep", 30, 30, 30, 4, 22), hole("shallow", 60, 30, 30, 4, 16)], { holeCycles: true })
    const ops = drillOps(p.operations)
    const deep = ops.find((o) => o.cycle?.kind === "deep")!
    expect(deep.points).toEqual([{ x: 30, y: 30 }])
    expect(deep.cycle).toMatchObject({ kind: "deep", peck: 4, retract: "chip-break", fullRetractEvery: 4 })
    const plain = ops.find((o) => o.cut === "drill" && o.cycle === undefined)!
    expect(plain.points).toEqual([{ x: 60, y: 30 }])
    expect(p.decisions).toContainEqual(expect.objectContaining({ feature: "deep", rule: "H2-deep-hole", outcome: "planned" }))
    expect(p.decisions.some((d) => d.feature === "shallow")).toBe(false)
  })

  test("beyond 8 x D every peck retracts fully, with a long-series drill; with only short drills the hole is refused with the flute length it needs", () => {
    const p = plan(50, [hole("gun", 30, 30, 50, 4, 40)], { holeCycles: true }, [...DEFAULT_CUTTERS, long])
    const op = drillOps(p.operations).find((o) => o.cycle?.kind === "deep")!
    expect(op.tool).toBe("drill-4-long")
    expect(op.cycle).toMatchObject({ retract: "full" })
    expect(op.cycle).not.toHaveProperty("fullRetractEvery")
    const short = plan(50, [hole("gun", 30, 30, 50, 4, 40)], { holeCycles: true })
    expect(drillOps(short.operations).some((o) => o.cycle !== undefined)).toBe(false)
    expect(short.unmachined.some((u) => /10 x D deep: no Ø4 drill has 40.7\d* mm of flutes/.test(u))).toBe(true)
    expect(short.decisions).toContainEqual(expect.objectContaining({ feature: "gun", rule: "H2-deep-hole", outcome: "refused" }))
  })
})

describe("back-boring from the far side (rule H3)", () => {
  // A datum plane on the underside whose normal points down: a hole sketched on it goes up into the plate.
  const under: Feature = { id: "under", type: "plane", from: { kind: "points", points: [[0, 0, 0], [1, 0, 0], [0, -1, 0]] } } as Feature
  const fromBelow = (pilot: number): Feature[] => [under, { id: "bb", type: "hole", plane: "under", at: [50, -30], diameter: pilot, depth: 30, kind: "counterbore", headDiameter: 16, headDepth: 12 } as Feature]

  test("the pilot is drilled from the top, then a boring bar set to the bore bores up from the underside", () => {
    const p = plan(30, fromBelow(12), { holeCycles: true })
    const ops = p.operations
    const pilot = ops.findIndex((o) => o.strategy === "drill" && o.cut === "drill" && o.cycle === undefined && o.top === 30)
    const bore = ops.findIndex((o) => o.strategy === "drill" && o.cycle?.kind === "back-bore")
    expect(pilot).toBeGreaterThan(-1)
    expect(bore).toBeGreaterThan(pilot)
    const op = ops[bore] as Extract<OperationSpec, { strategy: "drill" }>
    expect(op.tool).toBe("boringbar-b16")
    expect(op.cycle).toEqual({ kind: "back-bore", diameter: 16, pilotDiameter: 12, face: 0 })
    expect(op.top).toBe(12)
    expect(op.bottom).toBeCloseTo(0 - 3 - 0.5, 9)
    expect(op.points[0]!.x).toBeCloseTo(50, 9)
    expect(op.points[0]!.y).toBeCloseTo(30, 9)
    expect(p.decisions).toContainEqual(expect.objectContaining({ feature: "bb", rule: "H3-back-bore", outcome: "planned" }))
  })

  test("a pilot the bar cannot pass is refused with the reason; with the rules off it is the old 'not drilled from above'", () => {
    const narrow = plan(30, fromBelow(10), { holeCycles: true })
    expect(narrow.operations.some((o) => o.strategy === "drill" && o.cycle !== undefined)).toBe(false)
    expect(narrow.decisions).toContainEqual(expect.objectContaining({ rule: "H3-back-bore", outcome: "refused", reason: expect.stringMatching(/does not pass the Ø10 pilot hole/) }))
    expect(narrow.unmachined.some((u) => /back-boring is not possible/.test(u))).toBe(true)
    const off = plan(30, fromBelow(12))
    expect(off.unmachined.some((u) => /not drilled from above/.test(u))).toBe(true)
    const noBar = plan(30, fromBelow(12), { holeCycles: true }, DEFAULT_CUTTERS.filter((t) => t.kind !== "boringbar"))
    expect(noBar.decisions).toContainEqual(expect.objectContaining({ rule: "H3-back-bore", outcome: "refused", reason: expect.stringMatching(/no boring bar set to Ø16/) }))
  })
})

describe("tilted drilling (rule H4)", () => {
  // A hole in the right face (x = 100), going in along -X.
  const side = (over: Partial<Extract<Feature, { type: "hole" }>> = {}): Feature => ({ id: "s", type: "hole", plane: "YZ", offset: 100, at: [30, 15], diameter: 5, depth: 25, ...over } as Feature)

  test("on a machine that indexes, a plain side hole is drilled along its own axis", () => {
    const p = plan(30, [side()], { tilted: { layout: "table-AC" } })
    const op = drillOps(p.operations).find((o) => o.cycle?.kind === "tilted")!
    expect(op).toBeDefined()
    expect(op.cycle).toMatchObject({ kind: "tilted", sites: [{ entry: { x: 100, y: 30, z: 15 }, direction: { x: -1, y: 0, z: 0 }, depth: 25 }] })
    expect(op.tool).toBe("drill-5")
    expect(p.decisions).toContainEqual(expect.objectContaining({ feature: "s", rule: "H4-tilted-drilling", outcome: "planned" }))
  })

  test("a direction outside the rotary limits, or a threaded side hole, is refused with the reason", () => {
    const limited = plan(30, [side()], { tilted: { layout: "table-AC", limits: { tiltMin: -45, tiltMax: 45 } } })
    expect(limited.operations.some((o) => o.strategy === "drill" && o.cycle !== undefined)).toBe(false)
    expect(limited.decisions).toContainEqual(expect.objectContaining({ rule: "H4-tilted-drilling", outcome: "refused", reason: expect.stringMatching(/cannot reach its direction/) }))
    const threaded = plan(30, [side({ thread: { designation: "M6", depth: 10 } })], { tilted: { layout: "table-AC" } })
    expect(threaded.decisions).toContainEqual(expect.objectContaining({ rule: "H4-tilted-drilling", outcome: "refused", reason: expect.stringMatching(/only plain holes/) }))
    const none = plan(30, [side()])
    expect(none.unmachined.some((u) => /not drilled from above/.test(u))).toBe(true)
    expect(none.decisions).toEqual([])
  })
})

describe("named features become operations or are refused (rules N1, N3, N4, N5)", () => {
  const loop100x60 = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }]
  const band = (over: Partial<NamedFeature>): NamedFeature => ({
    id: "chamfer-1", kind: "chamfer-band", faces: [1], bounds: { min: { x: 0, y: 0, z: 10 }, max: { x: 100, y: 60, z: 12 } }, convex: true, size: 2 * Math.SQRT2, turn: 45, upperZ: 12, lowerZ: 10, loops: [loop100x60], loopSides: ["outside"], ...over
  })

  test("a 2 mm 45 degree chamfer ring becomes a 2D chamfer with a 90 degree cone, at the height of its upper edge", () => {
    const p = plan(12, [], { named: [band({})] })
    const op = p.operations.find((o) => o.strategy === "chamfer" && o.id === "chamfer-chamfer-1")!
    expect(op).toBeDefined()
    expect(op).toMatchObject({ strategy: "chamfer", top: 12, width: 2, loops: [{ side: "outside" }] })
    expect(findCutter(DEFAULT_CUTTERS, op.tool)!.angle).toBe(90)
    expect(p.decisions).toContainEqual(expect.objectContaining({ feature: "chamfer-1", rule: "N4-chamfer-band", outcome: "planned", operations: ["chamfer-chamfer-1"] }))
  })

  test("the same chamfer asked for by the deburring width is covered, not cut twice", () => {
    const p = plan(12, [], { named: [band({})] })
    const both = planJob({ ...{
      elements: [plate(12, [])], bounds: { min: [0, 0, 0], max: [100, 60, 12] }, stock: { min: { x: -2, y: -2, z: 0 }, max: { x: 102, y: 62, z: 13 } },
      tools: DEFAULT_CUTTERS, material: requireMaterial("6061"), rigidity: "standard" as const, finishAllowance: 0.2, scallop: 0.01
    }, deburr: 2, breadth: { named: [band({})] } })
    expect(p.operations.filter((o) => o.strategy === "chamfer")).toHaveLength(1)
    expect(both.operations.filter((o) => o.strategy === "chamfer")).toHaveLength(1)
    expect(both.decisions).toContainEqual(expect.objectContaining({ rule: "N4-chamfer-band", outcome: "covered" }))
  })

  test("a chamfer with no cone of its angle, an inside-corner chamfer and a chamfer without a loop are refused with their reason", () => {
    const steep = plan(12, [], { named: [band({ size: Math.hypot(1, 2), upperZ: 12, lowerZ: 10 })] })
    expect(steep.decisions).toContainEqual(expect.objectContaining({ rule: "N4-chamfer-band", outcome: "refused", reason: expect.stringMatching(/no chamfer \/ spot \/ countersink cutter of 53\.\d+°/) }))
    const inside = plan(12, [], { named: [band({ convex: false })] })
    expect(inside.decisions).toContainEqual(expect.objectContaining({ outcome: "refused", reason: expect.stringMatching(/inside corner/) }))
    const bare = plan(12, [], { named: [band({ loops: undefined })] })
    expect(bare.decisions).toContainEqual(expect.objectContaining({ outcome: "refused", reason: expect.stringMatching(/closed loop/) }))
    expect(steep.operations.some((o) => o.strategy === "chamfer")).toBe(false)
  })

  test("a slot the pocket operations reach is covered; one nothing reaches is refused", () => {
    const pocket: Feature[] = [rect("slotSk", 20, 20, 60, 10, 12), { id: "slot", type: "extrude", sketch: "slotSk", depth: 5, direction: "down", operation: "subtract" }]
    const named: NamedFeature = { id: "slot-1", kind: "slot", faces: [1, 2, 3], bounds: { min: { x: 20, y: 20, z: 7 }, max: { x: 80, y: 30, z: 12 } }, width: 10, depth: 5, length: 60, floorZ: 7, topZ: 12 }
    const p = plan(12, pocket, { named: [named] })
    const d = p.decisions.find((x) => x.feature === "slot-1")!
    expect(d).toMatchObject({ rule: "N1-region-covered", outcome: "covered" })
    expect(d.operations.length).toBeGreaterThan(0)
    const elsewhere = plan(12, pocket, { named: [{ ...named, id: "slot-2", bounds: { min: { x: 20, y: 40, z: 3 }, max: { x: 80, y: 50, z: 8 } }, floorZ: 3 }] })
    expect(elsewhere.decisions).toContainEqual(expect.objectContaining({ feature: "slot-2", rule: "N1-region-covered", outcome: "refused" }))
    expect(elsewhere.unmachined.some((u) => /Slot slot-2: no planned pocket/.test(u))).toBe(true)
  })

  test("a ring groove has no milling strategy; a vertical outline radius is covered by the contour, an edge fillet is refused", () => {
    const groove: NamedFeature = { id: "groove-1", kind: "groove", faces: [1, 2, 3], bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, width: 5, depth: 3, diameter: 24, external: true }
    const corner: NamedFeature = { id: "fillet-1", kind: "fillet-band", faces: [4], bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 4, z: 12 } }, convex: true, size: 4, axis: { x: 0, y: 0, z: 1 } }
    const edge: NamedFeature = { id: "fillet-2", kind: "fillet-band", faces: [5], bounds: { min: { x: 0, y: 0, z: 9 }, max: { x: 100, y: 3, z: 12 } }, convex: true, size: 3, axis: { x: 1, y: 0, z: 0 } }
    const p = plan(12, [], { named: [groove, corner, edge] })
    expect(p.decisions).toContainEqual(expect.objectContaining({ feature: "groove-1", rule: "N3-groove", outcome: "refused" }))
    expect(p.decisions).toContainEqual(expect.objectContaining({ feature: "fillet-1", rule: "N5-fillet-band", outcome: "covered" }))
    expect(p.decisions).toContainEqual(expect.objectContaining({ feature: "fillet-2", rule: "N5-fillet-band", outcome: "refused", reason: expect.stringMatching(/needs an edge-following strategy/) }))
    expect(p.decisions.every((d) => d.rule.length > 0)).toBe(true)
  })

  test("named features recognised on a real solid feed the planner: a slot cut into the plate is covered by the pocket the history gives", () => {
    const pocket: Feature[] = [rect("slotSk", -5, 20, 110, 10, 12), { id: "slot", type: "extrude", sketch: "slotSk", depth: 5, direction: "down", operation: "subtract" }]
    const el = { ...plate(12, pocket) }
    const placed = elementBrep(el as never)
    if (placed.brep === undefined) throw new Error(placed.reason)
    const named = recognizeNamedFeatures(placed.brep)
    expect(named.map((f) => f.kind)).toEqual(["slot"])
    const p = plan(12, pocket, { named })
    expect(p.decisions).toContainEqual(expect.objectContaining({ rule: "N1-region-covered", outcome: "covered" }))
  })
})

describe("the exact B-rep path hands the planner the same hole facts", () => {
  test("a side hole is kept as a site (not just counted) and a countersink carries its cone angle", () => {
    const side = { id: "s", type: "hole", plane: "YZ", offset: 100, at: [30, 15], diameter: 5, depth: 25 } as Feature
    const el = plate(30, [hole("c", 20, 30, 30, 5, 30, { kind: "countersink", headDiameter: 10, angle: 82 }), side])
    const r = exactFeatures(el as never)
    if (r === undefined || r.features === undefined) throw new Error(r?.reason ?? "no exact features")
    expect(r.features.sideHoles).toBe(1)
    expect(r.features.sideHoleSites).toHaveLength(1)
    const s = r.features.sideHoleSites![0]!
    expect([s.entry.x, s.entry.y, s.entry.z]).toEqual([100, 30, 15].map((v) => expect.closeTo(v, 6)))
    expect(s.direction.x).toBeCloseTo(-1, 9)
    expect(s.diameter).toBeCloseTo(5, 6)
    expect(s.depth).toBeCloseTo(25, 6)
    const csk = r.features.holes.find((h) => h.kind === "countersink")!
    expect(csk.headDiameter).toBeCloseTo(10, 4)
    expect(csk.headAngle).toBeCloseTo(82, 1)
  })
})

describe("what the planner emits is what the cycle generators accept", () => {
  const under: Feature = { id: "under", type: "plane", from: { kind: "points", points: [[0, 0, 0], [1, 0, 0], [0, -1, 0]] } } as Feature
  const toolpath = (op: Extract<OperationSpec, { strategy: "drill" }>, tools: ReadonlyArray<Cutter>, topZ: number) => generateHoleCycle({
    id: op.id, name: op.name ?? op.id, cycle: op.cycle!, tool: tools.find((t) => t.id === op.tool)!, points: op.points, top: op.top, bottom: op.bottom,
    clearanceZ: topZ + 10, retractZ: topZ + 2, feed: 200, rpm: 3000, coolant: "off"
  })

  test("countersink, deep hole and back-bore operations of one plan all generate toolpaths", () => {
    const feats: Feature[] = [
      hole("c", 20, 15, 30, 5, 12, { kind: "countersink", headDiameter: 10, angle: 90 }), hole("deep", 60, 15, 30, 4, 22),
      under, { id: "bb", type: "hole", plane: "under", at: [50, -45], diameter: 12, depth: 30, kind: "counterbore", headDiameter: 16, headDepth: 12 } as Feature
    ]
    const p = plan(30, feats, { holeCycles: true })
    const cycles = drillOps(p.operations).filter((o) => o.cycle !== undefined)
    expect(cycles.map((o) => o.cycle!.kind).sort()).toEqual(["back-bore", "countersink", "deep"])
    for (const op of cycles) {
      const tp = toolpath(op, DEFAULT_CUTTERS, 31)
      expect(tp.toolId).toBe(op.tool)
      expect(tp.moves.length).toBeGreaterThan(2)
    }
  })
})
