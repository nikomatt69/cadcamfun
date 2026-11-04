import { describe, expect, test } from "bun:test"
import { expectGolden } from "../../../test/golden.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings, type MacroStyle } from "../probing/device.ts"
import { planProbeCycle } from "../probing/cycles.ts"
import { compileActions } from "../probing/actions.ts"
import { nativeCycle, withoutNativeMarks } from "../probing/native.ts"
import { runProbeMoves, type SimMachine } from "../probing/simulate.ts"
import { plateWorld } from "../probing/world.ts"
import type { ProbeAction, ProbeCycle } from "../probing/types.ts"
import { makeProgram, type Move } from "../ir.ts"
import { posts } from "./index.ts"
import type { PostId } from "./types.ts"

/** The control's own probing cycles (spec 73 §5.9): vendor words read from the manuals, not run on a control. */
const probe = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const ctx = { probe, safeZ: 30, clearance: 3, search: 6, prefix: "pr" }
const nctx = { probe, safeZ: 30, clearance: 3 }
const G54 = { kind: "g5x" as const, code: "G54" as const }
const setXY: ProbeAction = { kind: "set-offset", ref: G54, axes: { X: "x", Y: "y" }, policy: { mode: "set" } }
const setZ: ProbeAction = { kind: "set-offset", ref: G54, axes: { Z: "z" }, policy: { mode: "set" } }
const bore: ProbeCycle = { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 }
const boss: ProbeCycle = { kind: "boss", centre: { x: 75, y: 30 }, diameter: 16, depth: 5, top: 10 }
const top: ProbeCycle = { kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 }

const inlineOf = (cycle: ProbeCycle, actions: ReadonlyArray<ProbeAction>) => {
  const r = planProbeCycle(cycle, ctx)
  if ("refused" in r) throw new Error(r.refused)
  return { routine: r, moves: compileActions(r, actions, ctx) }
}
const marked = (cycle: ProbeCycle, actions: ReadonlyArray<ProbeAction>, style: MacroStyle): ReadonlyArray<Move> => {
  const n = nativeCycle(cycle, actions, style, inlineOf(cycle, actions).moves, nctx)
  if ("refused" in n) throw new Error(n.refused)
  return n.moves
}
const programOf = (moves: ReadonlyArray<Move>) => makeProgram("native", [{ id: "p", name: "probe", toolId: "probe", spindleRpm: 0, coolant: "off", moves: [{ _tag: "Rapid", to: { x: 0, y: 0, z: 30 } }, ...moves] }])
const write = (id: PostId, moves: ReadonlyArray<Move>, nativeCycles: boolean): string => posts[id].emit(programOf(moves), { header: false, nativeCycles })

describe("native probe cycles", () => {
  const cases: ReadonlyArray<[string, PostId, MacroStyle, ProbeCycle, ReadonlyArray<ProbeAction>, string]> = [
    ["heidenhain-412", "heidenhain", "heidenhain-ts", bore, [setXY], "TCH PROBE 412 DATUM INSIDE CIRCLE"],
    ["heidenhain-413", "heidenhain", "heidenhain-ts", boss, [setXY], "TCH PROBE 413 DATUM OUTSIDE CIRCLE"],
    ["heidenhain-417", "heidenhain", "heidenhain-ts", top, [setZ], "TCH PROBE 417 DATUM IN TS AXIS"],
    ["heidenhain-419", "heidenhain", "heidenhain-ts", { kind: "edge", at: { x: 0, y: 20, z: -5 }, normal: { x: -1, y: 0 } }, [{ kind: "set-offset", ref: G54, axes: { X: "x" }, policy: { mode: "set" } }], "TCH PROBE 419 DATUM IN ONE AXIS"],
    ["renishaw-9814", "fanuc", "renishaw", bore, [setXY], "G65 P9814 D20.000 S1."],
    ["renishaw-9814-boss", "haas", "renishaw", boss, [setXY], "G65 P9814 D16.000 S1. Z3.000"],
    ["renishaw-9811", "fanuc", "renishaw", top, [setZ], "G65 P9811 S1. Z0.000"],
    ["siemens-977", "siemens", "siemens-cycles", bore, [setXY], "CYCLE977"],
    ["siemens-978", "siemens", "siemens-cycles", top, [setZ], "CYCLE978"]
  ]
  for (const [name, id, style, cycle, actions, word] of cases) {
    test(`${name}: the post writes the cycle, without the option the inline moves`, () => {
      const moves = marked(cycle, actions, style)
      const native = write(id, moves, true)
      expectGolden(`probing/native-${name}.nc`, native)
      expect(native).toContain(word)
      expect(native).not.toMatch(/\bM0?[34]\b/)
      // The measuring touches are the cycle's: only the armed approach is left.
      expect(native).not.toMatch(/G91|G38|TCH PROBE 0\.0/)
      // Klartext has no step-level preset write: without the cycle the program is refused, never written without its datum.
      if (id === "heidenhain") expect(() => write(id, moves, false)).toThrow(/preset|stores/)
      else expect(write(id, moves, false)).not.toContain(word)
    })
  }

  test("a marked program runs exactly as the inline one", () => {
    for (const style of ["heidenhain-ts", "renishaw", "siemens-cycles"] as const) {
      const world = plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 }, bores: [{ centre: { x: 30, y: 30 }, radius: 10 }] }, { translate: { x: 100.3, y: 199.8, z: -300 } })
      const machine: SimMachine = { offsets: { entries: { G54: { x: 100, y: 200, z: -300 } } }, active: G54, probe, start: { x: 0, y: 0, z: 30 } }
      const { moves, routine } = inlineOf(bore, [setXY])
      const a = runProbeMoves(moves, world, machine, { results: routine.results, units: routine.units })
      const b = runProbeMoves(marked(bore, [setXY], style), world, machine, { results: routine.results, units: routine.units })
      expect(b.stopped).toBeUndefined()
      expect(b.results["x"]!).toBeCloseTo(a.results["x"]!, 9)
      expect(b.offsets["G54"]!.x).toBeCloseTo(100.3, 9)
      expect(b.contacts.map((c) => c.tip)).toEqual(a.contacts.map((c) => c.tip))
    }
  })

  test("another family's marks leave the moves to its post", () => {
    const moves = marked(bore, [setXY], "heidenhain-ts")
    expect(write("fanuc", moves, true)).toBe(write("fanuc", withoutNativeMarks(moves), true))
  })

  test("what a cycle cannot do is refused, the operation runs inline", () => {
    const inline = inlineOf(bore, [setXY]).moves
    const refused = (c: ProbeCycle, a: ReadonlyArray<ProbeAction>, s: MacroStyle, re: RegExp, extra = {}): void => {
      const n = nativeCycle(c, a, s, inline, { ...nctx, ...extra })
      expect("refused" in n && n.refused).toMatch(re)
    }
    refused(bore, [setXY], "inline", /cycle package/)
    refused(bore, [setXY], "renishaw", /tilted/, { tilted: true })
    refused(bore, [{ kind: "inspect", characteristics: [], onFail: "alarm" }], "renishaw", /inspect/)
    refused(bore, [{ ...setXY, policy: { mode: "update-within-tolerance", tolerance: 0.1 } } as ProbeAction], "heidenhain-ts", /policy/)
    refused(bore, [{ kind: "set-offset", ref: G54, axes: { X: "x" }, policy: { mode: "set" } }], "heidenhain-ts", /sets X, Y/)
    refused({ ...bore, angles: [0, 2, 4] } as ProbeCycle, [], "heidenhain-ts", /angles/)
    refused({ kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5 }, [], "renishaw", /no Renishaw/)
    refused(bore, [{ ...setXY, ref: { kind: "g5x", code: "G58" } } as ProbeAction], "siemens-cycles", /programmable/)
    refused({ kind: "pocket", centre: { x: 0, y: 0 }, width: 20, angle: 0.5, depth: 3 }, [], "siemens-cycles", /axis/)
  })
})

describe("formula depth on the control", () => {
  const depthOf = (line: string): number => { let d = 0, m = 0; for (const c of line.replace(/\([^)]*\)/g, "")) { if (c === "[") m = Math.max(m, ++d); else if (c === "]") d-- } return m }
  test("no Fanuc or LinuxCNC line nests brackets deeper than five, on the deepest cycles", () => {
    const cycles: ReadonlyArray<ProbeCycle> = [
      { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, angles: [0, 1, 2, 3, 4, 5] },
      { kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5 },
      { kind: "plane", points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 50 }, { x: 55, y: 50 }], expectedZ: 0 },
      { kind: "sphere", centre: { x: 20, y: 30, z: 5 }, diameter: 25 }
    ]
    for (const id of ["fanuc", "linuxcnc"] as const) for (const c of cycles) {
      const lines = write(id, inlineOf(c, []).moves, false).split("\n")
      expect(Math.max(...lines.map(depthOf))).toBeLessThanOrEqual(5)
    }
  })
})
