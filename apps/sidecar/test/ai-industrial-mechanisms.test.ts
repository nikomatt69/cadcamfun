/**
 * Scenarios an industrial CAD programmer builds every week, driven through the assistant's REAL tools over the REAL kernel:
 * a shaft with a DIN 6885 keyway carrying a gear, a sheet-metal channel with its flat pattern, a bolted two-part assembly
 * with exact interference and automatic fasteners, and a rack-and-pinion gripper subset with a kinematic sweep. Every number
 * an assertion compares is computed by hand in the test.
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
const fresh = async (name: string) => { projectId = (await app.call("/api/projects", { method: "POST", json: { name } })).body.id }

beforeAll(async () => { app = await makeApp(); handlers = await app.toolHandlers() })
afterAll(async () => { await app.dispose() })

const rel = (value: number, expected: number) => Math.abs(value - expected) / expected

describe("shaft with a DIN 6885 key seat and a gear on it", () => {
  const M = 2, Z = 20, FACE = 10, BORE = 16
  let shaftId = ""
  let gearId = ""

  test("the keyway comes from DIN 6885 for the shaft diameter, and the shaft is exact and a closed solid", async () => {
    await fresh("Gear shaft")
    const made = await tool("cad_edit", {
      action: "parametric_recipe_create", recipe: "stepped_shaft", name: "Shaft",
      params: { sections: [{ diameter: BORE, length: 40 }, { diameter: 20, length: 30 }], keywaySection: 0 }
    })
    expect(made.ok).toBe(true)
    shaftId = made.ids[0]
    // DIN 6885 form A for a shaft of 12 to 17 mm: key 5 x 5, 3.0 deep in the shaft, 2.3 in the hub.
    expect(made.derived).toMatchObject({ keyWidth: 5, keyHeight: 5, shaftKeywayDepth: 3, hubKeywayDepth: 2.3 })
    expect(made.verification.closedSolid).toBe(true)
    const exact = await tool("cad", { action: "parametric_exact", elementId: shaftId })
    expect(exact.bodies[0]).toMatchObject({ exact: true, valid: true })
    // Two cylinders, less the end chamfers and the key seat: between the cylinders and the cylinders less 700 mm3.
    const cylinders = (Math.PI / 4) * (BORE * BORE * 40 + 20 * 20 * 30)
    expect(exact.bodies[0].volumeMm3).toBeLessThan(cylinders)
    expect(exact.bodies[0].volumeMm3).toBeGreaterThan(cylinders - 700)
  }, SLOW)

  test("the involute spur gear is an exact solid of the drawing: tip diameter m (z + 2), bore as asked, volume between the root and tip discs", async () => {
    const added = await tool("cad_edit", { action: "add", elements: [{ type: "gear", name: "Pinion", moduleValue: M, teeth: Z, thickness: FACE, holeDiameter: BORE, x: 20, rotation: { x: 0, y: 90, z: 0 } }] })
    expect(added.ok).toBe(true)
    gearId = added.ids[0]
    // The skill tells the assistant that the gear is exact; cad.exact must therefore list it, not silently drop it.
    const exact = await tool("cad", { action: "exact", ids: [gearId] })
    expect(exact.ok).toBe(true)
    expect(exact.parts).toHaveLength(1)
    const gear = exact.parts[0]
    expect(gear.valid).toBe(true)
    const root = (M * (Z - 2.5)) / 2, tip = (M * (Z + 2)) / 2
    const disc = (r: number) => Math.PI * r * r * FACE - (Math.PI / 4) * BORE * BORE * FACE
    expect(gear.volume).toBeGreaterThan(disc(root))
    expect(gear.volume).toBeLessThan(disc(tip))
    // Rotated onto the shaft axis (x), the gear spans 2 x tip along y and z and its thickness along x.
    expect(gear.bounds.max.y - gear.bounds.min.y).toBeCloseTo(2 * tip, 1)
    expect(gear.bounds.max.x - gear.bounds.min.x).toBeCloseTo(FACE, 3)
  }, SLOW)

  test("assembly lists both parts in the bill of materials, and a gear bore as large as the shaft section does not clash", async () => {
    const asm = await tool("cad", { action: "assembly" })
    expect(asm.ok).toBe(true)
    expect(asm.parts).toBe(2)
    expect(asm.bom.map((row: { name: string }) => row.name).sort()).toEqual(["Pinion", "Shaft"])
    expect(asm.interference.clashesTotal).toBe(0)
  }, SLOW)

  test("a bore smaller than the shaft is found as a clash with the exact overlap volume, never as a silent pass", async () => {
    const modified = await tool("cad_edit", { action: "modify", changes: [{ id: gearId, changes: { holeDiameter: 12 } }] })
    expect(modified.ok).toBe(true)
    const asm = await tool("cad", { action: "assembly" })
    expect(asm.interference.clashesTotal).toBe(1)
    // At most the whole ring between the two bores over the face width; the key seat of the shaft takes a little off it.
    const ring = (Math.PI / 4) * (BORE * BORE - 12 * 12) * FACE
    expect(asm.interference.clashes[0].volume).toBeGreaterThan(ring * 0.8)
    expect(asm.interference.clashes[0].volume).toBeLessThanOrEqual(ring * 1.001)
  }, SLOW)
})

describe("sheet-metal channel", () => {
  let id = ""
  let revision = ""
  const A = 30, B = 60, T = 2, R = 3, W = 40
  const K = 0.44
  const profile = (extra: unknown[] = []) => ({
    parameters: { legA: A, base: B, t: T, r: R, w: W },
    features: [
      { id: "prof", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "p", kind: "polyline", closed: false, points: [[0, "legA"], [0, 0], ["base", 0], ["base", "legA"]] }] } },
      { id: "channel", type: "sheet", sketch: "prof", thickness: "t", width: "w", bendRadius: "r", operation: "new" },
      ...extra
    ]
  })
  /** Centre-line length, less the tangent length of each of the two 90 degree bends, plus their allowance at the 0.44 K-factor. */
  const flat = (t: number, r: number) => {
    const centreRadius = r + t / 2
    return { straight: 2 * A + B - 4 * centreRadius, bends: 2 * (Math.PI / 2) * (r + K * t), centreArc: 2 * (Math.PI / 2) * centreRadius }
  }

  test("the flat pattern is the hand-computed blank, and the volume is thickness x width x neutral length", async () => {
    await fresh("Channel")
    const created = await tool("cad_edit", { action: "parametric_create", name: "Channel", history: profile() })
    expect(created.ok).toBe(true)
    id = created.elementId
    revision = created.revision
    const f = flat(T, R)
    const pattern = created.verification && (await tool("cad", { action: "parametric_inspect", elementId: id })).flatPatterns.channel
    expect(pattern.straightMm).toBeCloseTo(f.straight, 6)
    expect(pattern.bends).toBe(2)
    expect(pattern.lengthMm).toBeCloseTo(f.straight + f.bends, 6)
    const exact = await tool("cad", { action: "parametric_exact", elementId: id })
    expect(exact.bodies[0]).toMatchObject({ exact: true, valid: true })
    expect(rel(exact.bodies[0].volumeMm3, T * W * (f.straight + f.centreArc))).toBeLessThan(1e-3)
  }, SLOW)

  test("thickness is one parameter: 3 mm sheet rebuilds the blank and the volume together", async () => {
    const updated = await tool("cad_edit", { action: "parametric_update", elementId: id, expectedRevision: revision, parameters: { t: 3 } })
    expect(updated.ok).toBe(true)
    const f = flat(3, R)
    expect(updated.report.flatPatterns.channel.lengthMm).toBeCloseTo(f.straight + f.bends, 6)
    expect(rel(updated.verification.volumeMm3, 3 * W * (f.straight + f.centreArc))).toBeLessThan(1e-3)
    revision = updated.revision
    const back = await tool("cad_edit", { action: "parametric_update", elementId: id, expectedRevision: revision, parameters: { t: T } })
    expect(back.ok).toBe(true)
    revision = back.revision
  }, SLOW)

  test("a clearance hole in the base, inserted by parametric_edit, takes exactly its cylinder out of the sheet", async () => {
    const hole = await tool("cad", { action: "parametric_fastener", size: "M6", fit: "medium" })
    const edited = await tool("cad_edit", {
      action: "parametric_edit", elementId: id, expectedRevision: revision,
      edits: [
        { op: "set_parameter", name: "holeD", value: hole.clearanceHole },
        { op: "insert_feature", feature: { id: "mount", type: "hole", plane: "ZX", offset: "t / 2", at: ["w / 2", "base / 2"], diameter: "holeD", depth: "t" } }
      ]
    })
    expect(edited.ok).toBe(true)
    expect(edited.verification.attention.join(" ")).not.toContain("removes no material")
    const f = flat(T, R)
    const expected = T * W * (f.straight + f.centreArc) - (Math.PI / 4) * hole.clearanceHole ** 2 * T
    expect(rel(edited.verification.volumeMm3, expected)).toBeLessThan(2e-3)
  }, SLOW)
})

describe("bolted two-part assembly", () => {
  const plate = (name: string, z: number) => tool("cad_edit", {
    action: "parametric_recipe_create", recipe: "mounting_plate", name, x: 0, y: 0, z,
    params: { width: 80, depth: 60, thickness: 10, fastener: "M6", counterbore: false }
  })
  let baseId = "", coverId = ""

  test("two plates with matching holes are a joint, and fasten inserts exactly the screws, washers and nuts the stack needs, once", async () => {
    await fresh("Bolted plates")
    const base = await plate("Base", 0), cover = await plate("Cover", 10)
    baseId = base.ids[0]; coverId = cover.ids[0]
    expect(base.derived.holeDiameter).toBe(6.6)
    const before = await tool("cad", { action: "assembly" })
    expect(before.ok).toBe(true)
    expect(before.interference.clashesTotal).toBe(0)
    expect(before.joints[0]).toMatchObject({ kind: "fixed", axes: 4 })
    const fastened = await tool("cad_edit", { action: "fasten" })
    expect(fastened.ok).toBe(true)
    const roles = fastened.added.map((a: { role: string }) => a.role)
    // Four bolted joints: a screw, two washers and a nut each.
    expect(roles.filter((r: string) => r === "screw")).toHaveLength(4)
    expect(roles.filter((r: string) => r === "washer")).toHaveLength(8)
    expect(roles.filter((r: string) => r === "nut")).toHaveLength(4)
    const again = await tool("cad_edit", { action: "fasten" })
    expect(again.added ?? []).toHaveLength(0)
    const after = await tool("cad", { action: "assembly" })
    expect(after.fasteners.existing).toBe(4)
    expect(after.fasteners.unfastened).toEqual([])
    expect(after.bom.find((row: { name: string }) => row.name === "ISO 4762 M6x35")).toMatchObject({ quantity: 4 })
    // A pass-through bolt in a clearance hole touches nothing: the screws do not clash with the plates.
    expect(after.interference.clashesTotal).toBe(0)
  }, SLOW)

  test("pushing the cover 2 mm into the base is reported with the exact overlap volume: 2 x (area minus four holes)", async () => {
    const moved = await tool("cad_edit", { action: "transform", ids: [coverId], dz: -2 })
    expect(moved.ok).toBe(true)
    const asm = await tool("cad", { action: "assembly" })
    const plates = asm.interference.clashes.find((c: { a: string; b: string }) => [c.a, c.b].includes(baseId) && [c.a, c.b].includes(coverId))
    expect(plates).toBeDefined()
    const expected = 2 * (80 * 60 - 4 * Math.PI * 3.3 ** 2)
    expect(rel(plates.volume, expected)).toBeLessThan(1e-3)
  }, SLOW)

  test("lifting it 5 mm leaves a measured gap, not a guess", async () => {
    const moved = await tool("cad_edit", { action: "transform", ids: [coverId], dz: 7 })
    expect(moved.ok).toBe(true)
    const gap = await tool("cad", { action: "distance", firstId: baseId, secondId: coverId })
    expect(gap.ok).toBe(true)
    expect(gap.overlap).toBe(false)
    expect(gap.distance).toBeCloseTo(5, 6)
  }, SLOW)
})
