import { describe, expect, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import type { Move } from "../ir.ts"
import { binary, global, num, when } from "../macro.ts"
import type { WorkFrame } from "../setup.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings } from "./device.ts"
import { planProbeCycle } from "./cycles.ts"
import { evaluateInspection, frameToWork, runProbeMoves, tablePose, workToFrame, type SimKinematics, type SimMachine } from "./simulate.ts"
import type { Characteristic, ProbeContext, ProbeCycle, ProbeRoutine } from "./types.ts"
import { boxWorld, planeWorld, sphereWorld } from "./world.ts"

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const DEG = Math.PI / 180
const probe = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const G54 = { kind: "g5x", code: "G54" } as const
const g = (i: number) => ({ scope: "global", index: i }) as const
const ctxOf = (prefix: string, extra: Partial<ProbeContext> = {}): ProbeContext => ({ probe, safeZ: 30, clearance: 3, search: 6, prefix, ...extra })
const plan = (c: ProbeCycle, prefix: string, extra: Partial<ProbeContext> = {}): ProbeRoutine => {
  const r = planProbeCycle(c, ctxOf(prefix, extra))
  if ("refused" in r) throw new Error(r.refused)
  return r
}
const machine = (extra: Partial<SimMachine> = {}): SimMachine => ({ offsets: { entries: { G54: { x: 100, y: 200, z: -300 } } }, active: G54, probe, start: v(0, 0, 30), ...extra })
const touchX = (to: Vec3, extra: Partial<Extract<Move, { _tag: "Probe" }>> = {}): Move => ({ _tag: "Probe", to, direction: v(1, 0, 0), overtravel: 6, feed: 100, kind: "touch", onMiss: "alarm", ...extra })

describe("control flow", () => {
  test("While, If / Else and Goto run on the variables", () => {
    const moves: Move[] = [
      { _tag: "Assign", variable: g(1), value: num(0) },
      { _tag: "Assign", variable: g(2), value: num(0) },
      { _tag: "While", condition: when("lt", global(1), num(5)) },
      { _tag: "Assign", variable: g(2), value: binary("+", global(2), global(1)) },
      { _tag: "Assign", variable: g(1), value: binary("+", global(1), num(1)) },
      { _tag: "EndWhile" },
      { _tag: "If", condition: when("eq", global(2), num(10)) },
      { _tag: "Assign", variable: g(3), value: num(1) },
      { _tag: "Else" },
      { _tag: "Assign", variable: g(3), value: num(2) },
      { _tag: "EndIf" },
      { _tag: "Assign", variable: g(4), value: num(0) },
      { _tag: "Label", name: "top" },
      { _tag: "Assign", variable: g(4), value: binary("+", global(4), num(3)) },
      { _tag: "Goto", label: "top", condition: when("lt", global(4), num(10)) }
    ]
    const out = runProbeMoves(moves, boxWorld(v(0, 0, 0), v(1, 1, 1)), machine())
    expect(out.stopped).toBeUndefined()
    expect(out.variables["global:2"]).toBe(10)
    expect(out.variables["global:3"]).toBe(1)
    expect(out.variables["global:4"]).toBe(12)
  })

  test("a loop that does not end is stopped by the step budget", () => {
    const moves: Move[] = [{ _tag: "While", condition: when("eq", num(1), num(1)) }, { _tag: "Assign", variable: g(1), value: num(1) }, { _tag: "EndWhile" }]
    const out = runProbeMoves(moves, boxWorld(v(0, 0, 0), v(1, 1, 1)), machine(), { maxSteps: 50 })
    expect(out.stopped).toMatch(/more than 50 moves/)
  })

  test("a goto to a label that does not exist and an unbalanced block are refused", () => {
    expect(runProbeMoves([{ _tag: "Goto", label: "nowhere" }], boxWorld(v(0, 0, 0), v(1, 1, 1)), machine()).stopped).toMatch(/no label nowhere/)
    expect(() => runProbeMoves([{ _tag: "Else" }], boxWorld(v(0, 0, 0), v(1, 1, 1)), machine())).toThrow(RangeError)
    expect(() => runProbeMoves([{ _tag: "While", condition: when("lt", num(0), num(1)) }], boxWorld(v(0, 0, 0), v(1, 1, 1)), machine())).toThrow(/never closed/)
  })

  test("variables the program reads before it writes them come from the options; a program stop ends the run, an optional stop does not", () => {
    const moves: Move[] = [
      { _tag: "Assign", variable: g(2), value: binary("*", global(1), num(2)) },
      { _tag: "Stop", optional: true },
      { _tag: "Report", label: "r", values: [{ name: "twice", value: global(2) }] },
      { _tag: "Stop", optional: false },
      { _tag: "Assign", variable: g(3), value: num(99) }
    ]
    const out = runProbeMoves(moves, boxWorld(v(0, 0, 0), v(1, 1, 1)), machine(), { variables: { "global:1": 21 } })
    expect(out.reports).toEqual([{ label: "r", values: { twice: 42 } }])
    expect(out.stopped).toMatch(/program stop/)
    expect(out.variables["global:3"]).toBeUndefined()
  })
})

describe("touches", () => {
  // the block's machine position: its zero at the G54 origin (100, 200, -300)
  const placed = boxWorld(v(0, 0, -20), v(100, 60, 0), { translate: v(100, 200, -300) })

  test("a side touch stops at the face and stores the tip; the miss flag is 0 on a contact and 1 on a miss", () => {
    const hit = runProbeMoves([touchX(v(-2, 50, -5), { store: { x: g(10) }, onMiss: "flag", flag: g(20) })], placed, machine({ start: v(-10, 50, -5) }))
    expect(hit.stopped).toBeUndefined()
    expect(hit.variables["global:10"]).toBeCloseTo(-2, 9)
    expect(hit.variables["global:20"]).toBe(0)
    expect(hit.contacts).toHaveLength(1)
    const miss = runProbeMoves([touchX(v(-20, 50, -5), { direction: v(-1, 0, 0), onMiss: "flag", flag: g(20) })], placed, machine({ start: v(-10, 50, -5) }))
    expect(miss.stopped).toBeUndefined()
    expect(miss.alarms).toHaveLength(0)
    expect(miss.variables["global:20"]).toBe(1)
  })

  test("a touch that starts on the wrong side of its target is refused with the distance", () => {
    const out = runProbeMoves([touchX(v(-30, 50, -5), { overtravel: 0 })], placed, machine({ start: v(-10, 50, -5) }))
    expect(out.stopped).toMatch(/searches -?\d/)
  })

  test("pre-travel and noise move a Z contact along the touch", () => {
    const down: Move = { _tag: "Probe", to: v(10, 10, 0), direction: v(0, 0, -1), overtravel: 6, feed: 100, kind: "touch", onMiss: "alarm", store: { z: g(10) } }
    const clean = runProbeMoves([down], placed, machine({ start: v(10, 10, 10) }))
    expect(clean.variables["global:10"]).toBeCloseTo(0, 9)
    const real = runProbeMoves([down], placed, machine({ start: v(10, 10, 10), truth: { pretravelZ: 0.004, noise: () => 0.001 } }))
    expect(real.variables["global:10"]).toBeCloseTo(-0.005, 9)
  })

  test("a contact carries the NC line of its move", () => {
    const out = runProbeMoves([{ _tag: "Comment", text: "x" } as Move, touchX(v(-2, 50, -5))], placed, machine({ start: v(-10, 50, -5) }), { lineOf: (i) => 100 + i })
    expect(out.contacts[0]?.line).toBe(101)
  })
})

describe("offsets and tools written by the program", () => {
  const placed = boxWorld(v(0, 0, -20), v(100, 60, 0), { translate: v(100, 200, -300) })

  test("an offset update records before and after and changes what the next touch reports", () => {
    const moves: Move[] = [
      { _tag: "OffsetUpdate", target: { kind: "work", ref: G54 }, axis: "X", mode: "add", value: num(0.5) },
      touchX(v(-2, 50, -5), { store: { x: g(10) } })
    ]
    const out = runProbeMoves(moves, placed, machine({ start: v(-10, 50, -5) }))
    expect(out.updates).toEqual([{ ref: G54, axis: "X", before: 100, after: 100.5 }])
    expect(out.offsets["G54"]!.x).toBeCloseTo(100.5, 12)
    // the face is where it was in the machine; the program coordinate of the contact moved by the offset
    expect(out.variables["global:10"]).toBeCloseTo(-2.5, 9)
  })

  test("an angle is written in degrees and held in radians; `set` replaces, `add` accumulates", () => {
    const moves: Move[] = [
      { _tag: "OffsetUpdate", target: { kind: "work", ref: G54 }, axis: "R", mode: "set", value: num(1) },
      { _tag: "OffsetUpdate", target: { kind: "work", ref: G54 }, axis: "R", mode: "add", value: num(0.5) }
    ]
    const out = runProbeMoves(moves, placed, machine())
    expect(out.offsets["G54"]!.rotation!).toBeCloseTo(1.5 * DEG, 12)
    expect(out.updates.map((u) => u.after)).toEqual([1 * DEG, 1.5 * DEG])
  })

  test("a tool length, set then added, is tracked per part and quantity", () => {
    const moves: Move[] = [
      { _tag: "OffsetUpdate", target: { kind: "tool", tool: 3, quantity: "length", part: "wear" }, axis: "Z", mode: "set", value: num(-0.02) },
      { _tag: "OffsetUpdate", target: { kind: "tool", tool: 3, quantity: "length", part: "wear" }, axis: "Z", mode: "add", value: num(0.01) },
      { _tag: "OffsetUpdate", target: { kind: "tool", tool: 3, quantity: "radius", part: "geometry" }, axis: "R", mode: "set", value: num(4.98) }
    ]
    const out = runProbeMoves(moves, placed, machine({ tools: { 3: { length: 100, radius: 5 } } }))
    expect(out.tools).toEqual([
      { tool: 3, quantity: "length", part: "wear", before: 0, after: -0.02 },
      { tool: 3, quantity: "length", part: "wear", before: -0.02, after: -0.02 + 0.01 },
      { tool: 3, quantity: "radius", part: "geometry", before: 5, after: 4.98 }
    ])
  })

  test("an update that computes a number that is not finite stops the run with alarm 999 and writes nothing", () => {
    const out = runProbeMoves([{ _tag: "OffsetUpdate", target: { kind: "work", ref: G54 }, axis: "X", mode: "set", value: binary("/", num(1), num(0)) }], placed, machine())
    expect(out.alarms[0]?.code).toBe(999)
    expect(out.updates).toHaveLength(0)
    expect(out.offsets["G54"]!.x).toBe(100)
  })

  test("a program's own alarm ends the run with its code and text", () => {
    const out = runProbeMoves([{ _tag: "Alarm", code: 777, text: "out of tolerance" }, { _tag: "Assign", variable: g(1), value: num(1) }], placed, machine())
    expect(out.alarms).toEqual([{ code: 777, text: "out of tolerance", moveIndex: 0 }])
    expect(out.stopped).toMatch(/alarm 777/)
    expect(out.variables["global:1"]).toBeUndefined()
  })
})

describe("five-axis: a tilted plane", () => {
  const tilt = 30 * DEG
  const frame: WorkFrame = { origin: v(0, 0, 0), xAxis: v(1, 0, 0), yAxis: v(0, Math.cos(tilt), Math.sin(tilt)), zAxis: v(0, -Math.sin(tilt), Math.cos(tilt)) }

  test("frame and work coordinates are inverse", () => {
    const f: WorkFrame = { ...frame, origin: v(3, -4, 5) }
    for (const p of [v(0, 0, 0), v(10, -3, 7), v(-1.5, 22, -9)]) {
      const w = workToFrame(f, frameToWork(f, p))
      expect(w.x).toBeCloseTo(p.x, 12)
      expect(w.y).toBeCloseTo(p.y, 12)
      expect(w.z).toBeCloseTo(p.z, 12)
    }
    expect(frameToWork(undefined, v(1, 2, 3))).toEqual(v(1, 2, 3))
  })

  test("a face of the tilted plane, shifted along its normal, reads as that shift in the frame", () => {
    const d = 0.3
    const g54 = { x: 100, y: 200, z: -300 }
    const face = planeWorld(v(g54.x, g54.y + frame.zAxis.y * d, g54.z + frame.zAxis.z * d), frame.zAxis)
    for (const at of [{ x: 10, y: 10 }, { x: -25, y: 40 }]) {
      const r = plan({ kind: "z-surface", at, expectedZ: 0 }, "t", { frame })
      const out = runProbeMoves(r.moves, face, machine({ frame }), { results: r.results })
      expect(out.stopped).toBeUndefined()
      expect(out.results["z"]).toBeCloseTo(d, 9)
    }
  })

  test("a program that ignores the frame meets the leaning plane on its protected approach: alarm 992, not a wrong number", () => {
    const g54 = { x: 100, y: 200, z: -300 }
    const face = planeWorld(v(g54.x, g54.y, g54.z), frame.zAxis)
    const r = plan({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 }, "t")
    const out = runProbeMoves(r.moves, face, machine(), { results: r.results })
    expect(out.alarms[0]?.code).toBe(992)
    expect(out.stopped).toMatch(/protected move/)
  })
})

describe("five-axis: a rotary table that does not turn where the control believes", () => {
  const pivot = v(0, 0, 0)
  const truePivot = v(0.03, -0.02, 0)
  const kin: SimKinematics = { layout: "table-AC", pivot, truePivot }

  test("poses are rigid and invertible, and the true pivot is the fixed point of C", () => {
    const pose = { a: 20 * DEG, b: 0, c: 37 * DEG }
    const t = tablePose(kin, pose, true)
    for (const p of [v(10, 5, -3), v(-40, 22, 8)]) {
      const back = t.toTable(t.toMachine(p))
      expect(back.x).toBeCloseTo(p.x, 12)
      expect(back.y).toBeCloseTo(p.y, 12)
      expect(back.z).toBeCloseTo(p.z, 12)
    }
    const fixed = tablePose(kin, { a: 0, b: 0, c: 123 * DEG }, true).toMachine(truePivot)
    expect(fixed.x).toBeCloseTo(truePivot.x, 12)
    expect(fixed.y).toBeCloseTo(truePivot.y, 12)
    // the assumed pivot is not fixed: it moves by the pivot error rotated
    const assumed = tablePose(kin, { a: 0, b: 0, c: 180 * DEG }, true).toMachine(pivot)
    expect(assumed.x).toBeCloseTo(2 * truePivot.x, 12)
    expect(assumed.y).toBeCloseTo(2 * truePivot.y, 12)
  })

  test("a sphere on the table, measured at C0 and C180, has its two centres centred on the true pivot", () => {
    const N = v(50, 0, -20)
    const world = sphereWorld(N, 12.5)
    const a = plan({ kind: "sphere", centre: N, diameter: 25 }, "p")
    // at C180 the table carries the sphere to 2 * truePivot - N: the program looks there
    const rotated = v(-50, 0, -20)
    const b = plan({ kind: "sphere", centre: rotated, diameter: 25 }, "q")
    const moves: Move[] = [...a.moves, { _tag: "Orient", c: 180 }, ...b.moves]
    const results = { ...Object.fromEntries(Object.entries(a.results).map(([k, e]) => [`p_${k}`, e])), ...Object.fromEntries(Object.entries(b.results).map(([k, e]) => [`q_${k}`, e])) }
    const out = runProbeMoves(moves, world, machine({ offsets: { entries: { G54: { x: 0, y: 0, z: 0 } } }, kinematics: kin }), { results })
    expect(out.stopped).toBeUndefined()
    expect(out.results["p_x"]).toBeCloseTo(50, 9)
    expect(out.results["p_y"]).toBeCloseTo(0, 9)
    expect(out.results["q_x"]).toBeCloseTo(2 * truePivot.x - 50, 9)
    expect(out.results["q_y"]).toBeCloseTo(2 * truePivot.y, 9)
    // half way between the two centres is the true pivot (X, Y): what a rotary calibration solves for
    expect((out.results["p_x"]! + out.results["q_x"]!) / 2).toBeCloseTo(truePivot.x, 9)
    expect((out.results["p_y"]! + out.results["q_y"]!) / 2).toBeCloseTo(truePivot.y, 9)
    expect(out.results["p_diameter"]).toBeCloseTo(25, 9)
    expect(out.results["q_diameter"]).toBeCloseTo(25, 9)
  })

  test("an Orient on a machine without kinematics is refused, a move to zero is not", () => {
    const w = boxWorld(v(0, 0, 0), v(1, 1, 1))
    expect(runProbeMoves([{ _tag: "Orient", c: 90 }], w, machine()).stopped).toMatch(/kinematics/)
    expect(runProbeMoves([{ _tag: "Orient", c: 0 }], w, machine()).stopped).toBeUndefined()
  })
})

describe("inspection verdicts", () => {
  const size: Characteristic = { name: "bore", kind: "size", result: "d", nominal: 20, lower: -0.02, upper: 0.03 }

  test("a size inside the band passes at both limits and fails just outside", () => {
    expect(evaluateInspection({ d: 20.03 }, [size])[0]!.pass).toBe(true)
    expect(evaluateInspection({ d: 19.98 }, [size])[0]!.pass).toBe(true)
    const bad = evaluateInspection({ d: 20.031 }, [size])[0]!
    expect(bad.pass).toBe(false)
    expect(bad.deviation).toBeCloseTo(0.031, 12)
    expect(evaluateInspection({ d: 19.979 }, [size])[0]!.pass).toBe(false)
  })

  test("a true position is twice the distance to the nominal point, against the zone diameter", () => {
    const pos: Characteristic = { name: "pos", kind: "true-position", result: "x", result2: "y", nominal: 30, nominal2: 30, lower: 0, upper: 0.1 }
    const ok = evaluateInspection({ x: 30.03, y: 30.04 }, [pos])[0]!
    expect(ok.measured).toBeCloseTo(0.1, 12)
    expect(ok.pass).toBe(true)
    expect(evaluateInspection({ x: 30.04, y: 30.04 }, [pos])[0]!.pass).toBe(false)
  })

  test("a result that was never measured fails instead of passing on NaN, and bad limits throw", () => {
    expect(evaluateInspection({}, [size])[0]!.pass).toBe(false)
    expect(() => evaluateInspection({ d: 20 }, [{ ...size, lower: 1, upper: -1 }])).toThrow(RangeError)
    expect(() => evaluateInspection({ x: 1 }, [{ name: "p", kind: "true-position", result: "x", nominal: 1, lower: 0, upper: 0.1 }])).toThrow(/second result/)
  })
})
