/**
 * Spec 32 P3: what each move is for, the operations of a program on the clock, and an imported program split at its tool
 * changes with each tool read from the post's header.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"

const v = cam.viewer
const timelineOf = (gcode: string) => { const a = cam.generator.analyseGcode(gcode); return { a, timeline: v.buildTimeline(a.program, a.motion) } }

describe("move classes", () => {
  test("rapid, plunge, ramp, lead-in, cut, lead-out, retract and link on a milling program", () => {
    const { timeline } = timelineOf([
      "G21 G90 G17", "S9000 M3", "G0 X5 Y0 Z5", // rapid (from the origin, across and up)
      "G1 Z0 F300",                             // plunge (still above the stock top 0? no: ends at 0)
      "G1 X10 Z-2 F300",                        // ramp
      "G3 X15 Y5 I0 J5 F600",                   // lead-in (an arc after the descent, before a cut)
      "G1 X40",                                 // cut
      "G3 X45 Y10 I0 J5",                       // lead-out (an arc after the cut, before the way up)
      "G1 Z5",                                  // retract at feed
      "G1 X60 F2000",                           // link (feed above the stock)
      "G0 Z20",                                 // retract
      "M30"
    ].join("\n"))
    expect(v.classifyMoves(timeline, { stockTop: 0 })).toEqual(["rapid", "plunge", "ramp", "lead-in", "cut", "lead-out", "retract", "link", "retract"])
  })

  test("canned cycle strokes are cycles; dwells and probe moves have their own class", () => {
    const gcode = "G21 G90\nS2000 M3\nG0 X0 Y0 Z5\nG81 X0 Y0 Z-10 R2 F100\nX10\nG80\nG4 P1\nM30"
    const { timeline } = timelineOf(gcode)
    const classes = v.classifyMoves(timeline, { cycleLines: v.cycleLinesOf(gcode) })
    expect(classes.filter((c) => c === "cycle").length).toBe(2)
    expect(classes).toContain("dwell")
    expect([...v.cycleLinesOf(gcode)]).toEqual([4, 5])
    const probe = timelineOf("G21 G90\nG0 X0 Y0 Z10\nG38.2 Z-10 F50\nM30").timeline
    expect(v.classifyMoves(probe)).toContain("probe")
  })

  test("a lathe's feeds are cuts and its 45° pull-off a retract; a printer's moves are travel or deposit", () => {
    const lathe = timelineOf("G21 G18 G90\nT0101\nS800 M3\nG0 X52 Z2\nG71 U2 R0.5\nG71 P10 Q20 U0.4 W0.1 F100\nN10 G0 X20\nG1 Z-20\nN20 X52\nM30").timeline
    const classes = v.classifyMoves(lathe, { kind: "lathe" })
    expect(new Set(classes)).toEqual(new Set(["rapid", "cut", "retract"]))
    const printer = timelineOf("G21 G90 M82\nG92 E0\nG0 X0 Y0 Z0.2\nG1 X10 E1 F1200\nG0 X20\nM30").timeline
    expect(v.classifyMoves(printer, { kind: "3dprinter" })).toEqual(["rapid", "cut", "rapid"])
  })

  test("the summary counts every move once", () => {
    const { timeline } = timelineOf("G21 G90\nG0 X0 Y0 Z5\nG1 Z-1 F100\nG1 X10\nG0 Z5\nM30")
    const classes = v.classifyMoves(timeline, { stockTop: 0 })
    const summary = v.moveClassSummary(timeline, classes)
    expect(summary.reduce((n, s) => n + s.count, 0)).toBe(timeline.moves.length)
    expect(summary.find((s) => s.kind === "cut")!.length).toBeCloseTo(10, 9)
  })
})

describe("a program split at its tool changes", () => {
  const twoTools = [
    "(T1 D=10. CR=0. - ZMIN=-5. - flat end mill)",
    "(T2 D=6. CR=0. - ZMIN=-12. - drill)",
    "(T3 D=8. CR=1. - ZMIN=-2. - bull nose end mill)",
    "G21 G90 G17",
    "T1 M6", "S8000 M3", "G0 X0 Y0 Z5", "G1 Z-5 F300", "G1 X50 F800", "G0 Z5",
    "T2 M6", "S2000 M3", "G0 X10 Y10", "G81 X10 Y10 Z-12 R2 F100", "G80",
    "T3 M6", "S9000 M3", "G0 X0 Y0", "G1 Z-2 F300", "G1 X20", "G0 Z20",
    "M30"
  ].join("\n")

  test("one toolpath per tool, named and keyed by the tool; the motion track follows", () => {
    const a = cam.generator.analyseGcode(twoTools)
    expect(a.program.toolpaths.map((tp) => [tp.toolId, tp.name, tp.spindleRpm])).toEqual([["T1", "T1 flat end mill", 8000], ["T2", "T2 drill", 2000], ["T3", "T3 bull nose end mill", 9000]])
    expect(a.motion.paths.map((p) => p.count)).toEqual(a.program.toolpaths.map((tp) => cam.expandMoves(tp.moves, { x: 0, y: 0, z: 0 }).length))
    const timeline = v.buildTimeline(a.program, a.motion)
    const spans = v.operationSpans(timeline)
    expect(spans.map((s) => s.path)).toEqual([0, 1, 2])
    expect(spans[1]!.start).toBeCloseTo(spans[0]!.end, 9)
    // Lines are still the program's own.
    expect(v.timeOfLine(timeline, 14)).toBeCloseTo(timeline.moves.find((m) => m.state.line === 14)!.start, 12)
  })

  test("a one-tool program stays the single toolpath it always was", () => {
    const a = cam.generator.analyseGcode("G21 G90\nT1 M6\nS1000 M3\nG0 X0 Y0 Z5\nG1 Z-1 F100\nM30")
    expect(a.program.toolpaths.map((tp) => [tp.id, tp.toolId])).toEqual([["gcode", "tool"]])
  })

  test("the header's tools become the preview's models; an unknown description is an assumed end mill", () => {
    const models = cam.headerToolModels(twoTools)
    expect(models.get("T1")).toMatchObject({ family: "mill", shape: "flat", diameter: 10 })
    expect(models.get("T2")).toMatchObject({ shape: "drill", diameter: 6 })
    expect(models.get("T3")).toMatchObject({ shape: "bull", diameter: 8, cornerRadius: 1 })
    const odd = cam.headerToolModels("(T4 D=5. - ZMIN=-1. - form tool)")
    expect(odd.get("T4")).toMatchObject({ shape: "flat", diameter: 5 })
    expect(odd.get("T4")!.assumed).toContain("type")
    expect(cam.toolTypeIn("right hand tap")).toBe("tap")
    expect(cam.toolTypeIn("tapered mill")).toBe("tapered")
    expect(cam.toolTypeIn("spot drill")).toBe("spotdrill")
  })
})
