import { describe, expect, test } from "bun:test"
import { dependentsOf, dimensionsOf, moveFeature, plateTemplate, removeFeature, removeParameter, renameParameter, setDimension, setParameter, usesOf } from "./history-edit.ts"
import { historyVolume, rebuild, type History } from "./history.ts"

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
