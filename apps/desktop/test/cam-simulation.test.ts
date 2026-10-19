/**
 * Spec 32 P3: the simulation player — the path's colour modes and its "only what has run" range, stepping by move and by
 * operation, tool changes and finding markers on the clock, the machine readout and the NC strip.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { buildPlayback, TOOL_COLORS, toolColors } from "../src/viewport/view3d/playback.ts"
import { classLookup, pathBuffers, rampColor, startedBy } from "../src/viewport/view3d/toolpath-colors.ts"
import { findingTimes, ncWindow, operationAt, readoutAt, stepMove, stepOperation, toolChangeTimes } from "../src/features/cam/lib/simulation.ts"
import { createLiveStock, createStockSimulation } from "../src/viewport/view3d/stock-simulation.ts"

const v = cam.viewer
const GCODE = [
  "(T1 D=10. CR=0. - ZMIN=-2. - flat end mill)",
  "(T2 D=6. CR=0. - ZMIN=-10. - drill)",
  "G21 G90 G17",
  "T1 M6", "S8000 M3", "G0 X0 Y0 Z5", "G1 Z-2 F300", "G1 X40 F800", "G1 Y20", "G0 Z5",
  "T2 M6", "S2000 M3", "G0 X10 Y10", "G81 X10 Y10 Z-10 R2 F100", "X30", "G80",
  "M30"
].join("\n")
const analysis = cam.generator.analyseGcode(GCODE)
const timeline = v.buildTimeline(analysis.program, analysis.motion)
const playback = buildPlayback(analysis.program)
const classes = v.classifyMoves(timeline, { stockTop: 0, cycleLines: v.cycleLinesOf(GCODE) })
const byMove = new Map(timeline.moves.map((m, i) => [`${m.path}:${m.index}`, classes[i]!]))
const identity = (p: cam.viewer.TimedMove["from"]) => p

describe("path colour modes", () => {
  const buffers = (mode: Parameters<typeof pathBuffers>[1]["mode"], hidden?: ReadonlySet<number>) =>
    pathBuffers(playback, { mode, toolColors: toolColors(analysis.program), shown: identity, classOf: (p, i) => byMove.get(`${p}:${i}`), operationNames: analysis.program.toolpaths.map((tp) => tp.name), ...(hidden ? { hidden } : {}) }, TOOL_COLORS)

  test("every segment is drawn once, as a cut or as a rapid, in playback order", () => {
    const b = buffers("tool")
    expect(b.cut.starts.length + b.rapid.starts.length).toBe(playback.segments.length)
    for (const s of [b.cut.starts, b.rapid.starts]) for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!)
    expect(b.cut.colors!.length).toBe(b.cut.positions.length)
  })

  test("by tool, by operation: one legend row each, the two tools apart", () => {
    expect(buffers("tool").legend.map((l) => l.label)).toEqual(["T1", "T2"])
    expect(buffers("operation").legend.map((l) => l.label)).toEqual(["T1 flat end mill", "T2 drill"])
  })

  test("by move class: the drill strokes are cycles, the rapids stay dashed and red", () => {
    const b = buffers("move")
    const labels = b.legend.map((l) => l.label)
    expect(labels).toEqual(expect.arrayContaining(["rapid", "plunge", "cut", "cycle"]))
    expect(b.legend.find((l) => l.label === "cycle")!.color).toBe(v.MOVE_CLASS_COLORS.cycle)
  })

  test("by feed and by height: a ramp from the lowest to the highest value", () => {
    expect(buffers("feed").legend.map((l) => l.label)).toEqual(["100 mm/min", "800 mm/min"])
    expect(buffers("z").legend.map((l) => l.label)).toEqual(["Z -10", "Z 5"])
    expect(rampColor(0)).not.toBe(rampColor(1))
  })

  test("a hidden operation draws nothing; the playhead range counts the segments started", () => {
    const b = buffers("tool", new Set([1]))
    const all = buffers("tool")
    expect(b.cut.starts.length).toBeLessThan(all.cut.starts.length)
    expect(b.legend.map((l) => l.label)).toEqual(["T1"])
    expect(startedBy(all.cut.starts, -1)).toBe(0)
    expect(startedBy(all.cut.starts, timeline.duration + 1)).toBe(all.cut.starts.length)
  })
})

describe("navigation and readout", () => {
  const spans = v.operationSpans(timeline)

  test("stepping by move lands on move starts, both ways", () => {
    const second = timeline.moves[1]!.start
    expect(stepMove(timeline, 0, 1)).toBe(second)
    expect(stepMove(timeline, second, -1)).toBe(0)
    const mid = (timeline.moves[3]!.start + timeline.moves[4]!.start) / 2
    expect(stepMove(timeline, mid, -1)).toBe(timeline.moves[3]!.start)
    expect(stepMove(timeline, timeline.duration, 1)).toBe(timeline.duration)
  })

  test("stepping by operation, the operation playing, the tool change on the clock", () => {
    expect(spans).toHaveLength(2)
    expect(stepOperation(spans, 0, 1, timeline.duration)).toBe(spans[1]!.start)
    expect(stepOperation(spans, spans[1]!.start + 1, -1, timeline.duration)).toBe(spans[1]!.start)
    expect(stepOperation(spans, spans[1]!.start, -1, timeline.duration)).toBe(0)
    expect(operationAt(spans, spans[1]!.start + 0.01)).toBe(1)
    expect(toolChangeTimes(analysis.program, spans)).toEqual([spans[1]!.start])
  })

  test("findings with a line become markers at that line's first move", () => {
    const at = findingTimes(timeline, [{ line: 14, severity: "error", message: "into the vise" }, { severity: "warning", message: "no line" }])
    expect(at).toEqual([{ seconds: v.timeOfLine(timeline, 14)!, severity: "error", message: "into the vise" }])
  })

  test("the readout says where the tool is, how fast, which tool, what the move is for", () => {
    const cut = timeline.moves.findIndex((m) => m.state.line === 8)
    const m = timeline.moves[cut]!
    const r = readoutAt(timeline, classes, m.start + m.duration / 2)!
    expect(r).toMatchObject({ feed: 800, rapid: false, spindle: "cw", rpm: 8000, tool: 1, line: 8, klass: "cut", operation: 0 })
    expect(r.program.x).toBeCloseTo(20, 6)
  })

  test("the NC strip shows the blocks round the playing one", () => {
    const rows = ncWindow(GCODE, 8)
    expect(rows.map((r) => r.line)).toEqual([6, 7, 8, 9, 10, 11])
    expect(rows.find((r) => r.current)!.text).toBe("G1 X40 F800")
    expect(ncWindow(GCODE, undefined)).toEqual([])
  })
})

describe("the live stock (spec 32 P4)", () => {
  const stock = { minX: -5, maxX: 45, minY: -5, maxY: 25, minZ: -5, maxZ: 5 }
  // The program changes tools: each toolpath has its own cutter.
  const tools = new Map<string, cam.kernel.Cutter>(
    analysis.program.toolpaths.map((tp) => [tp.toolId, cam.kernel.DEFAULT_CUTTERS.find((c) => c.id === (tp.toolId === "T2" ? "drill-6" : "flat-10"))!])
  )
  const simulation = createStockSimulation({ program: analysis.program, timeline, tools, stock, cell: 1 })

  test("the simulation is built from the program's own tools", () => {
    expect(simulation).toBeDefined()
    expect(simulation!.missingTools).toEqual([])
    expect(simulation!.removedVolume).toBe(0)
  })

  test("the mesh follows the playhead: the material the program has cut is gone", () => {
    const live = createLiveStock(simulation!)
    const before = live.mesh.geometry.getAttribute("position").array as Float32Array
    // Nothing has run yet: the whole stock is there.
    for (let k = 0; k < before.length / 3; k++) expect(before[k * 3 + 2]).toBe(5)
    simulation!.advanceTo(timeline.duration)
    expect(live.update()).toBe(true)
    const after = live.mesh.geometry.getAttribute("position").array as Float32Array
    // The columns the cutter passed over are lower than the ceiling.
    const heights = [...after].filter((_, i) => i % 3 === 2)
    expect(Math.min(...heights)).toBeLessThan(5)
    // Nothing changed since: the mesh is not rebuilt.
    expect(live.update()).toBe(false)
  })

  test("a program without a cutter has no stock to simulate", () => {
    expect(createStockSimulation({ program: analysis.program, timeline, tools: new Map(), stock })).toBeUndefined()
  })
})

describe("class lookup without string keys", () => {
  test("every timeline move's class by its toolpath and index", () => {
    const lookup = classLookup(timeline, classes)
    timeline.moves.forEach((m, i) => expect(lookup(m.path, m.index)).toBe(classes[i]!))
    expect(lookup(99, 0)).toBeUndefined()
  })
})

