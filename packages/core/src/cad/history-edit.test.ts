import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { dependentsOf, dimensionsOf, moveFeature, plateTemplate, removeFeature, removeParameter, renameParameter, setDimension, setParameter, usesOf } from "./history-edit.ts"
import { historyVolume, rebuild, type History } from "./history.ts"

// These rebuild whole parametric models (grid patterns, mirrored features) and take seconds each; the default 5 s
// timeout turns them into failures under the load of a full-suite run, as in `csg.test.ts`.
setDefaultTimeout(60_000)

describe("the starting plate", () => {
  test("builds a plate with a hole: width x depth x thick minus the cylinder", () => {
    const r = rebuild(plateTemplate())
    expect(r.issues).toEqual([])
    expect(r.sketches["sketch1"]!.solve.status).toBe("fully-constrained")
    const hole = 60 * 40 * 8 - historyVolume(r)
    expect(hole).toBeGreaterThan(Math.PI * 25 * 8 * 0.99)
    expect(hole).toBeLessThanOrEqual(Math.PI * 25 * 8 + 1e-6)
  })
})

describe("dimensions", () => {
  const plate = plateTemplate()

  test("every feature lists the dimensions it has, with paths", () => {
    expect(dimensionsOf(plate.features[0]!).map((d) => [d.path, d.value])).toEqual([["sketch.constraints.5.value", "width"], ["sketch.constraints.6.value", "depth"]])
    expect(dimensionsOf(plate.features[1]!)).toEqual([{ path: "depth", label: "depth", value: "thick" }])
    expect(dimensionsOf(plate.features[2]!).map((d) => d.path)).toEqual(["offset", "at.0", "at.1", "diameter", "depth"])
  })

  test("setting one changes only that dimension, and the model follows", () => {
    const wider = setDimension(plate, "plate", "depth", 12)
    expect(wider.features[1]).toMatchObject({ depth: 12 })
    expect(wider.features[2]).toEqual(plate.features[2]!) // untouched
    expect(plate.features[1]).toMatchObject({ depth: "thick" }) // the original is not mutated
    expect(historyVolume(rebuild(wider))).toBeGreaterThan(historyVolume(rebuild(plate)))
    const longer = setDimension(plate, "sketch1", "sketch.constraints.5.value", "width * 2")
    expect(rebuild(longer).bodies[0]!.mesh.positions.length).toBeGreaterThan(0)
    expect(historyVolume(rebuild(longer))).toBeGreaterThan(1.9 * historyVolume(rebuild(plate)) - 400)
  })

  test("a feature or a dimension that does not exist is refused, not ignored", () => {
    expect(() => setDimension(plate, "nope", "depth", 1)).toThrow("No feature")
    expect(() => setDimension(plate, "plate", "width", 1)).toThrow("no dimension")
    expect(() => setDimension(plate, "hole1", "at.5", 1)).toThrow("no dimension")
  })
})

describe("parameters", () => {
  const history: History = { ...plateTemplate(), parameters: { ...plateTemplate().parameters, w: 5, wide: "w * 2", width_total: "width + w" } }

  test("renaming rewrites every formula and dimension that uses the name, whole word only", () => {
    const renamed = renameParameter(history, "width", "length")
    expect(renamed.parameters["length"]).toBe(60)
    expect("width" in renamed.parameters).toBe(false)
    expect(renamed.parameters["width_total"]).toBe("length + w")
    expect(dimensionsOf(renamed.features[0]!)[0]!.value).toBe("length")
    expect(renamed.features[2]).toMatchObject({ at: ["length / 2", "depth / 2"] })
    // `w` is its own name: renaming it leaves `width` and `width_total` alone.
    const w = renameParameter(history, "w", "margin")
    expect(w.parameters["wide"]).toBe("margin * 2")
    expect(w.parameters["width_total"]).toBe("width + margin")
    expect(w.parameters["width"]).toBe(60)
    expect(historyVolume(rebuild(renamed))).toBeCloseTo(historyVolume(rebuild(history)), 6)
  })

  test("a bad or taken name is refused, and a missing parameter too", () => {
    expect(() => renameParameter(history, "width", "9lives")).toThrow("not a valid name")
    expect(() => renameParameter(history, "width", "depth")).toThrow("already")
    expect(() => renameParameter(history, "ghost", "x")).toThrow("No parameter")
    expect(() => setParameter(history, "a b", 1)).toThrow("not a valid name")
  })

  test("a parameter that is still used cannot be removed, and the refusal says by what", () => {
    expect(usesOf(history, "width")).toEqual({ parameters: ["width_total"], features: ["sketch1", "hole1"] })
    expect(() => removeParameter(history, "width")).toThrow("still used by parameter width_total, feature sketch1, feature hole1")
    const free = removeParameter(history, "wide")
    expect("wide" in free.parameters).toBe(false)
    expect(setParameter(history, "extra", "thick + 1").parameters["extra"]).toBe("thick + 1")
  })
})

describe("features", () => {
  const plate = plateTemplate()

  test("removing a sketch removes what is built from it, and what is built from that", () => {
    expect(dependentsOf(plate, "sketch1")).toEqual(["plate"])
    expect(removeFeature(plate, "sketch1").features.map((f) => f.id)).toEqual(["hole1"])
    const patterned: History = { ...plate, features: [...plate.features, { id: "grid", type: "pattern", feature: "hole1", kind: "linear", count: 2, step: [10, 0, 0] }] }
    expect(removeFeature(patterned, "hole1").features.map((f) => f.id)).toEqual(["sketch1", "plate"])
    expect(removeFeature(patterned, "sketch1").features.map((f) => f.id)).toEqual(["hole1", "grid"])
    expect(removeFeature(plate, "ghost")).toEqual(plate)
  })

  test("a feature moves one place, but never above what it needs or below what needs it", () => {
    expect(moveFeature(plate, "hole1", -1).features.map((f) => f.id)).toEqual(["sketch1", "hole1", "plate"]) // the hole is independent
    expect(moveFeature(plate, "plate", -1)).toEqual(plate) // it needs its sketch above it
    expect(moveFeature(plate, "sketch1", 1)).toEqual(plate) // the extrusion needs it
    expect(moveFeature(plate, "sketch1", -1)).toEqual(plate) // already first
    expect(moveFeature(plate, "hole1", 1)).toEqual(plate) // already last
  })
})

describe("edge, corner, hole kind and mirror dimensions", () => {
  const base = plateTemplate()
  const treated: History = {
    parameters: { ...base.parameters, c: 1, r: 2, head: 16 },
    features: [
      base.features[0]!,
      { id: "plate", type: "extrude", sketch: "sketch1", depth: "thick", operation: "new", edge: { style: "chamfer", size: "c" }, corner: { style: "fillet", size: "r" } },
      { id: "hole1", type: "hole", plane: "XY", offset: "thick", at: ["width / 2", "depth / 2"], diameter: "hole", depth: "thick", kind: "counterbore", headDiameter: "head", headDepth: 3 },
      { id: "mirrored", type: "mirror", feature: "hole1", plane: "YZ", offset: "width / 2" },
      { id: "again", type: "pattern", feature: "mirrored", kind: "linear", count: 2, step: [0, 5, 0] }
    ]
  }

  test("an extrusion lists edge.size and corner.size only when it has them", () => {
    expect(dimensionsOf(treated.features[1]!).map((d) => [d.path, d.value])).toEqual([["depth", "thick"], ["edge.size", "c"], ["corner.size", "r"]])
    expect(dimensionsOf(base.features[1]!).map((d) => d.path)).toEqual(["depth"])
  })

  test("a counterbored hole lists headDiameter and headDepth; a countersink its angle; a mirror its offset", () => {
    expect(dimensionsOf(treated.features[2]!).map((d) => d.path)).toEqual(["offset", "at.0", "at.1", "diameter", "depth", "headDiameter", "headDepth"])
    const sink = { id: "s", type: "hole", plane: "XY", at: [1, 2], diameter: 4, depth: 6, kind: "countersink", headDiameter: 8, angle: 90 } as const
    expect(dimensionsOf(sink).map((d) => [d.path, d.label])).toEqual([["at.0", "centre u"], ["at.1", "centre v"], ["diameter", "diameter"], ["depth", "depth"], ["headDiameter", "countersink diameter"], ["angle", "countersink angle (deg)"]])
    expect(dimensionsOf(treated.features[3]!).map((d) => [d.path, d.value])).toEqual([["offset", "width / 2"]])
    expect(dimensionsOf({ id: "m", type: "mirror", feature: "x", plane: "XY" })).toEqual([])
  })

  test("setDimension reaches the nested edge, corner and head paths without touching the rest", () => {
    const next = setDimension(setDimension(setDimension(treated, "plate", "edge.size", 0.5), "plate", "corner.size", "r * 2"), "hole1", "headDiameter", 18)
    expect(next.features[1]).toMatchObject({ edge: { style: "chamfer", size: 0.5 }, corner: { style: "fillet", size: "r * 2" } })
    expect(next.features[2]).toMatchObject({ headDiameter: 18, headDepth: 3, kind: "counterbore" })
    expect(treated.features[1]).toMatchObject({ edge: { size: "c" } }) // immutable
    expect(() => setDimension(base, "plate", "edge.size", 1)).toThrow("no dimension")
  })

  test("the edited dimension drives the model: a smaller chamfer leaves more material", () => {
    expect(rebuild(treated).issues).toEqual([])
    const smaller = setDimension(treated, "plate", "edge.size", 0.25)
    expect(historyVolume(rebuild(smaller))).toBeGreaterThan(historyVolume(rebuild(treated)))
  })

  test("renaming a parameter rewrites the formulas inside edge, corner and head dimensions, and usesOf finds them", () => {
    expect(usesOf(treated, "c").features).toEqual(["plate"])
    expect(usesOf(treated, "head").features).toEqual(["hole1"])
    expect(usesOf(treated, "width").features).toEqual(["sketch1", "hole1", "mirrored"])
    const renamed = renameParameter(treated, "c", "chamferSize")
    expect(renamed.features[1]).toMatchObject({ edge: { size: "chamferSize" } })
    expect(renamed.parameters["chamferSize"]).toBe(1)
    const w = renameParameter(treated, "width", "w")
    expect(w.features[3]).toMatchObject({ offset: "w / 2" })
    expect(rebuild(w).issues).toEqual([])
  })

  test("removing a parameter that an edge or mirror still uses is refused", () => {
    expect(() => removeParameter(treated, "c")).toThrow("feature plate")
    expect(() => removeParameter(treated, "head")).toThrow("feature hole1")
  })

  test("a mirror depends on its source and a pattern on the mirror: removal cascades through both", () => {
    expect(dependentsOf(treated, "hole1")).toEqual(["mirrored"])
    expect(dependentsOf(treated, "mirrored")).toEqual(["again"])
    expect(removeFeature(treated, "hole1").features.map((f) => f.id)).toEqual(["sketch1", "plate"])
    expect(removeFeature(treated, "mirrored").features.map((f) => f.id)).toEqual(["sketch1", "plate", "hole1"])
    expect(removeFeature(treated, "sketch1").features.map((f) => f.id)).toEqual(["hole1", "mirrored", "again"])
  })

  test("a mirror cannot move above the feature it reflects, nor the source below its mirror", () => {
    expect(moveFeature(treated, "mirrored", -1)).toEqual(treated)
    expect(moveFeature(treated, "hole1", 1)).toEqual(treated)
    expect(moveFeature(treated, "again", -1)).toEqual(treated)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// shell, fillet, grid pattern, sweep, loft

import type { Feature } from "./history.ts"

const sq = (id: string, plane: "XY" | "YZ" | "ZX" = "XY", offset?: number): Feature => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [
      { id: "a", kind: "point", x: 0, y: 0 }, { id: "b", kind: "point", x: 10, y: 0 }, { id: "c", kind: "point", x: 10, y: 10 }, { id: "d", kind: "point", x: 0, y: 10 },
      { id: "l1", kind: "line", p1: "a", p2: "b" }, { id: "l2", kind: "line", p1: "b", p2: "c" }, { id: "l3", kind: "line", p1: "c", p2: "d" }, { id: "l4", kind: "line", p1: "d", p2: "a" }
    ],
    constraints: [{ type: "fixed", point: "a", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" }, { type: "length", line: "l1", value: "w" }, { type: "length", line: "l2", value: "w" }]
  }
})
const path = (id: string): Feature => ({
  id, type: "sketch", plane: "XY",
  sketch: { entities: [{ id: "a", kind: "point", x: 0, y: 0 }, { id: "b", kind: "point", x: 30, y: 0 }, { id: "l", kind: "line", p1: "a", p2: "b" }], constraints: [] }
})
const modelled: History = {
  parameters: { w: 20, wall: 2, rr: 3, nx: 3 },
  features: [
    sq("s"), { id: "box", type: "extrude", sketch: "s", depth: 20, operation: "new" },
    { id: "sh", type: "shell", feature: "box", thickness: "wall", open: "top" },
    { id: "f", type: "fillet", radius: "rr", edges: { parallel: "z", minLength: 4 } },
    { id: "h", type: "hole", plane: "XY", offset: 20, at: [5, 5], diameter: 3, depth: 5 },
    { id: "g", type: "pattern", feature: "h", kind: "grid", count: "nx", countB: 2, step: [4, 0, 0], stepB: [0, 4, 0] },
    sq("prof", "YZ"), path("route"), { id: "pipe", type: "sweep", profile: "prof", path: "route", operation: "new" },
    { id: "pm", type: "mirror", feature: "pipe", plane: "YZ" }, { id: "pp", type: "pattern", feature: "pipe", kind: "linear", count: 2, step: [0, 0, 50] },
    sq("l1", "XY", 100), sq("l2", "XY", 130), { id: "lf", type: "loft", sections: ["l1", "l2"], operation: "new" }
  ]
}
const feat = (h: History, id: string): Feature => h.features.find((f) => f.id === id)!

describe("dimensions of shell, fillet and grid patterns", () => {
  test("a shell has its thickness; a fillet its radius and, if set, its shortest edge", () => {
    expect(dimensionsOf(feat(modelled, "sh"))).toEqual([{ path: "thickness", label: "shell thickness", value: "wall" }])
    expect(dimensionsOf(feat(modelled, "f")).map((d) => [d.path, d.value])).toEqual([["radius", "rr"], ["edges.minLength", 4]])
    const bare: Feature = { id: "f2", type: "fillet", radius: 2, style: "chamfer" }
    expect(dimensionsOf(bare)).toEqual([{ path: "radius", label: "chamfer size", value: 2 }])
  })

  test("a grid pattern lists count, the first step, the rows and the row step in that order", () => {
    expect(dimensionsOf(feat(modelled, "g")).map((d) => d.path)).toEqual(["count", "step.0", "step.1", "step.2", "countB", "stepB.0", "stepB.1", "stepB.2"])
    expect(dimensionsOf(feat(modelled, "g")).find((d) => d.path === "countB")).toMatchObject({ label: "rows", value: 2 })
  })

  test("sweep and loft have no dimensions of their own (their sketches do)", () => {
    expect(dimensionsOf(feat(modelled, "pipe"))).toEqual([])
    expect(dimensionsOf(feat(modelled, "lf"))).toEqual([])
  })

  test("setDimension writes the thickness, the radius, the minimum length, the rows and a row step; the original is untouched", () => {
    const a = setDimension(modelled, "sh", "thickness", 3)
    expect(feat(a, "sh")).toMatchObject({ thickness: 3, open: "top" })
    expect(feat(modelled, "sh")).toMatchObject({ thickness: "wall" })
    expect(feat(setDimension(modelled, "f", "radius", "rr * 2"), "f")).toMatchObject({ radius: "rr * 2" })
    expect(feat(setDimension(modelled, "f", "edges.minLength", 8), "f")).toMatchObject({ edges: { parallel: "z", minLength: 8 } })
    expect(feat(setDimension(modelled, "g", "countB", 3), "g")).toMatchObject({ countB: 3 })
    expect(feat(setDimension(modelled, "g", "stepB.1", "nx * 2"), "g")).toMatchObject({ stepB: [0, "nx * 2", 0] })
  })

  test("a dimension a feature does not have is refused (a fillet without a minimum length has no edges.minLength)", () => {
    expect(() => setDimension(modelled, "sh", "radius", 1)).toThrow("no dimension")
    expect(() => setDimension({ ...modelled, features: [{ id: "f2", type: "fillet", radius: 2 }] }, "f2", "edges.minLength", 1)).toThrow("no dimension")
  })

  test("the model follows an edit: a thicker wall means more material left", () => {
    const base: History = { ...modelled, features: modelled.features.slice(0, 3) }
    const thick = setDimension(base, "sh", "thickness", 4)
    expect(historyVolume(rebuild(thick))).toBeGreaterThan(historyVolume(rebuild(base)))
  })
})

describe("parameters used by the new features", () => {
  test("usesOf finds the shell, fillet and grid dimensions that use a parameter", () => {
    expect(usesOf(modelled, "wall").features).toEqual(["sh"])
    expect(usesOf(modelled, "rr").features).toEqual(["f"])
    expect(usesOf(modelled, "nx").features).toEqual(["g"])
  })

  test("renaming a parameter rewrites the shell thickness, the fillet radius and the grid count", () => {
    const renamed = renameParameter(modelled, "wall", "skin")
    expect(feat(renamed, "sh")).toMatchObject({ thickness: "skin" })
    expect(renamed.parameters["skin"]).toBe(2)
    expect(feat(renameParameter(modelled, "nx", "columns"), "g")).toMatchObject({ count: "columns" })
  })

  test("removeParameter refuses while a fillet radius still uses it", () => {
    expect(() => removeParameter(modelled, "rr")).toThrow("feature f")
  })
})

describe("what the new features need", () => {
  test("a sweep needs its profile and its path sketches; a loft its sections; a shell its extrusion", () => {
    expect(dependentsOf(modelled, "prof")).toEqual(["pipe"])
    expect(dependentsOf(modelled, "route")).toEqual(["pipe"])
    expect(dependentsOf(modelled, "l1")).toEqual(["lf"])
    expect(dependentsOf(modelled, "l2")).toEqual(["lf"])
    expect(dependentsOf(modelled, "box")).toEqual(["sh"])
  })

  test("a mirror and a pattern of a sweep depend on it", () => {
    expect(dependentsOf(modelled, "pipe")).toEqual(["pm", "pp"])
  })

  test("removing the profile of a sweep takes the sweep and its mirror and pattern with it, and nothing else", () => {
    const without = removeFeature(modelled, "prof")
    expect(without.features.map((f) => f.id)).toEqual(["s", "box", "sh", "f", "h", "g", "route", "l1", "l2", "lf"])
  })

  test("removing the path sketch does the same", () => {
    expect(removeFeature(modelled, "route").features.map((f) => f.id)).toEqual(["s", "box", "sh", "f", "h", "g", "prof", "l1", "l2", "lf"])
  })

  test("removing one section of a loft removes the loft but keeps the other section", () => {
    const without = removeFeature(modelled, "l1")
    expect(without.features.map((f) => f.id)).not.toContain("lf")
    expect(without.features.map((f) => f.id)).toContain("l2")
  })

  test("removing the extrusion takes its shell; a fillet names bodies, not features, so it stays", () => {
    const ids = removeFeature(modelled, "box").features.map((f) => f.id)
    expect(ids).not.toContain("sh")
    expect(ids).toContain("f")
    expect(ids).not.toContain("box")
  })

  test("a grid pattern leaves its hole alone when removed, and removing the hole removes the grid", () => {
    expect(removeFeature(modelled, "g").features.map((f) => f.id)).toContain("h")
    expect(removeFeature(modelled, "h").features.map((f) => f.id)).not.toContain("g")
  })

  test("a sweep cannot be moved above its path sketch, nor a shell above its extrusion, nor the extrusion below its shell", () => {
    expect(moveFeature(modelled, "pipe", -1)).toBe(modelled)
    expect(moveFeature(modelled, "sh", -1)).toBe(modelled)
    expect(moveFeature(modelled, "box", 1)).toBe(modelled)
  })

  test("independent features do move: the loft's sections swap places", () => {
    const moved = moveFeature(modelled, "l2", -1)
    expect(moved.features.map((f) => f.id).slice(-3)).toEqual(["l2", "l1", "lf"])
  })
})
