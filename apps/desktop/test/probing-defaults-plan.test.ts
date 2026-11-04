/** What the editor creates by default must be plannable by the core (spec 73 §4): a drift guard between the field lists and the cycle union. */
import { expect, test } from "bun:test"
import { DEFAULT_PROBE_SETTINGS, PROBE_CYCLE_KINDS, probing, type ProbeContext, type ToolSetter } from "../src/features/cam/lib/probing/contract.ts"
import { cycleOfSpec, defaultSpecOf } from "../src/features/cam/lib/probing/cycle-fields.ts"

const device = probing.deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const ctx: ProbeContext = { probe: device, safeZ: 30, clearance: 3, search: 6, prefix: "ui" }
/** Kinds that need more than a probe: a tool setter on the machine, or the rotary routine instead of one cycle. */
const NEEDS_MORE = new Set(["tool-length", "tool-radius", "broken-tool", "rotary-axis"])

test("every default cycle the editor creates is planned by the core, with a nominal for every result", () => {
  for (const kind of PROBE_CYCLE_KINDS) {
    const decoded = cycleOfSpec(defaultSpecOf(kind, { x: 40, y: 25 }))
    if (!decoded.ok) throw new Error(`${kind}: ${decoded.issues.join(", ")}`)
    const routine = probing.planProbeCycle(decoded.cycle, ctx)
    if ("refused" in routine) {
      expect(NEEDS_MORE.has(kind), `${kind} refused: ${routine.refused}`).toBe(true)
      expect(routine.refused.length).toBeGreaterThan(10)
      continue
    }
    expect(routine.moves.length, kind).toBeGreaterThan(0)
    expect(routine.contacts.length, kind).toBeGreaterThan(0)
    for (const c of routine.contacts) for (const n of [c.expected.x, c.expected.y, c.expected.z, c.direction.x, c.direction.y, c.direction.z]) expect(Number.isFinite(n), `${kind} ${c.name}`).toBe(true)
    expect(Object.keys(routine.nominal).sort(), kind).toEqual(Object.keys(routine.results).sort())
  }
})

test("the cycles that need a setter are planned once the machine has one", () => {
  const setter: ToolSetter = { kind: "contact", position: { x: -300, y: 200, z: -340 }, triggerZ: -350, discDiameter: 12, maxToolDiameter: 80, feeds: { fast: 800, touch: 50 }, brokenTolerance: 0.5 }
  // the setter sits in machine coordinates: the planner needs where the work zero is in the machine to reach it
  const workOrigin = { x: 100, y: 200, z: -300 }
  for (const kind of ["tool-length", "tool-radius", "broken-tool"] as const) {
    const decoded = cycleOfSpec(defaultSpecOf(kind))
    if (!decoded.ok) throw new Error(`${kind}: ${decoded.issues.join(", ")}`)
    const routine = probing.planProbeCycle(decoded.cycle, { ...ctx, setter, workOrigin })
    expect("refused" in routine ? routine.refused : "", kind).toBe("")
  }
})
