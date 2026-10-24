import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { elementBrep, sceneToStep, stepToElements } from "./scene-step.ts"
import { brepBox } from "./history-brep.ts"
import { massProperties, readStepBreps, validateBrep, writeStepBreps } from "./brep/index.ts"
import { model } from "./script.ts"
import { elementMesh, volumeOf } from "../cam/model/element-mesh.ts"

setDefaultTimeout(60_000)

const PI = Math.PI
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe("elements of the drawing as exact solids", () => {
  test("catalogue solids sit where the viewport draws them (centre, rotation) and agree with their meshes", () => {
    const elements = [
      { id: "c", type: "cube", width: 20, height: 10, depth: 6, x: 5, y: -3, z: 2, rotation: { x: 0, y: 0, z: 30 } },
      { id: "y", type: "cylinder", radius: 4, height: 12, x: 0, y: 0, z: 6 },
      { id: "k", type: "cone", radius: 5, height: 9, x: 1, y: 2, z: 3, rotation: { x: 90, y: 0, z: 0 } },
      { id: "s", type: "sphere", radius: 3, x: -4, y: 0, z: 0 },
      { id: "t", type: "torus", radius: 10, tubeRadius: 2, x: 0, y: 0, z: 0 },
      { id: "p", type: "prism", radius: 6, sides: 5, height: 4, x: 0, y: 0, z: 0 },
      { id: "e", type: "extrusion", shape: "profile", profile: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 8 }], depth: 3, x: 1, y: 1, z: -2 },
      { id: "o", type: "extrusion", shape: "circle", radius: 5, depth: 2, x: 0, y: 0, z: 0 },
      { id: "r", type: "revolution", profile: [{ x: 2, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 6 }, { x: 2, y: 6 }], axis: "y", x: 0, y: 0, z: 0 }
    ]
    for (const e of elements) {
      const b = elementBrep(e)
      expect(b.reason).toBeUndefined()
      const rep = validateBrep(b.brep!)
      expect(rep.issues.map((i) => i.message)).toEqual([])
      const mesh = elementMesh(e)!
      // Same solid as the mesh within the meshing error; same box.
      expect(rel(massProperties(b.brep!).volume, volumeOf(mesh))).toBeLessThan(2e-2)
      const box = brepBox(b.brep!)
      let mx = -Infinity
      for (let i = 0; i < mesh.positions.length; i += 3) mx = Math.max(mx, mesh.positions[i]!)
      expect(Math.abs(box.hi.x - mx)).toBeLessThan(0.06)
    }
  })

  test("exact volumes of catalogue solids (the meshes only approximate them)", () => {
    const v = (e: Record<string, unknown>) => massProperties(elementBrep(e).brep!).volume
    expect(rel(v({ type: "cylinder", radius: 4, height: 12 }), PI * 16 * 12)).toBeLessThan(1e-12)
    expect(rel(v({ type: "cone", radius: 5, height: 9 }), (PI * 25 * 9) / 3)).toBeLessThan(1e-12)
    expect(rel(v({ type: "sphere", radius: 3 }), (4 / 3) * PI * 27)).toBeLessThan(1e-12)
    expect(rel(v({ type: "torus", radius: 10, tubeRadius: 2 }), 2 * PI * PI * 10 * 4)).toBeLessThan(1e-12)
    expect(rel(v({ type: "revolution", profile: [{ x: 2, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 6 }, { x: 2, y: 6 }], axis: "y" }), PI * 25 * 6)).toBeLessThan(1e-12)
  })

  test("a circular extrusion is an exact cylinder", () => {
    const b = elementBrep({ type: "extrusion", shape: "circle", radius: 5, depth: 2, x: 0, y: 0, z: 0 }).brep!
    expect(rel(massProperties(b).volume, PI * 25 * 2)).toBeLessThan(1e-12)
  })

  test("Boolean elements are computed exactly on their operands", () => {
    const elements = [
      { id: "plate", type: "cube", width: 40, height: 30, depth: 10, x: 0, y: 0, z: 0, visible: false },
      { id: "bore", type: "cylinder", radius: 5, height: 20, x: 0, y: 0, z: 0, visible: false },
      { id: "cut", type: "boolean-subtract", operands: ["plate", "bore"], name: "drilled plate" }
    ]
    const byId = new Map(elements.map((e) => [e.id, e]))
    const b = elementBrep(elements[2]!, byId).brep!
    expect(validateBrep(b).genus).toBe(1)
    expect(rel(massProperties(b).volume, 12000 - PI * 25 * 10)).toBeLessThan(1e-9)
  })
})

describe("the drawing as a STEP file", () => {
  test("visible solids not consumed by a Boolean, exact; the stock and 2D elements are skipped with a reason", () => {
    const elements = [
      { id: "plate", type: "cube", width: 40, height: 30, depth: 10, x: 0, y: 0, z: 0 },
      { id: "bore", type: "cylinder", radius: 5, height: 20, x: 0, y: 0, z: 0 },
      { id: "cut", type: "boolean-subtract", operands: ["plate", "bore"], name: "drilled plate" },
      { id: "pin", type: "cylinder", radius: 2, height: 10, x: 50, y: 0, z: 0, name: "pin" },
      { id: "stock", type: "workpiece", width: 100, height: 100, depth: 20, name: "Stock" },
      { id: "l", type: "line", x1: 0, y1: 0, x2: 10, y2: 0, name: "sketch line" },
      { id: "hidden", type: "sphere", radius: 3, x: 0, y: 0, z: 40, visible: false }
    ]
    const r = sceneToStep(elements, { timestamp: "2026-10-13T00:00:00" })
    expect(r.parts.map((p) => [p.name, p.exact, p.valid])).toEqual([["drilled plate", true, true], ["pin", true, true]])
    expect(r.skipped.map((s) => s.name).sort()).toEqual(["Stock", "sketch line"])
    const back = readStepBreps(r.step!)
    expect(back.warnings).toEqual([])
    expect(back.parts.map((p) => p.name)).toEqual(["drilled plate", "pin"])
    expect(rel(massProperties(back.parts[0]!.brep).volume, 12000 - PI * 250)).toBeLessThan(1e-9)
  })

  test("a solid with only a mesh is written as facets and said so", () => {
    const r = sceneToStep([{ id: "g", type: "gear", moduleValue: 2, teeth: 12, thickness: 5, x: 0, y: 0, z: 0, name: "gear" }])
    expect(r.parts.length).toBe(1)
    expect(r.parts[0]!.exact).toBe(false)
    expect(r.parts[0]!.note).toContain("faceted")
    expect(readStepBreps(r.step!).parts.length).toBe(1)
  })

  test("STEP in, drawing, CAM mesh and STEP out keep the exact solid", () => {
    const drilled = sceneToStep([
      { id: "a", type: "cube", width: 40, height: 30, depth: 10, x: 0, y: 0, z: 0 },
      { id: "b", type: "cylinder", radius: 5, height: 20, x: 0, y: 0, z: 0 },
      { id: "c", type: "boolean-subtract", operands: ["a", "b"], name: "plate" }
    ]).step!
    const imported = stepToElements(drilled)
    expect(imported.warnings).toEqual([])
    expect(imported.report.map((r) => [r.name, r.valid])).toEqual([["plate", true]])
    // The CAM and the viewport see it through its tessellation.
    const element = { ...imported.elements[0]!, id: "imported", x: 100 }
    const mesh = elementMesh(element)!
    expect(rel(volumeOf(mesh), 12000 - PI * 250)).toBeLessThan(1e-2)
    let minX = Infinity
    for (let i = 0; i < mesh.positions.length; i += 3) minX = Math.min(minX, mesh.positions[i]!)
    expect(minX).toBeCloseTo(80, 6)
    // Written back exactly, moved where the element is.
    const again = readStepBreps(sceneToStep([element]).step!)
    const mp = massProperties(again.parts[0]!.brep)
    expect(rel(mp.volume, 12000 - PI * 250)).toBeLessThan(1e-9)
    expect(mp.centroid.x).toBeCloseTo(100, 9)
  })
})

describe("STEP import heals what a foreign exporter left open", () => {
  test("a file whose faces carry their own vertices and edges imports as one valid solid", () => {
    const brep = elementBrep({ id: "b", type: "cube", width: 10, height: 20, depth: 30, x: 0, y: 0, z: 0 }).brep!
    // Write each face as its own shell-less piece: the STEP writer shares edges, so rebuild a Brep with per-face copies.
    const vertices: typeof brep.vertices[number][] = []
    const edges: typeof brep.edges[number][] = []
    const faces = brep.faces.map((f) => {
      const map = new Map<number, number>()
      const v = (i: number) => { let m = map.get(i); if (m === undefined) { m = vertices.length; vertices.push(brep.vertices[i]!); map.set(i, m) } return m }
      return { ...f, loops: f.loops.map((l) => ({ coedges: l.coedges.map((c) => { const e = brep.edges[c.edge]!; edges.push({ ...e, v0: v(e.v0), v1: v(e.v1) }); return { edge: edges.length - 1, reversed: c.reversed } }) })) }
    })
    const text = writeStepBreps([{ name: "exploded", brep: { vertices, edges, faces, shells: [{ faces: faces.map((_, i) => i), closed: true }] } }])
    const imported = stepToElements(text)
    expect(imported.report[0]!.valid).toBe(true)
    expect(imported.report[0]!.healed).toBeDefined()
    expect(imported.warnings.some((w) => w.includes("healed on import"))).toBe(true)
    expect(rel(imported.report[0]!.volume, 6000)).toBeLessThan(1e-9)
  })
})

describe("a long thread in the exported drawing", () => {
  test("a shaft with 31 turns of thread cut into it is written exact: the export can wait, an interactive rebuild could not", () => {
    const m = model()
    m.extrude(m.sketch("XY").circle([0, 0], 6), { depth: 36 })
    m.thread({ kind: "external", diameter: 6, pitch: 1, length: 32, at: [0, 0], offset: 2, cut: true })
    const part = { id: "rod", type: "parametric", name: "Rod", x: 0, y: 0, z: 0, history: m.build() }
    const out = sceneToStep([part])
    expect(out.skipped).toEqual([])
    expect(out.parts.map((p) => p.exact)).toEqual([true])
    expect(out.parts[0]!.valid).toBe(true)
    expect(out.parts[0]!.faces).toBeGreaterThan(3000)
    expect(readStepBreps(out.step!)).toBeDefined()
  }, 120_000)
})
