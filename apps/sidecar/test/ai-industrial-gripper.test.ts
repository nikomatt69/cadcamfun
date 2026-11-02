/**
 * Scenario: the rack-and-pinion core of a parallel gripper, driven through the assistant's real tools. The pinion is the exact
 * catalogue gear; each jaw is a parametric rack whose tooth pitch, flank angle and depth are expressions of ONE parameter, the module.
 * The motion study sweeps the pinion and the racks must travel the arc it rolls, in opposite directions, inside their limits.
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
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Gripper" } })).body.id
})
afterAll(async () => { await app.dispose() })

const TEETH = 8, THICK = 10, BAR = 8
/**
 * An ISO 53 rack of module m, 20 degree flanks, tooth tips 1 m and roots 1.25 m from the pitch line, teeth pointing down (-y), its
 * pitch line at y = 0 of the sketch. Every measure follows `m`; the number of teeth sets the length.
 */
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
    // One tooth, centred on x = pitch / 2: its root sits inside the bar so the union is one body.
    { id: "stooth", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "tooth", kind: "polyline", points: [
      ["pitch / 2 - rootW / 2 - tan(rad(pressure))", "ded + 1"], ["pitch / 2 + rootW / 2 + tan(rad(pressure))", "ded + 1"], ["pitch / 2 + tipW / 2", "-add"], ["pitch / 2 - tipW / 2", "-add"]
    ] }] } },
    { id: "tooth", type: "extrude", sketch: "stooth", depth: "thick", operation: "union" },
    { id: "teethRow", type: "pattern", feature: "tooth", kind: "linear", count: "teeth", step: ["pitch", 0, 0] }
  ]
})

/** Hand computation: the bar plus `teeth` trapezoids of height ded - add. */
const rackVolume = (m: number) => {
  const pitch = Math.PI * m, add = m, ded = 1.25 * m, a = Math.tan((20 * Math.PI) / 180)
  const tip = pitch / 2 - 2 * add * a, root = pitch / 2 + 2 * ded * a
  return THICK * (TEETH * pitch * BAR + TEETH * ((tip + root) / 2) * (ded + add))
}

describe("rack and pinion gripper subset", () => {
  let rackId = ""
  let pinionId = ""
  let revision = ""
  let rackBId = ""

  test("a rack whose every measure follows the module is created, valid and one closed body", async () => {
    const checked = await tool("cad", { action: "parametric_validate", history: rackHistory() })
    expect(checked.ok).toBe(true)
    expect(checked.verification).toMatchObject({ bodies: 1, closedSolid: true, sketchesFullyConstrained: true })
    expect(checked.verification.sizeMm.x).toBeCloseTo(TEETH * Math.PI * 2, 1)
    expect(Math.abs(checked.verification.volumeMm3 - rackVolume(2)) / rackVolume(2)).toBeLessThan(2e-3)
    const created = await tool("cad_edit", { action: "parametric_create", name: "Jaw rack", history: rackHistory(), x: 0, y: 0, z: -THICK / 2 })
    expect(created.ok).toBe(true)
    rackId = created.elementId; revision = created.revision
  }, SLOW)

  test("changing the module re-cuts every tooth: pitch, flank, depth and length all follow", async () => {
    const updated = await tool("cad_edit", { action: "parametric_update", elementId: rackId, expectedRevision: revision, parameters: { m: 3 } })
    expect(updated.ok).toBe(true)
    expect(updated.verification.sizeMm.x).toBeCloseTo(TEETH * Math.PI * 3, 1)
    expect(Math.abs(updated.verification.volumeMm3 - rackVolume(3)) / rackVolume(3)).toBeLessThan(2e-3)
    expect(updated.verification.throughHoles).toBe(0)
    const back = await tool("cad_edit", { action: "parametric_update", elementId: rackId, expectedRevision: updated.revision, parameters: { m: 2 } })
    expect(back.ok).toBe(true)
    revision = back.revision
  }, SLOW)

  test("the pinion is the exact gear of the same module and the pitch radius is m z / 2", async () => {
    const added = await tool("cad_edit", { action: "add", elements: [{ type: "gear", name: "Pinion", moduleValue: 2, teeth: 16, thickness: THICK, holeDiameter: 8 }] })
    expect(added.ok).toBe(true)
    pinionId = added.ids[0]
    const exact = await tool("cad", { action: "exact", ids: [pinionId] })
    expect(exact.parts[0].valid).toBe(true)
    const tip = (2 * (16 + 2)) / 2
    expect(exact.parts[0].bounds.max.x - exact.parts[0].bounds.min.x).toBeCloseTo(2 * tip, 0)
  }, SLOW)

  test("the second jaw is the same rack turned 180 degrees: its tips sit 14 mm below the axis, the first jaw's 14 mm above (pitch radius 16 less the addendum)", async () => {
    const second = await tool("cad_edit", { action: "parametric_create", name: "Jaw rack B", history: rackHistory(), x: 0, y: 0, z: -THICK / 2 })
    expect(second.ok).toBe(true)
    rackBId = second.elementId
    const length = TEETH * Math.PI * 2
    const turned = await tool("cad_edit", { action: "transform", ids: [rackBId], rotateAxis: "z", rotateDegrees: 180, about: { x: length / 2, y: 4.25, z: 0 } })
    expect(turned.ok).toBe(true)
    // Pitch lines at y = +16 and y = -16: the first moves up, the second (pitch line now at y = 8.5) down by 24.5.
    expect((await tool("cad_edit", { action: "transform", ids: [rackId], dy: 16 })).ok).toBe(true)
    expect((await tool("cad_edit", { action: "transform", ids: [rackBId], dy: -24.5 })).ok).toBe(true)
    const exact = await tool("cad", { action: "exact", ids: [rackId, rackBId] })
    const a = exact.parts.find((p: { id: string }) => p.id === rackId), b = exact.parts.find((p: { id: string }) => p.id === rackBId)
    expect(a.valid && b.valid).toBe(true)
    // The racks are mesh-able solids of the same volume as the hand computation.
    expect(Math.abs(a.volume - rackVolume(2)) / rackVolume(2)).toBeLessThan(2e-3)
    expect(Math.abs(b.volume - a.volume)).toBeLessThan(1e-6 * a.volume)
    expect(a.bounds.min.y).toBeCloseTo(16 - 2, 3)
    expect(b.bounds.max.y).toBeCloseTo(-16 + 2, 3)
  }, SLOW)

  test("the motion study: a quarter turn of the pinion moves the jaws pi/2 x pitch radius in opposite directions; a longer turn reports the limit", async () => {
    const pitchRadius = 16
    const frame = await tool("cad_edit", { action: "add", elements: [{ type: "cube", name: "Housing", x: 0, y: 0, z: -20, width: 120, height: 60, depth: 4 }] })
    expect(frame.ok).toBe(true)
    const model = {
      ground: frame.ids[0],
      joints: [
        { id: "pinion", parent: frame.ids[0], child: pinionId, kind: "revolute", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 } },
        { id: "jawA", parent: frame.ids[0], child: rackId, kind: "prismatic", origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, limits: { min: -5, max: 30 } },
        { id: "jawB", parent: frame.ids[0], child: rackBId, kind: "prismatic", origin: { x: 0, y: 0, z: 0 }, axis: { x: -1, y: 0, z: 0 }, limits: { min: -5, max: 30 } }
      ],
      couplings: [{ kind: "rack", pinion: "pinion", rack: "jawA", pitchRadius }, { kind: "rack", pinion: "pinion", rack: "jawB", pitchRadius }]
    }
    const study = await tool("cad", { action: "motion", model, sweep: { joint: "pinion", from: 0, to: 90, steps: 3, quantity: "angle" } })
    expect(study.ok).toBe(true)
    const last = study.frames[study.frames.length - 1]
    expect(last.value).toBe(90)
    expect(last.jointValues.jawA.slide).toBeCloseTo((Math.PI / 2) * pitchRadius, 6)
    expect(last.jointValues.jawB.slide).toBeCloseTo((Math.PI / 2) * pitchRadius, 6)
    expect(last.violations).toEqual([])
    // The jaws are on opposite sides of the pinion: they never touch each other anywhere in the sweep.
    for (const f of study.frames) expect(f.clashes.some((c: { a: string; b: string }) => [c.a, c.b].includes(rackId) && [c.a, c.b].includes(rackBId))).toBe(false)
    // 120 degrees would take the jaws 33.5 mm, past the 30 mm stop: the study says which joint and by how much, it does not clamp.
    const over = await tool("cad", { action: "motion", model, sweep: { joint: "pinion", from: 0, to: 120, steps: 4, quantity: "angle" } })
    expect(over.ok).toBe(true)
    const end = over.frames[over.frames.length - 1]
    expect(end.violations.map((v: { joint: string }) => v.joint).sort()).toEqual(["jawA", "jawB"])
    expect(end.violations[0].value).toBeCloseTo((2 * Math.PI / 3) * pitchRadius, 6)
  }, SLOW)
})
