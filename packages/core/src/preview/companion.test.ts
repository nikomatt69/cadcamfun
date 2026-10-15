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
    expect(preview.segments.map((segment) => [segment.kind, segment.line])).toEqual([
      ["rapid", 2],
      ["linear", 3],
      ["circular", 5],
    ])
    expect(preview.segments[0]?.to).toEqual([10, 0, 5])
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
    expect(preview.segments.map((segment) => segment.kind)).toEqual(["rapid", "linear"])
    expect(preview.segments[1]?.to).toEqual([20, 0, -1])
    expect(preview.stats.machineFunctions).toBe(0)
  })
})
