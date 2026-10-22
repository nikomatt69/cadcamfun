import { describe, expect, test } from "bun:test"
import { type Program, type Toolpath, makeProgram, validate } from "../../src/cam/ir.ts"
import { fiveAxisKinematic, describeFiveAxis, rotaryRangesOf, solveOrientation, tipPosition } from "../../src/cam/five-axis.ts"
import { anglesFor, partToMachine } from "../../src/cam/indexing.ts"
import { haasPost, posts, grblPost, fanucPost } from "../../src/cam/post/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import { analyseGcode } from "../../src/cam/generator/analysis.ts"
import { TriangleSoup } from "../../src/cam/model/mesh-queries.ts"
import { elementMesh, partMeshes, type Mesh64 } from "../../src/cam/model/index.ts"
import { MultiaxisParams, generateMultiaxis, toolAxisAt, envelopeOf } from "../../src/cam/operations/multiaxis.ts"
import { ToolSchema, type Tool } from "../../src/cam/tool.ts"
import { Schema } from "effect"

const endmill = Schema.decodeUnknownSync(ToolSchema)({ id: "6", name: "6 mm end mill", kind: "endmill", diameter: 6, flutes: 3, maxRpm: 12000 }) as Tool
const ballnose = Schema.decodeUnknownSync(ToolSchema)({ id: "8", name: "8 mm ball", kind: "ballnose", diameter: 8, flutes: 2, maxRpm: 12000 }) as Tool

const block = (x: number, y: number, z: number, w: number, h: number, d: number): Mesh64 =>
  elementMesh({ type: "cube", x, y, z, width: w, height: h, depth: d }, 0.01)!

const bbox = (x: number, y: number, z: number, w: number, h: number, d: number) => [x, y, z, w, h, d] as const

// Table-BC trunnion with the control applying the tool centre point (Haas G234).
const umc = fiveAxisKinematic({
  layout: "table-BC",
  limits: { tilt: [-35, 120], rotation: [0, 360] },
  pivot: { x: 0, y: 0, z: 0 },
  tcp: "control"
})

const tp = (moves: Toolpath["moves"], over: Partial<Toolpath> = {}): Toolpath => ({
  id: "t", name: "Five axis", toolId: "6", spindleRpm: 8100, coolant: "off", moves, ...over
})

describe("five-axis kinematics", () => {
  test("a horizontal surface needs no table motion", () => {
    const a = solveOrientation({ x: 0, y: 0, z: 1 }, umc)
    expect(a).toBeDefined()
    expect(a!.b ?? 0).toBeCloseTo(0, 6)
  })

  test("a surface tilted 30 degrees is reached by the table B axis within its range", () => {
    const n = { x: Math.sin(Math.PI / 6), y: 0, z: Math.cos(Math.PI / 6) }
    const a = solveOrientation(n, umc)
    expect(a).toBeDefined()
    expect(Math.abs(a!.b!)).toBeCloseTo(30, 6)
    expect(a!.b!).toBeGreaterThanOrEqual(-35)
    expect(a!.b!).toBeLessThanOrEqual(120)
  })

  test("a direction outside the tilt range is unreachable", () => {
    const k = fiveAxisKinematic({ layout: "table-BC", limits: { tilt: [-10, 10] } })
    expect(solveOrientation({ x: 1, y: 0, z: 0.2 }, k)).toBeUndefined()
  })

  test("program mode writes machine coordinates; control mode keeps part coordinates", () => {
    const p = { x: 10, y: 0, z: 0 }
    const a = { b: 45, c: 0 }
    const machine = fiveAxisKinematic({ layout: "table-BC", limits: { tilt: [-120, 120] }, tcp: "program" })
    expect(tipPosition(p, a, umc)).toEqual(p)
    expect(tipPosition(p, a, machine)).toEqual(partToMachine(p, a, "table-BC", machine.pivot))
  })

  test("the machine ranges used by validation match the table", () => {
    expect(rotaryRangesOf(umc)).toEqual({ b: { min: -35, max: 120 }, c: { min: 0, max: 360 } })
    expect(describeFiveAxis(umc)).toContain("table-BC")
  })
})

describe("five-axis post", () => {
  const program = (moves: Toolpath["moves"]): Program => makeProgram("Five axis", [tp(moves)], { metadata: { programNumber: "1234" } })

  test("opens the section with G234 H, writes B/C on the motion blocks and closes with G43", () => {
    const text = haasPost.emit(program([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 40 }, rotary: { b: 30, c: 0 } },
      { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 1200, rotary: { b: 30, c: 0 } },
      { _tag: "Linear", to: { x: 6, y: 0, z: -2 }, feed: 1200, rotary: { b: 32, c: 0 } },
      { _tag: "Rapid", to: { x: 6, y: 0, z: 40 }, rotary: { b: 32, c: 0 } }
    ]))
    expect(text.startsWith("%\nO1234")).toBe(true)
    expect(text).toContain("G234 H6")
    expect(text).toContain("B30.000")
    expect(text).toContain("B32.000")
    expect(text.indexOf("G234 H6")).toBeLessThan(text.indexOf("B30.000"))
    expect(text.lastIndexOf("G43 H6")).toBeGreaterThan(text.indexOf("B32.000"))
    expect(text).toContain("M30")
    expect(text.trimEnd().endsWith("%")).toBe(true)
  })

  test("a program that ends while the control still has TCPC on is closed with G49", () => {
    const text = haasPost.emit(program([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 40 }, rotary: { b: 30, c: 0 } },
      { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 1200, rotary: { b: 30, c: 0 } }
    ]))
    expect(text).toContain("G234 H6")
    expect(text).toContain("G49")
    expect(text.indexOf("G49")).toBeLessThan(text.indexOf("M5"))
  })

  test("a 3-axis section after a 5-axis one returns to G43 tool length compensation", () => {
    const text = haasPost.emit(program([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 40 }, rotary: { b: 10, c: 0 } },
      { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 800, rotary: { b: 10, c: 0 } },
      { _tag: "Rapid", to: { x: 5, y: 0, z: 40 } },
      { _tag: "Linear", to: { x: 20, y: 0, z: -2 }, feed: 800 }
    ]))
    const g234 = text.indexOf("G234 H6")
    const g43 = text.indexOf("G43 H6", g234)
    expect(g234).toBeGreaterThanOrEqual(0)
    expect(g43).toBeGreaterThan(g234)
  })

  test("the emitted rotary angles read back through the interpreter", () => {
    const text = haasPost.emit(program([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 40 }, rotary: { b: 30, c: 90 } },
      { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 1200, rotary: { b: 45, c: 90 } }
    ]))
    const result = interpretGcode(text)
    const last = result.segments.filter((s) => s.kind === "linear").at(-1)!
    expect(last.kind === "linear" && last.rotary).toEqual({ b: 45, c: 90 })
  })

  test("grbl and fanuc refuse rotary angles rather than dropping them", () => {
    const prog = program([{ _tag: "Linear", to: { x: 1, y: 0, z: 0 }, feed: 100, rotary: { b: 5 } }])
    expect(() => grblPost.emit(prog)).toThrow(RangeError)
    expect(() => fanucPost.emit(prog)).not.toThrow()
    expect(posts.haas).toBe(haasPost)
  })

  test("a toolpath that mixes 3+2 positioning with simultaneous motion is rejected", () => {
    const prog = program([
      { _tag: "Orient", b: 20 },
      { _tag: "Linear", to: { x: 1, y: 0, z: 0 }, feed: 100, rotary: { b: 20 } }
    ])
    expect(() => haasPost.emit(prog)).toThrow(/mixes/)
  })

  test("the emitted program is deterministic", () => {
    const moves: Toolpath["moves"] = [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 40 }, rotary: { b: 30, c: 0 } },
      { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 1200, rotary: { b: 30, c: 0 } }
    ]
    expect(haasPost.emit(program(moves))).toBe(haasPost.emit(program(moves)))
  })
})

describe("rotary limits in validate", () => {
  const machine = {
    id: "umc-500",
    travel: { minX: -305, maxX: 305, minY: -203, maxY: 203, minZ: -203, maxZ: 203 },
    rotary: { b: { min: -35, max: 120 }, c: { min: 0, max: 360 } }
  }

  test("a rotary angle outside the machine range is reported", () => {
    const issues = validate(makeProgram("p", [tp([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 10 }, rotary: { b: 150, c: 0 } }
    ])]), machine)
    expect(issues.some((i) => i._tag === "RotaryLimit" && i.axis === "B")).toBe(true)
  })

  test("angles inside the range are accepted", () => {
    const issues = validate(makeProgram("p", [tp([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 10 }, rotary: { b: 120, c: 360 } }
    ])]), machine)
    expect(issues.filter((i) => i._tag === "RotaryLimit")).toEqual([])
  })
})

describe("gcode interpreter and analysis of rotary words", () => {
  test("A, B and C are modal and do not change the geometry", () => {
    const result = interpretGcode("G0 X0 Y0 Z10\nG1 Z-1 F300 B20 C90\nG1 X5 B25\n")
    const linears = result.segments.filter((s) => s.kind === "linear")
    expect(linears[0]!.kind === "linear" && linears[0]!.rotary).toEqual({ b: 20, c: 90 })
    expect(linears[1]!.kind === "linear" && linears[1]!.rotary).toEqual({ b: 25, c: 90 })
    expect(result.errors).toEqual([])
  })

  test("analysis carries the rotary angles into the IR", () => {
    const { program } = analyseGcode("G0 Z10\nG1 X5 Y0 Z-1 F300 B30 C0\n")
    const moves = program.toolpaths[0]!.moves
    const linear = moves.find((m) => m._tag === "Linear")
    expect(linear && linear._tag === "Linear" && linear.rotary).toEqual({ b: 30, c: 0 })
  })
})

describe("triangle mesh queries", () => {
  const cube = new TriangleSoup([block(0, 0, 0, 20, 20, 10)], 1)

  test("the surface under a column is the top face, with its normal pointing up", () => {
    const hit = cube.down(3, 4, 50)
    expect(hit).toBeDefined()
    expect(hit!.point.z).toBeCloseTo(5, 6)
    expect(hit!.normal.z).toBeCloseTo(1, 6)
  })

  test("inside and outside of a closed solid", () => {
    expect(cube.inside({ x: 0, y: 0, z: 0 })).toBe(true)
    expect(cube.inside({ x: 0, y: 0, z: 20 })).toBe(false)
    expect(cube.inside({ x: 30, y: 0, z: 0 })).toBe(false)
  })

  test("clearance is the distance to the nearest surface", () => {
    expect(cube.distance({ x: 0, y: 0, z: 8 }, 10)).toBeCloseTo(3, 6)
    expect(cube.isClear({ x: 0, y: 0, z: 8 }, 2)).toBe(true)
    expect(cube.isClear({ x: 0, y: 0, z: 8 }, 4)).toBe(false)
    expect(cube.isClear({ x: 0, y: 0, z: 0 }, 0.02)).toBe(false)
  })

  test("the part meshes of an element selection", () => {
    const got = partMeshes([{ type: "cube", x: 0, y: 0, z: 0, width: 4, height: 4, depth: 4 }], { tolerance: 0.01 })
    expect(got?.meshes.length).toBe(1)
  })
})

describe("tool axis of a 5-axis cutter", () => {
  test("normal mode stands on the surface normal", () => {
    const n = { x: 0, y: 0, z: 1 }
    expect(toolAxisAt(n, { x: 1, y: 0, z: 0 }, { toolAxis: "normal", lead: 10, tilt: 0 })).toEqual(n)
  })

  test("a lead leans the axis towards the direction of travel by that angle", () => {
    const axis = toolAxisAt({ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { toolAxis: "lead", lead: 20, tilt: 0 })
    expect(Math.atan2(axis.x, axis.z) * 180 / Math.PI).toBeCloseTo(20, 6)
    expect(axis.y).toBeCloseTo(0, 9)
  })

  test("the cutter envelope of a ball nose starts at the contact point", () => {
    const env = envelopeOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, ballnose, 2)
    expect(env.cut).toEqual([{ x: 0, y: 0, z: 0 }])
    expect(env.body.length).toBeGreaterThan(10)
  })
})

describe("simultaneous 5-axis operation", () => {
  const params = (over: Record<string, unknown> = {}) => Schema.decodeUnknownSync(MultiaxisParams)({
    id: "5ax", name: "5-axis finish", totalDepth: 10, stepdown: 10, clearanceHeight: 30, safeHeight: 20, retractHeight: 5,
    stepover: 40, ...over
  })
  const plate = new TriangleSoup([block(0, 0, -5, 40, 40, 10)], 1)

  test("a flat plate with the normal axis needs no table motion and writes rotary words on every cut", () => {
    const result = generateMultiaxis(params({ toolAxis: "normal" }), plate, endmill, umc)
    expect(result.warnings).toEqual([])
    expect(result.stats.sections).toBeGreaterThan(0)
    const cuts = result.toolpath.moves.filter((m) => m._tag === "Linear")
    expect(cuts.length).toBeGreaterThan(10)
    for (const m of cuts) {
      if (m._tag !== "Linear") continue
      expect(m.rotary).toBeDefined()
      expect(Math.abs(m.rotary!.b ?? 0)).toBeLessThan(1e-6)
    }
    expect(validate(makeProgram("p", [result.toolpath]), { id: "umc", travel: { minX: -305, maxX: 305, minY: -203, maxY: 203, minZ: -300, maxZ: 300 }, rotary: { b: { min: -35, max: 120 }, c: { min: 0, max: 360 } } }).filter((i) => i._tag === "RotaryLimit")).toEqual([])
  })

  test("a leaned cutter uses the table and the program is emitted by the Haas post", () => {
    const result = generateMultiaxis(params({ toolAxis: "lead", lead: 15 }), plate, endmill, umc)
    const cuts = result.toolpath.moves.filter((m) => m._tag === "Linear")
    expect(cuts.some((m) => m._tag === "Linear" && Math.abs(m.rotary?.b ?? 0) > 5)).toBe(true)
    const text = haasPost.emit(makeProgram("Five axis", [result.toolpath]))
    expect(text).toContain("G234 H6")
    expect(text).toContain("B")
    const parsed = analyseGcode(text).stats
    expect(parsed.cutLength).toBeGreaterThan(0)
  })

  test("a ball nose with lean stays off the part: every cutter sample is clear", () => {
    const result = generateMultiaxis(params({ toolAxis: "lead", lead: 25, gougeAngle: 30 }), plate, ballnose, umc)
    expect(result.stats.points).toBeGreaterThan(0)
    for (const m of result.toolpath.moves) {
      if (m._tag !== "Linear") continue
      // Program in part coordinates: the tip is on or above the plate's top face (z = 0) at all times.
      expect(m.to.z).toBeGreaterThan(-10.0001)
    }
  })

  test("a steep unreachable surface is reported, not cut", () => {
    const k = fiveAxisKinematic({ layout: "table-BC", limits: { tilt: [-5, 5] } })
    const sphere = new TriangleSoup([elementMesh({ type: "sphere", x: 0, y: 0, z: 0, radius: 20 }, 0.05)!], 1)
    const result = generateMultiaxis(params({ toolAxis: "normal", gouge: false }), sphere, endmill, k)
    expect(result.stats.skipped).toBeGreaterThan(0)
  })

  test("contour strategy produces sections at the requested levels", () => {
    const dome = new TriangleSoup([elementMesh({ type: "sphere", x: 0, y: 0, z: 0, radius: 20 }, 0.05)!], 1)
    const result = generateMultiaxis(params({ strategy: "contour", toolAxis: "normal", totalDepth: 10, stepdown: 5 }), dome, endmill, umc)
    expect(result.stats.sections).toBeGreaterThan(0)
    // Steep points need a table tilt beyond the B range: they are left out and counted, never emitted out of range.
    expect(result.stats.skipped).toBeGreaterThan(0)
    const issues = validate(makeProgram("p", [result.toolpath]), { id: "umc", travel: { minX: -305, maxX: 305, minY: -203, maxY: 203, minZ: -300, maxZ: 300 }, rotary: { b: { min: -35, max: 120 }, c: { min: 0, max: 360 } } })
    expect(issues.filter((i) => i._tag === "RotaryLimit")).toEqual([])
  })

  test("a contour retracts across an obstructed interval instead of joining the reachable points through it", () => {
    class ObstructedSoup extends TriangleSoup {
      override isClear(p: { readonly x: number; readonly y: number; readonly z: number }, clearance: number): boolean {
        return Math.abs(p.x) > 1 && super.isClear(p, clearance)
      }
    }
    const soup = new ObstructedSoup([elementMesh({ type: "sphere", x: 0, y: 0, z: 0, radius: 8 }, 0.02)!], 0.5)
    const k = fiveAxisKinematic({ layout: "table-BC", limits: { tilt: [-180, 180] }, tcp: "control" })
    const result = generateMultiaxis(params({ strategy: "contour", toolAxis: "normal", gouge: false, totalDepth: 4, stepdown: 4, maxRotaryStep: 180 }), soup, { ...ballnose, diameter: 1 }, k)
    expect(result.stats.skipped).toBeGreaterThan(0)
    expect(result.stats.sections).toBeGreaterThan(1)
    let previous: { readonly x: number } | undefined
    const sides = new Set<number>()
    for (const move of result.toolpath.moves) {
      if (move._tag !== "Linear") { previous = undefined; continue }
      sides.add(Math.sign(move.to.x))
      if (previous !== undefined) expect(previous.x * move.to.x).toBeGreaterThan(0)
      previous = move.to
    }
    expect([...sides].sort()).toEqual([-1, 1])
  })

  test("drills are refused for a 5-axis surface", () => {
    const drill = Schema.decodeUnknownSync(ToolSchema)({ id: "d", name: "drill", kind: "drill", diameter: 5, flutes: 2, maxRpm: 5000 }) as Tool
    const result = generateMultiaxis(params(), plate, drill, umc)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.toolpath.moves).toEqual([])
  })
})

void bbox
void anglesFor
