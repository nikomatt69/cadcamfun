import { describe, expect, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings, type ProbeDevice } from "./device.ts"
import { planProbeCycle } from "./cycles.ts"
import { runProbeMoves, type SimMachine } from "./simulate.ts"
import { boxWorld, cylinderWorld, meshWorld, planeWorld, plateWorld, pocketWorld as pocketBlock, sphereWorld, unionWorld, type Placement, type ProbeWorld3 } from "./world.ts"
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
    const pocketWorld = pocketBlock({ x: 0, y: 0, z: -20 }, { x: 100, y: 60, z: 0 }, { min: { x: 30, y: 15 }, max: { x: 70, y: 45 }, depth: 10 })
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
    close(run({ kind: "stylus-calibrate", artefact: { kind: "height", at: { x: 10, y: 10 }, z: 0 } }, block(), probe, { truth: { pretravelZ: 0.004 } }).out.results, { zTrigger: 0.004 })
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

describe("validation the wire schema leaves to the core", () => {
  test("a normal or direction that is not a unit vector is refused", () => {
    const r = planProbeCycle({ kind: "edge", at: { x: 0, y: 0, z: -3 }, normal: { x: 0.7, y: 0.7 } }, ctx())
    expect("refused" in r && /unit vector/.test(r.refused)).toBe(true)
    const a = planProbeCycle({ kind: "edge-angle", start: { x: 0, y: 0 }, along: { x: 0, y: 0.5 }, pitch: 10, normal: { x: -1, y: 0 }, depth: 3 }, ctx())
    expect("refused" in a && /along/.test(a.refused)).toBe(true)
  })
})

describe("characteristic validation", () => {
  test("limits the wrong way round are refused by evaluateInspection and compileActions", async () => {
    const { evaluateInspection } = await import("./simulate.ts")
    const { compileActions } = await import("./actions.ts")
    const bad = { name: "d", kind: "size" as const, result: "diameter", nominal: 20, lower: 0.1, upper: -0.1 }
    expect(() => evaluateInspection({ diameter: 20 }, [bad])).toThrow(/exceeds/)
    const r = plan({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 })
    expect(() => compileActions(r, [{ kind: "inspect", characteristics: [bad], onFail: "alarm" }], ctx())).toThrow(/exceeds/)
  })
})

describe("the tool setter cycles", () => {
  const ORIGIN = { x: 100, y: 200, z: -300 }
  const setter = { kind: "contact" as const, position: { x: 400, y: 150, z: -150 }, triggerZ: -290, discDiameter: 12, maxToolDiameter: 40, feeds: { fast: 800, touch: 60 }, brokenTolerance: 0.1 }
  const sctx = (extra: Partial<ProbeContext> = {}): ProbeContext => ({ ...ctx(), safeZ: 200, setter, workOrigin: ORIGIN, ...extra })
  const splan = (c: ProbeCycle, extra: Partial<ProbeContext> = {}): ProbeRoutine => {
    const r = planProbeCycle(c, sctx(extra))
    if ("refused" in r) throw new Error(r.refused)
    return r
  }
  const mach = (p: ProbeDevice = probe): SimMachine => ({ offsets: { entries: { G54: ORIGIN } }, active: { kind: "g5x", code: "G54" }, probe: p, start: { x: 300 - ORIGIN.x, y: 150 - ORIGIN.y, z: 200 } })
  // The controlled point's machine height at which the believed tip meets the setter: the trigger height plus how much longer the tool is than believed.
  const plane = (believed: number, real: number) => planeWorld({ x: 0, y: 0, z: setter.triggerZ + (real - believed) }, { x: 0, y: 0, z: 1 })

  test("tool length is the believed length plus the height deviation, whatever the believed length", () => {
    for (const [believed, real] of [[0, 87.25], [80, 87.25], [90, 87.25]] as const) {
      const r = splan({ kind: "tool-length", tool: 5, nominalLength: believed })
      const out = runProbeMoves(r.moves, plane(believed, real), mach(), { results: r.results, units: r.units })
      expect(out.stopped).toBeUndefined()
      close(out.results, { length: real }, 1e-9)
    }
  })

  test("a tool beyond the search is refused by the touch (a miss is an alarm)", () => {
    const r = splan({ kind: "tool-length", tool: 5, nominalLength: 80 })
    const out = runProbeMoves(r.moves, plane(80, 80 - 40), mach(), {})
    expect(out.alarms[0]?.code).toBe(991)
  })

  test("a broken tool alarms past the tolerance, a worn one inside it passes", () => {
    const r = splan({ kind: "broken-tool", tool: 5, nominalLength: 80 })
    expect(runProbeMoves(r.moves, plane(80, 79.95), mach(), { results: r.results, units: r.units }).alarms.length).toBe(0)
    const broken = runProbeMoves(r.moves, plane(80, 78.2), mach(), { results: r.results, units: r.units })
    expect(broken.alarms[0]?.code).toBe(840)
    expect(planProbeCycle({ kind: "broken-tool", tool: 5 }, sctx())).toEqual({ refused: expect.stringMatching(/nominal length/) })
  })

  test("tool radius from two touches on the disc", () => {
    for (const real of [4.98, 5, 5.07]) {
      const tool: ProbeDevice = { ...probe, stylus: { ...probe.stylus, ballDiameter: 2 * real }, doubleTouch: false }
      const r = splan({ kind: "tool-radius", tool: 5, nominalRadius: 5 }, { safeZ: 30 })
      // A tall disc stands at the setter's centre (machine coordinates).
      const world = cylinderWorld({ centre: { x: setter.position.x, y: setter.position.y }, radius: setter.discDiameter / 2, z0: -400, z1: setter.triggerZ + 15, inside: false })
      const out = runProbeMoves(r.moves, world, mach(tool), { results: r.results, units: r.units })
      expect(out.stopped).toBeUndefined()
      close(out.results, { radius: real, x: setter.position.x - ORIGIN.x }, 1e-9)
    }
  })

  test("refusals: no setter, no work origin, a tool too big, a disc missing", () => {
    expect("refused" in planProbeCycle({ kind: "tool-length", tool: 1 }, ctx())).toBe(true)
    expect("refused" in planProbeCycle({ kind: "tool-length", tool: 1 }, { ...ctx(), setter })).toBe(true)
    expect("refused" in planProbeCycle({ kind: "tool-radius", tool: 1, nominalRadius: 25 }, sctx())).toBe(true)
    expect("refused" in planProbeCycle({ kind: "tool-radius", tool: 1, nominalRadius: 5 }, sctx({ setter: { ...setter, discDiameter: undefined } }))).toBe(true)
  })
})

describe("a control that reports contacts in the work frame under a tilted plane", () => {
  const t = Math.PI / 6
  const frame = { origin: { x: 0, y: 0, z: 0 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: Math.cos(t), z: Math.sin(t) }, zAxis: { x: 0, y: -Math.sin(t), z: Math.cos(t) } }
  const cycle: ProbeCycle = { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 }
  // the bore in the plane's coordinates, carried into the work offset's by the plane: a wall through the frame
  const inFrame = plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 }, bores: [{ centre: { x: 30.2, y: 29.9 }, radius: 10 }] })
  const world: ProbeWorld3 = {
    touch: (from, to, stylus) => {
      const toF = (p: Vec3): Vec3 => { const d = p; return { x: d.x * frame.xAxis.x + d.y * frame.xAxis.y + d.z * frame.xAxis.z, y: d.x * frame.yAxis.x + d.y * frame.yAxis.y + d.z * frame.yAxis.z, z: d.x * frame.zAxis.x + d.y * frame.zAxis.y + d.z * frame.zAxis.z } }
      const hit = inFrame.touch(toF(from), toF(to), { ...stylus, axis: { x: 0, y: 0, z: 1 } })
      if (hit === undefined) return undefined
      const L = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
      const k = hit.travelled / L
      return { tip: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k }, normal: hit.normal, travelled: hit.travelled }
    }
  }
  test("the results are the plane's either way", () => {
    for (const skipFrame of ["program", "work"] as const) {
      const r = planProbeCycle(cycle, { ...ctx(), frame, skipFrame })
      if ("refused" in r) throw new Error(r.refused)
      const out = runProbeMoves(r.moves, world, machine(probe, { frame, skipFrame, start: { x: 0, y: 0, z: 30 } }), { results: r.results, units: r.units })
      expect(out.stopped).toBeUndefined()
      close(out.results, { x: 30.2, y: 29.9, diameter: 20 })
    }
  })
})

describe("spheres", () => {
  const S = { x: 20, y: -30, z: 5 }
  test("a nine-touch sphere: the control's five, the host's nine, exact on an exact ball and better than five under noise", async () => {
    const { withHostFit } = await import("./calibration.ts")
    const c: ProbeCycle = { kind: "sphere", centre: S, diameter: 25, touches: 9 }
    const r = plan(c)
    expect(r.contacts.length).toBe(9)
    expect(r.hostFit).toBe("sphere")
    const world = sphereWorld({ x: 20.3, y: -30.2, z: 5.1 }, 12.5)
    const out = runProbeMoves(r.moves, world, machine(), { results: r.results, units: r.units })
    expect(out.stopped).toBeUndefined()
    close(out.results, { x: 20.3, y: -30.2, z: 5.1, diameter: 25 })
    const fit = withHostFit(r, out.results, probe)
    close(fit, { x: 20.3, y: -30.2, z: 5.1, diameter: 25, sphericity: 0 }, 1e-7)
    let s = 3
    const rnd = (): number => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5 }
    let five = 0, nine = 0
    for (let i = 0; i < 40; i++) {
      const noisy = runProbeMoves(r.moves, world, machine(probe, { truth: { noise: () => 0.004 * rnd() } }), { results: r.results, units: r.units })
      const f = withHostFit(r, noisy.results, probe)
      five += (noisy.results["z"]! - 5.1) ** 2
      nine += (f["z"]! - 5.1) ** 2
    }
    expect(nine).toBeLessThan(five)
  })

  test("stylus calibration on a sphere reads the radius by direction", () => {
    const r = plan({ kind: "stylus-calibrate", artefact: { kind: "sphere", centre: S, diameter: 25 }, directions: 8 })
    const truth = { radius: (d: Vec3) => 1.98 + 0.01 * Math.abs(d.y) }
    const out = runProbeMoves(r.moves, sphereWorld({ x: 20.4, y: -29.7, z: 5.2 }, 12.5), machine(probe, { truth }), { results: r.results, units: r.units })
    expect(out.stopped).toBeUndefined()
    close(out.results, { x: 20.4, y: -29.7, z: 5.2 })
    for (let k = 0; k < 8; k++) expect(out.results[`r${k}`]!).toBeCloseTo(1.98 + 0.01 * Math.abs(Math.sin((k * Math.PI) / 4)), 7)
  })
})
