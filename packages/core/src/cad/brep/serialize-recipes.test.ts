import { expect, setDefaultTimeout, test } from "bun:test"
import { brepFromJson, brepToText } from "./serialize.ts"
import { massProperties } from "./mass.ts"
import { countTopology } from "./topology.ts"
import { buildRecipe, recipeNames } from "../recipes.ts"
import { rebuildExact } from "../history-brep.ts"
import { rebuild, type DimConstraint, type Feature, type SketchFeature } from "../history.ts"
import type { SketchEntity } from "../sketch.ts"

setDefaultTimeout(120_000)

// Real bodies: the recipes of the library (NURBS, tori, cones, fillets, threads...) as the exact kernel builds it must be accepted
// by the checked decoder and come back with the same volume and counts. This is the guard against a shape the decoder is too strict about.
test("every exact body of the first recipes survives the JSON form", () => {
  let bodies = 0
  const kinds = new Set<string>()
  for (const name of recipeNames().slice(0, 12)) {
    let history
    try { history = buildRecipe(name).history } catch { continue }
    for (const body of rebuildExact(history, rebuild(history)).bodies) {
      if (body.brep === undefined) continue
      bodies++
      for (const f of body.brep.faces) kinds.add(f.surface.kind)
      const text = brepToText(body.brep)
      const back = brepFromJson(JSON.parse(text))
      expect(back.ok, `${name}: ${back.ok ? "" : JSON.stringify(back.problems.slice(0, 3))}`).toBe(true)
      if (!back.ok) continue
      expect(countTopology(back.brep), name).toEqual(countTopology(body.brep))
      expect(massProperties(back.brep).volume, name).toBe(massProperties(body.brep).volume)
    }
  }
  expect(bodies).toBeGreaterThan(2)
  expect(kinds.has("plane") && kinds.has("cylinder")).toBe(true)
})

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

// A loft from a circle to a square is rational NURBS columns; a revolve of an arc profile gives tori and cones. They carry the shapes the
// recipes do not: NURBS surfaces with weights, and parameter-space curves.
test("a lofted body (NURBS faces with weights) survives the JSON form", () => {
  const round: SketchFeature = {
    id: "s1", type: "sketch", plane: "XY",
    sketch: { entities: [pt("c", 10, 10), { id: "k", kind: "circle", center: "c", radius: 10 }], constraints: [{ type: "fixed", point: "c" }, { type: "radius", circle: "k", value: 10 } as DimConstraint] }
  }
  const square: SketchFeature = {
    id: "s2", type: "sketch", plane: "XY", offset: 25,
    sketch: {
      entities: [pt("p1", 2.2, 1.9), pt("p2", 11, 2.3), pt("p3", 13, 8), pt("p4", 1.6, 7), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
      constraints: [
        { type: "fixed", point: "p1", x: 2, y: 2 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
        { type: "length", line: "l1", value: 16 }, { type: "length", line: "l2", value: 16 }
      ] as DimConstraint[]
    }
  }
  const features: Feature[] = [round, square, { id: "lofted", type: "loft", sections: ["s1", "s2"], operation: "new" }]
  const history = { parameters: {}, features }
  const body = rebuildExact(history, rebuild(history)).bodies[0]!.brep!
  expect(body.faces.some((f) => f.surface.kind === "nurbs")).toBe(true)
  const back = brepFromJson(JSON.parse(brepToText(body)))
  expect(back.ok, back.ok ? "" : JSON.stringify(back.problems.slice(0, 3))).toBe(true)
  if (!back.ok) return
  expect(countTopology(back.brep)).toEqual(countTopology(body))
  expect(massProperties(back.brep).volume).toBe(massProperties(body).volume)
})
