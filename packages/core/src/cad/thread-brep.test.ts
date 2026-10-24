import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, makeBox, makeCylinder, massProperties, readStepBreps, validateBrep, writeStepBreps } from "./brep/index.ts"
import { frame } from "./brep/math.ts"
import { withBudget } from "./brep/budget.ts"
import { exactThreadPlan, exactThreadVolume, makeThreadBrep, makeThreadGrooveBrep, EXACT_THREAD_MAX_TURNS, EXACT_THREAD_QUICK_TURNS } from "./thread-brep.ts"
import { rebuildExact } from "./history-brep.ts"
import { model } from "./script.ts"
import type { ThreadSpec } from "./thread.ts"

setDefaultTimeout(120_000)

const M6: ThreadSpec = { diameter: 6, pitch: 1, length: 10, internal: false }
const UNC: ThreadSpec = { diameter: 12.7, pitch: 25.4 / 13, length: 20, internal: false }
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)
const volume = (b: Parameters<typeof massProperties>[0]) => massProperties(b).volume

describe("the exact modelled thread (spec 40 U1)", () => {
  for (const [name, spec] of [["M6 x 1", M6], ["1/2-13 UNC", UNC], ["M6 x 1 internal (the tool of a tapped hole)", { ...M6, internal: true }]] as const) {
    test(`${name}: a valid solid whose volume is the core plus the ridge (Pappus) within 0.2 %`, () => {
      const started = Date.now()
      const b = makeThreadBrep(spec)
      expect(validateBrep(b).issues.map((i) => i.message)).toEqual([])
      expect(rel(volume(b), exactThreadVolume(spec) as number)).toBeLessThan(0.002)
      expect(Date.now() - started).toBeLessThan(15_000)
    })
  }

  test("the thread stays inside its length and its major diameter", () => {
    const b = makeThreadBrep({ ...M6, cx: 5, cy: -3, z0: 2 })
    let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
    for (const v of b.vertices) {
      lo = { x: Math.min(lo.x, v.point.x), y: Math.min(lo.y, v.point.y), z: Math.min(lo.z, v.point.z) }
      hi = { x: Math.max(hi.x, v.point.x), y: Math.max(hi.y, v.point.y), z: Math.max(hi.z, v.point.z) }
    }
    expect(lo.z).toBeGreaterThanOrEqual(2 - 1e-9)
    expect(hi.z).toBeLessThanOrEqual(12 + 1e-9)
    // The widened facets reach a little past the major radius (under 0.5 %), never a tenth of a millimetre.
    expect(hi.x - 5).toBeLessThan(3 * 1.005)
    expect(hi.x - 5).toBeGreaterThan(3 * 0.99)
  })

  test("a left-hand thread has the same volume and the opposite hand", () => {
    const right = makeThreadBrep(M6), left = makeThreadBrep({ ...M6, left: true })
    expect(rel(volume(left), volume(right))).toBeLessThan(1e-3)
    // Seen from +Z the crest of a right-hand thread climbs as the angle grows; of a left-hand one, as it shrinks.
    const climb = (b: typeof right): number => {
      const rim = b.vertices.map((v) => v.point).filter((p) => Math.hypot(p.x, p.y) > 3.0 && p.z < 3)
      rim.sort((p, q) => p.z - q.z)
      const a = rim.slice(0, 40)
      // Angle against height over a short stretch: the sign of d(angle)/d(z).
      const pts = a.map((p) => ({ angle: Math.atan2(p.y, p.x), z: p.z })).filter((p) => Math.abs(p.angle) < Math.PI * 0.9)
      let num = 0
      for (let i = 1; i < pts.length; i++) num += (pts[i]!.angle - pts[i - 1]!.angle) * (pts[i]!.z - pts[i - 1]!.z)
      return Math.sign(num)
    }
    expect(climb(right)).not.toBe(climb(left))
  })

  test("it survives a STEP write and read within 0.1 % of its volume", () => {
    const b = makeThreadBrep(M6)
    const back = readStepBreps(writeStepBreps([{ name: "thread", brep: b }], { author: "test" }))
    expect(back.warnings).toEqual([])
    expect(rel(volume(back.parts[0]!.brep), volume(b))).toBeLessThan(1e-3)
    expect(validateBrep(back.parts[0]!.brep).valid).toBe(true)
  })

  test("a tapped hole: the plate minus the internal tool has the volume of the plate minus the tool", () => {
    const plate = makeBox(40, 30, 12)
    const tool = makeThreadBrep({ ...M6, internal: true, cx: 20, cy: 15, z0: 2 })
    const tapped = booleanBrep(plate, tool, "subtract").brep
    expect(validateBrep(tapped).valid).toBe(true)
    expect(rel(volume(tapped), 40 * 30 * 12 - (exactThreadVolume({ ...M6, internal: true }) as number))).toBeLessThan(0.002)
  })

  test("a thread cut into a shaft of exactly the major diameter: the thread in the zone, the shaft kept elsewhere, nothing added", () => {
    const shaft = makeCylinder(3, 14, frame({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }))
    const spec = { ...M6, length: 8, z0: 2 }
    const cut = booleanBrep(shaft, makeThreadGrooveBrep(spec), "subtract").brep
    expect(validateBrep(cut).issues.map((i) => i.message)).toEqual([])
    // 6 mm of plain shaft plus the thread (its crest brought in by 0.03 mm: 0.5 % of the radius, so a little under the nominal).
    const expected = Math.PI * 9 * 6 + (withBudget(120_000, () => exactThreadVolume(spec)) as number)
    expect(rel(volume(cut), expected)).toBeLessThan(0.006)
    expect(volume(cut)).toBeLessThan(expected)
    // A shaft narrower than the thread's core is not thickened by it.
    const thin = makeCylinder(1.5, 14, frame({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }))
    expect(volume(booleanBrep(thin, makeThreadGrooveBrep(spec), "subtract").brep)).toBeCloseTo(Math.PI * 1.5 ** 2 * 14, 4)
  })

  test("a thread along X is the same solid carried to the YZ frame", () => {
    const place = (p: { x: number; y: number; z: number }) => ({ x: p.z, y: p.x, z: p.y })
    const b = makeThreadBrep(M6, place)
    expect(rel(volume(b), volume(makeThreadBrep(M6)))).toBeLessThan(1e-3)
    let lo = Infinity, hi = -Infinity
    for (const v of b.vertices) { lo = Math.min(lo, v.point.x); hi = Math.max(hi, v.point.x) }
    expect(hi - lo).toBeGreaterThan(9)
    expect(hi - lo).toBeLessThanOrEqual(10 + 1e-9)
  })

  test("what it will not build is refused with its reason", () => {
    expect(exactThreadPlan({ ...M6, length: 1 })).toMatch(/too short/)
    // A long thread is a matter of time: a caller that limits it has the thread refused at once, with the time it would take.
    expect(withBudget(2000, () => exactThreadPlan({ ...M6, length: 40 }))).toMatch(/needs at least 11\.7 s to build exactly, more than the \d\.\d s/)
    // With no budget at all the caller is interactive: only the threads that build in a few seconds.
    expect(exactThreadPlan({ ...M6, length: 40 })).toMatch(new RegExp(`at most ${EXACT_THREAD_QUICK_TURNS} turns`))
    expect(typeof withBudget(60_000, () => exactThreadPlan({ ...M6, length: 40 }))).toBe("object")
    expect(EXACT_THREAD_MAX_TURNS).toBeGreaterThanOrEqual(58)
    expect(exactThreadPlan({ ...M6, pitch: 5 })).toMatch(/too coarse/)
    expect(() => withBudget(2000, () => makeThreadBrep({ ...M6, length: 40 }))).toThrow(RangeError)
    expect(() => makeThreadGrooveBrep({ ...M6, internal: true })).toThrow(/external/)
  })

  test("the history replays a thread as an exact body, and refuses a long one with the reason", () => {
    const m = model()
    m.extrude(m.sketch("XY").circle([0, 0], 6), { depth: 14 })
    m.thread({ kind: "external", diameter: 6, pitch: 1, length: 8, at: [0, 0], offset: 0 })
    const ok = rebuildExact(m.build())
    expect(ok.bodies[0]!.reason).toBeUndefined()
    expect(validateBrep(ok.bodies[0]!.brep!).valid).toBe(true)
    const long = model()
    long.extrude(long.sketch("XY").circle([0, 0], 6), { depth: 60 })
    long.thread({ kind: "external", diameter: 6, pitch: 1, length: 50, at: [0, 0], offset: 0 })
    // An external thread made a new body (a rod): under a time budget that body says why it has no exact model at once, the shaft is untouched.
    expect(rebuildExact(long.build(), undefined, { budgetMs: 2000 }).bodies.map((b) => b.reason).find((r) => r !== undefined)).toMatch(/needs at least/)
  })

  test("a thread of more than 24 turns is built when the caller gives the exact model a minute: valid, the volume within 0.2 % of the Pappus volume", () => {
    const spec = { ...M6, length: 34 }
    const rod = withBudget(120_000, () => makeThreadBrep(spec))
    const plan = withBudget(120_000, () => exactThreadPlan(spec))
    if (typeof plan === "string") throw new Error(plan)
    expect(plan.turns).toBeGreaterThan(30)
    expect(validateBrep(rod).valid).toBe(true)
    expect(Math.abs(massProperties(rod).volume / (withBudget(120_000, () => exactThreadVolume(spec)) as number) - 1)).toBeLessThan(0.002)
  }, 120_000)
})
