import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe, cad, model } from "@cadcamfun/core"
import { CadAssemblyReport, CadExactAnalysis, CadExactStep, CadHoleReport, CadSetupsReport } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(90_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history }
const cube = (id: string, x: number) => ({ id, type: "cube", name: id, x, y: 0, z: 0, width: 10, height: 10, depth: 10, layerId: "default" })
const post = (path: string, json: unknown, auth = true) => app.call(`/api/cad/exact/${path}`, { method: "POST", json, auth })

test("the exact kernel routes are authenticated and need a source", async () => {
  for (const path of ["analyze", "step", "assembly", "setups", "hole"]) {
    expect((await post(path, { elements: [plate] }, false)).status).toBe(401)
    expect((await post(path, {})).status).toBe(400)
    expect((await post(path, { elements: [] })).status).toBe(400)
  }
  expect((await post("analyze", { drawingId: "missing" })).status).toBe(404)
})

test("analyze gives the exact mass properties, the recognised holes and how the CAM will machine the part", async () => {
  const response = await post("analyze", { elements: [plate] })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CadExactAnalysis)(response.body)
  expect(result.parts).toHaveLength(1)
  const part = result.parts[0]!
  expect(part.valid).toBe(true)
  expect(part.holes).toHaveLength(4)
  expect(part.holes.every((h) => h.form === "counterbore" && h.bottom === "through")).toBe(true)
  expect(part.bounds.max.z).toBeCloseTo(12, 9)
  expect(part.machining).toMatchObject({ prismatic: true, holes: 4, pockets: 0, outlines: 1 })
  const holeVolume = 4 * (Math.PI * 2.75 ** 2 * (12 - 5.7) + Math.PI * 5 ** 2 * 5.7)
  expect(part.volume).toBeCloseTo(120 * 80 * 12 - holeVolume, 1)
  expect(result.totals.parts).toBe(1)
})

test("a stored drawing is read by id under the drawing access rule, and the scene never travels", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Exact kernel" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate, cube("c", 200)] } } })).body.id
  const response = await post("analyze", { drawingId: drawing, ids: ["plate"] })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CadExactAnalysis)(response.body)
  expect(result.parts.map((p) => p.id)).toEqual(["plate"])
  const all = Schema.decodeUnknownSync(CadExactAnalysis)((await post("analyze", { drawingId: drawing })).body)
  expect(all.parts.map((p) => p.id)).toEqual(["plate", "c"])
})

test("step writes the selection as one exact STEP file", async () => {
  const response = await post("step", { elements: [plate, cube("c", 200)], ids: ["plate"] })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CadExactStep)(response.body)
  expect(result.step).toMatch(/^ISO-10303-21;/)
  expect(result.parts).toEqual([expect.objectContaining({ id: "plate", exact: true, valid: true })])
  const none = Schema.decodeUnknownSync(CadExactStep)((await post("step", { elements: [{ id: "t", type: "text", text: "x", x: 0, y: 0 }] })).body)
  expect(none.step).toBeUndefined()
})

test("assembly reports the clash of two overlapping parts with the exact overlap volume", async () => {
  const response = await post("assembly", { elements: [cube("a", 0), cube("b", 5)] })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CadAssemblyReport)(response.body)
  expect(result.parts).toBe(2)
  expect(result.interference.clashes).toHaveLength(1)
  expect(result.interference.clashes[0]!.volume).toBeCloseTo(500, 2)
  expect(result.bom.map((row) => row.name).sort()).toEqual(["a", "b"])
})

/** A 60 x 40 x 20 block with a Ø6 hole drilled into it from its +X face (a side hole, 12 deep). */
const sideHole = {
  id: "side", type: "parametric", name: "Side", x: 0, y: 0, z: 0, layerId: "default",
  history: {
    parameters: {},
    features: [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 60, height: 40 }] } },
      { id: "block", type: "extrude", sketch: "s", depth: 20, operation: "new" },
      { id: "h", type: "hole", plane: "YZ", offset: 60, at: [20, 10], diameter: 6, depth: 12 }
    ]
  }
}

test("setups plan the orientations a part needs: a top-drilled plate one, a side hole a second", async () => {
  const flat = Schema.decodeUnknownSync(CadSetupsReport)((await post("setups", { elements: [plate] })).body)
  expect(flat.parts).toHaveLength(1)
  expect(flat.parts[0]!.plan.setups.map((s) => s.orientation)).toEqual(["+Z"])
  expect(flat.parts[0]!.plan.setups[0]!.holes).toHaveLength(4)
  expect(flat.parts[0]!.plan.uncovered).toHaveLength(0)

  const side = Schema.decodeUnknownSync(CadSetupsReport)((await post("setups", { elements: [sideHole, cube("c", 200)], ids: ["side"] })).body)
  expect(side.parts.map((p) => p.id)).toEqual(["side"])
  const plan = side.parts[0]!.plan
  expect(plan.setups.map((s) => s.orientation).sort()).toEqual(["+X", "+Z"])
  expect(plan.setups.find((s) => s.orientation === "+X")!.holes).toEqual([expect.objectContaining({ diameter: expect.closeTo(6, 6), depth: expect.closeTo(12, 6) })])
  expect(plan.uncovered).toHaveLength(0)

  const only = Schema.decodeUnknownSync(CadSetupsReport)((await post("setups", { elements: [sideHole], allowed: ["+Z"] })).body)
  expect(only.parts[0]!.plan.uncovered.length).toBeGreaterThan(0)
  expect(only.parts[0]!.plan.indexed).toHaveLength(1)
  expect((await post("setups", { elements: [sideHole], allowed: ["+W"] })).status).toBe(400)
})

test("hole previews the resize or fill of one recognised hole, exactly one change per request", async () => {
  const resize = Schema.decodeUnknownSync(CadHoleReport)((await post("hole", { elements: [plate], id: "plate", hole: 1, diameter: 7 })).body)
  expect(resize).toMatchObject({ ok: true, valid: true, hole: 1, holes: 4, edit: { kind: "resize", diameter: 7 } })
  if (!resize.ok) throw new Error(resize.error)
  const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h
  expect(resize.volumeChange).toBeCloseTo(-(disc(7, 6.3) - disc(5.5, 6.3)), 3)
  const wide = Schema.decodeUnknownSync(CadHoleReport)((await post("hole", { elements: [plate], id: "plate", hole: 0, diameter: 10 })).body)
  expect(wide).toMatchObject({ ok: false, error: expect.stringContaining("counterbore") })
  expect((await post("hole", { elements: [plate], id: "plate", hole: 0 })).status).toBe(400)
  expect((await post("hole", { elements: [plate], id: "plate", hole: 0, diameter: 7, fill: true })).status).toBe(400)
  expect((await post("hole", { elements: [plate], id: "plate", hole: 0, diameter: -3 })).status).toBe(400)
})

/** A 40 x 30 x 10 plate with a Ø10 boss 12 high standing on it. */
const bossed = {
  id: "bossed", type: "parametric", name: "Bossed", x: 0, y: 0, z: 0, layerId: "default",
  history: {
    parameters: {},
    features: [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 40, height: 30 }] } },
      { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "c", type: "sketch", plane: "XY", offset: 10, sketch: { entities: [], constraints: [], shapes: [{ id: "k", kind: "circle", at: [20, 15], diameter: 10 }] } },
      { id: "boss", type: "extrude", sketch: "c", depth: 12, operation: "union" }
    ]
  }
}

test("analyze lists the bosses and hole previews the resize of one, a boss takes a diameter only", async () => {
  const analysis = Schema.decodeUnknownSync(CadExactAnalysis)((await post("analyze", { elements: [bossed] })).body)
  expect(analysis.parts[0]!.bosses).toEqual([expect.objectContaining({ free: "far", diameter: expect.closeTo(10, 6), length: expect.closeTo(12, 6) })])
  const grown = Schema.decodeUnknownSync(CadHoleReport)((await post("hole", { elements: [bossed], id: "bossed", boss: 0, diameter: 16 })).body)
  expect(grown).toMatchObject({ ok: true, valid: true, boss: 0, bosses: 1 })
  const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h
  if (!("boss" in grown)) throw new Error("expected a boss report")
  expect(grown.volumeChange).toBeCloseTo(disc(16, 12) - disc(10, 12), 3)
  expect(Schema.decodeUnknownSync(CadHoleReport)((await post("hole", { elements: [bossed], id: "bossed", boss: 4, diameter: 8 })).body)).toMatchObject({ ok: false, error: expect.stringContaining("1 recognised bosses") })
  expect((await post("hole", { elements: [bossed], id: "bossed", boss: 0 })).status).toBe(400)
  expect((await post("hole", { elements: [bossed], id: "bossed", boss: 0, fill: true })).status).toBe(400)
  expect((await post("hole", { elements: [bossed], id: "bossed", hole: 0, boss: 0, diameter: 8 })).status).toBe(400)
  expect((await post("hole", { elements: [bossed], id: "bossed", diameter: 8 })).status).toBe(400)
})

test("a draft angle narrows the new bore or boss wall: the previewed volume is the exact frustum, and it needs a diameter", async () => {
  const frustum = (r1: number, r2: number, h: number) => (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3
  const tan = (deg: number) => Math.tan((deg * Math.PI) / 180)
  const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h
  // The mounting plate's drill is Ø5.5 over 6.3 mm below the counterbore: drafted 3 degrees from Ø7.
  const hole = Schema.decodeUnknownSync(CadHoleReport)((await post("hole", { elements: [plate], id: "plate", hole: 0, diameter: 7, taper: 3 })).body)
  if (!hole.ok || !("hole" in hole)) throw new Error("expected a hole report")
  expect(hole.volumeChange).toBeCloseTo(disc(5.5, 6.3) - frustum(3.5, 3.5 - 6.3 * tan(3), 6.3), 3)
  expect(hole.edit).toEqual({ kind: "resize", diameter: 7, taper: 3 })
  const boss = Schema.decodeUnknownSync(CadHoleReport)((await post("hole", { elements: [bossed], id: "bossed", boss: 0, diameter: 10, taper: 5 })).body)
  if (!boss.ok || !("boss" in boss)) throw new Error("expected a boss report")
  expect(boss.volumeChange).toBeCloseTo(frustum(5, 5 - 12 * tan(5), 12) - disc(10, 12), 3)
  expect(boss.taper).toBe(5)
  expect((await post("hole", { elements: [plate], id: "plate", hole: 0, fill: true, taper: 3 })).status).toBe(400)
  expect((await post("hole", { elements: [plate], id: "plate", hole: 0, diameter: 7, taper: 31 })).status).toBe(400)
  const closing = Schema.decodeUnknownSync(CadHoleReport)((await post("hole", { elements: [bossed], id: "bossed", boss: 0, diameter: 4, taper: 25 })).body)
  expect(closing).toMatchObject({ ok: false, error: expect.stringContaining("closes the boss") })
})

test("analyze reads a threaded shaft on its exact model: valid, with the volume of the shaft and the thread", async () => {
  const shaft = {
    id: "shaft", type: "parametric", name: "Shaft", x: 0, y: 0, z: 0, layerId: "default",
    history: { parameters: {}, features: [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "c", kind: "circle", at: [0, 0], diameter: 6 }] } },
      { id: "rod", type: "extrude", sketch: "s", depth: 14, operation: "new" },
      { id: "t", type: "thread", kind: "external", diameter: 6, pitch: 1, length: 8, at: [0, 0], offset: 2, cut: true }
    ] }
  }
  const result = Schema.decodeUnknownSync(CadExactAnalysis)((await post("analyze", { elements: [shaft] })).body)
  expect(result.skipped).toEqual([])
  const part = result.parts[0]!
  expect(part.valid).toBe(true)
  // 14 mm of Ø6 shaft, of which 8 mm carry the thread: the rest is a plain cylinder, the thread the ISO profile.
  const threadVolume = cad.exactThreadVolume({ diameter: 6, pitch: 1, length: 8, internal: false }) as number
  const expected = Math.PI * 9 * 6 + threadVolume
  // The crest of a thread cut into a shaft of the major diameter is brought in by 0.03 mm so the Boolean can decide it: a little under the nominal.
  expect(Math.abs(part.volume - expected) / expected).toBeLessThan(0.008)
  expect(part.volume).toBeLessThan(expected)
  // The same body goes out as STEP.
  const step = Schema.decodeUnknownSync(CadExactStep)((await post("step", { elements: [shaft] })).body)
  expect(step.parts).toEqual([expect.objectContaining({ id: "shaft", exact: true, valid: true })])
})

const rounded = (() => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 60, 40), { depth: 10 })
  m.fillet({ radius: 3, edges: { parallel: "z" } })
  return { id: "rounded", type: "parametric", name: "Rounded", x: 0, y: 0, z: 0, layerId: "default", history: JSON.parse(JSON.stringify(m.build())) }
})()

test("the rounded edges of a part are listed and a fillet takes a new radius: the volume moves by the sliver between the arcs", async () => {
  const analysis = Schema.decodeUnknownSync(CadExactAnalysis)((await post("analyze", { elements: [rounded] })).body)
  const fillets = analysis.parts[0]!.fillets
  expect(fillets).toBeDefined()
  expect(fillets!.length).toBeGreaterThanOrEqual(4)
  const f = fillets![0]!
  expect(f).toMatchObject({ kind: "cylinder", convex: true })
  const radius = f.radius - 1
  const response = await post("hole", { elements: [rounded], id: "rounded", fillet: 0, radius })
  expect(response.status).toBe(200)
  const report = Schema.decodeUnknownSync(CadHoleReport)(response.body)
  if (!("fillet" in report) || !report.ok) throw new Error(JSON.stringify(report))
  // A quarter-turn fillet leaves out r^2 (1 - pi/4): a tighter corner gains the difference, over the band's length.
  expect(report.volumeChange).toBeCloseTo((1 - Math.PI / 4) * (f.radius ** 2 - radius ** 2) * f.length, 4)
  expect(report.before).toEqual({ radius: f.radius, convex: true })
  expect(report.valid).toBe(true)
  // One target and one change.
  expect((await post("hole", { elements: [rounded], id: "rounded", fillet: 0 })).status).toBe(400)
  expect((await post("hole", { elements: [rounded], id: "rounded", fillet: 0, hole: 0, radius })).status).toBe(400)
  expect((await post("hole", { elements: [rounded], id: "rounded", fillet: 0, radius, diameter: 3 })).status).toBe(400)
  const refused = Schema.decodeUnknownSync(CadHoleReport)((await post("hole", { elements: [rounded], id: "rounded", fillet: 99, radius })).body)
  expect(refused.ok).toBe(false)
})
