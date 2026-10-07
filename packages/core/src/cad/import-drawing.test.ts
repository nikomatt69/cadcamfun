import { describe, expect, test } from "bun:test"
import { closedLoops, extrudeDrawing, parseSvg, readDxfShapes } from "./import-drawing.ts"

const dxf = (entities: string, units?: number): string =>
  `0\nSECTION\n2\nHEADER\n${units === undefined ? "" : `9\n$INSUNITS\n70\n${units}\n`}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`
const line = (x1: number, y1: number, x2: number, y2: number): string => `0\nLINE\n8\n0\n10\n${x1}\n20\n${y1}\n11\n${x2}\n21\n${y2}\n`
const circle = (x: number, y: number, r: number): string => `0\nCIRCLE\n8\n0\n10\n${x}\n20\n${y}\n40\n${r}\n`
const square = (s: number): string => line(0, 0, s, 0) + line(s, 0, s, s) + line(s, s, 0, s) + line(0, s, 0, 0)

describe("DXF to 3D", () => {
  test("four lines chain into one closed loop and extrude", () => {
    const { shapes } = readDxfShapes(dxf(square(50)))
    const loops = closedLoops(shapes)
    expect(loops.loops).toHaveLength(1)
    expect(loops.loops[0]!.area).toBeCloseTo(2500, 6)
    const r = extrudeDrawing(shapes, { depth: 10 })
    expect(r.stats).toEqual({ solids: 1, holes: 0, open: 0 })
    expect(r.elements).toHaveLength(1)
    expect(r.elements[0]).toMatchObject({ type: "extrusion", depth: 10, z: 0 })
  })

  test("a circle inside the outline is a hole taken out with a boolean-subtract", () => {
    const { shapes } = readDxfShapes(dxf(square(50) + circle(25, 25, 5)))
    const r = extrudeDrawing(shapes, { depth: 10 })
    expect(r.stats).toMatchObject({ solids: 1, holes: 1 })
    const sub = r.elements.find((e) => e["type"] === "boolean-subtract")!
    expect(sub["operands"]).toEqual([0, 1])
    const tool = r.elements[1] as Record<string, number | string>
    expect(tool["type"]).toBe("cylinder")
    expect(tool["radius"]).toBe(5)
    expect(Number(tool["height"])).toBeGreaterThan(10)
  })

  test("a hole inside a hole is an island solid again", () => {
    const { shapes } = readDxfShapes(dxf(square(100) + circle(50, 50, 30) + circle(50, 50, 10)))
    const r = extrudeDrawing(shapes, { depth: 5 })
    expect(r.stats.solids).toBe(2)
    expect(r.stats.holes).toBe(1)
  })

  test("$INSUNITS inches are converted to millimetres", () => {
    const { shapes } = readDxfShapes(dxf(square(2), 1))
    expect(closedLoops(shapes).loops[0]!.area).toBeCloseTo(50.8 * 50.8, 4)
  })

  test("an arc closes a rounded outline", () => {
    const arc = `0\nARC\n8\n0\n10\n10\n20\n0\n40\n10\n50\n0\n51\n180\n`
    const { shapes } = readDxfShapes(dxf(arc + line(0, 0, 20, 0)))
    const loops = closedLoops(shapes, { tolerance: 0.001 })
    expect(loops.loops).toHaveLength(1)
    expect(loops.loops[0]!.area).toBeCloseTo((Math.PI * 100) / 2, 1)
  })

  test("an open outline is reported, never guessed", () => {
    const { shapes } = readDxfShapes(dxf(line(0, 0, 10, 0) + line(10, 0, 10, 10)))
    const r = extrudeDrawing(shapes, { depth: 5 })
    expect(r.elements).toHaveLength(0)
    expect(r.stats.open).toBe(1)
    expect(r.warnings.join(" ")).toContain("open outline")
  })

  test("a gap within the tolerance still closes", () => {
    const { shapes } = readDxfShapes(dxf(line(0, 0, 10, 0) + line(10.004, 0, 10, 10) + line(10, 10.003, 0, 10) + line(0, 10, 0, 0.002)))
    expect(closedLoops(shapes, { gap: 0.01 }).loops).toHaveLength(1)
  })

  test("a non-positive depth is refused", () => {
    const { shapes } = readDxfShapes(dxf(square(10)))
    expect(extrudeDrawing(shapes, { depth: 0 }).warnings).toContain("depth must be positive")
  })

  test("a finer tolerance gives a rounder hole", () => {
    const { shapes } = readDxfShapes(dxf(square(50) + circle(25, 25, 5)))
    const coarse = extrudeDrawing(shapes, { depth: 5, tolerance: 0.1 }).elements[1] as Record<string, unknown>
    const fine = extrudeDrawing(shapes, { depth: 5, tolerance: 0.001 }).elements[1] as Record<string, unknown>
    expect(Number(fine["tolerance"])).toBeLessThan(Number(coarse["tolerance"]))
  })
})

describe("SVG to 3D", () => {
  test("a rect becomes a closed loop with y flipped", () => {
    const { shapes } = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="40" height="20"/></svg>`)
    const loops = closedLoops(shapes)
    expect(loops.loops).toHaveLength(1)
    expect(loops.loops[0]!.area).toBeCloseTo(800, 6)
    expect(Math.max(...loops.loops[0]!.points.map((p) => p.y))).toBeLessThanOrEqual(0 + 1e-9)
  })

  test("a path with lines and a closing Z, plus a circle hole", () => {
    const svg = `<svg><path d="M0 0 L60 0 L60 60 L0 60 Z"/><circle cx="30" cy="30" r="8"/></svg>`
    const r = extrudeDrawing(parseSvg(svg).shapes, { depth: 6 })
    expect(r.stats).toMatchObject({ solids: 1, holes: 1 })
  })

  test("curves and arcs are flattened within the tolerance", () => {
    const svg = `<svg><path d="M0 0 L40 0 A20 20 0 0 1 40 40 L0 40 Z"/><path d="M100 0 C120 0 120 40 100 40 Z"/></svg>`
    const { shapes } = parseSvg(svg, { tolerance: 0.005 })
    expect(closedLoops(shapes).loops.length).toBe(2)
  })

  test("transforms and scale are applied", () => {
    const svg = `<svg><g transform="translate(10 10) scale(2)"><rect width="10" height="10"/></g></svg>`
    const { shapes } = parseSvg(svg, { scale: 0.5 })
    expect(closedLoops(shapes).loops[0]!.area).toBeCloseTo(100, 6)
  })
})
