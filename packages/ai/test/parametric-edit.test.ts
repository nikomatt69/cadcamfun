/**
 * Structural edits of a stored parametric part (`cad_edit.parametric_edit`) against the real kernel, and the history schema's
 * promise that it keeps every field the kernel reads: a field the schema drops is silently lost on the first assistant update.
 */
import { describe, expect, test } from "bun:test"
import { ParametricEdit, PARAMETRIC_ACTION_INPUTS } from "@cadcamfun/api"
import { model, plateTemplate, type History } from "@cadcamfun/core"
import { Schema } from "effect"
import { CELLS } from "../../core/src/cad/history-cells.ts"
import { decodeHistory, parametricReport } from "../src/parametric.ts"
import { editHistory, outlineHistory, OUTLINE_DIMENSION_CAP } from "../src/parametric-edit.ts"

const edits = (...list: ReadonlyArray<unknown>) => list.map((e) => Schema.decodeUnknownSync(ParametricEdit)(e))
const plate = (): History => structuredClone(plateTemplate())
const volume = (history: History): number => parametricReport(history).volumeMm3!

describe("the history schema keeps every field of every feature kind", () => {
  for (const cell of CELLS) {
    test(cell.id, () => {
      const m = model()
      cell.build(m)
      const built = JSON.parse(JSON.stringify(m.build())) as History
      const decoded = decodeHistory(built)
      expect(decoded.success).toBe(true)
      if (decoded.success) expect(JSON.parse(JSON.stringify(decoded.data))).toEqual(built)
    })
  }

  test("the cosmetic thread, tolerance and fit of a hole, and the designation of a thread, survive a decode", () => {
    const m = model()
    const base = m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 })
    m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 6.8, depth: 10, thread: { designation: "M8", depth: 8, fit: "6H" }, tolerance: { upper: 0.02, lower: 0 }, fit: "H7" })
    m.thread({ kind: "external", diameter: 8, pitch: 1.25, length: 6, at: [5, 5], offset: 10, designation: "M8", operation: "union", targets: [base] })
    const built = JSON.parse(JSON.stringify(m.build())) as History
    const decoded = decodeHistory(built)
    expect(decoded.success).toBe(true)
    if (!decoded.success) return
    const hole = decoded.data.features.find((f) => f.type === "hole")
    expect(hole).toMatchObject({ thread: { designation: "M8", depth: 8, fit: "6H" }, tolerance: { upper: 0.02, lower: 0 }, fit: "H7" })
    expect(decoded.data.features.find((f) => f.type === "thread")).toMatchObject({ designation: "M8" })
  })
})

describe("editHistory", () => {
  test("a parameter is added and a feature dimension is bound to it; the part rebuilds with the new size", () => {
    const history = plate()
    const before = volume(history)
    const stored = outlineHistory(history).find((f) => f.type === "extrude")!
    const depth = ("dimensions" in stored ? stored.dimensions : []).find((d) => d.path === "depth")!
    expect(depth).toBeDefined()
    const out = editHistory(history, edits(
      { op: "set_parameter", name: "plate_thickness", value: 12 },
      { op: "set_dimension", feature: stored.id, path: "depth", value: "plate_thickness" }
    ))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.applied[0]).toContain("added")
    expect(out.history.parameters["plate_thickness"]).toBe(12)
    expect(volume(out.history)).toBeGreaterThan(before)
    // Edit by parameter afterwards: the bound dimension follows.
    const resized = editHistory(out.history, edits({ op: "set_parameter", name: "plate_thickness", value: 20 }))
    expect(resized.ok).toBe(true)
    if (resized.ok) expect(volume(resized.history)).toBeGreaterThan(volume(out.history))
  })

  test("renaming a parameter rewrites every formula that uses it", () => {
    const history = plate()
    const name = Object.keys(history.parameters)[0]!
    const out = editHistory(history, edits({ op: "rename_parameter", from: name, to: "renamed_one" }))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.history.parameters).toHaveProperty("renamed_one")
    expect(out.history.parameters).not.toHaveProperty(name)
    expect(volume(out.history)).toBeCloseTo(volume(history), 3)
  })

  test("a parameter that is still used cannot be removed, and the refusal names who uses it", () => {
    const history = plate()
    const used = Object.keys(history.parameters).find((n) => JSON.stringify(history.features).includes(n))!
    const out = editHistory(history, edits({ op: "remove_parameter", name: used }))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain("still used")
  })

  test("a dimension path that does not exist is refused with the paths the feature has", () => {
    const history = plate()
    const out = editHistory(history, edits({ op: "set_dimension", feature: "hole1", path: "radius", value: 3 }))
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toContain("no dimension 'radius'")
      expect(out.error).toContain("diameter")
    }
  })

  test("an unknown feature is refused with the feature ids", () => {
    const out = editHistory(plate(), edits({ op: "set_dimension", feature: "ghost", path: "depth", value: 3 }))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain("hole1")
  })

  test("a feature is inserted at the end, built, and the part loses material; replace_feature changes a field no path reaches", () => {
    const history = plate()
    const before = volume(history)
    const out = editHistory(history, edits({ op: "insert_feature", feature: { id: "chamfer1", type: "fillet", style: "chamfer", radius: 1, edges: { parallel: "z" } } }))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.history.features.at(-1)!.id).toBe("chamfer1")
    expect(volume(out.history)).toBeLessThan(before)
    const replaced = editHistory(out.history, edits({ op: "replace_feature", feature: { id: "chamfer1", type: "fillet", style: "fillet", radius: 2, edges: { parallel: "z" } } }))
    expect(replaced.ok).toBe(true)
    if (replaced.ok) expect(replaced.history.features.at(-1)).toMatchObject({ style: "fillet", radius: 2 })
  })

  test("inserting a feature above what it needs is refused by the kernel's order rule, and replacing a feature with another type is refused", () => {
    const history = plate()
    const early = editHistory(history, edits({ op: "insert_feature", atStart: true, feature: { id: "e0", type: "extrude", sketch: "plate-sketch-missing", depth: 3, operation: "new" } }))
    expect(early.ok).toBe(false)
    const first = history.features[0]!.id
    const swap = editHistory(history, edits({ op: "replace_feature", feature: { id: first, type: "extrude", sketch: first, depth: 3, operation: "new" } }))
    expect(swap.ok).toBe(false)
    if (!swap.ok) expect(swap.error).toContain("cannot replace")
  })

  test("removing a feature with dependents needs cascade; with it the dependents go too", () => {
    const history = plate()
    const sketch = history.features.find((f) => f.type === "sketch")!.id
    const refused = editHistory(history, edits({ op: "remove_feature", id: sketch }))
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error).toContain("cascade:true")
    const hole = editHistory(history, edits({ op: "remove_feature", id: "hole1" }))
    expect(hole.ok).toBe(true)
    if (!hole.ok) return
    expect(hole.history.features.some((f) => f.id === "hole1")).toBe(false)
    expect(volume(hole.history)).toBeGreaterThan(volume(history))
  })

  test("a list is atomic: the second edit fails, so the first one is not returned", () => {
    const history = plate()
    const out = editHistory(history, edits(
      { op: "set_parameter", name: "extra", value: 3 },
      { op: "set_dimension", feature: "ghost", path: "depth", value: 3 }
    ))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain("edits[1]")
  })

  test("an edit that breaks the rebuild is refused with the kernel's message, not stored", () => {
    const history = plate()
    const out = editHistory(history, edits({ op: "set_dimension", feature: "hole1", path: "diameter", value: "nonexistent + 1" }))
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toContain("fail to rebuild")
      expect(out.problems!.join(" ")).toContain("nonexistent")
    }
  })

  test("feature names and groups are timeline-only, set the timeline version, and do not change the geometry", () => {
    const history = plate()
    const ids = history.features.map((f) => f.id)
    const out = editHistory(history, edits(
      { op: "rename_feature", id: ids[0]!, name: "Base sketch" },
      { op: "group_features", group: "base", name: "Base", ids: ids.slice(0, 2) }
    ))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.history.version).toBe(2)
    expect(out.history.groups).toEqual([{ id: "base", name: "Base" }])
    expect(volume(out.history)).toBeCloseTo(volume(history), 3)
    const back = editHistory(out.history, edits({ op: "ungroup_features", group: "base" }, { op: "rename_feature", id: ids[0]! }))
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.history).toEqual(history)
  })
})

describe("outlineHistory", () => {
  test("lists the dimension paths of every feature, and one feature in full", () => {
    const history = plate()
    const all = outlineHistory(history)
    expect(all.map((f) => f.id)).toEqual(history.features.map((f) => f.id))
    const hole = outlineHistory(history, "hole1")
    expect(hole).toHaveLength(1)
    expect("dimensions" in hole[0]! && hole[0].dimensions.map((d) => d.path)).toContain("diameter")
  })

  test("a big part stops listing at the cap and says how many dimensions the rest have", () => {
    const m = model()
    // A 50-point outline has 100 dimensions of its own: three of them pass the cap of 300.
    const outline = Array.from({ length: 50 }, (_, k) => [20 * Math.cos((k * Math.PI * 2) / 50), 20 * Math.sin((k * Math.PI * 2) / 50)] as const)
    for (let i = 0; i < 3; i++) m.extrude(m.sketch("XY").polyline(outline), { depth: 2 })
    const listing = outlineHistory(m.build())
    const listed = listing.reduce((sum, f) => sum + ("dimensions" in f ? f.dimensions.length : 0), 0)
    expect(listed).toBeLessThanOrEqual(OUTLINE_DIMENSION_CAP)
    expect(listing.some((f) => "truncated" in f)).toBe(true)
  })
})

describe("the action input", () => {
  const input = PARAMETRIC_ACTION_INPUTS["cad_edit.parametric_edit"]
  test("accepts a list of edits and refuses an empty list, an unknown op and a bad parameter name", () => {
    const ok = { elementId: "a", expectedRevision: "r", edits: [{ op: "set_parameter", name: "w", value: "h / 2" }] }
    expect(Schema.is(input)(ok)).toBe(true)
    expect(Schema.is(input)({ ...ok, edits: [] })).toBe(false)
    expect(Schema.is(input)({ ...ok, edits: [{ op: "explode" }] })).toBe(false)
    expect(Schema.is(input)({ ...ok, edits: [{ op: "set_parameter", name: "1w", value: 3 }] })).toBe(false)
    expect(Schema.is(input)({ ...ok, edits: [{ op: "insert_feature", feature: { id: "x", type: "extrude", sketch: "s", depth: "d", operation: "new" } }] })).toBe(true)
  })
})
