import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"

const v = cam.viewer

describe("viewer: tokenizer", () => {
  test("words, N numbers and comments", () => {
    const block = v.tokenize("N10 G01 X1.5 Y-2 (move) F300 ; fast")
    expect(block.words.map((w) => `${w.letter}${w.value}`)).toEqual(["G1", "X1.5", "Y-2", "F300"])
    expect(block.comment).toBe("fast")
  })
  test("program markers and comment-only lines yield no words", () => {
    expect(v.tokenize("%").words).toEqual([])
    expect(v.tokenize("; G1 X5 M3").words).toEqual([])
    expect(v.tokenize("(G1 X5)").words).toEqual([])
  })
  test("decimal G words are kept whole", () => {
    expect(v.hasG(v.tokenize("G13.1 D10"), 13.1)).toBe(true)
    expect(v.hasG(v.tokenize("G13.1 D10"), 13)).toBe(false)
  })
})

describe("viewer: line classification and statistics", () => {
  test("G02/G03 are arcs, not rapids; G17/G12 are not linear moves", () => {
    expect(v.classifyLine("G02 X1 Y1 I1 J0")).toBe("circular")
    expect(v.classifyLine("G03 X1 Y1 I1 J0")).toBe("circular")
    expect(v.classifyLine("G00 X1")).toBe("rapid")
    expect(v.classifyLine("G01 X1")).toBe("linear")
    expect(v.classifyLine("G17")).toBe("other")
    expect(v.classifyLine("G10 L2 P1")).toBe("other")
    expect(v.classifyLine("M3 S1000")).toBe("machine")
    expect(v.classifyLine("; M3 is the spindle")).toBe("other")
  })
  test("counts per kind", () => {
    const stats = v.lineStats(["G0 Z5", "G1 X1 F100", "G1 X2 M8", "G2 X3 Y1 I1", "G3 X0 Y0 I-1", "M30", "; comment M5"])
    expect(stats).toEqual({ rapidMoves: 1, linearMoves: 2, circularMoves: 2, machineFunctions: 2 })
  })
  test("Fanuc detection and non-blank lines", () => {
    expect(v.isFanucProgram(["%", "O0001"])).toBe(true)
    expect(v.isFanucProgram(["G1 X1"])).toBe(false)
    expect(v.programLines("G0 X1\n\n  \nG1 X2\n")).toEqual(["G0 X1", "G1 X2"])
  })
})

describe("viewer: 2D preview path", () => {
  const program = ["; header", "G90", "G0 X0 Y0 Z5", "G1 Z-1 F100", "G1 X10", "Y5", "G2 X0 Y5 I-5 J0", "M30"].join("\n")
  test("one point per motion block, modal motion included", () => {
    const path = v.previewPath(program)
    expect(path.points).toEqual([
      { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -1 }, { x: 10, y: 0, z: -1 }, { x: 10, y: 5, z: -1 }, { x: 0, y: 5, z: -1 }
    ])
    expect(path).toMatchObject({ totalLines: 8, rapidMoves: 1, linearMoves: 3, circularMoves: 1, machineFunctions: 1 })
    expect(path.boundaries).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 5, minZ: -1, maxZ: 5 })
  })
  test("G91 moves are relative to the previous block", () => {
    const path = v.previewPath("G90\nG0 X10 Y10\nG91\nG1 X5 Y-2")
    expect(path.points.at(-1)).toEqual({ x: 15, y: 8, z: 0 })
  })
  test("empty program", () => {
    const path = v.previewPath("")
    expect(path.points).toEqual([])
    expect(path.boundaries).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 })
  })
  test("fit centres the bounds with a 20px margin", () => {
    const fit = v.fitView({ minX: 0, maxX: 100, minY: 0, maxY: 50, minZ: 0, maxZ: 0 }, 540, 240)!
    expect(fit.scale).toBe(4)
    expect(fit.offsetX).toBe(270 - 50 * 4)
    expect(fit.offsetY).toBe(120 - 25 * 4)
  })
  test("a single straight line fits on its non-zero axis", () => {
    const fit = v.fitView({ minX: 0, maxX: 100, minY: 5, maxY: 5, minZ: 0, maxZ: 0 }, 540, 240)!
    expect(fit.scale).toBe(5)
    expect(v.fitView({ minX: 1, maxX: 1, minY: 1, maxY: 1, minZ: 0, maxZ: 0 }, 540, 240)).toBeUndefined()
  })
})

describe("viewer: 3D toolpath parser", () => {
  test("rapids and feeds, modal feed", () => {
    const { points } = v.parseToolpath("G0 X1 Y2 Z3\nG1 X4 F250\nG1 Y5")
    expect(points.map((p) => [p.x, p.y, p.z, p.feedrate, p.type, p.isRapid === true])).toEqual([
      [1, 2, 3, 0, "G0", true], [4, 2, 3, 250, "G1", false], [4, 5, 3, 250, "G1", false]
    ])
    expect(points.map((p) => p.line)).toEqual([1, 2, 3])
  })
  test("G02 is an arc and keeps the start as a marker point", () => {
    const { points } = v.parseToolpath("G0 X10 Y0\nG3 X0 Y10 I-10 J0 F100", 5)
    const marker = points[1]!
    expect(marker).toMatchObject({ type: "G3", isArc: true, isClockwise: false, arcRadius: 10, arcCenter: { x: 0, y: 0, z: 0 } })
    const end = points.at(-1)!
    expect(end.x).toBeCloseTo(0, 6)
    expect(end.y).toBeCloseTo(10, 6)
    // quarter circle of radius 10, 5 mm chords: ceil(15.708 / 5) = 4 segments
    expect(points.length).toBe(2 + 4)
    for (const p of points.slice(2)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 6)
  })
  test("a full circle with I/J returns to its start", () => {
    const { points } = v.parseToolpath("G0 X10 Y0\nG2 X10 Y0 I-10 J0", 10)
    const end = points.at(-1)!
    expect(end.x).toBeCloseTo(10, 6)
    expect(end.y).toBeCloseTo(0, 6)
    expect(points.filter((p) => p.isArc).length).toBeGreaterThan(5)
  })
  test("R arcs: the centre is on the right of a clockwise chord and flips with a negative R", () => {
    const cw = v.parseToolpath("G0 X0 Y0\nG2 X10 Y0 R5", 5).points[1]!
    expect(cw.arcCenter!.x).toBeCloseTo(5, 6)
    expect(cw.arcCenter!.y).toBeCloseTo(0, 6)
    const small = v.parseToolpath("G0 X0 Y0\nG2 X6 Y0 R5").points[1]!
    expect(small.arcCenter!.y).toBeCloseTo(-4, 6)
    const major = v.parseToolpath("G0 X0 Y0\nG2 X6 Y0 R-5").points[1]!
    expect(major.arcCenter!.y).toBeCloseTo(4, 6)
  })
  test("an arc with no centre is a line to its end", () => {
    const { points } = v.parseToolpath("G0 X0 Y0\nG2 X5 Y5")
    expect(points.at(-1)).toMatchObject({ x: 5, y: 5, type: "G2" })
    expect(points.some((p) => p.isArc)).toBe(false)
  })
  test("G17 / G10 / G54 do not move, G91 is incremental", () => {
    const { points } = v.parseToolpath("G17\nG10 L2 P1 X5\nG54\nG90\nG0 X10\nG91\nG1 X2 F100")
    expect(points.map((p) => p.x)).toEqual([10, 12])
  })
  test("tool changes are reported with their line", () => {
    const { toolChanges } = v.parseToolpath("T1 M6\nG0 X1\nT12 M6")
    expect(toolChanges).toEqual([{ number: 1, line: 1 }, { number: 12, line: 3 }])
  })
  test("G81 expands in place and is flagged as a fixed cycle", () => {
    const { points } = v.parseToolpath("G0 X0 Y0 Z10\nG81 X5 Y5 Z-3 R2 F80\nX10\nG80\nG0 X0")
    const cycle = points.filter((p) => p.isFixedCycle)
    expect(cycle.map((p) => [p.x, p.y, p.z, p.type])).toEqual([
      [5, 5, 2, "rapid"], [5, 5, -3, "linear"], [5, 5, 2, "rapid"],
      [10, 5, 2, "rapid"], [10, 5, -3, "linear"], [10, 5, 2, "rapid"]
    ])
    expect(cycle[1]!.feedrate).toBe(80)
    expect(points.at(-1)).toMatchObject({ x: 0, type: "G0" })
  })
  test("G83 pecks by Q, G82 dwells by P", () => {
    const peck = v.parseToolpath("G83 X0 Y0 Z-12 R2 Q5").points
    // R=2: pecks at -3, -8, then the final -12, each retracted to R (and re-entered rapidly in between)
    expect(peck.filter((p) => p.type === "linear").map((p) => p.z)).toEqual([-3, -8, -12])
    const dwell = v.parseToolpath("G82 X0 Y0 Z-3 R2 P0.5").points
    expect(dwell.find((p) => p.type === "dwell")?.cycleParams?.["dwell"]).toBe(0.5)
  })
  test("an explicit G1 cancels the canned cycle", () => {
    const { points } = v.parseToolpath("G81 X1 Y1 Z-1 R1\nG1 X5 F100\nX9")
    expect(points.filter((p) => p.isFixedCycle).length).toBe(3)
    expect(points.slice(-2).map((p) => [p.x, p.type])).toEqual([[5, "G1"], [9, "G1"]])
  })
  test("G12 circle pocket with passes", () => {
    const { points } = v.parseToolpath("G0 X5 Y5 Z0\nG12 D10 P2", 100)
    const marker = points.find((p) => p.shapeParams)!
    expect(marker).toMatchObject({ shapeType: "circle", shapeParams: { diameter: 10, radius: 5, passes: 2 } })
    // 16 segments minimum, two passes of 17 points
    expect(points.filter((p) => p.isShape && !p.shapeParams).length).toBe(34)
  })
  test("G13.1 / G13.2 / G13.3 are shapes and not circles", () => {
    expect(v.parseToolpath("G13.1 D20 H5").points[0]).toMatchObject({ shapeType: "sphere", shapeParams: { diameter: 20, radius: 10, height: 5 } })
    expect(v.parseToolpath("G13.2 D20 H8").points[0]).toMatchObject({ shapeType: "cone", shapeParams: { baseRadius: 10, height: 8 } })
    expect(v.parseToolpath("G13.2 D20 A45").points[0]!.shapeParams!["height"]).toBeCloseTo(10, 6)
    const extrude = v.parseToolpath("G0 X0 Y0\nG13.3 X10 Y0 W2 H3").points
    expect(extrude.find((p) => p.shapeParams)).toMatchObject({ shapeType: "extrude", shapeParams: { width: 2, height: 3, length: 10 } })
    // four corners and the closing point
    expect(extrude.filter((p) => p.isShape && !p.shapeParams).length).toBe(5)
  })
})

describe("viewer: timing", () => {
  const rapid: cam.viewer.ToolpathPoint = { x: 0, y: 0, z: 0, type: "G0", isRapid: true }
  test("segment durations use the destination feed", () => {
    expect(v.segmentDuration({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0, type: "G1", feedrate: 600 })).toBeCloseTo(10, 9)
    // rapids run at 1000 mm/min
    expect(v.segmentDuration(rapid, { x: 100, y: 0, z: 0, type: "G0", isRapid: true })).toBeCloseTo(6, 9)
    // no feed anywhere: 500 mm/min default
    expect(v.segmentDuration({ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0, type: "G1" })).toBeCloseTo(6, 9)
    expect(v.segmentDuration(rapid, rapid)).toBe(0)
  })
  test("animation duration is clamped to 300 ms..2 s", () => {
    const near = { x: 0.1, y: 0, z: 0, type: "G1" }
    // 0.1 mm at 500 mm/min = 12 ms; / 0.1 = 120 ms -> raised to the 300 ms floor
    expect(v.animationDurationMs({ x: 0, y: 0, z: 0 }, near, 1)).toBe(300)
    // 1 mm = 120 ms / 0.1 = 1200 ms, inside the clamp
    expect(v.animationDurationMs({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0, type: "G1" }, 1)).toBe(1200)
    const far = { x: 5000, y: 0, z: 0, type: "G1" }
    expect(v.animationDurationMs({ x: 0, y: 0, z: 0 }, far, 1)).toBe(2000)
    // 100 mm at 500 mm/min = 12 s; / (1 * 0.1) = 120 s -> clamped; at 4x it is still above the cap
    expect(v.animationDurationMs({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0, type: "G1" }, 4)).toBe(2000)
  })
  test("clock format, total and remaining time", () => {
    expect(v.formatClock(75)).toBe("01:15")
    const pts: cam.viewer.ToolpathPoint[] = [
      { x: 0, y: 0, z: 0, type: "G0", isRapid: true },
      { x: 100, y: 0, z: 0, type: "G1", feedrate: 600 },
      { x: 200, y: 0, z: 0, type: "G1", feedrate: 600 }
    ]
    expect(v.totalCycleTime(pts)).toBe("00:20")
    expect(v.remainingTime(pts, 1)).toBe("01:40")
    expect(v.remainingTime(pts, 2)).toBe("00:00")
    expect(v.toolpathStatistics(pts)).toEqual({ totalPoints: 3, rapidMoves: 1, cuttingMoves: 2, totalEstimatedTime: "00:20" })
  })
  test("tool height offset by type", () => {
    expect(v.toolHeightOffset({ type: "endmill", diameter: 6 })).toBe(22)
    expect(v.toolHeightOffset({ type: "ballendmill", diameter: 6 })).toBe(17)
    expect(v.toolHeightOffset({ type: "drill", diameter: 6 })).toBe(11)
    expect(v.toolHeightOffset({ type: "other", diameter: 6 })).toBe(0)
    expect(v.toolHeightOffset(undefined)).toBe(0)
  })
})
