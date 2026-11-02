/**
 * Design configurations, mass and sketch constraints of a stored parametric part through the assistant's real tools: the variants
 * (parameter values and suppressed features) are created, shown, compared and removed with `cad_edit.parametric_edit` and
 * `cad.parametric_configurations`, over the real sidecar, its database and the exact kernel. Every number is a hand computation.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { plateTemplate, type History } from "@cadcamfun/core"
import type { ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
import { makeParametricRunner } from "./helpers/parametric.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const run = makeParametricRunner(() => handlers, () => projectId)
let elementId = ""

/** 60 x 40 x 8 plate with a 10 mm through hole: the hole is cut through the whole thickness. */
const plate = (width = 60, depth = 40, thick = 8, hole = 10) => width * depth * thick - Math.PI * (hole / 2) ** 2 * thick

beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Configurations test" } })).body.id
  const created = await run({ action: "create", name: "Plate", material: "aluminium", history: plateTemplate() })
  expect(created.ok).toBe(true)
  elementId = created.elementId
}, 120_000)
afterAll(async () => { await app.dispose() })

const edit = async (edits: unknown[]) => run({ action: "edit", elementId, expectedRevision: (await run({ action: "inspect", elementId })).revision, edits })

describe("mass of a part with a material", () => {
  test("the build verdict carries the density, the mass (volume x density), the centre of gravity and the bounds", async () => {
    const inspected = await run({ action: "inspect", elementId })
    const v = inspected.verification
    expect(v.volumeSource).toBe("exact")
    expect(v.volumeMm3).toBeCloseTo(plate(), 2)
    expect(v.material).toMatchObject({ densityGcm3: 2.7 })
    // 18 571.68 mm3 = 18.57168 cm3 at 2.7 g/cm3.
    expect(v.massG).toBeCloseTo((plate() * 2.7) / 1000, 2)
    // The hole is on the centre line, so the centre of gravity is the plate's centre.
    expect(v.centerOfGravityMm.x).toBeCloseTo(30, 3)
    expect(v.centerOfGravityMm.y).toBeCloseTo(20, 3)
    expect(v.centerOfGravityMm.z).toBeCloseTo(4, 3)
    expect(v.boundsMm).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 60, y: 40, z: 8 } })
    expect(inspected.material).toBe("aluminium")
  })

  test("a designation of the library sets the density, and the mass follows a parameter edit", async () => {
    const modified = await handlers.modifyEntities(projectId, [{ id: elementId, changes: { material: "EN AW-6061" } }]) as { ok: boolean }
    expect(modified.ok).toBe(true)
    const before = await run({ action: "inspect", elementId })
    expect(before.verification.material).toMatchObject({ name: "Aluminium 6061-T6", densityGcm3: 2.7, source: "library" })
    const wider = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { width: 80 } })
    expect(wider.ok).toBe(true)
    expect(wider.verification.massG).toBeCloseTo((plate(80) * wider.verification.material.densityGcm3) / 1000, 2)
    expect(wider.verification.centerOfGravityMm.x).toBeCloseTo(40, 3)
    const back = await run({ action: "update", elementId, expectedRevision: wider.revision, parameters: { width: 60 } })
    expect(back.ok).toBe(true)
  })

  test("cad exact carries the same mass per part and in the total, and names the parts that have no material", async () => {
    const bare = await run({ action: "create", name: "Bare plate", history: plateTemplate() })
    const exact = await (async () => {
      const definition = (await import("@cadcamfun/ai")).buildTools(handlers, projectId).find((t) => t.id === "cad")!
      return JSON.parse(await definition.execute({ action: "exact", ids: [elementId, bare.elementId] } as never, { sessionId: "s", projectId: "p", signal: new AbortController().signal })) as any
    })()
    expect(exact.ok).toBe(true)
    const part = exact.parts.find((p: { id: string }) => p.id === elementId)
    expect(part.massG).toBeCloseTo((plate() * 2.7) / 1000, 3)
    expect(part.material.densityGcm3).toBe(2.7)
    expect(exact.parts.find((p: { id: string }) => p.id === bare.elementId).massG).toBeUndefined()
    expect(exact.totals.massG).toBeCloseTo(part.massG, 3)
    expect(exact.totals.massUnweighted).toEqual([bare.elementId])
  }, 120_000)

  test("a material the library does not know gives no mass and says so", async () => {
    const created = await run({ action: "create", name: "Mystery", material: "unobtainium", history: plateTemplate() })
    expect(created.ok).toBe(true)
    expect(created.verification.massG).toBeUndefined()
    expect(created.verification.attention.join(" ")).toContain("unobtainium")
  })

  test("steel is heavier than aluminium by exactly the density ratio", async () => {
    const created = await run({ action: "create", name: "Steel plate", material: "S235JR", history: plateTemplate() })
    expect(created.ok).toBe(true)
    expect(created.verification.massG).toBeCloseTo((plate() * created.verification.material.densityGcm3) / 1000, 2)
    expect(created.verification.material.densityGcm3).toBeGreaterThan(7)
  })
})

describe("design configurations", () => {
  test("a part without configurations reports none and says how to add one", async () => {
    const none = await run({ action: "configurations", elementId })
    expect(none.ok).toBe(true)
    expect(none.designTable).toBeNull()
    expect(none.note).toContain("add_configuration")
  })

  test("variants are defined, shown and compared: each variant's volume and mass are the hand computation of its parameters", async () => {
    const edited = await edit([
      { op: "add_configuration", name: "Wide", values: { width: 100 } },
      { op: "add_configuration", name: "Tall plate", values: { width: 60, thick: 12, hole: 14 }, suppress: ["hole1"] },
      { op: "activate_configuration", id: "wide" }
    ])
    expect(edited.ok).toBe(true)
    expect(edited.mutation).toBe("edit")
    expect(edited.applied.join("\n")).toContain("configuration 'Wide' (wide) added and shown")
    // "Default" was recorded the first time, and the shown one is Wide: the part itself follows it.
    expect(edited.designTable.active).toBe("wide")
    expect(edited.designTable.configurations.map((c: { id: string }) => c.id)).toEqual(["default", "wide", "tall-plate"])
    expect(edited.elements[0].history.parameters.width).toBe(100)
    expect(edited.verification.volumeMm3).toBeCloseTo(plate(100), 2)
    expect(edited.verification.massG).toBeCloseTo((plate(100) * 2.7) / 1000, 1)

    const compared = await run({ action: "configurations", elementId, compare: true })
    expect(compared.ok).toBe(true)
    const byId = Object.fromEntries(compared.variants.map((v: { id: string }) => [v.id, v]))
    expect(byId.default.volumeMm3).toBeCloseTo(plate(), 2)
    expect(byId.wide.volumeMm3).toBeCloseTo(plate(100), 2)
    // The third variant suppresses the hole, so it is a solid slab 60 x 40 x 12.
    expect(byId["tall-plate"].volumeMm3).toBeCloseTo(60 * 40 * 12, 2)
    expect(byId["tall-plate"].sizeMm).toEqual({ x: 60, y: 40, z: 12 })
    expect(byId.wide.sizeMm.x).toBe(100)
    expect(byId.wide.massG).toBeCloseTo((plate(100) * 2.7) / 1000, 1)
    expect(byId["tall-plate"].massG).toBeCloseTo((60 * 40 * 12 * 2.7) / 1000, 1)
    expect(byId.wide.active).toBe(true)
    // Comparing builds each variant on its own: what is stored is the shown one, unchanged.
    expect(compared.revision).toBe(edited.revision)
    // The table lists only what differs.
    const table = compared.designTable
    expect(table.parameters.map((p: { name: string }) => p.name).sort()).toEqual(["hole", "thick", "width"])
    expect(table.suppressed).toEqual([{ feature: "hole1", in: ["tall-plate"] }])
    expect(table.parameters.find((p: { name: string }) => p.name === "width").values).toEqual({ default: 60, wide: 100, "tall-plate": 60 })
  }, 120_000)

  test("showing a variant writes its values and suppressed features into the part; an edit to the shown one is kept in it", async () => {
    const shown = await edit([{ op: "activate_configuration", id: "tall-plate" }])
    expect(shown.ok).toBe(true)
    expect(shown.verification.volumeMm3).toBeCloseTo(60 * 40 * 12, 2)
    expect(shown.verification.massG).toBeCloseTo((60 * 40 * 12 * 2.7) / 1000, 1)
    expect(shown.elements[0].history.features.find((f: { id: string }) => f.id === "hole1").suppressed).toBe(true)
    // A plain parameter edit while Tall plate is shown changes that configuration, not the others.
    const resized = await edit([{ op: "set_parameter", name: "thick", value: 20 }])
    expect(resized.ok).toBe(true)
    const compared = await run({ action: "configurations", elementId, compare: true })
    const byId = Object.fromEntries(compared.variants.map((v: { id: string }) => [v.id, v]))
    expect(byId["tall-plate"].volumeMm3).toBeCloseTo(60 * 40 * 20, 2)
    expect(byId.default.volumeMm3).toBeCloseTo(plate(), 2)
    // Back to the original with Default, and nothing was lost on the way.
    const home = await edit([{ op: "activate_configuration", id: "default" }])
    expect(home.ok).toBe(true)
    expect(home.verification.volumeMm3).toBeCloseTo(plate(), 2)
    expect(home.elements[0].history.features.find((f: { id: string }) => f.id === "hole1").suppressed).toBeUndefined()
  }, 120_000)

  test("set_configuration changes a variant without showing it; clear makes a value follow the current one", async () => {
    const changed = await edit([{ op: "set_configuration", id: "wide", values: { width: 120, depth: 50 }, release: ["hole1"] }])
    expect(changed.ok).toBe(true)
    // Default stays the shown variant.
    expect(changed.designTable.active).toBe("default")
    expect(changed.elements[0].history.parameters.width).toBe(60)
    const compared = await run({ action: "configurations", elementId, compare: true })
    const wide = compared.variants.find((v: { id: string }) => v.id === "wide")
    expect(wide.volumeMm3).toBeCloseTo(plate(120, 50), 2)
    const cleared = await edit([{ op: "set_configuration", id: "wide", clear: ["depth"] }])
    expect(cleared.ok).toBe(true)
    const again = await run({ action: "configurations", elementId, compare: true })
    expect(again.variants.find((v: { id: string }) => v.id === "wide").volumeMm3).toBeCloseTo(plate(120, 40), 2)
  }, 120_000)

  test("a refused configuration edit stores nothing and says what to do", async () => {
    const before = await run({ action: "inspect", elementId })
    const unknown = await edit([{ op: "activate_configuration", id: "nope" }])
    expect(unknown.ok).toBe(false)
    expect(unknown.error).toContain("Configurations: default")
    const parameter = await edit([{ op: "set_parameter", name: "keep", value: 3 }, { op: "set_configuration", id: "wide", values: { ghost: 1 } }])
    expect(parameter.ok).toBe(false)
    expect(parameter.error).toContain("edits[1]")
    expect(parameter.error).toContain("Parameters: width, depth, thick, hole")
    const duplicate = await edit([{ op: "add_configuration", name: "WIDE" }])
    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toContain("already a configuration named")
    const feature = await edit([{ op: "set_configuration", id: "wide", suppress: ["ghost"] }])
    expect(feature.ok).toBe(false)
    expect(feature.error).toContain("Features: sketch1, plate, hole1")
    const formula = await edit([{ op: "set_configuration", id: "wide", values: { width: "depth *" } }])
    expect(formula.ok).toBe(false)
    const stale = await run({ action: "edit", elementId, expectedRevision: "0".repeat(64), edits: [{ op: "remove_configuration", id: "wide" }] })
    expect(stale.ok).toBe(false)
    expect(stale.error).toContain("changed since inspection")
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  })

  test("rename and remove: the shown variant removed leaves the part as it is", async () => {
    const renamed = await edit([{ op: "rename_configuration", id: "wide", name: "Extra wide" }])
    expect(renamed.ok).toBe(true)
    expect(renamed.designTable.configurations.find((c: { id: string }) => c.id === "wide").name).toBe("Extra wide")
    const clash = await edit([{ op: "rename_configuration", id: "wide", name: "default" }])
    expect(clash.ok).toBe(false)
    const dropped = await edit([{ op: "remove_configuration", id: "default" }])
    expect(dropped.ok).toBe(true)
    expect(dropped.designTable.active).toBeNull()
    expect(dropped.verification.volumeMm3).toBeCloseTo(plate(), 2)
    // Two variants are left; the part is shown by none of them.
    expect(dropped.designTable.configurations.map((c: { id: string }) => c.id)).toEqual(["wide", "tall-plate"])
  }, 120_000)

  test("removing a feature a variant suppresses also drops it from that variant, so no variant names a feature that is gone", async () => {
    const removed = await edit([{ op: "remove_feature", id: "hole1" }])
    expect(removed.ok).toBe(true)
    expect(removed.designTable.suppressed).toEqual([])
    const compared = await run({ action: "configurations", elementId, compare: true })
    expect(compared.variants.every((v: { ok: boolean }) => v.ok)).toBe(true)
    // Without the hole, the volume of the tall variant is a plain slab and Default is one too.
    expect(compared.variants.find((v: { id: string }) => v.id === "tall-plate").volumeMm3).toBeCloseTo(60 * 40 * 20, 2)
  }, 120_000)
})

describe("sketch constraints: degrees of freedom and conflicts reach the verdict", () => {
  let sketchPart = ""
  test("a sketch left under-constrained is reported with its degrees of freedom and the points that can move", async () => {
    const history = structuredClone(plateTemplate()) as History
    const features = history.features.map((f) => f.type === "sketch" ? { ...f, sketch: { ...f.sketch, constraints: f.sketch.constraints.filter((c) => !(c.type === "length" && "line" in c && c.line === "l2")) } } : f)
    const created = await run({ action: "create", name: "Loose plate", history: { ...history, features } })
    expect(created.ok).toBe(true)
    sketchPart = created.elementId
    expect(created.verification.sketchesFullyConstrained).toBe(false)
    expect(created.verification.sketches).toEqual([expect.objectContaining({ id: "sketch1", status: "under-constrained", dof: 1 })])
    expect(created.verification.sketches[0].freePoints.length).toBeGreaterThan(0)
    expect(created.verification.attention.join(" ")).toContain("1 degree(s) of freedom left")
  })

  test("inspecting the sketch lists every constraint with its state; adding the missing dimension closes it", async () => {
    const inspected = await run({ action: "inspect", elementId: sketchPart, feature: "sketch1" })
    expect(inspected.sketch.status).toBe("under-constrained")
    expect(inspected.sketch.dof).toBe(1)
    expect(inspected.sketch.rows.map((r: { type: string; state: string }) => `${r.type}:${r.state}`)).toContain("length:ok")
    const closed = await run({
      action: "edit", elementId: sketchPart, expectedRevision: inspected.revision,
      edits: [{ op: "add_sketch_constraint", feature: "sketch1", constraint: { type: "length", line: "l2", value: "depth" } }]
    })
    expect(closed.ok).toBe(true)
    expect(closed.applied[0]).toContain("fully constrained")
    expect(closed.sketches[0]).toMatchObject({ feature: "sketch1", status: "fully-constrained", dof: 0 })
    expect(closed.verification.sketchesFullyConstrained).toBe(true)
    expect(closed.verification.sketches).toBeUndefined()
    expect(closed.verification.volumeMm3).toBeCloseTo(plate(), 2)
  }, 120_000)

  test("a dimension that contradicts the rest is refused naming the clash; a repeated one is kept and reported as redundant, then removed or made a reference", async () => {
    const inspected = await run({ action: "inspect", elementId: sketchPart, feature: "sketch1" })
    const clash = await run({
      action: "edit", elementId: sketchPart, expectedRevision: inspected.revision,
      edits: [{ op: "add_sketch_constraint", feature: "sketch1", constraint: { type: "length", line: "l1", value: 55 } }]
    })
    expect(clash.ok).toBe(false)
    expect(clash.error).toMatch(/cannot all hold|conflict/)
    const redundant = await run({
      action: "edit", elementId: sketchPart, expectedRevision: inspected.revision,
      edits: [{ op: "add_sketch_constraint", feature: "sketch1", constraint: { type: "horizontal", line: "l1" } }]
    })
    expect(redundant.ok).toBe(true)
    expect(redundant.sketches[0].status).toBe("over-constrained")
    expect(redundant.verification.attention.join(" ")).toContain("over-constrained")
    expect(redundant.verification.sketches[0].redundant.length).toBeGreaterThan(0)
    const lastIndex = redundant.sketches[0].rows.length - 1
    const removed = await run({
      action: "edit", elementId: sketchPart, expectedRevision: redundant.revision,
      edits: [{ op: "remove_sketch_constraint", feature: "sketch1", index: lastIndex }]
    })
    expect(removed.ok).toBe(true)
    expect(removed.sketches[0].status).toBe("fully-constrained")
    // A driving dimension becomes a reference: it then measures, and the part is under-constrained again.
    const lengthIndex = removed.sketches[0].rows.findIndex((r: { type: string; name: string }) => r.type === "length")
    const driven = await run({
      action: "edit", elementId: sketchPart, expectedRevision: removed.revision,
      edits: [{ op: "set_constraint_driven", feature: "sketch1", index: lengthIndex, driven: true }]
    })
    expect(driven.ok).toBe(true)
    expect(driven.sketches[0].rows[lengthIndex].state).toBe("driven")
    expect(driven.sketches[0].rows[lengthIndex].measured).toBeCloseTo(60, 6)
    expect(driven.sketches[0].status).toBe("under-constrained")
  }, 120_000)

  test("a sketch id that is not a sketch is refused listing the sketches; a constraint on an entity that is not there is refused", async () => {
    const inspected = await run({ action: "inspect", elementId: sketchPart })
    const notSketch = await run({
      action: "edit", elementId: sketchPart, expectedRevision: inspected.revision,
      edits: [{ op: "add_sketch_constraint", feature: "plate", constraint: { type: "horizontal", line: "l1" } }]
    })
    expect(notSketch.ok).toBe(false)
    expect(notSketch.error).toContain("Sketch features: sketch1")
    const ghost = await run({
      action: "edit", elementId: sketchPart, expectedRevision: inspected.revision,
      edits: [{ op: "add_sketch_constraint", feature: "sketch1", constraint: { type: "horizontal", line: "nope" } }]
    })
    expect(ghost.ok).toBe(false)
    expect(ghost.error).toContain("'nope' is not an entity of sketch 'sketch1'")
    const range = await run({
      action: "edit", elementId: sketchPart, expectedRevision: inspected.revision,
      edits: [{ op: "remove_sketch_constraint", feature: "sketch1", index: 150 }]
    })
    expect(range.ok).toBe(false)
    expect(range.error).toContain("has no constraint 150")
  })
})

describe("a variant keeps working when the part is edited around it", () => {
  test("renaming a parameter follows through every variant; a designation not in the table falls back to its family density", async () => {
    const created = await run({ action: "create", name: "Renamed", material: "EN AW-6082", history: plateTemplate() })
    expect(created.ok).toBe(true)
    // 6082 is not a grade of the CAM table: it is the generic aluminium of the same density, and the verdict says so.
    expect(created.verification.material).toMatchObject({ densityGcm3: 2.7, source: "generic" })
    const id = created.elementId
    const edit2 = async (edits: unknown[]) => run({ action: "edit", elementId: id, expectedRevision: (await run({ action: "inspect", elementId: id })).revision, edits })
    const made = await edit2([{ op: "add_configuration", name: "Big", values: { width: 90 } }, { op: "activate_configuration", id: "default" }])
    expect(made.ok).toBe(true)
    const renamed = await edit2([{ op: "rename_parameter", from: "width", to: "w" }])
    expect(renamed.ok).toBe(true)
    const compared = await run({ action: "configurations", elementId: id, compare: true })
    expect(compared.designTable.parameters.map((p: { name: string }) => p.name)).toEqual(["w"])
    expect(compared.variants.find((v: { id: string }) => v.id === "big").volumeMm3).toBeCloseTo(plate(90), 2)
    expect(compared.variants.find((v: { id: string }) => v.id === "default").volumeMm3).toBeCloseTo(plate(), 2)
  }, 120_000)
})
