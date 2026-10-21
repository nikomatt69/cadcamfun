/**
 * A variable-radius fillet in the parametric history (spec 33 E7): the radius runs linearly along a straight edge, and the
 * mesh rebuild (a loft of the two end sections) and the exact replay (the conical `variableFillet`) remove the same volume.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { DimConstraint, History } from "./history.ts"
import type { SketchEntity } from "./sketch.ts"
import { meshVolume } from "./solid.ts"
import { rebuild } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { brepLocator, massProperties, validateBrep } from "./brep/index.ts"

setDefaultTimeout(120_000)
const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

/** A 30 (x) by 20 by 10 box; the variable fillet takes the one vertical edge at the origin corner (x 0..3, y 0..3 selects it). */
const body = (radiusEnd?: number): History => ({
  parameters: {},
  features: [
    {
      id: "s1", type: "sketch", plane: "XY",
      sketch: {
        entities: [pt("p1", 0, 0), pt("p2", 30, 0), pt("p3", 30, 20), pt("p4", 0, 20), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
        constraints: [
          { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" },
          { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" }
        ] as DimConstraint[]
      }
    },
    { id: "box", type: "extrude", sketch: "s1", depth: 10, operation: "new" },
    {
      id: "vf", type: "fillet", style: "fillet", radius: 1, ...(radiusEnd === undefined ? {} : { radiusEnd }),
      edges: { within: { min: [-1, -1, -1], max: [3, 3, 11] } }
    }
  ]
})

describe("variable-radius fillet in the history", () => {
  test("mesh and exact agree on the volume the taper removes, and the exact body validates", () => {
    const mesh = rebuild(body(3))
    expect(mesh.issues.filter((i) => i.severity === "error")).toEqual([])
    const exact = rebuildExact(body(3))
    const solid = exact.bodies[0]
    if (solid?.brep === undefined) throw new Error(`no exact body: ${solid?.reason ?? "none"}`)
    expect(validateBrep(solid.brep).issues).toEqual([])
    // Removed along the 10 mm edge: L (1 - pi/4) (r0^2 + r0 r1 + r1^2) / 3 with r0 = 1, r1 = 3.
    const expected = 6000 - (10 * (1 - Math.PI / 4) * (1 + 3 + 9)) / 3
    const vExact = massProperties(solid.brep).volume
    const vMesh = meshVolume(mesh.bodies[0]!.mesh)
    const removed = 6000 - expected
    expect(Math.abs(vExact - expected) / removed).toBeLessThan(1e-4)
    expect(Math.abs(vMesh - expected) / removed).toBeLessThan(0.03)
    const locator = brepLocator(solid.brep)
    expect(locator.classify({ x: 0.4, y: 0.4, z: 0.2 }, 1e-6)).toBe("in")
    expect(locator.classify({ x: 0.4, y: 0.4, z: 9.8 }, 1e-6)).toBe("out")
  })
  test("equal ends equal the constant fillet; a chamfer with radiusEnd is refused", () => {
    const equalEnds = body(2)
    ;(equalEnds.features[2] as { radius: number }).radius = 2
    const vVar = massProperties(rebuildExact(equalEnds).bodies[0]!.brep!).volume
    const vConst = massProperties(rebuildExact(body()).bodies[0]!.brep!).volume
    // body() has radius 1 constant, so compare against a constant history of radius 2 built the same way.
    const h = body(2)
    ;(h.features[2] as { radius: number }).radius = 2
    delete (h.features[2] as { radiusEnd?: number }).radiusEnd
    const vConst2 = massProperties(rebuildExact(h).bodies[0]!.brep!).volume
    expect(Math.abs(vVar - vConst2)).toBeLessThan(1e-6)
    expect(vConst).toBeGreaterThan(vConst2)
    const bad = rebuild({ parameters: {}, features: [...body(3).features.slice(0, 2), { id: "vf", type: "fillet", style: "chamfer", radius: 1, radiusEnd: 3 }] })
    expect(bad.issues.some((i) => i.severity === "error" && i.message.includes("variable radius"))).toBe(true)
  })
})
