/**
 * Enterprise gates of the exact kernel, measured on reference parts:
 *
 *   validity     every exact body of every reference history passes the validator with zero issues; a body without an exact
 *                model carries the reason (never a silent fallback to the mesh)
 *   STEP         export then re-import: volume and area within STEP_REL, bounding box within STEP_BOX_MM
 *   determinism  the same history rebuilt twice writes byte-identical STEP (fixed timestamp): same hash, same topology
 *   budget       the flange recipe rebuilds exactly within BUDGET_MS on the development machine
 *
 * Measured 2026-10-14 (load average ~20): STEP round trip |dV|/V <= 4.5e-15, |dA|/A <= 5.1e-16, bounding box identical;
 * flange exact rebuild 13.1 / 14.7 / 16.4 s warm, 17.5-51.6 s cold depending on the machine's other load.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { liquidMixerHistory } from "../../drawing/liquid-mixer.ts"
import { brepBox, rebuildExact, type ExactRebuild } from "../history-brep.ts"
import type { History } from "../history.ts"
import { buildRecipe } from "../recipes.ts"
import { model } from "../script.ts"
import { massProperties } from "./mass.ts"
import { readStepBreps, writeStepBreps } from "./step.ts"
import { compactBrep, type Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(60_000)

/** Relative tolerance on volume and area through a STEP round trip (measured worst 4.5e-15). */
const STEP_REL = 1e-12
/** Absolute tolerance on the bounding box through a STEP round trip, mm (measured 0). */
const STEP_BOX_MM = 1e-9
/**
 * Exact rebuild budget of the flange recipe, ms. Measured at load 19-22 with other builds running: 13.1-21.6 s warm or
 * cold, 51.6 s at the worst; the budget is that worst run plus ~75 % (the Boolean costs ~2 s per bolt hole: see the change log).
 */
const BUDGET_MS = 90_000
const TIMESTAMP = "2026-01-01T00:00:00"

const holedPlate = (): History => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 40, 25), { depth: 6, id: "plate" })
  const h = m.hole({ plane: "XY", offset: 6, at: [6, 6], diameter: 4, depth: 6, id: "h1" })
  m.pattern({ feature: h, kind: "linear", count: 3, step: [10, 0, 0], id: "row" })
  m.mirror({ feature: h, plane: "ZX", offset: 12.5, id: "m" })
  return m.build()
}
const revolved = (): History => {
  const m = model()
  m.revolve(m.sketch("XY").rectangle([5, 0], 3, 10), { axis: "y", id: "ring" })
  return m.build()
}
const rounded = (): History => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 40, 25), { depth: 6, corner: { style: "fillet", size: 5 }, id: "plate" })
  return m.build()
}

const REFERENCE: ReadonlyArray<readonly [string, () => History]> = [
  ["mounting_plate", () => buildRecipe("mounting_plate", {}).history],
  ["flange", () => buildRecipe("flange", {}).history],
  ["l_bracket", () => buildRecipe("l_bracket", {}).history],
  ["stepped_shaft", () => buildRecipe("stepped_shaft", { sections: [{ diameter: 20, length: 30 }, { diameter: 14, length: 40 }] }).history],
  ["holed_plate", holedPlate],
  ["revolved_ring", revolved],
  ["rounded_plate", rounded]
]

/** One exact rebuild per reference part for the whole file (the flange alone takes seconds). */
const cache = new Map<string, ExactRebuild>()
const exactOf = (name: string): ExactRebuild => {
  let r = cache.get(name)
  if (r === undefined) { r = rebuildExact(REFERENCE.find(([n]) => n === name)![1]()); cache.set(name, r) }
  return r
}

let mixerRebuild: ExactRebuild | undefined
const mixer = (): ExactRebuild => (mixerRebuild ??= rebuildExact(liquidMixerHistory()))

const roundTrip =(name: string, b: Brep): void => {
  const step = writeStepBreps([{ name, brep: b }], { timestamp: TIMESTAMP })
  const back = readStepBreps(step)
  expect(back.warnings).toEqual([])
  expect(back.parts.length).toBe(1)
  const c = back.parts[0]!.brep
  expect(validateBrep(c).issues.map((i) => i.message)).toEqual([])
  const m0 = massProperties(b), m1 = massProperties(c)
  expect(Math.abs(m1.volume - m0.volume) / m0.volume).toBeLessThanOrEqual(STEP_REL)
  expect(Math.abs(m1.area - m0.area) / m0.area).toBeLessThanOrEqual(STEP_REL)
  const b0 = brepBox(b), b1 = brepBox(c)
  for (const k of ["x", "y", "z"] as const) {
    expect(Math.abs(b1.lo[k] - b0.lo[k])).toBeLessThanOrEqual(STEP_BOX_MM)
    expect(Math.abs(b1.hi[k] - b0.hi[k])).toBeLessThanOrEqual(STEP_BOX_MM)
  }
  // The reader keeps what the faces use; a source body may still carry unused vertices (a revolve's axis points).
  const used = compactBrep(b)
  expect(c.faces.length).toBe(used.faces.length)
  expect(c.edges.length).toBe(used.edges.length)
  expect(c.vertices.length).toBe(used.vertices.length)
}

describe("gate: budget", () => {
  test(`the flange recipe rebuilds exactly within ${BUDGET_MS} ms`, () => {
    // One timed run (cold: the first exact rebuild of the file), reused by the other gates.
    const h = buildRecipe("flange", {}).history
    const t0 = performance.now()
    const r = rebuildExact(h)
    const ms = performance.now() - t0
    cache.set("flange", r)
    console.log(`[gate budget] flange exact rebuild: ${ms.toFixed(0)} ms (budget ${BUDGET_MS} ms)`)
    expect(ms).toBeLessThan(BUDGET_MS)
    expect(r.bodies.every((b) => b.brep !== undefined)).toBe(true)
  })
})

describe("gate: validity", () => {
  for (const [name] of REFERENCE) {
    test(`${name}: every body is exact and passes the validator with zero issues`, () => {
      const r = exactOf(name)
      expect(r.result.issues.filter((i) => i.severity === "error")).toEqual([])
      expect(r.bodies.length).toBeGreaterThan(0)
      for (const b of r.bodies) {
        expect(b.reason).toBeUndefined()
        const rep = validateBrep(b.brep!)
        expect(rep.issues.map((i) => `${i.kind}: ${i.message}`)).toEqual([])
        expect(rep.valid).toBe(true)
        expect(rep.manifoldSolid).toBe(true)
      }
    })
  }

  test("liquid mixer: a body without an exact model says why, the mesh body stays", () => {
    const r = mixer()
    expect(r.result.bodies.length).toBe(r.bodies.length)
    for (const b of r.bodies) {
      if (b.brep !== undefined) expect(validateBrep(b.brep).issues).toEqual([])
      else expect((b.reason ?? "").length).toBeGreaterThan(0)
    }
    expect(r.result.bodies.every((b) => b.mesh.indices.length > 0)).toBe(true)
  })
})

describe(`gate: STEP round trip (volume and area within ${STEP_REL} relative, box within ${STEP_BOX_MM} mm)`, () => {
  for (const [name] of REFERENCE) {
    test(name, () => {
      for (const b of exactOf(name).bodies) roundTrip(`${name}-${b.id}`, b.brep!)
    })
  }

  // Open: the mixer's figure-eight boss (two overlapping cylinders with coplanar caps) fails the exact union ("edge used 3
  // times"), so the mixer has no exact body yet. When the Boolean is fixed this test fails: turn it into a plain `test`.
  test.failing("liquid mixer: exact body and STEP round trip", () => {
    const r = mixer()
    expect(r.bodies.every((b) => b.brep !== undefined)).toBe(true)
    for (const b of r.bodies) roundTrip(`mixer-${b.id}`, b.brep!)
  })
})

describe("gate: determinism", () => {
  for (const name of ["l_bracket", "stepped_shaft", "holed_plate", "revolved_ring", "rounded_plate"]) {
    test(`${name}: the same history gives the same STEP hash twice`, () => {
      // Two independent rebuilds of two independently built histories.
      const run = () => {
        const h = REFERENCE.find(([n]) => n === name)![1]()
        const bodies = rebuildExact(h).bodies
        expect(bodies.every((q) => q.brep !== undefined)).toBe(true)
        const step = writeStepBreps(bodies.map((q) => ({ name: `${name}-${q.id}`, brep: q.brep! })), { timestamp: TIMESTAMP })
        return { step, hash: Bun.hash(step), shape: bodies.map((q) => [q.brep!.faces.length, q.brep!.edges.length, q.brep!.vertices.length, massProperties(q.brep!).volume]) }
      }
      const a = run(), b = run()
      expect(a.hash).toBe(b.hash)
      expect(a.step).toBe(b.step)
      expect(a.shape).toEqual(b.shape)
    })
  }
})
