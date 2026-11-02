/**
 * Scenario: a parallel gripper (housing, pinion, two rack jaws) built, mated, limited, listed and weighed through the assistant's real
 * tools, driven by named parameters and edited two ways: by parameter and by configuration. The racks are ONE stored parametric part
 * (every measure follows the module); the assembly reads that part, so editing the part or showing one of its variants changes the
 * assembly. Every number is a hand computation.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const SLOW = 110_000
const tool = async (id: string, input: Record<string, unknown>) => {
  const definition = buildTools(handlers, projectId).find((t) => t.id === id)
  if (definition === undefined) throw new Error(`Tool ${id} is not registered`)
  return JSON.parse(await definition.execute(input as never, { sessionId: "s", projectId: "p", signal: new AbortController().signal })) as any
}
beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Gripper assembly" } })).body.id
})
afterAll(async () => { await app.dispose() })

const TEETH = 8, THICK = 10, BAR = 8
/** An ISO 53 rack of module m (see ai-industrial-gripper): tooth tips 1 m and roots 1.25 m from the pitch line at y = 0, teeth pointing down. */
const rackHistory = () => ({
  parameters: {
    m: 2, teeth: TEETH, pressure: 20, thick: THICK, bar: BAR,
    pitch: "pi * m", add: "m", ded: "1.25 * m",
    tipW: "pitch / 2 - 2 * add * tan(rad(pressure))", rootW: "pitch / 2 + 2 * ded * tan(rad(pressure))",
    len: "teeth * pitch"
  },
  features: [
    { id: "sbar", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "bar", kind: "polyline", points: [[0, "ded"], ["len", "ded"], ["len", "ded + bar"], [0, "ded + bar"]] }] } },
    { id: "barBody", type: "extrude", sketch: "sbar", depth: "thick", operation: "new" },
    { id: "stooth", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "tooth", kind: "polyline", points: [
      ["pitch / 2 - rootW / 2 - tan(rad(pressure))", "ded + 1"], ["pitch / 2 + rootW / 2 + tan(rad(pressure))", "ded + 1"], ["pitch / 2 + tipW / 2", "-add"], ["pitch / 2 - tipW / 2", "-add"]
    ] }] } },
    { id: "tooth", type: "extrude", sketch: "stooth", depth: "thick", operation: "union" },
    { id: "teethRow", type: "pattern", feature: "tooth", kind: "linear", count: "teeth", step: ["pitch", 0, 0] }
  ]
})
const rackVolume = (m: number, thick = THICK, teeth = TEETH) => {
  const pitch = Math.PI * m, add = m, ded = 1.25 * m, a = Math.tan((20 * Math.PI) / 180)
  const tip = pitch / 2 - 2 * add * a, root = pitch / 2 + 2 * ded * a
  return thick * (teeth * pitch * BAR + teeth * ((tip + root) / 2) * (ded + add))
}
const ALU = 2.7

const axisZ = (x: number, y: number, z: number) => ({ kind: "axis", origin: { x, y, z }, dir: { x: 0, y: 0, z: 1 } })
const axisX = (x: number, y: number, z: number, sign = 1) => ({ kind: "axis", origin: { x, y, z }, dir: { x: sign, y: 0, z: 0 } })

describe("rack and pinion gripper assembly", () => {
  let rackId = ""
  let revision = ""

  test("the jaw rack is a stored part with a material: volume, mass and centre of gravity follow the module", async () => {
    const created = await tool("cad_edit", { action: "parametric_create", name: "Jaw rack", material: "aluminium", history: rackHistory() })
    expect(created.ok).toBe(true)
    rackId = created.elementId; revision = created.revision
    const v = created.verification
    expect(v.sketchesFullyConstrained).toBe(true)
    expect(Math.abs(v.volumeMm3 - rackVolume(2)) / rackVolume(2)).toBeLessThan(2e-3)
    expect(v.massG).toBeCloseTo((v.volumeMm3 * ALU) / 1000, 3)
    // The teeth repeat along x: the centre of gravity sits in the middle of the bar and mid-thickness.
    expect(v.centerOfGravityMm.x).toBeCloseTo((TEETH * Math.PI * 2) / 2, 1)
    expect(v.centerOfGravityMm.z).toBeCloseTo(THICK / 2, 3)
    expect(v.boundsMm.min.y).toBeCloseTo(-2, 2)
  }, SLOW)

  test("variants of the jaw by configuration: a heavy-duty module 3 jaw and a half-length jaw, compared with their masses", async () => {
    const edited = await tool("cad_edit", {
      action: "parametric_edit", elementId: rackId, expectedRevision: revision,
      edits: [
        { op: "add_configuration", name: "Module 3", values: { m: 3, thick: 12 } },
        { op: "add_configuration", name: "Short", values: { m: 2, thick: 10, teeth: 4 } },
        { op: "activate_configuration", id: "default" }
      ]
    })
    expect(edited.ok).toBe(true)
    revision = edited.revision
    expect(edited.designTable.configurations.map((c: { id: string }) => c.id)).toEqual(["default", "module-3", "short"])
    const compared = await tool("cad", { action: "parametric_configurations", elementId: rackId, compare: true })
    const byId = Object.fromEntries(compared.variants.map((x: { id: string }) => [x.id, x]))
    expect(Math.abs(byId.default.volumeMm3 - rackVolume(2)) / rackVolume(2)).toBeLessThan(2e-3)
    expect(Math.abs(byId["module-3"].volumeMm3 - rackVolume(3, 12)) / rackVolume(3, 12)).toBeLessThan(2e-3)
    expect(Math.abs(byId.short.volumeMm3 - rackVolume(2, 10, 4)) / rackVolume(2, 10, 4)).toBeLessThan(2e-3)
    for (const x of compared.variants) expect(x.massG).toBeCloseTo((x.volumeMm3 * ALU) / 1000, 2)
    expect(byId["module-3"].sizeMm.x).toBeCloseTo(TEETH * Math.PI * 3, 1)
    expect(byId["module-3"].massG).toBeGreaterThan(byId.default.massG)
  }, SLOW)

  /** Housing 120 x 60 x 4 under the pinion; the pinion axis is z through the origin; the jaws slide along x either side of it. */
  const gripper = (extra: Record<string, unknown> = {}, rackShape: Record<string, unknown> = { kind: "part", elementId: rackId }) => ({
    op: "assembly",
    definitions: [
      { id: "housing", shape: { kind: "box", x: 120, y: 60, z: 4 }, material: "aluminium", designation: "Housing" },
      { id: "pinion", shape: { kind: "cylinder", radius: 13.5, height: THICK }, material: "S235JR", designation: "Pinion blank" },
      { id: "rack", shape: rackShape, designation: "Jaw rack" }
    ],
    occurrences: [
      { id: "housing", definition: "housing", at: { x: -60, y: -30, z: -4 }, grounded: true },
      { id: "pinion", definition: "pinion" },
      { id: "jawA", definition: "rack", at: { x: -((TEETH * Math.PI * 2) / 2), y: 16, z: 0 } },
      { id: "jawB", definition: "rack", at: { x: (TEETH * Math.PI * 2) / 2, y: -16, z: 0 }, rotate: { axis: { x: 0, y: 0, z: 1 }, degrees: 180 } }
    ],
    mates: [
      { kind: "revolute", id: "pinionAxis", a: { occurrence: "housing", feature: axisZ(60, 30, 0) }, b: { occurrence: "pinion", feature: axisZ(0, 0, 0) } },
      { kind: "slider", id: "slideA", limits: { min: -5, max: 30 }, a: { occurrence: "housing", feature: axisX(0, 46, 4, -1) }, b: { occurrence: "jawA", feature: axisX(0, 0, 0) } },
      { kind: "slider", id: "slideB", limits: { min: -5, max: 30 }, a: { occurrence: "housing", feature: axisX(0, 14, 4) }, b: { occurrence: "jawB", feature: axisX(0, 0, 0) } }
    ],
    ...extra
  })

  test("the assembly reads the stored rack: mates solve, the bill of materials counts two jaws, mass is volume x density per grade", async () => {
    const r = await tool("cad", { action: "workflow", ...gripper({ checks: ["bom", "mass", "interference"] }) })
    expect(r.ok).toBe(true)
    expect(r.leaves).toEqual(["housing", "pinion", "jawA", "jawB"])
    expect(r.residual).toBeLessThan(1e-6)
    // The jaws sit on the housing without entering it, and the pinion root circle clears the rack tips: nothing clashes.
    expect(r.interference.clashes).toEqual([])
    const rack = r.bom.find((row: { name: string }) => row.designation === "Jaw rack")
    expect(rack.quantity).toBe(2)
    // The racks take the density of the stored part's own material (aluminium 2.7 g/cm3): a row is one part's mass, the hand-computed volume.
    expect(Math.abs(rack.massG - (rackVolume(2) * ALU) / 1000) / rack.massG).toBeLessThan(3e-3)
    const housing = r.bom.find((row: { name: string }) => row.designation === "Housing")
    expect(housing.massG).toBeCloseTo((120 * 60 * 4 * ALU) / 1000, 3)
    const pinion = r.bom.find((row: { name: string }) => row.designation === "Pinion blank")
    expect(pinion.massG).toBeGreaterThan(0)
    expect(r.mass.unweighted).toEqual([])
    expect(r.mass.massG).toBeCloseTo(r.bom.reduce((sum: number, row: { massG: number; quantity: number }) => sum + row.massG * row.quantity, 0), 1)
  }, SLOW)

  test("each jaw slides within its limits, driven by the slider: the stop is reported, not hidden", async () => {
    const within = await tool("cad", { action: "workflow", ...gripper({ drive: { joint: "slideA", from: 0, to: 30, steps: 4 } }) })
    expect(within.ok).toBe(true)
    expect(within.frames.map((f: { value: number }) => f.value)).toEqual([0, 10, 20, 30])
    // jawA's slide is positive towards -x (the axis of its mate points that way): it opens by 30 mm.
    expect(within.placements.jawA.t[0]).toBeCloseTo(-(TEETH * Math.PI) - 30, 3)
    for (const f of within.frames) expect(f.joints.find((j: { id: string }) => j.id === "slideA").violation).toBeUndefined()
    const past = await tool("cad", { action: "workflow", ...gripper({ drive: { joint: "slideA", from: 0, to: 40, steps: 5 } }) })
    const last = past.frames[past.frames.length - 1]
    expect(last.joints.find((j: { id: string }) => j.id === "slideA").violation).toMatchObject({ quantity: "slide", limit: 30 })
  }, SLOW)

  test("the pinion drives both jaws through a coupling: a quarter turn opens each jaw by pi/2 x the pitch radius, and the stop is reported when the turn goes further", async () => {
    const pitchRadius = 16
    const ratio = (pitchRadius * Math.PI) / 180
    const couple = [{ joint: "slideA", ratio }, { joint: "slideB", ratio }]
    const quarter = await tool("cad", { action: "workflow", ...gripper({ drive: { joint: "pinionAxis", from: 0, to: 90, steps: 4, couple }, checks: ["interference"] }) })
    expect(quarter.ok).toBe(true)
    const slide = (frame: { joints: Array<{ id: string; slide?: number; angle?: number }> }, id: string) => frame.joints.find((j) => j.id === id)!
    const last = quarter.frames[quarter.frames.length - 1]
    expect(slide(last, "pinionAxis").angle).toBeCloseTo(90, 3)
    expect(slide(last, "slideA").slide).toBeCloseTo((Math.PI / 2) * pitchRadius, 3)
    expect(slide(last, "slideB").slide).toBeCloseTo((Math.PI / 2) * pitchRadius, 3)
    // The jaws open in opposite directions, symmetrically about the pinion.
    expect(quarter.placements.jawA.t[0]).toBeCloseTo(-(TEETH * Math.PI) - (Math.PI / 2) * pitchRadius, 3)
    expect(quarter.placements.jawB.t[0]).toBeCloseTo(TEETH * Math.PI + (Math.PI / 2) * pitchRadius, 3)
    expect(quarter.firstClash).toBeUndefined()
    for (const f of quarter.frames) for (const j of f.joints) expect(j.violation).toBeUndefined()
    // 120 degrees would take the jaws 33.5 mm, past the 30 mm stop of both sliders: the study names the joints and the value asked.
    const over = await tool("cad", { action: "workflow", ...gripper({ drive: { joint: "pinionAxis", from: 0, to: 120, steps: 5, couple } }) })
    const end = over.frames[over.frames.length - 1]
    expect(end.joints.filter((j: { violation?: unknown }) => j.violation !== undefined).map((j: { id: string }) => j.id).sort()).toEqual(["slideA", "slideB"])
    expect(slide(end, "slideA").violation).toMatchObject({ quantity: "slide", limit: 30 })
    expect((slide(end, "slideA").violation as { value: number }).value).toBeCloseTo((2 * Math.PI / 3) * pitchRadius, 3)
    const wrong = await tool("cad", { action: "workflow", ...gripper({ drive: { joint: "pinionAxis", from: 0, to: 90, steps: 3, couple: [{ joint: "nope", ratio }] } }) })
    expect(wrong.ok).toBe(false)
    expect(wrong.error).toContain("mates: pinionAxis, slideA, slideB")
    const self = await tool("cad", { action: "workflow", ...gripper({ drive: { joint: "pinionAxis", from: 0, to: 90, steps: 3, couple: [{ joint: "pinionAxis", ratio }] } }) })
    expect(self.ok).toBe(false)
  }, SLOW)

  test("edit by parameter: the module of the stored rack changes the assembly's mass and the jaw length with it", async () => {
    const updated = await tool("cad_edit", { action: "parametric_update", elementId: rackId, expectedRevision: revision, parameters: { m: 3 } })
    expect(updated.ok).toBe(true)
    revision = updated.revision
    const r = await tool("cad", { action: "workflow", ...gripper({ checks: ["bom"] }) })
    expect(r.ok).toBe(true)
    const rack = r.bom.find((row: { name: string }) => row.designation === "Jaw rack")
    expect(Math.abs(rack.massG - (rackVolume(3) * ALU) / 1000) / rack.massG).toBeLessThan(3e-3)
    const back = await tool("cad_edit", { action: "parametric_update", elementId: rackId, expectedRevision: revision, parameters: { m: 2 } })
    expect(back.ok).toBe(true)
    revision = back.revision
  }, SLOW)

  test("edit by configuration: the assembly shows the stored part's variant by name, a variant that does not exist says what does", async () => {
    const heavy = await tool("cad", { action: "workflow", ...gripper({ checks: ["bom"] }, { kind: "part", elementId: rackId, configuration: "module-3" }) })
    expect(heavy.ok).toBe(true)
    const rack = heavy.bom.find((row: { name: string }) => row.designation === "Jaw rack")
    expect(Math.abs(rack.massG - (rackVolume(3, 12) * ALU) / 1000) / rack.massG).toBeLessThan(3e-3)
    // The stored part is untouched by reading a variant.
    expect((await tool("cad", { action: "parametric_inspect", elementId: rackId })).history.parameters.m).toBe(2)
    const missing = await tool("cad", { action: "workflow", ...gripper({}, { kind: "part", elementId: rackId, configuration: "titan" }) })
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain("default, module-3, short")
    const ghost = await tool("cad", { action: "workflow", ...gripper({}, { kind: "part", elementId: "nope" }) })
    expect(ghost.ok).toBe(false)
    expect(ghost.error).toContain("Definition 'rack'")
  }, SLOW)
})
