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
