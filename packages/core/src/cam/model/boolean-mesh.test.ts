import { describe, expect, test } from "bun:test"
import { meshVolume } from "../../cad/solid.ts"
import { plateTemplate } from "../../cad/history-edit.ts"
import { DEFAULT_GEOMETRY, DEFAULT_PRINTER_EXTRAS, DEFAULT_SETTINGS, generateToolpath, type ToolpathSettings } from "../generator/index.ts"
import { elementBounds } from "../generator/elements.ts"
import { booleanElementMesh, consumedOperands, isBooleanElement } from "./boolean-mesh.ts"
import { elementMesh, volumeOf, type Element } from "./element-mesh.ts"
import { buildPartModel } from "./model.ts"

const cube = (id: string, x: number, w = 10): Element => ({ id, type: "cube", x, y: 0, z: 0, width: w, height: w, depth: w })
const rod = (id: string): Element => ({ id, type: "cylinder", x: 0, y: 0, z: 0, radius: 2, height: 30, segments: 64 })
const vol = (r: ReturnType<typeof booleanElementMesh>) => meshVolume(r!.mesh)

describe("a Boolean element as a solid", () => {
  const elements = (op: string): Element[] => [cube("a", 0), cube("b", 5), { id: "r", type: op, operands: ["a", "b"] }]

  test("union, subtraction and intersection of overlapping cubes have the volumes of the sets", () => {
    const find = (op: string) => elements(op).find((e) => e["id"] === "r")!
    expect(vol(booleanElementMesh(elements("boolean-union"), find("boolean-union")))).toBeCloseTo(1500, 2)
    expect(vol(booleanElementMesh(elements("boolean-subtract"), find("boolean-subtract")))).toBeCloseTo(500, 2)
    expect(vol(booleanElementMesh(elements("boolean-intersect"), find("boolean-intersect")))).toBeCloseTo(500, 2)
  })

  test("a plate with a hole: the cylinder subtracted, then the result is a real part with a hole in it", () => {
    const all: Element[] = [{ id: "plate", type: "cube", x: 0, y: 0, z: 0, width: 40, height: 40, depth: 10 }, rod("hole"), { id: "cut", type: "boolean-subtract", operands: ["plate", "hole"] }]
    const r = booleanElementMesh(all, all[2]!)!
    expect(r.warnings).toEqual([])
    expect(meshVolume(r.mesh)).toBeCloseTo(16000 - volumeOf(elementMesh(rod("h"))!) / 3, 0) // 10 of the rod's 30 mm are inside the plate
  })

  test("nested Booleans resolve from the inside out; the Boolean's own gizmo transform moves the result", () => {
    const all: Element[] = [cube("a", 0), cube("b", 5), cube("c", 100), { id: "ab", type: "boolean-union", operands: ["a", "b"] }, { id: "top", type: "boolean-union", operands: ["ab", "c"] }]
    expect(vol(booleanElementMesh(all, all[4]!))).toBeCloseTo(2500, 1)
    const moved = booleanElementMesh(all, { ...all[3]!, translateX: 20 })!
    let min = Infinity, max = -Infinity
    for (let i = 0; i < moved.mesh.positions.length; i += 3) { min = Math.min(min, moved.mesh.positions[i]!); max = Math.max(max, moved.mesh.positions[i]!) }
    expect(min).toBeCloseTo(15, 3) // the union spans x -5 .. 10; moved by 20
    expect(max).toBeCloseTo(30, 3)
  })

  test("what cannot be formed says why: a missing operand, an operand that is not a solid, a loop", () => {
    const missing: Element[] = [cube("a", 0), { id: "r", type: "boolean-union", operands: ["a", "ghost"] }]
    expect(booleanElementMesh(missing, missing[1]!)).toBeUndefined()
    const flat: Element[] = [cube("a", 0), { id: "t", type: "text", content: "x" }, { id: "r", type: "boolean-subtract", operands: ["a", "t"] }]
    expect(booleanElementMesh(flat, flat[2]!)).toBeUndefined()
    const loop: Element[] = [{ id: "p", type: "boolean-union", operands: ["q", "a"] }, { id: "q", type: "boolean-union", operands: ["p", "a"] }, cube("a", 0)]
    expect(booleanElementMesh(loop, loop[0]!)).toBeUndefined()
  })

  test("the operands a visible Boolean consumes are known, and a hidden Boolean consumes nothing", () => {
    const all = elements("boolean-union")
    expect([...consumedOperands(all)].sort()).toEqual(["a", "b"])
    expect([...consumedOperands(all.map((e) => (e["id"] === "r" ? { ...e, visible: false } : e)))]).toEqual([])
    expect(isBooleanElement(all[2]!)).toBe(true)
    expect(isBooleanElement(all[0]!)).toBe(false)
  })
})

describe("mesh and parametric elements are solids for the CAM", () => {
  const unitCube = {
    vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]].map(([x, y, z]) => ({ x, y, z })),
    faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
  }

  test("a mesh element (what the editor's Boolean leaves) has the volume of its faces, and is placed by x, y, z and the gizmo", () => {
    const m = elementMesh({ id: "m", type: "mesh", ...unitCube })!
    expect(Math.abs(volumeOf(m))).toBeCloseTo(1000, 6)
    const moved = elementMesh({ id: "m", type: "mesh", x: 5, translateZ: 2, ...unitCube })!
    expect(Math.min(...moved.positions.filter((_, i) => i % 3 === 0))).toBeCloseTo(5, 9)
    expect(Math.min(...moved.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(2, 9)
  })

  test("a broken mesh element is not a solid, rather than a wrong one", () => {
    expect(elementMesh({ id: "m", type: "mesh", vertices: unitCube.vertices, faces: [[0, 1, 99]] })).toBeUndefined()
    expect(elementMesh({ id: "m", type: "mesh", vertices: [], faces: [] })).toBeUndefined()
    expect(elementMesh({ id: "m", type: "mesh", vertices: [{ x: 0, y: 0, z: 0 }, { x: Number.NaN, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }], faces: [[0, 1, 2], [0, 2, 3], [1, 2, 3], [0, 1, 3]] })).toBeUndefined()
  })

  test("a parametric element is the union of its bodies; a history that builds nothing is not a solid", () => {
    const m = elementMesh({ id: "p", type: "parametric", history: plateTemplate() })!
    expect(Math.abs(volumeOf(m))).toBeGreaterThan(60 * 40 * 8 - Math.PI * 25 * 8 - 1)
    expect(Math.abs(volumeOf(m))).toBeLessThan(60 * 40 * 8)
    expect(elementMesh({ id: "p", type: "parametric", history: { parameters: {}, features: [] } })).toBeUndefined()
    expect(elementMesh({ id: "p", type: "parametric" })).toBeUndefined()
  })

  test("their bounds come from the mesh, not from a width and a radius they do not have", () => {
    const parametric = elementBounds({ id: "p", type: "parametric", history: plateTemplate() } as never)
    expect(parametric.min.x).toBeCloseTo(0, 5); expect(parametric.max.x).toBeCloseTo(60, 5)
    expect(parametric.max.y).toBeCloseTo(40, 5); expect(parametric.max.z).toBeCloseTo(8, 5)
    const mesh = elementBounds({ id: "m", type: "mesh", ...unitCube } as never)
    expect(mesh.max.z).toBeCloseTo(10, 9)
    const ext = elementBounds({ id: "e", type: "extrusion", shape: "profile", profile: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }], depth: 12, x: 5, y: 5, z: 2 } as never)
    expect(ext.max.x).toBeCloseTo(35, 9); expect(ext.max.z).toBeCloseTo(14, 9)
  })

  test("the CAM part model sees a parametric plate: material round the hole, none in it", () => {
    const part = buildPartModel([{ id: "p", type: "parametric", history: plateTemplate() }], { cell: 0.25 })!
    expect(part.skipped).toEqual([])
    const top = part.dexels.top(-Infinity)
    const at = (x: number, y: number) => top[Math.floor((y - part.grid.minY) / part.grid.cellY) * part.grid.nx + Math.floor((x - part.grid.minX) / part.grid.cellX)]
    expect(at(30, 20)).toBe(-Infinity) // the hole, at the centre of a 60 x 40 plate
    expect(at(5, 5)).toBeCloseTo(8, 6)
  })

  test("the generator machines a parametric plate and a mesh element as surfaces, saying nothing about 'not solids'", () => {
    const stock = { width: 80, height: 60, depth: 12, radius: 0, x: 30, y: 20, topZ: 8, allowance: 1 }
    const run = (selectedElements: Record<string, unknown>[]) => generateToolpath({
      settings: { ...DEFAULT_SETTINGS, operationType: "3d_surface", toolType: "endmill", toolDiameter: 4, depth: 4, stepdown: 2, stepover: 50, tolerance: 0.05, surfaceStrategy: "roughing" } as ToolpathSettings,
      geometry: { ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements, stock } as never, printer: DEFAULT_PRINTER_EXTRAS
    }).response
    const parametric = run([{ id: "p", type: "parametric", history: plateTemplate() }])
    expect(parametric.warnings.join(" ")).not.toContain("not solids")
    expect(parametric.gcode.split("\n").filter((l) => /^G1 /.test(l)).length).toBeGreaterThan(20)
    const meshed = run([{ id: "m", type: "mesh", ...unitCube }])
    expect(meshed.warnings.join(" ")).not.toContain("not solids")
    expect(meshed.gcode.split("\n").filter((l) => /^G1 /.test(l)).length).toBeGreaterThan(5)
  })
})
