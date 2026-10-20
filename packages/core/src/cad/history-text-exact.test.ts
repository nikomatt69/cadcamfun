import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuild, type Feature, type History, type SketchFeature } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"
import type { SketchEntity } from "./sketch.ts"

setDefaultTimeout(60_000)

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

const rectangle = (id: string, x: number, y: number, w: number, h: number): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("p1", x, y), pt("p2", x + w, y), pt("p3", x + w, y + h), pt("p4", x, y + h), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x, y }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ]
  }
})

const history = (features: Feature[]): History => ({ parameters: {}, features })
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe("exact text (C2)", () => {
  test("a standalone text is an exact solid with the mesh's volume", () => {
    const h = history([{ id: "t1", type: "text", text: "A7", height: 10, depth: 3, plane: "XY", operation: "new" }])
    const r = rebuildExact(h)
    expect(r.result.issues.filter((i) => i.severity === "error")).toEqual([])
    const b = r.bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(validateBrep(b.brep!).issues.map((i) => i.message)).toEqual([])
    const mesh = rebuild(h).bodies[0]!
    expect(rel(massProperties(b.brep!).volume, meshVolume(mesh.mesh))).toBeLessThan(1e-6)
  })

  test("text embossed on a plate top keeps the exact model", () => {
    const h = history([
      rectangle("s1", 0, 0, 40, 25),
      { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" },
      { id: "t1", type: "text", text: "OK", height: 8, depth: 2, plane: "XY", offset: 6, at: [5, 8], operation: "union" }
    ])
    const r = rebuildExact(h)
    const b = r.bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(validateBrep(b.brep!).issues.map((i) => i.message)).toEqual([])
    const mesh = rebuild(h).bodies[0]!
    expect(rel(massProperties(b.brep!).volume, meshVolume(mesh.mesh))).toBeLessThan(1e-6)
    expect(massProperties(b.brep!).volume).toBeGreaterThan(6000)
  })
})
