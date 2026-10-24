import { expect, setDefaultTimeout, test } from "bun:test"
import type { History } from "./history.ts"
import { model } from "./script.ts"
import { analyzeBrep, analyzeScene, assemblyReport, setupsForScene } from "./scene-analysis.ts"
import { makeBox } from "./brep/index.ts"

setDefaultTimeout(90_000)

/** A 60 x 30 block of height h at the origin with two holes 30 mm apart, drilled from its top. */
const block = (h: number, d: number, depth: number): History => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 60, 30), { depth: h, id: "block" })
  m.hole({ plane: "XY", offset: h, at: [15, 15], diameter: d, depth, id: "a" })
  m.hole({ plane: "XY", offset: h, at: [45, 15], diameter: d, depth, id: "b" })
  return m.build()
}
/** An aluminium base with two M8 tapped holes and a steel plate with two M8 clearance holes, placed on it inside a component. */
const scene = (): Array<Record<string, unknown>> => [
  { id: "base", type: "parametric", name: "Base", history: block(20, 6.8, 16), x: 0, y: 0, z: 0, layerId: "default", metadata: { material: "aluminium" } },
  { id: "sub", type: "component", name: "Cover assembly", x: 0, y: 0, z: 20, layerId: "default", elements: [
    { id: "plate", type: "parametric", name: "Plate", history: block(8, 9, 8), x: 0, y: 0, z: 0, layerId: "default", metadata: { material: "S235JR" } }
  ] },
  { id: "note", type: "text", text: "label", x: 0, y: 0 }
]

test("each solid of the scene is analysed on its exact model", () => {
  const a = analyzeScene(scene())
  expect(a.parts.map((p) => p.id)).toEqual(["base", "plate"])
  const base = a.parts[0]!
  expect(base.valid).toBe(true)
  // 60 x 30 x 20 block minus two Ø6.8 x 16 blind holes.
  expect(base.volume).toBeCloseTo(60 * 30 * 20 - 2 * Math.PI * 3.4 ** 2 * 16, 2)
  expect(base.holes).toHaveLength(2)
  expect(base.holes.every((h) => h.diameter === 6.8 && Math.abs(h.depth - 16) < 1e-6 && h.bottom !== "through")).toBe(true)
  expect(base.bounds.max.z).toBeCloseTo(20, 9)
  expect(base.machining).toMatchObject({ prismatic: true, holes: 2, outlines: 1, pockets: 0 })
  const plate = a.parts[1]!
  expect(plate.bounds.min.z).toBeCloseTo(20, 9)
  expect(plate.holes.map((h) => h.bottom)).toEqual(["through", "through"])
  expect(a.totals.parts).toBe(2)
  expect(a.totals.volume).toBeCloseTo(base.volume + plate.volume, 6)
})

test("a selection narrows the analysis; a non-solid is never listed as a part", () => {
  expect(analyzeScene(scene(), { ids: ["plate"] }).parts.map((p) => p.id)).toEqual(["plate"])
  expect(analyzeScene(scene(), { machining: false }).parts[0]!.machining).toEqual({ prismatic: false, reason: "not evaluated" })
})

test("the assembly report finds the fasteners the shared holes need, the joints, the parts list and no clash", () => {
  const r = assemblyReport(scene())
  expect(r.parts).toBe(2)
  expect(r.interference.clashes).toEqual([])
  expect(r.fasteners.plans.map((p) => p.designation)).toEqual(["ISO 4762 M8x20", "ISO 4762 M8x20"])
  expect(r.fasteners.plans[0]!.threadName).toBe("M8")
  expect(r.fasteners.unfastened).toEqual([])
  expect(r.fasteners.existing).toBe(0)
  expect(r.bom.map((row) => row.name).sort()).toEqual(["Base", "Plate"])
  expect(r.bom.find((row) => row.name === "Base")!.mass).toBeGreaterThan(0)
  expect(r.joints).toHaveLength(1)
  expect(r.joints[0]!.kind).toBe("fixed")
  expect(new Set([r.joints[0]!.parentName, r.joints[0]!.childName])).toEqual(new Set(["Base", "Plate"]))
})

test("two overlapping parts are a clash with the exact overlap volume", () => {
  const cube = (id: string, x: number) => ({ id, type: "cube", name: id, x, y: 0, z: 0, width: 10, height: 10, depth: 10 })
  const r = assemblyReport([cube("a", 0), cube("b", 5)])
  expect(r.interference.clashes).toHaveLength(1)
  expect(r.interference.clashes[0]!.volume).toBeCloseTo(5 * 10 * 10, 3)
})

test("the assembly report lists the closest pairs with their exact gap", () => {
  const cube = (id: string, x: number) => ({ id, type: "cube", name: id, x, y: 0, z: 0, width: 10, height: 10, depth: 10 })
  const r = assemblyReport([cube("a", 0), cube("b", 13), cube("far", 100)])
  expect(r.clearance).toHaveLength(1)
  expect(r.clearance[0]!.aName).toBe("a")
  expect(r.clearance[0]!.bName).toBe("b")
  expect(r.clearance[0]!.distance).toBeCloseTo(3, 9)
  expect(r.clearance[0]!.overlap).toBe(false)
})

import { sceneDistance, sceneShell } from "./scene-analysis.ts"
test("a solid of the drawing can be hollowed on paper: volumes, open faces by name, reasons when it cannot", () => {
  const cube = { id: "c", type: "cube", name: "block", x: 0, y: 0, z: 0, width: 30, height: 20, depth: 10 }
  const closed = sceneShell([cube], "c", 2)
  expect(closed.ok).toBe(true)
  if (closed.ok) {
    expect(closed.cavityVolume).toBeCloseTo(26 * 16 * 6, 6)
    expect(closed.volume).toBeCloseTo(6000 - 26 * 16 * 6, 6)
    expect(closed.shells).toBe(2)
    expect(closed.valid).toBe(true)
  }
  expect(sceneShell([cube], "missing", 2)).toEqual({ ok: false, error: "no solid 'missing' in the drawing" })
  const bad = sceneShell([cube], "c", 2, ["nothing.top"])
  expect(bad.ok).toBe(false)
  expect(sceneShell([{ id: "s", type: "sphere", radius: 10, x: 0, y: 0, z: 0 }], "s", 11).ok).toBe(false)
  const ball = sceneShell([{ id: "s", type: "sphere", radius: 10, x: 0, y: 0, z: 0 }], "s", 2)
  expect(ball.ok && Math.abs(ball.cavityVolume - (4 / 3) * Math.PI * 512) < 1e-6).toBe(true)
})

test("the exact gap between two solids of the drawing", () => {
  const cube = (id: string, x: number) => ({ id, type: "cube", name: id, x, y: 0, z: 0, width: 10, height: 10, depth: 10 })
  const d = sceneDistance([cube("a", 0), cube("b", 14.5)], "a", "b")
  expect(d.ok).toBe(true)
  if (d.ok) { expect(d.distance).toBeCloseTo(4.5, 9); expect(d.overlap).toBe(false) }
  expect(sceneDistance([cube("a", 0)], "a", "a").ok).toBe(false)
  expect(sceneDistance([cube("a", 0)], "a", "zz").ok).toBe(false)
})

test("the exact analysis names the faces and says what healing would do for a solid that does not validate", () => {
  const params = analyzeScene([{ id: "c", type: "cube", name: "block", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }]).parts[0]!
  expect(params.valid).toBe(true)
  expect(params.repair).toBeUndefined()
  const bad = analyzeBrep("x", "open box", (() => {
    const box = makeBox(10, 10, 10)
    // Drop a face: the shell is open and every neighbour's edge is used once.
    return { ...box, faces: box.faces.slice(0, 5), shells: [{ faces: [0, 1, 2, 3, 4], closed: true }] }
  })(), { machining: false })
  expect(bad.valid).toBe(false)
  expect(bad.repair).toBeDefined()
  expect(bad.repair!.validAfter).toBe(false)
  expect(bad.repair!.issuesAfter.length).toBeGreaterThan(0)
})

test("setups are planned for the solids of the scene, a component's child included, and the selection narrows them", () => {
  const all = setupsForScene(scene())
  expect(all.parts.map((p) => p.id)).toEqual(["base", "plate"])
  // Both blocks are drilled from the top only: one +Z setup with the two holes each, nothing unreachable.
  for (const p of all.parts) {
    expect(p.plan.setups.map((s) => s.orientation)).toEqual(["+Z"])
    expect(p.plan.setups[0]!.holes).toHaveLength(2)
    expect(p.plan.uncovered).toEqual([])
  }
  expect(setupsForScene(scene(), { ids: ["plate"] }).parts.map((p) => p.id)).toEqual(["plate"])
  expect(setupsForScene(scene(), { fixture: "none" }).parts[0]!.plan.setups.map((s) => s.orientation).sort()).toEqual(["+Z", "-Z"])
})

test("the machining summary counts the islands standing in a pocket, and only then", () => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 100, 60), { depth: 10, id: "plate" })
  m.extrude(m.sketch("XY", 10).rectangle([20, 10], 60, 40), { depth: 6, direction: "down", operation: "subtract", id: "pocket" })
  m.extrude(m.sketch("XY", 4).rectangle([40, 20], 20, 20), { depth: 6, operation: "union", id: "island" })
  const withIsland = analyzeScene([{ id: "p", type: "parametric", name: "P", history: m.build(), x: 0, y: 0, z: 0, layerId: "default" }])
  expect(withIsland.parts[0]!.machining).toMatchObject({ prismatic: true, pockets: 1, outlines: 1, islands: 1 })
  const plain = analyzeScene([{ id: "b", type: "parametric", name: "B", history: block(20, 6.8, 16), x: 0, y: 0, z: 0, layerId: "default" }])
  expect("islands" in plain.parts[0]!.machining).toBe(false)
})
