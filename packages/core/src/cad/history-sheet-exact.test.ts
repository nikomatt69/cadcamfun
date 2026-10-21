import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuild, type Feature, type History, type SketchFeature } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"
import type { SketchEntity } from "./sketch.ts"

setDefaultTimeout(60_000)

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

const straight = (id: string): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("a", 0, 0), pt("b", 30, 0), line("c", "a", "b")],
    constraints: [{ type: "fixed", point: "a", x: 0, y: 0 }, { type: "fixed", point: "b", x: 30, y: 0 }]
  }
})

const bent = (id: string): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("a", 0, 0), pt("b", 20, 0), pt("c", 20, 20), line("l1", "a", "b"), line("l2", "b", "c")],
    constraints: [
      { type: "fixed", point: "a", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" },
      { type: "length", line: "l1", value: 20 }, { type: "length", line: "l2", value: 20 }
    ]
  }
})

const history = (features: Feature[]): History => ({ parameters: {}, features })
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe("exact sheet (C2)", () => {
  test("a straight base flange is an exact strip", () => {
    const h = history([straight("s1"), { id: "flange", type: "sheet", sketch: "s1", thickness: 2, width: 20, operation: "new" }])
    const r = rebuildExact(h)
    expect(r.result.issues.filter((i) => i.severity === "error")).toEqual([])
    const b = r.bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(validateBrep(b.brep!).issues.map((i) => i.message)).toEqual([])
    expect(rel(massProperties(b.brep!).volume, 30 * 2 * 20)).toBeLessThan(1e-9)
  })

  test("a bent flange matches the mesh volume and stays valid", () => {
    const h = history([bent("s1"), { id: "flange", type: "sheet", sketch: "s1", thickness: 2, width: 20, bendRadius: 3, operation: "new" }])
    const r = rebuildExact(h)
    const b = r.bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(validateBrep(b.brep!).issues.map((i) => i.message)).toEqual([])
    const mesh = rebuild(h).bodies[0]!
    expect(rel(massProperties(b.brep!).volume, meshVolume(mesh.mesh))).toBeLessThan(1e-6)
  })
})


test("edge flanges extend an existing sheet and its flat development in both rebuilds", () => {
  for (const end of ["start", "end"] as const) for (const angle of [90, -90, 60]) {
    const h: History = { parameters: { flange: 20 }, features: [straight("s1"), { id: "sheet", type: "sheet", sketch: "s1", thickness: 2, width: 20, bendRadius: 3, operation: "new", flanges: [{ end, length: "flange", angle }] }] }
    const mesh = rebuild(h), exact = rebuildExact(h)
    expect(mesh.issues.filter((i) => i.severity === "error")).toEqual([])
    const b = exact.bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(validateBrep(b.brep!).valid).toBe(true)
    expect(rel(massProperties(b.brep!).volume, meshVolume(mesh.bodies[0]!.mesh))).toBeLessThan(1e-6)
    const phi = Math.abs(angle) * Math.PI / 180
    const flat = mesh.flatPatterns["sheet"]!
    expect(flat.bends).toHaveLength(1)
    expect(flat.length).toBeCloseTo(50 - 2 * 4 * Math.tan(phi / 2) + phi * (3 + 0.44 * 2), 6)
  }
  const bad = rebuild(history([straight("s1"), { id: "sheet", type: "sheet", sketch: "s1", thickness: 2, width: 20, operation: "new", flanges: [{ end: "end", length: 20, angle: 180 }] }]))
  expect(bad.issues.some((i) => i.severity === "error")).toBe(true)
  expect(bad.bodies).toHaveLength(0)
})

test("bend-end relief removes material at both width edges and follows the developed blank", async () => {
  const { flatPatternDrawing } = await import("./sheet-metal.ts")
  for (const end of ["start", "end"] as const) {
    const h = history([straight("s1"), { id: "sheet", type: "sheet", sketch: "s1", thickness: 2, width: 20, bendRadius: 3, operation: "new", flanges: [{ end, length: 20, angle: 90, relief: { width: 1, depth: 1 } }] }])
    const mesh = rebuild(h), exact = rebuildExact(h)
    expect(mesh.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(exact.bodies[0]!.reason).toBeUndefined()
    const body = exact.bodies[0]!.brep!
    expect(validateBrep(body).valid).toBe(true)
    expect(rel(massProperties(body).volume, meshVolume(mesh.bodies[0]!.mesh))).toBeLessThan(1e-6)
    // Cross-section area: two straight runs plus the centre-radius bend. Two 1 mm width strips lose the flange,
    // bend and 1 mm of the original base run; the base before the relief stays full width.
    const area = (30 - 4 + 20 - 4) * 2 + Math.PI / 2 * 4 * 2
    const removed = 2 * ((20 - 4 + 1) * 2 + Math.PI / 2 * 4 * 2)
    expect(rel(massProperties(body).volume, area * 20 - removed)).toBeLessThan(0.001)
    const flat = mesh.flatPatterns["sheet"]!
    expect(flat.reliefs).toHaveLength(1)
    const drawing = flatPatternDrawing(flat, 20)
    const cut = drawing.entities.filter((e) => e.layerId === "cut")
    expect(cut.length).toBe(8)
    const bend = drawing.entities.find((e) => e.layerId === "bend")!
    expect(bend._tag).toBe("Line")
    if (bend._tag === "Line") { expect(bend.start.y).toBe(1); expect(bend.end.y).toBe(19) }
  }
})
