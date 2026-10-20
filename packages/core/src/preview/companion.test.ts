import { describe, expect, test } from "bun:test"
import { makeProgram } from "../cam/ir.ts"
import { decodeSettings, type Stock } from "../cam/generator/schema.ts"
import { withMachineDefaults } from "../cam/generator/settings.ts"
import { toolModelFromSettings } from "../cam/tool-model.ts"
import { previewPath } from "../cam/viewer/lines.ts"
import {
  arcChordPoints,
  documentParameters,
  elementsOfDocument,
  machineScenePreview,
  meshPreview,
  toolpathPreviewFromGcode,
  toolpathPreviewFromProgram,
} from "./companion.ts"

const settings = (patch: Record<string, unknown> = {}) => withMachineDefaults(decodeSettings(patch))
const stock: Stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const latheSettings = settings({ machineType: "lathe", stockDiameter: 50, stockLength: 100 })

describe("companion mesh preview", () => {
  test("a cube becomes a closed mesh with one named part", () => {
    const preview = meshPreview([{ id: "box", name: "Box", type: "cube", width: 10, height: 20, depth: 30 }])
    expect(preview.truncated).toBe(false)
    expect(preview.parts).toEqual([{ id: "box", name: "Box", triangleStart: 0, triangleCount: preview.indices.length / 3 }])
    expect(preview.indices.length).toBeGreaterThan(0)
    expect(preview.normals).toHaveLength(preview.positions.length)
    expect(preview.bounds.min[2]).toBeLessThan(preview.bounds.max[2])
  })

  test("a second solid past the triangle cap is listed and marked truncated", () => {
    const cube = { type: "cube", width: 10, height: 10, depth: 10 }
    const first = meshPreview([{ id: "a", name: "A", ...cube }])
    const both = meshPreview(
      [{ id: "a", name: "A", ...cube }, { id: "b", name: "B", ...cube }],
      { maxTriangles: first.indices.length / 3 },
    )
    expect(both.truncated).toBe(true)
    expect(both.parts.map((part) => part.id)).toEqual(["a", "b"])
    expect(both.parts[1]?.triangleCount).toBe(0)
    expect(both.indices).toHaveLength(first.indices.length)
  })

  test("a malformed element is listed without triangles instead of failing or poisoning the preview", () => {
    // A corrupt stored element: reading it throws inside the kernel.
    const corrupt = { id: "bad", name: "Bad", type: "cube", height: 10, depth: 10, get width(): number { throw new Error("corrupt") } }
    const preview = meshPreview([
      corrupt,
      { id: "box", name: "Box", type: "cube", width: 10, height: 10, depth: 10 },
    ])
    expect(preview.parts.map((part) => [part.id, part.triangleCount > 0])).toEqual([["bad", false], ["box", true]])
    expect([...preview.positions, ...preview.normals].every(Number.isFinite)).toBe(true)
  })

  test("coordinates travel rounded to 1e-5 mm", () => {
    const preview = meshPreview([{ id: "box", type: "cube", width: 10 / 3, height: 10, depth: 10 }])
    for (const value of [...preview.positions, ...preview.normals]) expect(Math.abs(value * 1e5 - Math.round(value * 1e5))).toBeLessThan(1e-6)
  })

  test("documents yield elements from an array or from geometry", () => {
    expect(elementsOfDocument({ elements: [{ id: "a", type: "line" }] })).toHaveLength(1)
    expect(elementsOfDocument({ geometry: { elements: [{ id: "b", type: "cube" }] } })[0]?.id).toBe("b")
    expect(documentParameters({ name: "Bracket", type: "custom", width: 12, elements: [] })).toEqual([
      { key: "name", value: "Bracket" },
      { key: "type", value: "custom" },
      { key: "width", value: "12" },
    ])
  })
})

describe("companion toolpath preview", () => {
  const gcode = ["G21", "G0 X10 Y0 Z5", "G1 X20 Y0 Z-1 F200", "M3", "G2 X20 Y10 I0 J5"].join("\n")

  test("segments point at the G-code line that moved, and stats match the 2D preview", () => {
    const preview = toolpathPreviewFromGcode(gcode)
    const classic = previewPath(gcode)
    // The first rapid only sets the start: where the tool was before it is unknown.
    expect(preview.segments[0]).toMatchObject({ kind: "linear", line: 3, from: [10, 0, 5], to: [20, 0, -1] })
    // The arc follows its centre (20, 5): every chord is on line 5 and stays on the 5 mm radius.
    const arc = preview.segments.slice(1)
    expect(arc.length).toBeGreaterThan(4)
    expect(arc.every((segment) => segment.kind === "circular" && segment.line === 5)).toBe(true)
    for (const segment of arc) expect(Math.hypot(segment.to[0] - 20, segment.to[1] - 5)).toBeCloseTo(5, 6)
    expect(arc.at(-1)?.to.map((value) => Number(value.toFixed(6)))).toEqual([20, 10, -1])
    // Clockwise from (20, 0) to (20, 10) about (20, 5) swings through X15.
    expect(Math.min(...arc.map((segment) => segment.to[0]))).toBeCloseTo(15, 1)
    expect(preview.stats).toMatchObject({
      rapidMoves: classic.rapidMoves,
      linearMoves: classic.linearMoves,
      circularMoves: classic.circularMoves,
      machineFunctions: classic.machineFunctions,
    })
    expect(preview.truncated).toBe(false)
    expect(preview.stock).toEqual(preview.bounds)
  })

  test("a cap drops later segments but still counts them", () => {
    const preview = toolpathPreviewFromGcode(gcode, { maxSegments: 1 })
    expect(preview.segments).toHaveLength(1)
    expect(preview.truncated).toBe(true)
    expect(preview.stats.linearMoves).toBe(1)
  })

  test("the path starts at the first programmed point, so the stock is not stretched to an assumed origin", () => {
    const preview = toolpathPreviewFromGcode(["G90", "G0 Z85", "G0 X-3 Y-3 Z80", "G1 Z74 F300", "G1 X3"].join("\n"))
    expect(preview.segments[0]?.from).toEqual([0, 0, 85])
    expect(preview.bounds.min[2]).toBe(74)
  })

  test("a fixed drilling cycle is drawn down to its depth and back to the retract plane", () => {
    const preview = toolpathPreviewFromGcode(["G0 X0 Y0 Z10", "G81 X5 Y5 Z-4 R2 F100", "X15", "G80"].join("\n"))
    const plunges = preview.segments.filter((segment) => segment.kind === "linear")
    expect(plunges.map((segment) => [segment.line, segment.to])).toEqual([[2, [5, 5, -4]], [3, [15, 5, -4]]])
    expect(preview.bounds.min[2]).toBe(-4)
  })

  test("a program without G-code still yields rapid and linear segments", () => {
    const program = makeProgram("job", [{
      id: "tp",
      name: "face",
      toolId: "t1",
      spindleRpm: 1000,
      coolant: "off",
      moves: [
        { _tag: "Rapid", to: { x: 10, y: 0, z: 5 } },
        { _tag: "Linear", to: { x: 20, y: 0, z: -1 }, feed: 200 },
      ],
    }])
    const preview = toolpathPreviewFromProgram(program)
    expect(preview.segments.map((segment) => segment.kind)).toEqual(["linear"])
    expect(preview.segments[0]).toMatchObject({ from: [10, 0, 5], to: [20, 0, -1] })
    expect(preview.stats.machineFunctions).toBe(0)
  })

  test("a program arc follows its centre like the G-code path, not a straight chord", () => {
    const program = makeProgram("job", [{
      id: "tp",
      name: "contour",
      toolId: "t1",
      spindleRpm: 1000,
      coolant: "off",
      moves: [
        { _tag: "Rapid", to: { x: 20, y: 0, z: 2 } },
        { _tag: "Linear", to: { x: 20, y: 0, z: -1 }, feed: 200 },
        { _tag: "Arc", to: { x: 20, y: 10, z: -1 }, center: { x: 20, y: 5 }, clockwise: true, feed: 200 },
      ],
    }])
    const preview = toolpathPreviewFromProgram(program)
    const arc = preview.segments.filter((segment) => segment.kind === "circular")
    // Half a turn of radius 5 is ~15.7 mm: one chord per millimetre at most.
    expect(arc.length).toBeGreaterThanOrEqual(16)
    expect(new Set(arc.map((segment) => segment.line))).toEqual(new Set([3]))
    for (const segment of arc) expect(Math.hypot(segment.to[0] - 20, segment.to[1] - 5)).toBeCloseTo(5, 6)
    expect(arc.at(-1)?.to).toEqual([20, 10, -1])
    // Clockwise from (20, 0) to (20, 10) about (20, 5) swings through X15, exactly as the G-code preview draws it.
    expect(Math.min(...arc.map((segment) => segment.to[0]))).toBeCloseTo(15, 1)
    expect(preview.bounds.min[0]).toBeCloseTo(15, 1)
    expect(preview.stats).toMatchObject({ rapidMoves: 1, linearMoves: 1, circularMoves: 1 })
  })

  test("a helical arc rises evenly and a full circle closes on its start", () => {
    const points = arcChordPoints({ x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: -2 }, { x: 0, y: 0 }, false)
    expect(points.length).toBeGreaterThan(60)
    expect(points.at(-1)).toEqual({ x: 10, y: 0, z: -2 })
    const zs = points.map((point) => point.z)
    expect(zs.every((z, index) => index === 0 || z <= zs[index - 1]!)).toBe(true)
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(10, 1)
  })

  test("non-finite G-code coordinates are dropped instead of reaching the phone", () => {
    const preview = toolpathPreviewFromGcode(["G0 X0 Y0 Z5", "G1 X1e999 F100", "G1 X5 Y5 Z0"].join("\n"))
    for (const segment of preview.segments) expect([...segment.from, ...segment.to].every(Number.isFinite)).toBe(true)
  })
})

describe("companion machine preview (spec 31 §5, the spec 13 §6 payload)", () => {
  const latheProgram = ["G18 G90", "M3 S600", "G0 X52 Z2", "G0 X44", "G1 Z-40 F60", "M5", "G0 X52", "M30"].join("\n")

  test("a lathe program is mapped to the display world: x is Z, z is +X/2 for a rear turret", () => {
    const preview = machineScenePreview({ settings: latheSettings, stock, gcode: latheProgram, generatorGcode: latheProgram })
    expect(preview.machine).toMatchObject({ kind: "lathe", source: "generator", xMode: "diameter", turret: "rear" })
    // The machine's position before the first move is assumed; the first rapid only sets it.
    expect(preview.segments[0]).toMatchObject({ kind: "rapid", from: [2, 0, 26], to: [2, 0, 22] })
    expect(preview.segments[1]).toMatchObject({ kind: "linear", line: 5, from: [2, 0, 22], to: [-40, 0, 22] })
    // Program coordinates stay out of the payload: display x is Z, and X is never a diameter on the phone.
    for (const segment of preview.segments) expect(segment.to[1]).toBe(0)
    expect(preview.machine.tool).toMatchObject({ family: "lathe", turret: "rear" })
    expect(preview.machine.bodies.map((body) => body.role)).toContain("chuck")
    expect(preview.machine.axes).toBe(2)
  })

  test("M3 turns the part positively and M5 stops it; the collision into the chuck is red", () => {
    const gcode = ["G18 G90", "M3 S600", "G0 X40 Z0", "G1 Z-90 F60", "M5", "G0 X52"].join("\n")
    const preview = machineScenePreview({ settings: latheSettings, stock, gcode })
    // S600 is capped at two display revolutions per second, the lathe's M3 sense is positive.
    expect(preview.machine.spin[0]).toEqual({ segment: 0, rate: 2 })
    const last = preview.machine.spin[preview.machine.spin.length - 1]!
    expect(last.rate).toBe(0)
    expect(last.segment).toBe(preview.segments.length - 1)
    // Z-90 is inside the jaws, which grip the bar up to Z-80.
    expect(preview.machine.collisions.length).toBeGreaterThan(0)
    expect(preview.segments[preview.machine.collisions[0]!]!.line).toBe(4)
    expect(preview.machine.assumed).toEqual(["workholding"])
  })

  test("a mill program keeps the program's own coordinates and turns the tool negatively with M3", () => {
    const gcode = ["M3 S60", "G0 Z5", "G1 X60 F60", "M5", "G1 X120"].join("\n")
    const preview = machineScenePreview({ settings: settings(), stock, gcode, generatorGcode: gcode })
    expect(preview.machine).toMatchObject({ kind: "mill", source: "generator", axes: 3, tool: { family: "mill" } })
    expect(preview.segments.map((segment) => segment.to)).toEqual([[60, 0, 5], [120, 0, 5]])
    expect(preview.machine.spin).toEqual([{ segment: 0, rate: -1 }, { segment: 1, rate: 0 }])
    expect(preview.machine.bodies.map((body) => body.role)).toContain("vise-base")
    expect(preview.machine.workholding).toContain("vise")
  })

  test("the kernel's NC is the kernel's mill, and its artifact carries the stock", () => {
    const gcode = ["M3 S60", "G0 Z5", "G1 X60 F60"].join("\n")
    const artifact = {
      schemaVersion: 1, jobId: "j", material: { id: "m", name: "Aluminium", iso: "N30" }, machine: { id: "vmc-standard", name: "VMC", post: "fanuc" },
      origin: { x: 0, y: 0, z: 0 }, stockBounds: { min: { x: -20, y: -20, z: -10 }, max: { x: 20, y: 20, z: 0 } },
      operations: [], program: makeProgram("k", []), tools: [], nc: gcode, claims: [], issues: [], release: "preview",
      stock: { initialVolume: 1, finalVolume: 1, partVolume: 1, remainingVolume: 0, maxRemaining: 0, cellSize: 1 },
      cycleTimeSeconds: 1, identity: { job: "j", part: "p", nc: "n", algorithm: "a" }, notes: [],
    } as Parameters<typeof machineScenePreview>[0]["artifact"]
    const preview = machineScenePreview({ settings: settings(), stock, gcode, kernelNc: gcode, artifact, machineId: "vmc-standard" })
    expect(preview.machine).toMatchObject({ kind: "mill", source: "kernel" })
    // The kernel's stock box and the machine preset's table, not the generator's 100 x 60 stock.
    expect(preview.stock.min).toEqual([-20, -20, -10])
    const table = preview.machine.bodies.find((body) => body.role === "table")!
    if (table.shape.type !== "box") throw new Error("expected a box table")
    expect(table.shape.max.x - table.shape.min.x).toBeCloseTo(1000, 6)
  })

  test("a program the interpreter cannot read falls back to the parser's shapes, with no motion state", () => {
    const gcode = ["M3 S1000", "G0 X0 Y0 Z5", "G13 D20 F200"].join("\n")
    const preview = machineScenePreview({ settings: settings(), stock, gcode })
    const circular = preview.segments.filter((segment) => segment.kind === "circular")
    expect(circular.length).toBeGreaterThan(16)
    expect(preview.machine.spin).toEqual([])
    expect(preview.machine.collisions).toEqual([])
    // The G-code stats still count the shape's line.
    expect(preview.stats).toMatchObject({ rapidMoves: 1, circularMoves: 0 })
  })

  test("a program without G-code draws the timeline in display coordinates and counts its moves", () => {
    const program = makeProgram("face", [{
      id: "tp", name: "face", toolId: "t1", spindleRpm: 1000, coolant: "off",
      moves: [
        { _tag: "Rapid", to: { x: 10, y: 0, z: 5 } },
        { _tag: "Linear", to: { x: 20, y: 0, z: -1 }, feed: 200 },
      ],
    }])
    const preview = machineScenePreview({ settings: latheSettings, stock, program })
    expect(preview.machine.source).toBe("settings")
    expect(preview.segments.map((segment) => [segment.kind, segment.from, segment.to])).toEqual([
      ["rapid", [5, 0, 10], [5, 0, 5]],
      ["linear", [5, 0, 5], [-1, 0, 10]],
    ])
    expect(preview.stats).toEqual({ rapidMoves: 1, linearMoves: 1, circularMoves: 0, machineFunctions: 0 })
    // The lathe's display x is Z and display z is X/2, and the path starts where the machine was: max X and max Z.
    expect(preview.machine.kind).toBe("lathe")
  })

  test("the payload frames the machine and keeps the stock's own size", () => {
    const preview = machineScenePreview({ settings: settings({ workholdingConfigured: true }), stock, gcode: "M3 S60\nG0 Z5\nG1 X60 F60" })
    expect(preview.bounds.min[2]).toBeLessThan(-20)
    expect(preview.stock).toEqual({ min: [-50, -30, -20], max: [50, 30, 0] })
    expect(preview.truncated).toBe(false)
  })
})

describe("the phone's operations, cutter and contacts (preview format 4)", () => {
  const millSettings = settings()

  test("a program's operations own their run of path segments, each with its own cutter", () => {
    const program = makeProgram("job", [
      {
        id: "tp-1", name: "face", toolId: "t1", spindleRpm: 1000, coolant: "off",
        moves: [
          { _tag: "Rapid", to: { x: 10, y: 0, z: 5 } },
          { _tag: "Linear", to: { x: 20, y: 0, z: -1 }, feed: 200 },
        ],
      },
      {
        id: "tp-2", name: "contour", toolId: "t2", spindleRpm: 800, coolant: "off",
        moves: [
          { _tag: "Rapid", to: { x: 20, y: 0, z: 5 } },
          { _tag: "Linear", to: { x: 20, y: 20, z: -1 }, feed: 150 },
        ],
      },
    ])
    const preview = machineScenePreview({
      settings: millSettings,
      stock,
      program,
      tools: [
        { toolId: "t1", resource: { type: "endmill", diameter: 6, numberOfFlutes: 2, cuttingLength: 20, totalLength: 60, shankDiameter: 6 } },
        { toolId: "t2", resource: { type: "endmill", diameter: 10, numberOfFlutes: 3, cuttingLength: 25, totalLength: 70, shankDiameter: 10, holderDiameter: 32, holderLength: 40, holderType: "shrink" } },
      ],
    })
    const operations = preview.machine.operations
    expect(operations.map((operation) => [operation.index, operation.name, operation.toolId])).toEqual([
      [0, "face", "t1"],
      [1, "contour", "t2"],
    ])
    // Each operation owns a contiguous run of the path's segments, and the runs do not overlap.
    expect(operations[0]?.startSegment).toBe(0)
    expect(operations[0]?.endSegment).toBeLessThan(operations[1]!.startSegment)
    expect(operations[1]?.endSegment).toBe(preview.segments.length - 1)
    // The cutter is the tool the document names, not a generic marker.
    expect(operations[0]?.cutter?.diameter).toBe(6)
    expect(operations[1]?.cutter?.diameter).toBe(10)
    expect(operations[1]?.cutter?.holder).toMatchObject({ diameter: 32, kind: "shrink" })
  })

  test("a program that changes tools is one operation per tool", () => {
    const gcode = ["T1 M6", "M3 S600", "G0 X0 Y0 Z5", "G1 X20 F100", "T2 M6", "G0 X0 Y0 Z5", "G1 X30 F100"].join("\n")
    const preview = machineScenePreview({ settings: millSettings, stock, gcode })
    expect(preview.machine.operations.map((operation) => operation.toolId)).toEqual(["T1", "T2"])
    expect(preview.machine.operations[0]?.startSegment).toBe(0)
    expect(preview.machine.operations[1]?.startSegment).toBeGreaterThan(0)
  })

  test("a rapid into the stock is a contact on the clock, on the segment that made it", () => {
    const gcode = ["M3 S600", "G0 X0 Y0 Z5", "G1 X10 F100", "G0 Z-10"].join("\n")
    const preview = machineScenePreview({ settings: millSettings, stock, gcode })
    const rapid = preview.machine.events.find((event) => event.code === "RAPID_INTO_STOCK")
    expect(rapid).toBeDefined()
    expect(rapid?.severity).toBe("error")
    expect(rapid?.line).toBe(4)
    // The clock is the desktop's: the contact happens after the cut that precedes it.
    expect(rapid?.seconds).toBeGreaterThan(0)
    // The event points at the segment of the move that crashed, so the phone can seek to it.
    const segment = preview.segments[rapid!.segment]!
    expect(segment.kind).toBe("rapid")
    expect(segment.line).toBe(4)
    // A contact is a red segment too.
    expect(preview.machine.collisions).toContain(rapid!.segment)
  })

  test("a clean program reports no contact", () => {
    const gcode = ["M3 S600", "G0 X0 Y0 Z5", "G1 X20 F100"].join("\n")
    const preview = machineScenePreview({ settings: millSettings, stock, gcode })
    expect(preview.machine.events).toEqual([])
    expect(preview.machine.collisions).toEqual([])
  })
})
