import { describe, expect, test } from "bun:test"
import { makeProgram } from "../cam/ir.ts"
import { previewPath } from "../cam/viewer/lines.ts"
import {
  documentParameters,
  elementsOfDocument,
  meshPreview,
  toolpathPreviewFromGcode,
  toolpathPreviewFromProgram,
} from "./companion.ts"

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
})
