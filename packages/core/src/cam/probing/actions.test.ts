import { describe, expect, test } from "bun:test"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings } from "./device.ts"
import { planProbeCycle } from "./cycles.ts"
import { compileActions, offsetDeltas } from "./actions.ts"
import { evaluateInspection, runProbeMoves, type SimMachine } from "./simulate.ts"
import { plateWorld, boxWorld } from "./world.ts"
import { applyCorrection, UPDATE_MODES, type UpdatePolicy } from "../work-offset.ts"
import type { ProbeAction, ProbeContext, ProbeRoutine } from "./types.ts"

const probe = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const ctx: ProbeContext = { probe, safeZ: 30, clearance: 3, search: 6, prefix: "pr" }
const routineOf = (r: ReturnType<typeof planProbeCycle>): ProbeRoutine => { if ("refused" in r) throw new Error(r.refused); return r }
const base = { entries: { G54: { x: 100, y: 200, z: -300 } } }
const machine: SimMachine = { offsets: base, active: { kind: "g5x", code: "G54" }, probe, start: { x: 0, y: 0, z: 30 } }

describe("actions agree with the host rule", () => {
  test("set-offset on a bore and a surface: IR run == applyCorrection on seeded cases", () => {
    let seed = 7
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const bore = routineOf(planProbeCycle({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 }, ctx))
    for (let i = 0; i < 40; i++) {
      const d = { x: (rnd() - 0.5) * 1.2, y: (rnd() - 0.5) * 1.2, z: 0 }
      const policy: UpdatePolicy = { mode: UPDATE_MODES[Math.floor(rnd() * 4)]!, tolerance: 0.1 + rnd() * 0.5, ...(rnd() < 0.5 ? { limit: 0.6 + rnd() } : {}), ...(rnd() < 0.5 ? { deadband: rnd() * 0.05 } : {}) }
      const action: Extract<ProbeAction, { kind: "set-offset" }> = { kind: "set-offset", ref: { kind: "g5x", code: "G54" }, axes: { X: "x", Y: "y" }, policy }
      const world = plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 }, bores: [{ centre: { x: 30, y: 30 }, radius: 10 }] }, { translate: { x: 100 + d.x, y: 200 + d.y, z: -300 } })
      const out = runProbeMoves(compileActions(bore, [action], ctx), world, machine, { results: bore.results, units: bore.units })
      const host = applyCorrection(base, { ref: action.ref, delta: offsetDeltas(bore, out.results, action) }, policy)
      expect(out.alarms.length > 0).toBe(host.alarm !== undefined)
      if (host.alarm === undefined) {
        expect(out.offsets["G54"]!.x).toBeCloseTo(host.table.entries["G54"]!.x, 9)
        expect(out.offsets["G54"]!.y).toBeCloseTo(host.table.entries["G54"]!.y, 9)
      }
      if (host.applied) expect(out.offsets["G54"]!.x).toBeCloseTo(100 + d.x, 9)
    }
  })

  test("inspection on the control == evaluateInspection; wear comp and report", () => {
    const bore = routineOf(planProbeCycle({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 }, ctx))
    for (const radius of [9.98, 10, 10.03]) {
      const world = plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 }, bores: [{ centre: { x: 30, y: 30 }, radius }] }, { translate: { x: 100, y: 200, z: -300 } })
      const chars = [{ name: "dia", kind: "size" as const, result: "diameter", nominal: 20, lower: -0.02, upper: 0.02 }, { name: "pos", kind: "true-position" as const, result: "x", result2: "y", nominal: 30, nominal2: 30, lower: 0, upper: 0.05 }]
      const moves = compileActions(bore, [
        { kind: "inspect", characteristics: chars, onFail: "flag", flag: "bad" },
        { kind: "wear-comp", tool: 5, quantity: "radius", result: "diameter", nominal: 20, gain: 0.5, deadband: 0.005, limit: 0.5, sense: -1 },
        { kind: "report", results: ["x", "y", "diameter"] }
      ], ctx)
      const out = runProbeMoves(moves, world, machine, { results: bore.results, units: bore.units, characteristics: chars })
      const host = evaluateInspection(out.results, chars)
      expect(out.variables["n:prbad"]).toBe(host.every((v) => v.pass) ? 0 : 1)
      expect(out.reports[0]!.values["diameter"]!).toBeCloseTo(2 * radius, 9)
      const dev = 2 * radius - 20
      if (Math.abs(dev) >= 0.005) expect(out.tools[0]!.after).toBeCloseTo(-0.5 * dev, 9)
      else expect(out.tools.length).toBe(0)
    }
  })

  test("alarm on an inspection failure, rotation via the offset", () => {
    const corner = routineOf(planProbeCycle({ kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5 }, ctx))
    const theta = 0.2 * Math.PI / 180
    const world = boxWorld({ x: 0, y: 0, z: -20 }, { x: 100, y: 60, z: 0 }, { translate: { x: 100, y: 200, z: -300 }, rotate: theta })
    const moves = compileActions(corner, [{ kind: "rotation", result: "rotation", via: "offset-r", ref: { kind: "g5x", code: "G54" }, policy: { mode: "set" } }], ctx)
    const out = runProbeMoves(moves, world, machine, { results: corner.results, units: corner.units })
    expect(out.offsets["G54"]!.rotation!).toBeCloseTo(theta, 12)
    const bad = compileActions(corner, [{ kind: "inspect", characteristics: [{ name: "rot", kind: "angle", result: "rotation", nominal: 0, lower: -0.001, upper: 0.001 }], onFail: "alarm" }], ctx)
    expect(runProbeMoves(bad, world, machine).alarms[0]!.code).toBe(820)
    expect(() => compileActions(corner, [{ kind: "report", results: ["nope"] }], ctx)).toThrow(/no result/)
  })
})
