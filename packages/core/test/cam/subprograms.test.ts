import { describe, expect, test } from "bun:test"
import { makeProgram, type Move, type Program, type Toolpath } from "../../src/cam/ir.ts"
import { fanucPost, genericPost, grblPost, haasPost, heidenhainPost, type PostOptions } from "../../src/cam/post/index.ts"
import { isTranslation, planSubprograms } from "../../src/cam/post/subprograms.ts"
import { interpretGcode, type GSegment } from "../../src/cam/testing/gcode-interpreter.ts"

const MM_PER_INCH = 25.4

/** A counterbore-like path at (ox, oy): positioning, a plunge, a helical circle, `laps` squares, an arc and a retract. */
const pocket = (id: string, toolId: string, ox: number, oy: number, radius = 3, laps = 2): Toolpath => {
  const at = (x: number, y: number, z: number) => ({ x: ox + x, y: oy + y, z })
  const lap = Array.from({ length: laps }, (_, k): Move[] => {
    const z = -2 - 0.5 * (k + 1)
    return [
      { _tag: "Linear", to: at(2, 4, z), feed: 900 }, { _tag: "Linear", to: at(2, 2, z), feed: 900 },
      { _tag: "Linear", to: at(0, 2, z), feed: 900 }, { _tag: "Linear", to: at(0, 4, z), feed: 900 }
    ]
  }).flat()
  const moves: Move[] = [
    { _tag: "Comment", text: `pocket at ${ox}, ${oy}` },
    { _tag: "Rapid", to: at(radius, 0, 5) },
    { _tag: "Rapid", to: at(radius, 0, 1) },
    { _tag: "Linear", to: at(radius, 0, 0), feed: 300 },
    { _tag: "Arc", to: at(radius, 0, -1), center: { x: ox, y: oy }, clockwise: false, feed: 900 },
    { _tag: "Arc", to: at(radius, 0, -2), center: { x: ox, y: oy }, clockwise: false, feed: 900 },
    { _tag: "Linear", to: at(0, 0, -2), feed: 900 },
    { _tag: "Linear", to: at(0, 4, -2), feed: 900 },
    ...lap,
    { _tag: "Arc", to: at(4, 0, -2 - 0.5 * laps), center: { x: ox, y: oy }, clockwise: true, feed: 900 },
    { _tag: "Dwell", seconds: 0.2 },
    { _tag: "Rapid", to: at(4, 0, 5) }
  ]
  return { id, name: `Pocket ${id}`, toolId, spindleRpm: 8000, coolant: "flood", moves }
}
type Origins = ReadonlyArray<readonly [number, number]>
/** On the 1 µm output grid: whole multiples of a micron apart. */
const gridMm: Origins = [[10.001, 20.002], [50.123, 20.002], [10.001, 60.987], [50.123, 60.987]]
/** On the 0.001 in output grid, in mm. */
const gridInch: Origins = [[0.4, 0.8], [2.0, 0.8], [0.4, 2.4], [2.0, 2.4]].map(([x, y]) => [x! * MM_PER_INCH, y! * MM_PER_INCH] as const)
/** Anywhere: the translations are not whole microns. */
const freeMm: Origins = [[10.0004, 20.0007], [50.1234, 20.0007], [10.0004, 60.9876], [50.1234, 60.9876]]
const holes = (origins: Origins, units: "mm" | "inch" = "mm"): Program => makeProgram("holes", origins.map(([x, y], i) => pocket(`p${i}`, "t1", x, y)), { units, workOffset: "G54" })

const sub: Partial<PostOptions> = { subprograms: true }
const lines = (text: string) => text.trimEnd().split("\n")
const shape = (segments: ReadonlyArray<GSegment>) => segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind !== "dwell")

describe("subprograms from repeated toolpaths", () => {
  test("off by default: the text is the one every earlier build wrote", () => {
    const p = holes(gridMm)
    expect(fanucPost.emit(p)).toBe(fanucPost.emit(p, { subprograms: false }))
    expect(fanucPost.emit(p)).not.toContain("M98")
  })

  test("four copies become one O-program and four calls, after M30 and before the closing %", () => {
    const text = fanucPost.emit(holes(gridMm), sub)
    const l = lines(text)
    expect(l.filter((x) => /^M98 P1001$/.test(x))).toHaveLength(4)
    expect(l.filter((x) => x === "O1001")).toHaveLength(1)
    expect(l.indexOf("O1001")).toBeGreaterThan(l.indexOf("M30"))
    expect(l.at(-1)).toBe("%")
    const body = l.slice(l.indexOf("O1001"), l.length - 1)
    expect(body[1]).toBe("G91")
    expect(body.at(-2)).toBe("G90")
    expect(body.at(-1)).toBe("M99")
    expect(l.length).toBeLessThan(lines(fanucPost.emit(holes(gridMm))).length * 0.65)
    expect(text).toContain("(SUBPROGRAM O1001: POCKET P0 X4)")
  })

  test("on the output grid the replay of the text with subprograms is the replay of the text without them, exactly", () => {
    for (const post of [fanucPost, haasPost]) {
      for (const arcMode of ["ijk", "radius"] as const) {
        for (const [units, origins] of [["mm", gridMm], ["inch", gridInch]] as const) {
          const p = holes(origins, units)
          const flat = interpretGcode(post.emit(p, { arcMode }), { dwell: "milliseconds" })
          const withSub = interpretGcode(post.emit(p, { arcMode, ...sub }), { dwell: "milliseconds" })
          const tag = `${post.id} ${arcMode} ${units}`
          expect(withSub.errors, tag).toEqual([])
          expect(flat.errors, tag).toEqual([])
          expect(post.emit(p, { arcMode, ...sub }), tag).toContain("M98 P1001")
          const a = shape(flat.segments), b = shape(withSub.segments)
          expect(b.length, tag).toBe(a.length)
          for (let i = 0; i < a.length; i++) {
            expect(a[i]!.kind, tag).toBe(b[i]!.kind)
            for (const axis of ["x", "y", "z"] as const) {
              expect(Math.abs(a[i]!.to[axis] - b[i]!.to[axis]), `${tag} ${i} ${axis}`).toBeLessThan(1e-6)
              expect(Math.abs(a[i]!.from[axis] - b[i]!.from[axis]), `${tag} ${i} ${axis}`).toBeLessThan(1e-6)
            }
            expect(a[i]!.feed, tag).toBeCloseTo(b[i]!.feed, 6)
          }
          expect(withSub.cutLength, tag).toBeCloseTo(flat.cutLength, 4)
          expect(withSub.ended, tag).toBe(true)
        }
      }
    }
  })

  test("anywhere else in metric a copy is within a micron and a half of its own text", () => {
    const p = holes(freeMm)
    const flat = interpretGcode(fanucPost.emit(p), { dwell: "milliseconds" })
    const text = fanucPost.emit(p, sub)
    expect(text).toContain("M98 P1001")
    const withSub = interpretGcode(text, { dwell: "milliseconds" })
    expect(withSub.errors).toEqual([])
    const a = shape(flat.segments), b = shape(withSub.segments)
    // The end-of-program rapid may add one block that corrects the last micron.
    expect(b.length - a.length).toBeLessThanOrEqual(1)
    for (let i = 0; i < a.length; i++) {
      for (const axis of ["x", "y", "z"] as const) expect(Math.abs(a[i]!.to[axis] - b[i]!.to[axis])).toBeLessThan(0.0016)
    }
  })

  test("in inches a translation that is not a whole number of steps is not shared, so no copy is ever 25 µm off", () => {
    const p = holes(freeMm, "inch")
    expect(fanucPost.emit(p, sub)).not.toContain("M98")
    expect(fanucPost.emit(p, sub)).toBe(fanucPost.emit(p))
  })

  test("the replay maps each motion to the call in the main program, so the operation and the tool stay right", () => {
    const text = fanucPost.emit(holes(gridMm), sub)
    const r = interpretGcode(text, { dwell: "milliseconds" })
    const rows = text.split("\n")
    const callLines = rows.flatMap((x, i) => (x === "M98 P1001" ? [i + 1] : []))
    const insideSub = r.segments.filter((s) => "subLine" in s)
    expect(insideSub.length).toBeGreaterThan(0)
    expect(new Set(insideSub.map((s) => s.line))).toEqual(new Set(callLines))
    for (const s of insideSub) expect((s as { subLine: number }).subLine).toBeGreaterThan(rows.indexOf("M30") + 1)
  })

  test("N numbers carry on through the subprogram without a repeat", () => {
    const text = fanucPost.emit(holes(gridMm), { ...sub, lineNumbers: { start: 10, step: 10 } })
    const numbers = lines(text).flatMap((x) => { const m = /^N(\d+) /.exec(x); return m === null ? [] : [Number(m[1])] })
    expect(new Set(numbers).size).toBe(numbers.length)
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers)
    expect(interpretGcode(text, { dwell: "milliseconds" }).errors).toEqual([])
  })

  test("a control without subprograms, or a dialect that has none, ignores the option", () => {
    const p = holes(gridMm)
    expect(genericPost.emit(p, sub)).toBe(genericPost.emit(p))
    expect(grblPost.emit(p, sub)).toBe(grblPost.emit(p))
  })

  test("what is not the same motion is not shared", () => {
    const a = pocket("a", "t1", 0, 0), bigger = pocket("b", "t1", 40, 0, 3.5), c = pocket("c", "t1", 80, 0)
    const p = makeProgram("mixed", [a, bigger, c], { units: "mm", workOffset: "G54" })
    const plan = planSubprograms(p, 1001, 9999)
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]!.members).toEqual([0, 2])
    expect(plan.callOf.has(1)).toBe(false)
    // A different feed breaks it too.
    const slower: Toolpath = { ...c, moves: c.moves.map((m) => (m._tag === "Linear" ? { ...m, feed: m.feed + 1 } : m)) }
    expect(planSubprograms(makeProgram("f", [a, slower], { units: "mm", workOffset: "G54" }), 1001, 9999).groups).toHaveLength(0)
  })

  test("a body too short to pay for its own overhead is left as it is", () => {
    const tiny = (id: string, x: number): Toolpath => pocket(id, "t1", x, 0, 3, 0)
    expect(planSubprograms(makeProgram("t", [tiny("a", 0), tiny("b", 30)], { units: "mm", workOffset: "G54" }), 1001, 9999).groups).toHaveLength(0)
    expect(planSubprograms(makeProgram("t", [tiny("a", 0), tiny("b", 30), tiny("c", 60)], { units: "mm", workOffset: "G54" }), 1001, 9999).groups).toHaveLength(1)
  })

  test("a toolpath with a canned cycle or a rotary word is never a candidate", () => {
    const drill = (id: string, x: number): Toolpath => ({
      id, name: id, toolId: "t2", spindleRpm: 1000, coolant: "off",
      moves: [
        { _tag: "Rapid", to: { x, y: 0, z: 5 } },
        ...Array.from({ length: 8 }, (_, i): Move => ({ _tag: "Cycle", cycle: "drill", to: { x: x + i * 5, y: 0, z: -5 }, retractHeight: 2, feed: 100, peckDepth: 0, dwellSeconds: 0 }))
      ]
    })
    expect(planSubprograms(makeProgram("d", [drill("a", 0), drill("b", 100)], { units: "mm", workOffset: "G54" }), 1001, 9999).groups).toHaveLength(0)
    const turned = (id: string, x: number): Toolpath => ({ ...pocket(id, "t1", x, 0), moves: pocket(id, "t1", x, 0).moves.map((m) => (m._tag === "Linear" ? { ...m, rotary: { a: 10 } } : m)) })
    expect(planSubprograms(makeProgram("r", [turned("a", 0), turned("b", 50)], { units: "mm", workOffset: "G54" }), 1001, 9999).groups).toHaveLength(0)
  })

  test("two groups take consecutive numbers, and the limit of the control is respected", () => {
    const p = makeProgram("two", [pocket("a", "t1", 0, 0), pocket("b", "t1", 30, 0), pocket("c", "t1", 0, 30, 4), pocket("d", "t1", 30, 30, 4)], { units: "mm", workOffset: "G54" })
    const plan = planSubprograms(p, 1001, 9999)
    expect(plan.groups.map((g) => g.number)).toEqual([1001, 1002])
    expect(planSubprograms(p, 1001, 1001).groups.map((g) => g.number)).toEqual([1001])
    const text = fanucPost.emit(p, sub)
    expect(lines(text).filter((x) => /^O100[12]$/.test(x))).toEqual(["O1001", "O1002"])
    const flat = interpretGcode(fanucPost.emit(p), { dwell: "milliseconds" }), subbed = interpretGcode(text, { dwell: "milliseconds" })
    expect(subbed.errors).toEqual([])
    expect(subbed.cutLength).toBeCloseTo(flat.cutLength, 3)
  })

  test("the main program number moves the numbers of the subprograms", () => {
    const p = makeProgram("n", gridMm.map(([x, y], i) => pocket(`p${i}`, "t1", x, y)), { units: "mm", workOffset: "G54", metadata: { programNumber: "2500" } })
    expect(lines(fanucPost.emit(p, sub))).toContain("O2501")
  })

  test("copies under different tools keep their own tool change; the call sits in each operation", () => {
    const p = makeProgram("tools", [pocket("a", "t1", 0, 0), pocket("b", "t2", 40, 0), pocket("c", "t1", 80, 0)], { units: "mm", workOffset: "G54" })
    const text = fanucPost.emit(p, sub)
    const l = lines(text)
    expect(l.filter((x) => /^T\d M6$/.test(x))).toEqual(["T1 M6", "T2 M6", "T1 M6"])
    const r = interpretGcode(text, { dwell: "milliseconds" })
    expect(r.errors).toEqual([])
    expect(r.tools).toEqual([1, 2, 1])
    expect(interpretGcode(fanucPost.emit(p), { dwell: "milliseconds" }).cutLength).toBeCloseTo(r.cutLength, 4)
  })

  test("isTranslation is symmetric and tolerant of float noise only", () => {
    const c = (t: Toolpath) => ({ head: 1, origin: (t.moves[1] as { to: { x: number; y: number; z: number } }).to, body: t.moves.slice(2) })
    const a = c(pocket("a", "t", 0, 0)), b = c(pocket("b", "t", 12.3456789, 7.7654321)), d = c(pocket("d", "t", 5, 5, 3.001))
    expect(isTranslation(a, b)).toBe(true)
    expect(isTranslation(b, a)).toBe(true)
    expect(isTranslation(a, d)).toBe(false)
    // Output steps of 0.0254 mm: 12.3456789 mm is not a whole number of them.
    expect(isTranslation(a, b, 0.0254)).toBe(false)
    expect(isTranslation(a, c(pocket("e", "t", 25.4, 2.54)), 0.0254)).toBe(true)
  })
})

/** One step of a Klartext program as the control runs it: where the tool goes, at rapid or at which feed. */
interface KlartextStep { readonly x: number; readonly y: number; readonly z: number; readonly rapid: boolean; readonly feed: number | undefined }

/**
 * Runs the `L` blocks of a Klartext program: absolute and incremental (`IX`) axes, `R0 FMAX` / `F`, `CALL LBL n` jumping to
 * `LBL n` and back at `LBL 0`, the main program ending at the block that carries `M30`. Enough of the control to compare two
 * texts' motion.
 */
const runKlartext = (text: string): KlartextStep[] => {
  const blocks = lines(text).map((l) => l.replace(/^\d+ /, ""))
  const labels = new Map<number, number>()
  blocks.forEach((b, i) => { const m = /^LBL (\d+)$/.exec(b); if (m && m[1] !== "0") labels.set(Number(m[1]), i) })
  const steps: KlartextStep[] = []
  const at = { x: 0, y: 0, z: 0 }
  let feed: number | undefined
  const run = (from: number, inLabel: boolean): void => {
    for (let i = from; i < blocks.length; i++) {
      const b = blocks[i]!
      if (inLabel && b === "LBL 0") return
      if (!inLabel && b.startsWith("END PGM")) return
      const call = /^CALL LBL (\d+)$/.exec(b)
      if (call) { run(labels.get(Number(call[1]))! + 1, true); continue }
      // A `C` arc is a step to its end point (its centre, `CC`, does not move the tool).
      if (!b.startsWith("L ") && !b.startsWith("C ")) continue
      for (const w of b.matchAll(/(I?)([XYZ])([+-][\d.]+)/g)) {
        const axis = w[2]!.toLowerCase() as "x" | "y" | "z"
        at[axis] = w[1] === "I" ? at[axis] + Number(w[3]) : Number(w[3])
      }
      const f = /\bF(\d+(?:\.\d*)?)/.exec(b)
      if (f) feed = Number(f[1])
      const step = { ...at, rapid: b.includes("FMAX"), feed: b.includes("FMAX") ? undefined : feed }
      // A block that carries only M functions at the current position (Klartext has no M block of its own) is no step.
      const last = steps[steps.length - 1]
      if (last === undefined || last.x !== step.x || last.y !== step.y || last.z !== step.z || last.rapid !== step.rapid) steps.push(step)
      if (!inLabel && /\bM30\b/.test(b)) return
    }
  }
  run(0, false)
  return steps
}

const expectSameMotion = (a: ReadonlyArray<KlartextStep>, b: ReadonlyArray<KlartextStep>) => {
  expect(a.length).toBe(b.length)
  a.forEach((s, i) => {
    const t = b[i]!
    expect({ i, rapid: s.rapid, feed: s.feed }).toEqual({ i, rapid: t.rapid, feed: t.feed })
    expect(Math.hypot(s.x - t.x, s.y - t.y, s.z - t.z)).toBeLessThan(2e-3)
  })
}

describe("Klartext label subprograms", () => {
  test("four copies become one label body after M30, called four times, and the control runs the same motion", () => {
    const p = holes(gridMm)
    const text = heidenhainPost.emit(p, sub)
    const l = lines(text).map((x) => x.replace(/^\d+ /, ""))
    expect(l.filter((x) => x === "CALL LBL 1")).toHaveLength(4)
    expect(l.filter((x) => x === "LBL 1")).toHaveLength(1)
    // M30 ends the main program on its last positioning block; the label bodies follow it.
    expect(l.indexOf("LBL 1")).toBeGreaterThan(l.findIndex((x) => /^L .*\bM30\b/.test(x)))
    expect(l.indexOf("LBL 0")).toBeLessThan(l.findIndex((x) => x.startsWith("END PGM")))
    // The body is incremental, so one text serves every copy; nothing of the ISO subprogram syntax is left.
    const body = l.slice(l.indexOf("LBL 1") + 1, l.indexOf("LBL 0"))
    expect(body.some((x) => /^L .*\bI[XYZ][+-]/.test(x))).toBe(true)
    expect(body.every((x) => !/(?:^|\s)[XYZ][+-]/.test(x))).toBe(true)
    expect(text).not.toMatch(/M98|M99|G91|\bO\d/)
    expect(text.length).toBeLessThan(heidenhainPost.emit(p).length)
    expectSameMotion(runKlartext(text), runKlartext(heidenhainPost.emit(p)))
  })

  test("a move after a call keeps the body's feed mode: the writer omits the G1 the body left active", () => {
    // Copies that end on a feed move, then a finishing pass whose first move is a feed move: after the last call the shared
    // writer writes it without G1, and the post must not read it as the rapid of the positioning before the call.
    const copy = (id: string, ox: number, oy: number): Toolpath => {
      const t = pocket(id, "t1", ox, oy)
      return { ...t, moves: t.moves.slice(0, -2) }
    }
    const finish: Toolpath = { id: "finish", name: "Finish", toolId: "t1", spindleRpm: 8000, coolant: "flood", moves: [
      { _tag: "Linear", to: { x: 80, y: 80, z: -3 }, feed: 900 }, { _tag: "Linear", to: { x: 90, y: 80, z: -3 }, feed: 900 }, { _tag: "Rapid", to: { x: 90, y: 80, z: 5 } }
    ] }
    const p = makeProgram("ends-cutting", [...gridMm.map(([x, y], i) => copy(`c${i}`, x, y)), finish], { units: "mm", workOffset: "G54" })
    const text = heidenhainPost.emit(p, sub)
    expect(text).toContain("CALL LBL 1")
    const l = lines(text).map((x) => x.replace(/^\d+ /, ""))
    expect(l.slice(l.lastIndexOf("CALL LBL 1") + 1).find((x) => x.startsWith("L "))).toMatch(/^L X\+80(?:\.0+)? Y\+80(?:\.0+)?(?: Z-3(?:\.0+)?)? R0$/)
    expectSameMotion(runKlartext(text), runKlartext(heidenhainPost.emit(p)))
  })

  test("without the option the Klartext text is unchanged", () => {
    const p = holes(gridMm)
    expect(heidenhainPost.emit(p, { subprograms: false })).toBe(heidenhainPost.emit(p))
    expect(heidenhainPost.emit(p)).not.toContain("LBL")
  })
})
