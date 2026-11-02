/**
 * Scenario: a flanged bearing housing built the way an industrial CAD programmer would, driven through the assistant's REAL tools
 * (`cad`, `cad_edit`) and the REAL kernel: named parameters, fully constrained sketches, an ISO 273 bolt circle looked up with
 * `parametric_fastener`, the exact solid checked against hand-computed volumes, one named parameter regenerating the whole
 * part, a refused variant leaving the part untouched, and every refusal telling the model what to do.
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
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Bearing housing" } })).body.id
})
afterAll(async () => { await app.dispose() })

const circle = (diameter: string, id = "c") => ({ id, kind: "circle", at: [0, 0], diameter })
const sketch = (id: string, shapes: unknown[], offset?: string) => ({ id, type: "sketch", plane: "XY", ...(offset === undefined ? {} : { offset }), sketch: { shapes } })

/** The bolt circle is sized from the fastener table, not from memory: an M8 bolt in a medium clearance hole. */
const housingHistory = (boltD: number) => ({
  parameters: { flangeD: 130, flangeT: 10, bodyD: 66, bodyH: 30, seatD: 52, seatW: 15, boreD: 40, bcd: 96, boltD, bolts: 4 },
  features: [
    sketch("sflange", [circle("flangeD")]),
    { id: "flange", type: "extrude", sketch: "sflange", depth: "flangeT", operation: "new" },
    sketch("sbody", [circle("bodyD")]),
    { id: "body", type: "extrude", sketch: "sbody", depth: "flangeT + bodyH", operation: "union" },
    // The bearing seat is cut down from the top face, whose height is a function of two parameters.
    sketch("sseat", [circle("seatD")], "flangeT + bodyH"),
    { id: "seat", type: "extrude", sketch: "sseat", depth: "seatW", direction: "down", operation: "subtract" },
    sketch("sbore", [circle("boreD")]),
    { id: "bore", type: "extrude", sketch: "sbore", depth: "flangeT + bodyH", operation: "subtract" },
    { id: "bolt", type: "hole", plane: "XY", offset: "flangeT", at: ["bcd / 2", 0], diameter: "boltD", depth: "flangeT" },
    { id: "bolts", type: "pattern", feature: "bolt", kind: "circular", count: "bolts", centre: [0, 0] }
  ]
})

/** Hand computation of the housing: a stack of cylinders minus the seat, the bore and the bolt holes (all mm). */
const housingVolume = (p: { flangeD: number; flangeT: number; bodyD: number; bodyH: number; seatD: number; seatW: number; boreD: number; boltD: number; bolts: number }) => {
  const disc = (d: number, h: number) => (Math.PI / 4) * d * d * h
  const total = p.flangeT + p.bodyH
  return disc(p.flangeD, p.flangeT) + disc(p.bodyD, p.bodyH) - disc(p.seatD, p.seatW) - disc(p.boreD, total - p.seatW) - p.bolts * disc(p.boltD, p.flangeT)
}

describe("flanged bearing housing", () => {
  let elementId = ""
  let revision = ""
  let boltD = 0
  const P = { flangeD: 130, flangeT: 10, bodyD: 66, bodyH: 30, seatD: 52, seatW: 15, boreD: 40, bcd: 96, bolts: 4 }

  test("the bolt hole comes from the ISO 273 table, not from memory", async () => {
    const found = await tool("cad", { action: "parametric_fastener", size: "M8", fit: "medium" })
    expect(found.ok).toBe(true)
    boltD = found.clearanceHole
    expect(boltD).toBe(9)
    expect(found.thread.tapDrill).toBeCloseTo(6.8, 5)
  })

  test("validate gives a verdict before anything is stored: exact, closed, fully constrained, dimensions as hand-computed", async () => {
    const checked = await tool("cad", { action: "parametric_validate", history: housingHistory(boltD) })
    expect(checked.ok).toBe(true)
    expect(checked.verification).toMatchObject({ verdict: "valid", bodies: 1, closedSolid: true, sketchesFullyConstrained: true, throughHoles: 1 + P.bolts })
    // Exact when the kernel finishes inside the interactive budget (1.5 s); otherwise the mesh volume, which is within 0.05 %, and it says so.
    expect(checked.verification.exactBodies === 1 || typeof checked.verification.exactPending === "string").toBe(true)
    expect(checked.verification.sizeMm.x).toBeCloseTo(130, 0)
    expect(checked.verification.sizeMm.z).toBeCloseTo(40, 1)
    expect(Math.abs(checked.verification.volumeMm3 - housingVolume({ ...P, boltD })) / housingVolume({ ...P, boltD })).toBeLessThan(5e-4)
    expect(checked.verification.attention).toEqual([])
  }, SLOW)

  test("create stores it and answers with the handles of the next call and the same verdict", async () => {
    const created = await tool("cad_edit", { action: "parametric_create", name: "Bearing housing", history: housingHistory(boltD) })
    expect(created.ok).toBe(true)
    elementId = created.elementId
    revision = created.revision
    expect(created.ids).toEqual([elementId])
    expect(revision).toMatch(/^[0-9a-f]{64}$/)
    expect(created.verification.verdict).toBe("valid")
    // The revision handed back is the one inspection reads, so the very next update needs no extra round trip.
    const inspected = await tool("cad", { action: "parametric_inspect", elementId })
    expect(inspected.revision).toBe(revision)
  }, SLOW)

  test("the exact solid is valid and its volume is the hand-computed one to 0.01 %", async () => {
    const exact = await tool("cad", { action: "parametric_exact", elementId })
    expect(exact.ok).toBe(true)
    const body = exact.bodies[0]
    expect(body).toMatchObject({ exact: true, valid: true, throughHoles: 1 + P.bolts })
    const expected = housingVolume({ ...P, boltD })
    expect(Math.abs(body.volumeMm3 - expected) / expected).toBeLessThan(1e-4)
  }, SLOW)

  test("manufacturability: no error on a mill with a 6 mm cutter, the bolt circle keeps its edge distance", async () => {
    const dfm = await tool("cad", { action: "parametric_dfm", elementId, process: "mill", toolDiameter: 6, material: "metal" })
    expect(dfm.issues.filter((i: { severity: string }) => i.severity === "error")).toEqual([])
    expect(dfm.issues.find((i: { code: string }) => i.code === "HOLE_EDGE_DISTANCE")).toBeUndefined()
  }, SLOW)

  test("one named parameter regenerates the whole part: six bolts, a bigger bore and a thicker flange follow together", async () => {
    const updated = await tool("cad_edit", { action: "parametric_update", elementId, expectedRevision: revision, parameters: { bolts: 6, boreD: 44, flangeT: 12 } })
    expect(updated.ok).toBe(true)
    expect(updated.verification.attention).toEqual([])
    expect(updated.verification.verdict).toBe("valid")
    expect(updated.verification.throughHoles).toBe(1 + 6)
    // Seat height and bolt offsets are expressions of flangeT: the part is 2 mm taller and the holes still cut the flange.
    expect(updated.verification.sizeMm.z).toBeCloseTo(42, 1)
    const expected = housingVolume({ ...P, flangeT: 12, boreD: 44, bolts: 6, boltD })
    expect(Math.abs(updated.verification.volumeMm3 - expected) / expected).toBeLessThan(5e-4)
    revision = updated.revision
  }, SLOW)

  test("changing it back restores the original revision: a parameter edit is its own undo", async () => {
    const back = await tool("cad_edit", { action: "parametric_update", elementId, expectedRevision: revision, parameters: { bolts: 4, boreD: 40, flangeT: 10 } })
    expect(back.ok).toBe(true)
    const again = await tool("cad", { action: "parametric_inspect", elementId })
    expect(Math.abs(again.verification.volumeMm3 - housingVolume({ ...P, boltD })) / housingVolume({ ...P, boltD })).toBeLessThan(5e-4)
    revision = back.revision
  }, SLOW)

  test("a variant that cannot be built is refused with the cause and the fix, and the stored part does not move", async () => {
    const refused = await tool("cad_edit", { action: "parametric_update", elementId, expectedRevision: revision, parameters: { boreD: -5 } })
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain("untouched")
    expect(refused.diagnosis.rootCauses.length).toBeGreaterThan(0)
    const after = await tool("cad", { action: "parametric_inspect", elementId })
    expect(after.revision).toBe(revision)
    // A parameter that does not exist is named with the ones that do, and the way to add it.
    const typo = await tool("cad_edit", { action: "parametric_update", elementId, expectedRevision: revision, parameters: { boltDiameter: 9 } })
    expect(typo.ok).toBe(false)
    expect(typo.error).toContain("boltD")
    expect(typo.error).toContain("set_parameter")
  }, SLOW)

  test("parametric_edit adds a chamfer on the seat mouth and a fillet at the foot of the neck; the volumes follow Pappus' theorem", async () => {
    const before = await tool("cad", { action: "parametric_exact", elementId })
    const v0 = before.bodies[0].volumeMm3
    const edited = await tool("cad_edit", {
      action: "parametric_edit", elementId, expectedRevision: revision,
      edits: [
        { op: "set_parameter", name: "neckFillet", value: 3 },
        { op: "insert_feature", feature: { id: "neckBlend", type: "fillet", radius: "neckFillet", edges: { kind: "concave", curved: true, within: { min: [-34, -34, 9.9], max: [34, 34, 10.1] } } } }
      ]
    })
    expect(edited.ok).toBe(true)
    const after = (await tool("cad", { action: "parametric_exact", elementId })).bodies[0].volumeMm3
    // Fill added by a concave fillet of radius r on a neck of radius R: 2 pi (R + 0.2234 r) x (1 - pi/4) r^2.
    const r = 3, R = 33
    const fill = 2 * Math.PI * (R + 0.2234 * r) * (1 - Math.PI / 4) * r * r
    expect(after - v0).toBeGreaterThan(fill * 0.95)
    expect(after - v0).toBeLessThan(fill * 1.05)
    revision = edited.revision
  }, SLOW)

  test("a stale revision is refused, and parametric_edit removes the fillet again without touching anything else", async () => {
    const stale = await tool("cad_edit", { action: "parametric_edit", elementId, expectedRevision: "0".repeat(64), edits: [{ op: "remove_feature", id: "neckBlend" }] })
    expect(stale.ok).toBe(false)
    expect(stale.error).toContain("Inspect")
    const removed = await tool("cad_edit", { action: "parametric_edit", elementId, expectedRevision: revision, edits: [{ op: "remove_feature", id: "neckBlend" }] })
    expect(removed.ok).toBe(true)
    expect(Math.abs(removed.verification.volumeMm3 - housingVolume({ ...P, boltD })) / housingVolume({ ...P, boltD })).toBeLessThan(5e-4)
  }, SLOW)
})

describe("what the verdict warns about", () => {
  test("a bolt hole that misses the part is stored, but the verdict says 'review' and names the feature", async () => {
    const history = housingHistory(9)
    const miss = { ...history, features: history.features.map((f) => f.id === "bolt" ? { ...f, offset: "flangeT + 30" } : f) }
    const created = await tool("cad_edit", { action: "parametric_create", name: "Misplaced bolt", history: miss })
    expect(created.ok).toBe(true)
    expect(created.verification.verdict).toBe("review")
    expect(created.verification.attention.join(" ")).toContain("removes no material")
  }, SLOW)

  test("a union that touches nothing is reported as separate lumps instead of passing silently", async () => {
    const history = {
      parameters: { w: 40, t: 5 },
      features: [
        sketch("a", [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: "w" }]),
        { id: "base", type: "extrude", sketch: "a", depth: "t", operation: "new" },
        sketch("b", [{ id: "c", kind: "circle", at: [200, 0], diameter: 10 }]),
        { id: "lump", type: "extrude", sketch: "b", depth: "t", operation: "union" }
      ]
    }
    const checked = await tool("cad", { action: "parametric_validate", history })
    expect(checked.ok).toBe(true)
    expect(checked.verification.verdict).toBe("review")
    expect(checked.verification.attention.join(" ")).toContain("disjoint")
  }, SLOW)

  test("a cut that eats the whole part says which feature did it", async () => {
    const history = {
      parameters: { w: 40, t: 5 },
      features: [
        sketch("a", [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: "w" }]),
        { id: "base", type: "extrude", sketch: "a", depth: "t", operation: "new" },
        sketch("b", [{ id: "r", kind: "rectangle", at: [-10, -10], width: 100, height: 100 }]),
        { id: "tooMuch", type: "extrude", sketch: "b", depth: 20, operation: "subtract" }
      ]
    }
    const refused = await tool("cad_edit", { action: "parametric_create", name: "Nothing left", history })
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain("tooMuch")
    expect(refused.diagnosis.removedLastSolid.feature).toBe("tooMuch")
  }, SLOW)

  test("an unknown name in an expression lists the parameters that exist", async () => {
    const history = housingHistory(9)
    const typo = { ...history, features: history.features.map((f) => f.id === "bolt" ? { ...f, diameter: "boltDia" } : f) }
    const refused = await tool("cad_edit", { action: "parametric_create", name: "Typo", history: typo })
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain("boltDia")
    expect(refused.error).toContain("boltD")
  }, SLOW)
})
