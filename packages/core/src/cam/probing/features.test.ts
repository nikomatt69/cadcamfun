import { describe, expect, test } from "bun:test"
import { booleanBrep, makeBox, makeCylinder, makeSphere, translation, transformBrep, tessellateBrep, type Brep } from "../../cad/brep/index.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings } from "./device.ts"
import { planProbeCycle } from "./cycles.ts"
import { planProbeForFeature, previewMoves, probeCandidates } from "./features.ts"
import { runProbeMoves } from "./simulate.ts"
import { meshWorld } from "./world.ts"
import type { ProbeContext } from "./types.ts"

const probe = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const ctx: ProbeContext = { probe, safeZ: 50, clearance: 3, search: 6, prefix: "pf" }
const at = (x: number, y: number, z: number) => translation({ x, y, z })

/** A 100 x 60 x 20 plate whose top is z = 0, with a 20 mm hole at (30, 30) and a 16 mm boss at (75, 30) standing 10 high. */
const plate = (): Brep => {
  const block = transformBrep(makeBox(100, 60, 20), at(0, 0, -20))
  const holed = booleanBrep(block, transformBrep(makeCylinder(10, 40), at(30, 30, -30)), "subtract").brep
  return booleanBrep(holed, transformBrep(makeCylinder(8, 10), at(75, 30, 0)), "union").brep
}
const element = (brep: Brep, id = "part") => ({ id, type: "brep", brep, x: 0, y: 0, z: 0 })

describe("feature to cycle", () => {
  const part = plate()
  const els = [element(part)]

  test("the candidates of a plate with a hole and a boss", () => {
    const refs = probeCandidates(part).map((c) => c.kind)
    expect(refs).toContain("bore")
    expect(refs).toContain("boss")
    expect(refs).toContain("z-surface")
    expect(refs).toContain("edge")
    expect(refs).toContain("corner")
  })

  test("a hole is a bore, a boss a boss, the top face a z-surface, found by hint", () => {
    const bore = planProbeForFeature(els, { elementId: "part", hint: "bore" }, ctx)
    expect(bore.ok && bore.cycle.kind === "bore" && bore.cycle.diameter === 20 && Math.abs(bore.cycle.centre.x - 30) < 1e-3 && Math.abs(bore.cycle.centre.y - 30) < 1e-3).toBe(true)
    const boss = planProbeForFeature(els, { elementId: "part", hint: "boss" }, ctx)
    expect(boss.ok && boss.cycle.kind === "boss" && boss.cycle.diameter === 16 && Math.abs(boss.cycle.centre.x - 75) < 1e-3).toBe(true)
    const top = planProbeForFeature(els, { elementId: "part", hint: "z-surface" }, ctx)
    expect(top.ok && top.cycle.kind === "z-surface").toBe(true)
  })

  test("without a hint the first kind present is chosen and the reason says so", () => {
    const plan = planProbeForFeature(els, { elementId: "part" }, ctx)
    expect(plan.ok).toBe(true)
    if (plan.ok) { expect(plan.cycle.kind).toBe("bore"); expect(plan.chosenBecause).toMatch(/first kind present/) }
  })

  test("an outside corner has the faces' senses toward the part and is measured exactly on the mesh", () => {
    const plan = planProbeForFeature(els, { elementId: "part", hint: "corner" }, ctx)
    expect(plan.ok).toBe(true)
    if (!plan.ok || plan.cycle.kind !== "corner") throw new Error("no corner")
    expect(plan.cycle.inside).toBe(false)
    const routine = planProbeCycle(plan.cycle, ctx)
    if ("refused" in routine) throw new Error(routine.refused)
    const world = meshWorld([tessellateBrep(part)])
    const out = runProbeMoves(routine.moves, world, { offsets: { entries: {} }, active: { kind: "g5x", code: "G54" }, probe, start: { x: 0, y: 0, z: 50 } }, { results: routine.results, units: routine.units })
    expect(out.stopped).toBeUndefined()
    expect(Math.abs(out.results["x"]! - plan.cycle.corner.x)).toBeLessThan(2e-3)
    expect(Math.abs(out.results["y"]! - plan.cycle.corner.y)).toBeLessThan(2e-3)
  })

  test("the cycle of a feature, run on the tessellated part, finds the feature where the model says", () => {
    const world = meshWorld([tessellateBrep(part)])
    const machine = { offsets: { entries: {} }, active: { kind: "g5x" as const, code: "G54" as const }, probe, start: { x: 0, y: 0, z: 50 } }
    for (const [hint, want] of [["bore", { x: 30, y: 30, diameter: 20 }], ["boss", { x: 75, y: 30, diameter: 16 }], ["z-surface", { z: 0 }]] as const) {
      const plan = planProbeForFeature(els, { elementId: "part", hint }, ctx)
      if (!plan.ok) throw new Error(plan.reason)
      const routine = planProbeCycle(plan.cycle, ctx)
      if ("refused" in routine) throw new Error(routine.refused)
      const out = runProbeMoves(routine.moves, world, machine, { results: routine.results, units: routine.units })
      expect(out.stopped).toBeUndefined()
      for (const [k, v] of Object.entries(want)) expect(Math.abs(out.results[k]! - v)).toBeLessThan(0.1)
    }
  })

  test("a reference names a candidate; a wrong one lists what there is", () => {
    const bores = probeCandidates(part).filter((c) => c.kind === "bore")
    const named = planProbeForFeature(els, { elementId: "part", ref: bores[0]!.ref }, ctx)
    expect(named.ok && named.chosenBecause).toMatch(/named by the reference/)
    const bad = planProbeForFeature(els, { elementId: "part", ref: "hole:9" }, ctx)
    expect(!bad.ok && /hole:0/.test(bad.reason)).toBe(true)
  })

  test("a stylus that does not fit is refused with the reason", () => {
    const fat = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 19 })
    const plan = planProbeForFeature(els, { elementId: "part", hint: "bore" }, { ...ctx, probe: fat })
    expect(!plan.ok && /fit/.test(plan.reason)).toBe(true)
  })

  test("unknown element, no solid, no feature of the hint", () => {
    expect(planProbeForFeature(els, { elementId: "nope" }, ctx)).toEqual({ ok: false, reason: expect.stringMatching(/no element/) })
    expect(planProbeForFeature([{ id: "t", type: "text" }], { elementId: "t" }, ctx)).toEqual({ ok: false, reason: expect.stringMatching(/exact solid/) })
    const ball = [element(transformBrep(makeSphere(10), at(0, 0, 0)), "ball")]
    expect(planProbeForFeature(ball, { elementId: "ball", hint: "bore" }, ctx)).toEqual({ ok: false, reason: expect.stringMatching(/no bore/) })
    const sphere = planProbeForFeature(ball, { elementId: "ball", hint: "sphere" }, { ...ctx, safeZ: 60 })
    expect(sphere.ok && sphere.cycle.kind === "sphere" && sphere.cycle.diameter === 20).toBe(true)
  })

  test("a rib is named by its two faces and is refused unnamed", () => {
    const rib = [element(transformBrep(makeBox(12, 60, 20), at(40, 0, -20)), "rib")]
    expect("reason" in planProbeForFeature(rib, { elementId: "rib", hint: "web" }, ctx)).toBe(true)
    const sides = probeCandidates(rib[0]!.brep).filter((c) => c.kind === "edge")
    expect(sides.length).toBe(4)
    const west = sides.find((c) => c.cycle.kind === "edge" && c.cycle.normal.x === -1)!, east = sides.find((c) => c.cycle.kind === "edge" && c.cycle.normal.x === 1)!
    const refs = [west.ref, east.ref].map((r) => r.split(":")[1]).join(",")
    const plan = planProbeForFeature(rib, { elementId: "rib", ref: `web:${refs}` }, ctx)
    expect(plan.ok && plan.cycle.kind === "web" && Math.abs(plan.cycle.width - 12) < 1e-3 && Math.abs(plan.cycle.centre.x - 46) < 1e-3 && Math.abs(plan.cycle.centre.y - 30) < 1e-3).toBe(true)
  })

  test("preview moves: rapids, touches and retracts", () => {
    const r = planProbeCycle({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 }, ctx)
    if ("refused" in r) throw new Error(r.refused)
    const kinds = new Set(previewMoves(r.moves).map((m) => m.kind))
    expect(kinds.has("probe")).toBe(true)
    expect(kinds.has("rapid")).toBe(true)
  })
})
