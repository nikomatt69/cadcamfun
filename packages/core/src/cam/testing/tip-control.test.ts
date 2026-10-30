/**
 * The replay of a program written under the control's tool-centre-point mode (spec 72 step 0.2).
 *
 * Truth is independent of the code under test: the planned tip path is written here in machine coordinates with rotation matrices of
 * this file (not `partToMachine`), the posts write the program under their own word, and the replay must bring every motion back onto
 * that path. Declared tolerance: the post splits turning moves at 0.01 mm and the numbers are written to 0.001 mm / 0.001 deg, so a
 * carried point lies within 0.02 mm of the planned machine-axis line.
 */
import { describe, expect, test } from "bun:test"
import { fiveAxisKinematic } from "../five-axis.ts"
import { makeProgram, type Program, type Toolpath } from "../ir.ts"
import { fanucPost, haasPost, heidenhainPost, mazakPost, siemensPost, type Post } from "../post/index.ts"
import { interpretGcode, type GSegment } from "./gcode-interpreter.ts"
import { carryTipControl, machineToTip } from "./tip-control.ts"

type V = { x: number; y: number; z: number }
const RAD = Math.PI / 180
const TOL = 0.02

// Table AC: machine = Rx(A) Rz(C) (part - pivot) + pivot, written from the definition (see `five-axis.ts`), not imported.
const pivot: V = { x: 50, y: 20, z: -30 }
const rx = (d: number) => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [[1, 0, 0], [0, c, -s], [0, s, c]] }
const rz = (d: number) => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [[c, -s, 0], [s, c, 0], [0, 0, 1]] }
const mm = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!))
const apply = (m: number[][], p: V): V => ({ x: m[0]![0]! * p.x + m[0]![1]! * p.y + m[0]![2]! * p.z, y: m[1]![0]! * p.x + m[1]![1]! * p.y + m[1]![2]! * p.z, z: m[2]![0]! * p.x + m[2]![1]! * p.y + m[2]![2]! * p.z })
const toMachine = (p: V, a: number, c: number): V => { const r = apply(mm(rx(a), rz(c)), { x: p.x - pivot.x, y: p.y - pivot.y, z: p.z - pivot.z }); return { x: r.x + pivot.x, y: r.y + pivot.y, z: r.z + pivot.z } }
const dist = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
const distToSegment = (p: V, a: V, b: V): number => {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1)))
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t })
}
const distToPolyline = (p: V, line: ReadonlyArray<V>): number => Math.min(...line.slice(1).map((q, i) => distToSegment(p, line[i]!, q)))

const kin = fiveAxisKinematic({ layout: "table-AC", pivot, limits: { tilt: [-120, 120] }, tcp: "program" })

/** The planned path in machine coordinates, as a program-frame generator writes it: approach at zero, a sweep that tilts and turns, a cut and a return. */
const planned = [
  { tip: { x: 0, y: 0, z: 40 }, a: 0, c: 0, rapid: true }, { tip: { x: 0, y: 0, z: 0 }, a: 0, c: 0, rapid: false },
  { tip: { x: 60, y: 10, z: 0 }, a: 40, c: 90, rapid: false }, { tip: { x: 60, y: 40, z: -5 }, a: 40, c: 90, rapid: false },
  { tip: { x: 30, y: 40, z: -5 }, a: 10, c: 20, rapid: false }, { tip: { x: 30, y: 40, z: 30 }, a: 0, c: 0, rapid: false }
].map((p) => ({ ...p, machine: toMachine(p.tip, p.a, p.c) }))
const machinePath = planned.map((p) => p.machine)
const moves: Toolpath["moves"] = planned.map((p) => p.rapid
  ? { _tag: "Rapid" as const, to: p.machine, rotary: { a: p.a, c: p.c } }
  : { _tag: "Linear" as const, to: p.machine, feed: 800, rotary: { a: p.a, c: p.c } })
const program: Program = makeProgram("Five axis", [{ id: "t", name: "t", toolId: "6", spindleRpm: 8100, coolant: "off", moves }], { metadata: { programNumber: "1234" } })

const words: ReadonlyArray<readonly [string, Post, RegExp]> = [
  ["fanuc", fanucPost, /^G43\.4 H6$/m], ["mazak", mazakPost, /^G43\.4 H6$/m], ["haas", haasPost, /^G234 H6$/m],
  ["siemens", siemensPost, /^TRAORI$/m], ["heidenhain", heidenhainPost, /M128/]
]
type Motion = Exclude<GSegment, { kind: "dwell" }>
const motionsOf = (segs: ReadonlyArray<GSegment>): Motion[] => segs.filter((s): s is Motion => s.kind !== "dwell")
const feedOf = (segs: ReadonlyArray<GSegment>) => segs.filter((s): s is Extract<GSegment, { kind: "linear" }> => s.kind === "linear")

describe("the interpreter tracks the tip-control word each post writes", () => {
  for (const [id, post, word] of words) {
    test(`${id}: the motions between the on and the off word are marked, the others are not`, () => {
      const nc = post.emit(program, { kinematics: kin, tcp: true })
      expect(nc).toMatch(word)
      const r = interpretGcode(nc)
      expect(r.errors).toEqual([])
      const motions = motionsOf(r.segments)
      expect(r.tipControlSegments).toBeGreaterThan(10)
      expect(motions.filter((s) => s.tcp === true).length).toBe(r.tipControlSegments)
      // Every motion that carries the table angles is marked; the retract after the section (no angles written) is not.
      expect(motions.at(-1)!.tcp === true).toBe(false)
      expect(motions.some((s) => s.tcp === true && s.kind === "linear")).toBe(true)
    })

    test(`${id}: without the word (tcp false) nothing is marked`, () => {
      const nc = post.emit(program, { kinematics: kin, tcp: false })
      expect(nc).not.toMatch(/G43\.4|G234|TRAORI|M128/)
      expect(interpretGcode(nc).tipControlSegments).toBe(0)
    })
  }

  test("cancel words: G43, G49 and TRAFOOF end the mode; M129 ends it after its own block; TRAORI(n) starts it", () => {
    const marks = (text: string) => interpretGcode(text).segments.map((s) => s.kind !== "dwell" && s.tcp === true)
    expect(marks("G43.4 H1\nG1 X1 F100\nG43 H1\nG1 X2 F100")).toEqual([true, false])
    expect(marks("G234 H1\nG1 X1 F100\nG49\nG1 X2 F100")).toEqual([true, false])
    expect(marks("TRAORI(2)\nG1 X1 F100\nTRAFOOF\nG1 X2 F100")).toEqual([true, false])
    expect(marks("G1 X1 F100\nM128\nG1 X2\nG1 X3 M129\nG1 X4")).toEqual([false, true, true, false])
    expect(marks("0 BEGIN PGM T MM\n1 L X+1 R0 F100\n2 FUNCTION TCPM F TCP AXIS POS PATHCTRL AXIS\n3 L X+2 R0\n4 FUNCTION RESET TCPM\n5 L X+3 R0\n6 END PGM T MM")).toEqual([false, true, false])
  })

  test("a definition's own blocks are read through tipControl", () => {
    const text = "G1 X1 F100\nMY TCP ON\nG1 X2\nMY TCP OFF\nG1 X3"
    expect(interpretGcode(text).tipControlSegments).toBe(0)
    const r = interpretGcode(text, { tipControl: { on: ["my tcp  on"], off: ["MY TCP OFF"] } })
    expect(r.segments.map((s) => s.kind !== "dwell" && s.tcp === true)).toEqual([false, true, false])
  })
})

describe("carryTipControl brings the tip back to machine coordinates", () => {
  for (const [id, post] of words) {
    test(`${id}: every carried point is on the planned machine-axis line, and every planned vertex is reached`, () => {
      const r = interpretGcode(post.emit(program, { kinematics: kin, tcp: true }))
      const carried = carryTipControl(r.segments, { layout: "table-AC", pivot })
      expect(carried.carried).toBe(r.tipControlSegments)
      expect(carried.unconverged).toBe(0)
      expect(carried.segments.every((s) => s.kind === "dwell" || s.tcp !== true)).toBe(true)
      // The posts' own retract after the section (to the clearance plane) is not on the planned path: only the section is compared.
      const lastTcpLine = Math.max(...r.segments.filter((s) => s.kind !== "dwell" && s.tcp === true).map((s) => s.line))
      const motions = carried.segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind !== "dwell" && s.line <= lastTcpLine)
      // Haas feeds its rapid that turns the table along the tip (the post cannot keep the tip on a rapid): that move is a curve in the machine
      // axes, not the planned line. Everything else follows the planned line within the declared tolerance.
      const onLine = motions.filter((s) => id !== "haas" || (s.kind === "linear" && s.feed !== 5000))
      const worst = Math.max(...onLine.map((s) => distToPolyline(s.to, machinePath)))
      expect(worst).toBeLessThan(TOL)
      for (const p of machinePath) expect(Math.min(...motions.map((s) => dist(s.to, p)))).toBeLessThan(0.002 * 3)
    })

    test(`${id}: round trip, the carried end of every motion taken back to the part is the tip position the NC wrote`, () => {
      const r = interpretGcode(post.emit(program, { kinematics: kin, tcp: true }))
      const carried = carryTipControl(r.segments, { layout: "table-AC", pivot })
      const marked = r.segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind !== "dwell" && s.tcp === true)
      expect(marked.length).toBeGreaterThan(10)
      for (const raw of marked) {
        const pieces = carried.segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind !== "dwell" && s.line === raw.line)
        const end = pieces.at(-1)!
        expect(carried.interior.has(end)).toBe(false)
        const h = raw.kind === "arc" ? {} : { a: raw.rotary?.a ?? 0, c: raw.rotary?.c ?? 0 }
        expect(dist(machineToTip(end.to, h, { layout: "table-AC", pivot }), raw.to)).toBeLessThan(1e-6)
      }
    })
  }

  test("a wrong pivot is detected: the carried points leave the planned line by far", () => {
    const r = interpretGcode(fanucPost.emit(program, { kinematics: kin, tcp: true }))
    const right = carryTipControl(r.segments, { layout: "table-AC", pivot })
    const wrong = carryTipControl(r.segments, { layout: "table-AC", pivot: { x: pivot.x, y: pivot.y, z: pivot.z + 5 } })
    const lastTcpLine = Math.max(...r.segments.filter((s) => s.kind !== "dwell" && s.tcp === true).map((s) => s.line))
    const dev = (c: ReturnType<typeof carryTipControl>) => Math.max(...c.segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind !== "dwell" && s.line <= lastTcpLine).map((s) => distToPolyline(s.to, machinePath)))
    expect(dev(right)).toBeLessThan(TOL)
    expect(dev(wrong)).toBeGreaterThan(1)
    // And the wrong layout: the same words read for a B/C table do not land on the path either.
    const bc = carryTipControl(r.segments, { layout: "table-BC", pivot })
    expect(dev(bc)).toBeGreaterThan(1)
  })

  test("a program without a tip-control word is returned as it is", () => {
    const r = interpretGcode("G0 X0 Y0 Z10\nG1 Z0 F100\nG1 X10 A20 C30")
    const c = carryTipControl(r.segments, { layout: "table-AC", pivot })
    expect(c.segments).toBe(r.segments)
    expect(c.carried).toBe(0)
  })

  test("a motion that keeps the angles maps rigidly: it is not split, and a line stays a line", () => {
    const r = interpretGcode("G43.4 H1\nG0 X0 Y0 Z10 A30 C45\nG1 X20 Y5 Z0 F100\nG1 X40 Y5 Z0")
    const c = carryTipControl(r.segments, { layout: "table-AC", pivot })
    // The first motion turns the table (split), the next two keep A30 C45 (one piece each).
    const pieces = motionsOf(c.segments).filter((s) => s.line === 3 || s.line === 4)
    expect(pieces.length).toBe(2)
    expect(dist(pieces[0]!.to, toMachine({ x: 20, y: 5, z: 0 }, 30, 45))).toBeLessThan(1e-9)
  })

  test("after the mode is cancelled the next motion starts where the carried one ended", () => {
    const r = interpretGcode("G43.4 H1\nG1 X10 Y0 Z0 A30 C0 F100\nG1 X10 Y0 Z0 A0\nG43 H1\nG1 X20 F100")
    const c = carryTipControl(r.segments, { layout: "table-AC", pivot })
    const motions = c.segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind !== "dwell")
    const [first, second] = [motions.at(-2)!, motions.at(-1)!]
    expect(dist(second.from, first.to)).toBeLessThan(1e-9)
    // The second motion is a machine-axis word as written; with the table back at zero the tip and the machine agree.
    expect(dist(second.to, { x: 20, y: 0, z: 0 })).toBeLessThan(1e-6)
    expect(c.cancelledTilted).toBe(0)
  })

  test("a cancel while the table stands tilted is counted: the axes the next block does not write are not known", () => {
    const c = carryTipControl(interpretGcode("G43.4 H1\nG1 X10 Y0 Z0 A30 C0 F100\nG43 H1\nG1 X20 F100").segments, { layout: "table-AC", pivot })
    expect(c.cancelledTilted).toBe(1)
  })

  test("an arc with the table tilted is replayed as chords within the tolerance, and counted", () => {
    const r = interpretGcode("G43.4 H1\nG0 X10 Y0 Z0 A30 C0\nG3 X0 Y10 I-10 J0 F100")
    const c = carryTipControl(r.segments, { layout: "table-AC", pivot }, { tolerance: 0.01 })
    expect(c.arcsLinearised).toBe(1)
    expect(c.segments.some((s) => s.kind === "arc")).toBe(false)
    const end = motionsOf(c.segments).at(-1)!
    expect(dist(end.to, toMachine({ x: 0, y: 10, z: 0 }, 30, 0))).toBeLessThan(1e-6)
    // At zero angles the arc is the same in both frames and stays an arc.
    const flat = carryTipControl(interpretGcode("G43.4 H1\nG0 X10 Y0 Z0\nG3 X0 Y10 I-10 J0 F100").segments, { layout: "table-AC", pivot })
    expect(flat.segments.some((s) => s.kind === "arc")).toBe(true)
  })

  test("a bad tolerance is refused", () => {
    const r = interpretGcode("G43.4 H1\nG1 X1 F100")
    expect(() => carryTipControl(r.segments, { layout: "table-AC", pivot }, { tolerance: 0 })).toThrow(RangeError)
  })
})
