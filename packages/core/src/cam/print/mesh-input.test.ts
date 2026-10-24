import { describe, expect, test } from "bun:test"
import { printBodies } from "./bodies.ts"
import { sliceMesh } from "./slice.ts"
import { slicePrint } from "./index.ts"
import { generate3DPrinterProgram } from "../generator/printer.ts"
import { findPrinter } from "../kernel/machines.ts"
import { planOnly, runJob } from "../kernel/execute.ts"
import type { ManufacturingJob } from "../kernel/contracts.ts"
import type { Mesh64 } from "../model/element-mesh.ts"

const cube = { id: "cube", type: "cube", width: 4, height: 4, depth: 1, x: 0, y: 0, z: 0.5 }
const valid = printBodies([cube]).meshes[0]!
const positions = Array.from(valid.positions), indices = Array.from(valid.indices)
const settings = { layerHeight: 0.2, printSpeed: 60, printTemperature: 205, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 2, supportType: "none" }
const job = (meshes: ManufacturingJob["part"]): ManufacturingJob => ({ schemaVersion: 1, id: "input", name: "Mesh input", material: "PLA", machine: findPrinter("printer-desktop-220")!, part: meshes })
const asElement = () => ({ id: "source", type: "mesh", vertices: Array.from({ length: positions.length / 3 }, (_, i) => ({ x: positions[i * 3]!, y: positions[i * 3 + 1]!, z: positions[i * 3 + 2]! })), faces: Array.from({ length: indices.length / 3 }, (_, i) => indices.slice(i * 3, i * 3 + 3)) })

describe("print source mesh validation", () => {
  const invalid = [
    { name: "fractional index before Uint32 coercion", positions, indices: indices.map((v, i) => i === 0 ? v + 0.5 : v) },
    { name: "negative index", positions, indices: indices.map((v, i) => i === 0 ? -1 : v) },
    { name: "out-of-range index", positions, indices: indices.map((v, i) => i === 0 ? positions.length : v) },
    { name: "NaN index", positions, indices: indices.map((v, i) => i === 0 ? NaN : v) },
    { name: "infinite coordinate", positions: positions.map((v, i) => i === 0 ? Infinity : v), indices },
    { name: "incomplete coordinate tuple", positions: [...positions, 1], indices },
    { name: "incomplete triangle", positions, indices: [...indices, 0] },
    { name: "empty mesh beside a valid mesh", positions: [], indices: [] },
    { name: "missing horizontal cap despite closed slice outlines", positions, indices: indices.slice(6) },
    { name: "one reversed triangle", positions, indices: indices.map((v, i) => i === 1 ? indices[2]! : i === 2 ? indices[1]! : v) }
  ]
  for (const mesh of invalid) {
    test(`${mesh.name} refuses both execution and planning, including mixed input`, () => {
      for (const run of [runJob, planOnly]) {
        const result = run(job({ kind: "meshes", meshes: [valid, mesh] }))
        expect(result.status).toBe("failed")
        if (result.status === "failed") expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ tag: "InvalidInput", severity: "error", stage: "prepare" })]))
      }
    })
  }

  test("the low-level slicer rejects invalid structure before consuming any triangle", () => {
    expect(() => sliceMesh({ positions, indices: [...indices, 0] }, [0.1])).toThrow(/triangle/i)
    expect(() => sliceMesh({ positions, indices: indices.map((v, i) => i === 0 ? 0.5 : v) }, [0.1])).toThrow(/index/i)
  })

  test("the public slicer rejects an open cap that every planar slice would conceal", () => {
    const open: Mesh64 = { positions: valid.positions, indices: valid.indices.slice(6) }
    expect(() => slicePrint([valid, open], settings)).toThrow(/open|closed|boundary/i)
  })

  test("serialized mesh data cannot be sanitized or partially printed", () => {
    const source = asElement()
    const corrupt = [
      { ...source, faces: [...source.faces, [0, 1]] },
      { ...source, faces: [...source.faces, null] },
      { ...source, vertices: source.vertices.map((v, i) => i === 0 ? { ...v, z: NaN } : v) },
      { ...source, rotation: { x: Infinity } },
      { type: "component", x: NaN, elements: [source] }
    ]
    for (const broken of corrupt) {
      const response = generate3DPrinterProgram([cube, broken], settings)
      expect(response.error).toBeDefined()
      expect(response.gcode).toStartWith("; Error:")
      expect(response.gcode).not.toContain("G1")
      expect(response.stats).toBeUndefined()
    }
  })

  test("coincident duplicate vertices and a globally inside-out shell stay printable", () => {
    const soupPositions = indices.flatMap((i) => positions.slice(i * 3, i * 3 + 3))
    const soup = { positions: soupPositions, indices: Array.from({ length: indices.length }, (_, i) => i) }
    const flipped = { positions, indices: indices.map((v, i) => i % 3 === 1 ? indices[i + 1]! : i % 3 === 2 ? indices[i - 1]! : v) }
    for (const source of [soup, flipped]) {
      const result = runJob(job({ kind: "meshes", meshes: [source] }))
      expect(result.status).toBe("ok")
      if (result.status === "ok") expect(result.value.release).toBe("verified-program")
    }
  })
})
