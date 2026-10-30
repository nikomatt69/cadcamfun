/**
 * Tilted work planes (3+2) written with the control's own swivel words (spec 72 P4-6, step 5.5): Fanuc G68.2 + G53.1, Siemens CYCLE800,
 * Heidenhain PLANE SPATIAL.
 *
 * Truth is geometric and independent of the writer: the toolpath is in its plane's coordinates, so its tool tip is at
 * `workToWorld(frame, p)` in the work offset. The posted text is replayed by the reference interpreter (and read back by `convertNc`)
 * and every tip position must land there. The tolerance is declared: coordinates are written with 3 decimals (0.0005 mm each axis, up to
 * 0.0009 mm in 3D) and the plane angles with 4 decimals (0.00005 deg is 0.0001 mm at 100 mm), 0.002 mm in all.
 */
import { describe, expect, test } from "bun:test"
import { frameFromNormal } from "../../src/cam/indexing.ts"
import { makeProgram, type Program, type Toolpath } from "../../src/cam/ir.ts"
import type { WorkFrame } from "../../src/cam/setup.ts"
import { workToWorld } from "../../src/cam/setup.ts"
import { convertNc, fanucPost, genericPost, grblPost, haasPost, heidenhainPost, linuxcncPost, mazakPost, okumaPost, siemensPost, type PostOptions } from "../../src/cam/post/index.ts"
import { eulerXYZ, eulerZXZ, frameMatrix, matMul, rotation, spatialAngles } from "../../src/cam/post/workplane.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const TOL = 0.002
const swivel = { dataRecord: "TABLE_AC" }

const op = (id: string, tool: string, moves: Toolpath["moves"]): Toolpath => ({ id, name: `Op ${id}`, toolId: tool, spindleRpm: 8000, coolant: "off", moves })
/** A pocket-like path in plane coordinates: down into the plane, a square, a quarter circle, up. */
const local = (): Toolpath["moves"] => [
  { _tag: "Rapid", to: { x: 5, y: 5, z: 10 } },
  { _tag: "Linear", to: { x: 5, y: 5, z: -3 }, feed: 200 },
  { _tag: "Linear", to: { x: 45, y: 5, z: -3 }, feed: 600 },
  { _tag: "Linear", to: { x: 45, y: 35, z: -3 }, feed: 600 },
  { _tag: "Arc", to: { x: 25, y: 55, z: -3 }, center: { x: 25, y: 35 }, clockwise: false, feed: 500 },
  { _tag: "Linear", to: { x: 5, y: 35, z: -3 }, feed: 600 },
  { _tag: "Rapid", to: { x: 5, y: 35, z: 10 } }
]
const world = (frame: WorkFrame, moves: Toolpath["moves"]) => moves.flatMap((m) => (m._tag === "Rapid" || m._tag === "Linear" ? [workToWorld(frame, m.to)] : []))

const frames: ReadonlyArray<readonly [string, WorkFrame]> = [
  ["tilted 45 deg about X", frameFromNormal({ x: 12, y: -7, z: 30 }, { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 })],
  ["side face, tool along +X", frameFromNormal({ x: 100, y: 20, z: -15 }, { x: 1, y: 0, z: 0 })],
  ["general normal", frameFromNormal({ x: -20, y: 40, z: 5 }, { x: 0.3, y: -0.5, z: 0.8 }, { x: 0.2, y: 1, z: 0 })],
  ["back face, tool along -Y (Siemens gimbal region)", frameFromNormal({ x: 0, y: 80, z: 0 }, { x: 0, y: -1, z: 0 })],
  ["upside down, tool along -Z (Euler singularity at 180)", frameFromNormal({ x: 3, y: 4, z: 5 }, { x: 0, y: 0, z: -1 })]
]

/** Every expected tip appears among the replayed points, in order (the post adds its own retract moves between and after). */
const expectInOrder = (got: ReadonlyArray<{ x: number; y: number; z: number }>, expected: ReadonlyArray<{ x: number; y: number; z: number }>): void => {
  let at = 0
  for (const want of expected) {
    let found = false
    while (at < got.length) {
      const p = got[at++]!
      if (Math.hypot(p.x - want.x, p.y - want.y, p.z - want.z) <= TOL) { found = true; break }
    }
    expect(found).toBe(true)
  }
}

const tipsOf = (text: string, dwell?: "seconds" | "milliseconds") => {
  const r = interpretGcode(text, dwell === undefined ? {} : { dwell })
  expect(r.errors).toEqual([])
  return r.segments.flatMap((s) => (s.kind === "rapid" || s.kind === "linear" ? [s.to] : []))
}

describe("the angle conversions are exact rotations", () => {
  test("each control's triple rebuilds the frame's rotation, singular cases included", () => {
    for (const [, frame] of frames) {
      const m = frameMatrix(frame)
      const e = eulerZXZ(m), x = eulerXYZ(m), s = spatialAngles(m)
      const zxz = matMul(matMul(rotation("z", e.i), rotation("x", e.j)), rotation("z", e.k))
      const xyz = matMul(matMul(rotation("x", x.a), rotation("y", x.b)), rotation("z", x.c))
      const spatial = matMul(matMul(rotation("z", s.spc), rotation("y", s.spb)), rotation("x", s.spa))
      for (const rebuilt of [zxz, xyz, spatial]) rebuilt.forEach((v, i) => expect(v).toBeCloseTo(m[i]!, 9))
    }
  })
})

describe("the posted tilted plane reproduces the tool-tip positions of the toolpath", () => {
  for (const [name, frame] of frames) {
    for (const [post, extra, dwell] of [[fanucPost, {}, "milliseconds"], [siemensPost, { swivel }, "seconds"], [heidenhainPost, {}, "seconds"]] as const) {
      test(`${post.id}, ${name}`, () => {
        const moves = local()
        const program = makeProgram("tilt", [op("a", "1", moves)])
        const text = post.emit(program, { workPlanes: { a: { frame, layout: "table-AC" } }, ...extra } as Partial<PostOptions>)
        expectInOrder(tipsOf(text, dwell), world(frame, moves))
      })
    }
  }

  test("convertNc reads the posted tilted plane back into the work offset's own axes", () => {
    const [, frame] = frames[2]!
    const moves = local().filter((m) => m._tag !== "Arc")
    const program = makeProgram("tilt", [op("a", "1", moves)])
    for (const [post, extra] of [[fanucPost, {}], [siemensPost, { swivel }], [heidenhainPost, {}]] as const) {
      const text = post.emit(program, { workPlanes: { a: { frame, layout: "table-AC" } }, ...extra } as Partial<PostOptions>)
      const read = convertNc(text, { source: post.id, target: "generic" })
      expect(read.errors).toEqual([])
      expect(read.notes.join(" ")).toContain("tilted")
      const tips = read.program!.toolpaths.flatMap((t) => t.moves.flatMap((m) => (m._tag === "Rapid" || m._tag === "Linear" ? [m.to] : [])))
      const expected = world(frame, moves)
      expectInOrder(tips, expected)
    }
  })

  test("without the plane the same toolpath lands elsewhere (the old behaviour is visibly wrong)", () => {
    const [, frame] = frames[0]!
    const moves = local()
    const text = fanucPost.emit(makeProgram("tilt", [op("a", "1", moves)]))
    const got = tipsOf(text, "milliseconds")
    const want = world(frame, moves)
    expect(Math.hypot(got[1]!.x - want[1]!.x, got[1]!.y - want[1]!.y, got[1]!.z - want[1]!.z)).toBeGreaterThan(5)
  })
})

describe("what each control is told, and when the plane is cancelled", () => {
  const frame = frames[0]![1]
  const two = (): Program => makeProgram("setups", [
    op("a", "1", local()),
    op("b", "1", local()),
    op("c", "2", local()),
    op("d", "2", [{ _tag: "Rapid", to: { x: 0, y: 0, z: 10 } }, { _tag: "Linear", to: { x: 10, y: 0, z: 0 }, feed: 300 }, { _tag: "Rapid", to: { x: 10, y: 0, z: 10 } }])
  ])
  const sideFrame = frames[1]![1]
  const planes = { a: { frame, layout: "table-AC" as const }, b: { frame, layout: "table-AC" as const }, c: { frame: sideFrame, layout: "table-AC" as const } }
  const lines = (text: string) => text.trimEnd().split("\n").map((l) => l.replace(/^\d+ /, ""))
  const idx = (ls: ReadonlyArray<string>, re: RegExp, from = 0) => ls.findIndex((l, i) => i >= from && re.test(l))

  test("Fanuc: retract, G68.2 with Euler angles, G53.1; G69 and the axes home before the tool change and at the end", () => {
    const ls = lines(fanucPost.emit(two(), { workPlanes: planes }))
    const set = idx(ls, /^G68\.2 /)
    expect(set).toBeGreaterThan(-1)
    expect(ls[set]).toMatch(/^G68\.2 X12\.000 Y-7\.000 Z30\.000 I0\.0000 J45\.0000 K0\.0000$/)
    expect(ls[set - 2]).toBe("G91 G28 Z0")
    expect(ls[set - 1]).toBe("G90")
    expect(ls[set + 1]).toBe("G53.1")
    // Operations a and b share the plane and the tool: one G68.2 for both.
    expect(ls.filter((l) => /^G68\.2 /.test(l))).toHaveLength(2)
    const change = idx(ls, /^T2 M6$/)
    const cancel = idx(ls, /^G69$/)
    expect(cancel).toBeGreaterThan(set)
    expect(cancel).toBeLessThan(change)
    expect(ls[cancel + 1]).toBe("G0 A0.000 C0.000")
    // The second plane (side face) replaces the first one after the tool change; the operation d runs in the same plane as c.
    expect(ls.filter((l) => /^G68\.2 /.test(l))).toHaveLength(2)
    expect(ls.filter((l) => l === "G69")).toHaveLength(2)
    expect(ls.at(-3)).not.toBe("G69") // the last G69 comes before M5 / M30
    expect(idx(ls, /^G69$/, change)).toBeLessThan(idx(ls, /^M30$/))
    expect(ls.at(-1)).toBe("%")
  })

  test("Siemens: CYCLE800 with all 16 parameters, swivelled back and deselected at the end", () => {
    const ls = lines(siemensPost.emit(two(), { workPlanes: planes, swivel }))
    const set = ls.find((l) => /^CYCLE800\(1,"TABLE_AC",0,57,12\.000,-7\.000,30\.000,45\.0000,0\.0000,0\.0000,0,0,0,-1,100,1\)$/.test(l))
    expect(set).toBeDefined()
    for (const l of ls.filter((l) => l.startsWith("CYCLE800("))) if (l !== "CYCLE800()") expect(l.slice(9, -1).split(",")).toHaveLength(16)
    const back = idx(ls, /^CYCLE800\(1,"TABLE_AC",0,57,0\.000,0\.000,0\.000,0\.0000,0\.0000,0\.0000,0,0,0,-1,100,1\)$/)
    expect(back).toBeGreaterThan(-1)
    expect(ls[back + 1]).toBe("CYCLE800()")
    expect(back).toBeLessThan(idx(ls, /^T2 M6$/))
    expect(idx(ls, /^CYCLE800\(\)$/, idx(ls, /^T2 M6$/))).toBeLessThan(idx(ls, /^M30$/))
  })

  test("Siemens refuses a plane without the machine's swivel data record", () => {
    expect(() => siemensPost.emit(two(), { workPlanes: planes })).toThrow(/swivel\.dataRecord/)
  })

  test("Heidenhain: datum at the plane's origin, PLANE SPATIAL ... TURN, PLANE RESET and the datum back", () => {
    const ls = lines(heidenhainPost.emit(two(), { workPlanes: planes }))
    const set = idx(ls, /^PLANE SPATIAL /)
    expect(ls[set]).toBe("PLANE SPATIAL SPA+45.0000 SPB+0.0000 SPC+0.0000 TURN MB MAX FMAX")
    expect(ls.slice(set - 4, set)).toEqual(["CYCL DEF 7.0 DATUM SHIFT", "CYCL DEF 7.1 X+12.000", "CYCL DEF 7.2 Y-7.000", "CYCL DEF 7.3 Z+30.000"])
    const reset = idx(ls, /^PLANE RESET /)
    expect(ls[reset]).toBe("PLANE RESET TURN MB MAX FMAX")
    expect(ls.slice(reset + 1, reset + 5)).toEqual(["CYCL DEF 7.0 DATUM SHIFT", "CYCL DEF 7.1 X+0.000", "CYCL DEF 7.2 Y+0.000", "CYCL DEF 7.3 Z+0.000"])
    expect(reset).toBeLessThan(idx(ls, /^TOOL CALL 2 /))
  })

  test("a rotary solution is passed on: Siemens _DIR, Heidenhain SEQ", () => {
    const plus = { a: { frame, solution: 1 as const } }
    expect(siemensPost.emit(makeProgram("s", [op("a", "1", local())]), { workPlanes: plus, swivel })).toContain(",0,0,0,1,100,1)")
    expect(heidenhainPost.emit(makeProgram("s", [op("a", "1", local())]), { workPlanes: { a: { frame, solution: -1 as const } } })).toContain("TURN MB MAX FMAX SEQ-")
  })

  test("a frame that is the work offset itself writes no plane word", () => {
    const identity = frameFromNormal({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
    const text = fanucPost.emit(makeProgram("s", [op("a", "1", local())]), { workPlanes: { a: { frame: identity } } })
    expect(text).not.toMatch(/G68\.2|G53\.1|G69/)
  })

  test("a control without the words refuses instead of cutting in the wrong place", () => {
    for (const post of [grblPost, genericPost, haasPost, linuxcncPost, okumaPost, mazakPost]) {
      expect(() => post.emit(makeProgram("s", [op("a", "1", local())]), { workPlanes: { a: { frame } } })).toThrow(/no tilted-plane words/)
    }
  })

  test("a plane for a toolpath the program does not have, or on top of other frames, is refused", () => {
    expect(() => fanucPost.emit(makeProgram("s", [op("a", "1", local())]), { workPlanes: { typo: { frame } } })).toThrow(/does not have/)
    const indexed = op("a", "1", [{ _tag: "Orient", a: 30, c: 0 }, ...local()])
    expect(() => fanucPost.emit(makeProgram("s", [indexed]), { workPlanes: { a: { frame } } })).toThrow(/Orient/)
    const simultaneous = op("a", "1", [{ _tag: "Rapid", to: { x: 0, y: 0, z: 10 }, rotary: { a: 30, c: 0 } }])
    expect(() => fanucPost.emit(makeProgram("s", [simultaneous]), { workPlanes: { a: { frame } } })).toThrow(/rotary axes/)
  })

  test("a toolpath outside every plane stays in the work offset, between two tilted ones", () => {
    const mixed = makeProgram("m", [op("a", "1", local()), op("b", "1", local()), op("c", "1", local())])
    const text = fanucPost.emit(mixed, { workPlanes: { a: { frame }, c: { frame } } })
    const ls = lines(text)
    expect(ls.filter((l) => /^G68\.2 /.test(l))).toHaveLength(2)
    expect(ls.filter((l) => l === "G69")).toHaveLength(2)
    const tips = tipsOf(text, "milliseconds")
    const expected = [...world(frame, local()), ...local().flatMap((m) => (m._tag === "Rapid" || m._tag === "Linear" ? [m.to] : [])), ...world(frame, local())]
    expect(tips.length).toBeGreaterThanOrEqual(expected.length)
    for (const want of expected) expect(tips.some((p) => Math.hypot(p.x - want.x, p.y - want.y, p.z - want.z) <= TOL)).toBe(true)
  })
})
