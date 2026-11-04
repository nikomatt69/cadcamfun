import { describe, expect, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings, type ProbeDevice } from "./device.ts"
import { planProbeCycle } from "./cycles.ts"
import { runProbeMoves, type SimMachine } from "./simulate.ts"
import { boxWorld, cylinderWorld, meshWorld, plateWorld, sphereWorld, surfaceWorld, unionWorld, type Placement, type ProbeWorld3 } from "./world.ts"
import { faceSurface, unionSurface, boxSurface } from "./sphere-cast.ts"
import type { ProbeContext, ProbeCycle, ProbeRoutine } from "./types.ts"

const probe: ProbeDevice = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const single: ProbeDevice = { ...probe, doubleTouch: false }
const ctx = (p: ProbeDevice = probe): ProbeContext => ({ probe: p, safeZ: 30, clearance: 3, search: 6, prefix: "pr" })
const machine = (p: ProbeDevice = probe, extra: Partial<SimMachine> = {}): SimMachine => ({ offsets: { entries: {} }, active: { kind: "g5x", code: "G54" }, probe: p, start: { x: 0, y: 0, z: 30 }, ...extra })

const plan = (c: ProbeCycle, p = probe): ProbeRoutine => {
  const r = planProbeCycle(c, ctx(p))
  if ("refused" in r) throw new Error(r.refused)
  return r
}
const run = (c: ProbeCycle, world: ProbeWorld3, p = probe, extra: Partial<SimMachine> = {}) => {
  const r = plan(c, p)
  const out = runProbeMoves(r.moves, world, machine(p, extra), { results: r.results, units: r.units })
  if (out.stopped !== undefined) throw new Error(out.stopped)
  return { routine: r, out }
}
const close = (got: Readonly<Record<string, number>>, want: Readonly<Record<string, number>>, eps = 1e-9): void => {
  for (const [k, v] of Object.entries(want)) {
    if (!(Math.abs((got[k] ?? NaN) - v) <= eps)) throw new Error(`${k}: ${got[k]} != ${v}`)
  }
}

/** A block 0..100 x 0..60 x -20..0 with a bore and a boss and a slot cut in it, all analytic. */
const block = (placement?: Placement): ProbeWorld3 => plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 }, bores: [{ centre: { x: 30, y: 30 }, radius: 10 }], bosses: [{ centre: { x: 75, y: 30 }, radius: 8, height: 10 }] }, placement)

describe("cycles reproduce nominal on their analytic world", () => {
  for (const [label, p] of [["double touch", probe], ["single touch", single]] as const) {
    test(`z, edge, bore, boss (${label})`, () => {
      close(run({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 }, block(), p).out.results, { z: 0 })
      close(run({ kind: "edge", at: { x: 0, y: 20, z: -5 }, normal: { x: -1, y: 0 } }, block(), p).out.results, { x: 0, s: 0 })
      close(run({ kind: "edge", at: { x: 50, y: 60, z: -5 }, normal: { x: 0, y: 1 } }, block(), p).out.results, { y: 60, s: 60 })
      close(run({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 }, block(), p).out.results, { x: 30, y: 30, diameter: 20, diameterX: 20, diameterY: 20 })
      close(run({ kind: "boss", centre: { x: 75, y: 30 }, diameter: 16, depth: 5, top: 10 }, block(), p).out.results, { x: 75, y: 30, diameter: 16 })
    })
  }

  test("bore and boss from angles, three and five", () => {
    close(run({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, angles: [0.3, 2.4, 4.1] }, block()).out.results, { x: 30, y: 30, diameter: 20 })
    close(run({ kind: "boss", centre: { x: 75, y: 30 }, diameter: 16, depth: 5, top: 10, angles: [0, 1.2, 2.5, 3.7, 5] }, block()).out.results, { x: 75, y: 30, diameter: 16 })
  })

  test("corner outside and inside, web, pocket, rectangle, edge angle, plane, sphere", () => {
    close(run({ kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5 }, block()).out.results, { x: 0, y: 0, rotation: 0, rotationY: 0 })
    close(run({ kind: "corner", corner: { x: 100, y: 60 }, inside: false, xSense: -1, ySense: -1, depth: 5, touchesPerEdge: 1 }, block()).out.results, { x: 100, y: 60 })
    // a pocket 40 x 30 at (50, 30), 10 deep in a block: four walls
    const pocketWorld = surfaceWorld(unionSurface([faceSurface({ x: 0, y: 0 }, { x: 100, y: 60 }, 0), boxSurface({ x: 30, y: 15, z: -10 }, { x: 70, y: 45, z: 20 })]))
    close(run({ kind: "corner", corner: { x: 30, y: 15 }, inside: true, xSense: -1, ySense: -1, depth: 5 }, pocketWorld).out.results, { x: 30, y: 15, rotation: 0 })
    close(run({ kind: "rectangle", inside: true, centre: { x: 50, y: 30 }, size: { x: 40, y: 30 }, depth: 5 }, pocketWorld).out.results, { x: 50, y: 30, sizeX: 40, sizeY: 30 })
    close(run({ kind: "pocket", centre: { x: 50, y: 30 }, width: 30, angle: Math.PI / 2, depth: 5 }, pocketWorld).out.results, { x: 50, y: 30, width: 30 })
    const web = boxWorld({ x: 40, y: 0, z: -20 }, { x: 52, y: 60, z: 0 })
    close(run({ kind: "web", centre: { x: 46, y: 30 }, width: 12, angle: 0, depth: 5 }, web).out.results, { x: 46, y: 30, width: 12 })
    close(run({ kind: "rectangle", inside: false, centre: { x: 46, y: 30 }, size: { x: 12, y: 60 }, depth: 5 }, web).out.results, { x: 46, y: 30, sizeX: 12, sizeY: 60 })
    close(run({ kind: "edge-angle", start: { x: 0, y: 10 }, along: { x: 0, y: 1 }, pitch: 30, normal: { x: -1, y: 0 }, depth: 5 }, block()).out.results, { angle: 0, s: 0 })
    close(run({ kind: "plane", points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 50 }, { x: 55, y: 50 }], expectedZ: 0 }, block()).out.results, { z: 0, tiltA: 0, tiltB: 0, flatness: 0 })
    close(run({ kind: "sphere", centre: { x: 20, y: -30, z: 5 }, diameter: 25 }, sphereWorld({ x: 20, y: -30, z: 5 }, 12.5)).out.results, { x: 20, y: -30, z: 5, diameter: 25 })
  })

  test("stylus calibration on a ring and a height", () => {
    const ring = cylinderWorld({ centre: { x: 0, y: 0 }, radius: 25, z0: -20, z1: 0, inside: true })
    const lobed: ProbeDevice = probe
    const truth = { radius: (d: Vec3) => 1.98 + 0.01 * Math.abs(d.x) }
    const r = plan({ kind: "stylus-calibrate", artefact: { kind: "ring", centre: { x: 0.2, y: -0.1 }, diameter: 50, depth: 5 }, directions: 8 }, lobed)
    const out = runProbeMoves(r.moves, ring, machine(lobed, { truth }), { results: r.results, units: r.units })
    expect(out.stopped).toBeUndefined()
    for (let k = 0; k < 8; k++) expect(out.results[`r${k}`]!).toBeCloseTo(1.98 + 0.01 * Math.abs(Math.cos((k * Math.PI) / 4)), 9)
    close(out.results, { x: 0, y: 0 })
    close(run({ kind: "stylus-calibrate", artefact: { kind: "height", at: { x: 10, y: 10 }, z: 0 } }, block(), probe, { truth: { pretravelZ: 0.004 } }).out.results, { zTrigger: -0.004 })
  })
})

describe("a part that is not where it was drawn", () => {
  test("shifted block: every result moves by the shift", () => {
    const d = { x: 0.7, y: -0.4, z: 0.15 }
    const w = block({ translate: d })
    close(run({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 }, w).out.results, { z: d.z })
    close(run({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 }, w).out.results, { x: 30 + d.x, y: 30 + d.y, diameter: 20 })
    close(run({ kind: "boss", centre: { x: 75, y: 30 }, diameter: 16, depth: 5, top: 10, angles: [0, 2, 4] }, w).out.results, { x: 75 + d.x, y: 30 + d.y, diameter: 16 })
  })

  test("rotated block: the corner and its rotation are exact", () => {
    const theta = 0.3 * Math.PI / 180
    const w = block({ translate: { x: 0.5, y: -0.3, z: 0 }, rotate: theta })
    const out = run({ kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5 }, w).out
    close(out.results, { x: 0.5, y: -0.3 })
    expect(out.results["rotation"]!).toBeCloseTo(theta, 12)
    expect(out.results["rotationY"]!).toBeCloseTo(theta, 12)
    const angle = run({ kind: "edge-angle", start: { x: 0, y: 10 }, along: { x: 0, y: 1 }, pitch: 30, normal: { x: -1, y: 0 }, depth: 5 }, w).out
    expect(angle.results["angle"]!).toBeCloseTo(theta, 12)
  })

  test("a lobed probe is compensated by its calibration", () => {
    const lobes = [{ angle: 0, radius: 1.97 }, { angle: Math.PI / 2, radius: 1.985 }, { angle: Math.PI, radius: 1.99 }, { angle: 1.5 * Math.PI, radius: 1.975 }]
    const lobed: ProbeDevice = { ...probe, calibration: { ballDiameter: 4, effectiveRadius: 1.98, directional: lobes } }
    // the truth is the calibration: the touches trigger at the radius of their direction
    const out = run({ kind: "rectangle", inside: false, centre: { x: 46, y: 30 }, size: { x: 12, y: 60 }, depth: 5 }, boxWorld({ x: 40, y: 0, z: -20 }, { x: 52, y: 60, z: 0 }), lobed).out
    close(out.results, { x: 46, y: 30, sizeX: 12, sizeY: 60 })
    // without the calibration the same probe reads the size wrong by the lobing
    const naive = run({ kind: "rectangle", inside: false, centre: { x: 46, y: 30 }, size: { x: 12, y: 60 }, depth: 5 }, boxWorld({ x: 40, y: 0, z: -20 }, { x: 52, y: 60, z: 0 }), probe, { truth: { radius: (d) => (d.x < -0.5 ? 1.99 : d.x > 0.5 ? 1.97 : d.y > 0.5 ? 1.985 : 1.975) } }).out
    expect(Math.abs(naive.results["sizeX"]! - 12)).toBeGreaterThan(0.01)
  })

  test("a mesh box measures as the box world", () => {
    const box = (min: Vec3, max: Vec3) => {
      const v = [[min.x, min.y, min.z], [max.x, min.y, min.z], [max.x, max.y, min.z], [min.x, max.y, min.z], [min.x, min.y, max.z], [max.x, min.y, max.z], [max.x, max.y, max.z], [min.x, max.y, max.z]].flat()
      const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
      return { positions: v, indices: f }
    }
    const placement = { translate: { x: 0.2, y: 0.1, z: -0.05 }, rotate: 0.002 }
    const c: ProbeCycle = { kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5 }
    const a = run(c, meshWorld([box({ x: 0, y: 0, z: -20 }, { x: 100, y: 60, z: 0 })], placement)).out.results
    const b = run(c, boxWorld({ x: 0, y: 0, z: -20 }, { x: 100, y: 60, z: 0 }, placement)).out.results
    close(a, b, 1e-9)
  })
})

describe("refusals and alarms", () => {
  test("stylus does not fit, too few points, collinear plane", () => {
    expect(planProbeCycle({ kind: "bore", centre: { x: 0, y: 0 }, diameter: 5, depth: 2 }, ctx())).toHaveProperty("refused")
    expect(planProbeCycle({ kind: "plane", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], expectedZ: 0 }, ctx())).toHaveProperty("refused")
    expect(planProbeCycle({ kind: "plane", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], expectedZ: 0 }, ctx())).toHaveProperty("refused")
    expect(planProbeCycle({ kind: "tool-length", tool: 3 }, ctx())).toHaveProperty("refused")
    expect(planProbeCycle({ kind: "z-surface", at: { x: 0, y: 0 }, expectedZ: 0 }, { ...ctx(), prefix: "1x" })).toHaveProperty("refused")
  })

  test("a miss is an alarm, a contact on a protected move is an alarm", () => {
    const r = plan({ kind: "z-surface", at: { x: 200, y: 10 }, expectedZ: 0 })
    const out = runProbeMoves(r.moves, block(), machine(), { results: r.results })
    expect(out.alarms[0]?.code).toBe(991)
    expect(out.stopped).toMatch(/did not touch/)
    // a bore planned at the wrong place: the probe descends onto the plate top
    const wrong = plan({ kind: "bore", centre: { x: 50, y: 30 }, diameter: 20, depth: 5 })
    const crash = runProbeMoves(wrong.moves, block(), machine())
    expect(crash.alarms[0]?.code).toBe(992)
  })

  test("union of worlds takes the first contact", () => {
    const w = unionWorld([boxWorld({ x: 0, y: 0, z: -10 }, { x: 10, y: 10, z: 0 }), boxWorld({ x: 0, y: 0, z: -10 }, { x: 10, y: 10, z: 2 })])
    close(run({ kind: "z-surface", at: { x: 5, y: 5 }, expectedZ: 2 }, w).out.results, { z: 2 })
  })
})
