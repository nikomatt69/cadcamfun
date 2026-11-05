import { describe, expect, test } from "bun:test"
import { expectGolden } from "../../../test/golden.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings } from "../probing/device.ts"
import { planProbeCycle } from "../probing/cycles.ts"
import { compileActions } from "../probing/actions.ts"
import { runProbeMoves, type SimMachine } from "../probing/simulate.ts"
import { planeWorld, plateWorld, type ProbeWorld3 } from "../probing/world.ts"
import type { Characteristic, ProbeAction, ProbeCycle } from "../probing/types.ts"
import { makeProgram, type Move, type Program } from "../ir.ts"
import { formatOffsetRef, type WorkOffsetRef } from "../work-offset.ts"
import { simulateNc } from "../testing/probe-machine.ts"
import { dialectOf, posts } from "./index.ts"
import { emitProgram } from "./emitter.ts"
import { grblTouchOff } from "../probing/actions.ts"
import type { PostId } from "./types.ts"

/**
 * Probe programs written by every post that has probing words, each replayed on the NC text against the same modelled part as the IR
 * it was written from: the contacts, the offset changes, the report and the alarms must agree (spec 73 §5.8, §5.11). The text itself is a golden
 * file per dialect; vendor words are read from the manuals and were not run on a control.
 */
const probe = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const ctx = { probe, safeZ: 30, clearance: 3, search: 6, prefix: "pr" }
const G54: WorkOffsetRef = { kind: "g5x", code: "G54" }

interface Dialect { readonly id: PostId; readonly second: WorkOffsetRef; readonly report: boolean; readonly alarmCode: boolean }
const DIALECTS: ReadonlyArray<Dialect> = [
  { id: "fanuc", second: { kind: "extended", p: 3 }, report: true, alarmCode: false },
  { id: "haas", second: { kind: "extended", p: 3 }, report: true, alarmCode: true },
  { id: "mazak", second: { kind: "extended", p: 3 }, report: true, alarmCode: false },
  { id: "mitsubishi", second: { kind: "extended", p: 3 }, report: true, alarmCode: false },
  { id: "brother", second: { kind: "extended", p: 3 }, report: true, alarmCode: false },
  { id: "generic", second: { kind: "extended", p: 3 }, report: true, alarmCode: false },
  { id: "okuma", second: { kind: "extended", p: 3 }, report: false, alarmCode: true },
  { id: "linuxcnc", second: { kind: "linuxcnc", p: 8 }, report: true, alarmCode: true },
  { id: "siemens", second: { kind: "frame", n: 5 }, report: true, alarmCode: true }
]

const routineOf = (cycle: ProbeCycle) => {
  const r = planProbeCycle(cycle, ctx)
  if ("refused" in r) throw new Error(r.refused)
  return r
}
const BASE = { x: 100, y: 200, z: -300 }
const machineFor = (active: WorkOffsetRef, second: WorkOffsetRef): SimMachine => ({
  offsets: { entries: { G54: BASE, [formatOffsetRef(second)]: { x: 150, y: 250, z: -310 } } }, active, probe, start: { x: 0, y: 0, z: 30 }
})
const programOf = (name: string, moves: ReadonlyArray<Move>, ref: WorkOffsetRef, start = { x: 0, y: 0, z: 30 }): Program => ({
  ...makeProgram(name, [{ id: "p", name: "probe", toolId: "probe", spindleRpm: 0, coolant: "off", moves: [{ _tag: "Rapid", to: start }, ...moves] }]),
  ...(ref.kind === "g5x" ? {} : { workOffsetRef: ref })
})
const near = (a: number, b: number, eps = 3e-3): void => { expect(Math.abs(a - b)).toBeLessThanOrEqual(eps) }

const boreWorld = (dx: number, dy: number, radius = 10): ProbeWorld3 =>
  plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 }, bores: [{ centre: { x: 30, y: 30 }, radius }] }, { translate: { x: BASE.x + dx, y: BASE.y + dy, z: BASE.z } })
const cornerWorld = (dx: number, dy: number): ProbeWorld3 =>
  plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 } }, { translate: { x: 150 + dx, y: 250 + dy, z: -310 } })

const chars: ReadonlyArray<Characteristic> = [{ name: "diameter", kind: "size", result: "diameter", nominal: 20, lower: -0.05, upper: 0.05 }]

const agree = (id: PostId, dialect: Dialect, moves: ReadonlyArray<Move>, ref: WorkOffsetRef, world: ProbeWorld3, golden?: string) => {
  const machine = machineFor(ref, dialect.second)
  const ir = runProbeMoves(moves, world, machine)
  const text = posts[id].emit(programOf(`probe ${id}`, moves, ref), { header: false })
  if (golden !== undefined) expectGolden(`probing/${id}-${golden}.nc`, text)
  expect(text).not.toMatch(/\bM0?[34]\b/)
  const nc = simulateNc(text, { world, machine, codes: dialectOf(id)!.probing! })
  expect(nc.errors).toEqual([])
  expect(nc.contacts.length).toBe(ir.contacts.length)
  ir.contacts.forEach((c, i) => { near(nc.contacts[i]!.tip.x, c.tip.x); near(nc.contacts[i]!.tip.y, c.tip.y); near(nc.contacts[i]!.tip.z, c.tip.z) })
  const key = formatOffsetRef(ref)
  for (const axis of ["x", "y", "z"] as const) near(nc.offsets[key]![axis], ir.offsets[key]![axis])
  expect(nc.updates.map((u) => `${formatOffsetRef(u.ref)}:${u.axis}`)).toEqual(ir.updates.map((u) => `${formatOffsetRef(u.ref)}:${u.axis}`))
  nc.updates.forEach((u, i) => near(u.after, ir.updates[i]!.after))
  // OSP's alarm message holds 16 characters.
  const message = (t: string): string => (id === "okuma" ? t.toUpperCase().slice(0, 16) : t.toUpperCase())
  expect(nc.alarms.map((a) => message(a.text))).toEqual(ir.alarms.map((a) => message(a.text)))
  expect(Boolean(nc.stopped)).toBe(Boolean(ir.stopped))
  return { ir, nc, text }
}

describe("probe goldens replay to the IR's results", () => {
  for (const dialect of DIALECTS) {
    const { id } = dialect
    test(`${id}: bore, G54 update, inspection (and a report)`, () => {
      const r = routineOf({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 })
      const actions: ProbeAction[] = [
        { kind: "set-offset", ref: G54, axes: { X: "x", Y: "y" }, policy: { mode: "set" } },
        { kind: "inspect", characteristics: chars, onFail: "alarm" },
        ...(dialect.report ? [{ kind: "report" as const, results: ["x", "y", "diameter"] }] : [])
      ]
      const moves = compileActions(r, actions, ctx)
      const { ir, nc, text } = agree(id, dialect, moves, G54, boreWorld(0.7, -0.4), "bore")
      expect(ir.stopped).toBeUndefined()
      near(nc.offsets["G54"]!.x, BASE.x + 0.7, 2e-3)
      near(nc.offsets["G54"]!.y, BASE.y - 0.4, 2e-3)
      expect(nc.updates.length).toBe(2)
      expect(text).toContain(id === "okuma" ? "G15 H1" : "G54")
      if (dialect.report) {
        expect(nc.reports.length).toBe(ir.reports.length)
        const want = ir.reports[0]!.values
        const got = Object.fromEntries(Object.entries(nc.reports[0]!.values).map(([k, v]) => [k.toLowerCase(), v]))
        for (const k of ["x", "y", "diameter"]) near(got[k]!, want[k]!, 2e-3)
      }
    })

    test(`${id}: an out-of-tolerance bore stops with the inspection alarm, in the IR and in the text`, () => {
      const r = routineOf({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 })
      const moves = compileActions(r, [{ kind: "inspect", characteristics: chars, onFail: "alarm" }], ctx)
      const { ir, nc } = agree(id, dialect, moves, G54, boreWorld(0, 0, 10.2))
      expect(ir.alarms.length).toBe(1)
      expect(nc.alarms.length).toBe(1)
      if (dialect.alarmCode) expect(nc.alarms[0]!.code).toBe(ir.alarms[0]!.code)
    })

    test(`${id}: an outside corner into ${formatOffsetRef(dialect.second)}`, () => {
      const r = routineOf({ kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5, touchesPerEdge: 1 })
      const moves = compileActions(r, [{ kind: "set-offset", ref: dialect.second, axes: { X: "x", Y: "y" }, policy: { mode: "set" } }], ctx)
      const { nc, text } = agree(id, dialect, moves, dialect.second, cornerWorld(0.3, 0.2), "corner")
      near(nc.offsets[formatOffsetRef(dialect.second)]!.x, 150.3, 2e-3)
      near(nc.offsets[formatOffsetRef(dialect.second)]!.y, 250.2, 2e-3)
      const select = id === "siemens" ? "G505" : id === "linuxcnc" ? "G59.2" : id === "haas" ? "G154 P3" : id === "okuma" ? "G15 H9" : "G54.1 P3"
      expect(text.split("\n").some((l) => l.includes(select))).toBe(true)
    })

    if (id !== "okuma") test(`${id}: a tool length on the setter goes into the tool table`, () => {
      const setter = { kind: "contact" as const, position: { x: 400, y: 150, z: -150 }, triggerZ: -290, discDiameter: 12, maxToolDiameter: 40, feeds: { fast: 800, touch: 60 }, brokenTolerance: 0.1 }
      const sctx = { ...ctx, safeZ: 200, setter, workOrigin: BASE }
      const r0 = planProbeCycle({ kind: "tool-length", tool: 5, nominalLength: 80 }, sctx)
      if ("refused" in r0) throw new Error(r0.refused)
      const moves = compileActions(r0, [{ kind: "tool-offset", tool: 5, quantity: "length", result: "length", part: "geometry" }], sctx)
      const world = planeWorld({ x: 0, y: 0, z: setter.triggerZ + 7.25 }, { x: 0, y: 0, z: 1 })
      const machine: SimMachine = { ...machineFor(G54, dialect.second), start: { x: 300, y: -50, z: 200 } }
      const ir = runProbeMoves(moves, world, machine)
      const text = posts[id].emit(programOf(`probe ${id}`, moves, G54, { x: 300, y: -50, z: 200 }), { header: false })
      expectGolden(`probing/${id}-tool-length.nc`, text)
      const nc = simulateNc(text, { world, machine, codes: dialectOf(id)!.probing! })
      expect(nc.errors).toEqual([])
      expect(ir.tools.length).toBe(1)
      expect(nc.tools.length).toBe(1)
      near(nc.tools[0]!.after, 87.25, 2e-3)
      near(ir.tools[0]!.after, 87.25, 1e-9)
      expect(nc.tools[0]!.tool).toBe(5)
      expect(nc.tools[0]!.part).toBe("geometry")
    })

    test(`${id}: a touch that finds nothing is an alarm`, () => {
      const r = routineOf({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 })
      // The part sits 30 mm lower than the program believes: the search ends in the air.
      const world = plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 } }, { translate: { x: BASE.x, y: BASE.y, z: BASE.z - 30 } })
      const { ir, nc } = agree(id, dialect, compileActions(r, [{ kind: "set-offset", ref: G54, axes: { Z: "z" }, policy: { mode: "set" } }], ctx), G54, world)
      expect(ir.alarms.length).toBe(1)
      expect(nc.alarms.length).toBe(1)
    })
  }

  test("okuma refuses what it has no words for: a tool-table write, a report", () => {
    const setter = { kind: "contact" as const, position: { x: 400, y: 150, z: -150 }, triggerZ: -290, discDiameter: 12, maxToolDiameter: 40, feeds: { fast: 800, touch: 60 }, brokenTolerance: 0.1 }
    const r0 = planProbeCycle({ kind: "tool-length", tool: 5, nominalLength: 80 }, { ...ctx, safeZ: 200, setter, workOrigin: BASE })
    if ("refused" in r0) throw new Error(r0.refused)
    const tool = compileActions(r0, [{ kind: "tool-offset", tool: 5, quantity: "length", result: "length", part: "geometry" }], ctx)
    expect(() => posts["okuma"].emit(programOf("p", tool, G54), { header: false })).toThrow(/tool length/)
    const r = routineOf({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 })
    expect(() => posts["okuma"].emit(programOf("p", compileActions(r, [{ kind: "report", results: ["z"] }], ctx), G54), { header: false })).toThrow(/report/)
  })

  test("heidenhain: a bore with its inspection replays, one axis per touch", () => {
    const r = routineOf({ kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 })
    const moves = compileActions(r, [{ kind: "inspect", characteristics: chars, onFail: "alarm" }], ctx)
    const machine = machineFor(G54, { kind: "g5x", code: "G55" })
    const world = boreWorld(0.7, -0.4)
    const ir = runProbeMoves(moves, world, machine)
    const text = posts["heidenhain"].emit(programOf("probe heidenhain", moves, G54), { header: false })
    expectGolden("probing/heidenhain-bore.nc", text)
    const nc = simulateNc(text, { world, machine, codes: dialectOf("heidenhain")!.probing! })
    expect(nc.errors).toEqual([])
    expect(nc.contacts.length).toBe(ir.contacts.length)
    ir.contacts.forEach((c, i) => { near(nc.contacts[i]!.tip.x, c.tip.x); near(nc.contacts[i]!.tip.y, c.tip.y) })
    expect(nc.alarms.length).toBe(0)
  })

  test("grbl: a surface touched off with G10 L20 replays to the IR's offset, what needs variables is refused", () => {
    const moves = grblTouchOff({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 }, G54, ctx)
    if ("refused" in moves) throw new Error(moves.refused)
    const machine = machineFor(G54, { kind: "g5x", code: "G55" })
    const world = boreWorld(0, 0)
    const shifted = plateWorld({ min: { x: 0, y: 0, z: -20 }, max: { x: 100, y: 60, z: 0 } }, { translate: { x: BASE.x, y: BASE.y, z: BASE.z + 0.25 } })
    const ir = runProbeMoves(moves, shifted, machine)
    near(ir.offsets["G54"]!.z, BASE.z + 0.25, 1e-9)
    const text = posts["grbl"].emit(programOf("probe grbl", moves, G54), { header: false })
    expectGolden("probing/grbl-z-surface.nc", text)
    expect(text).toContain("G10 L20 P1 Z0.000")
    const nc = simulateNc(text, { world: shifted, machine, codes: dialectOf("grbl")!.probing! })
    expect(nc.errors).toEqual([])
    near(nc.updates.find((u) => u.axis === "Z")!.after, BASE.z + 0.25)
    void world
    expect(() => posts["grbl"].emit(programOf("p", routineOf({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 }).moves, G54), { header: false })).toThrow(/no variables/)
    const edge = grblTouchOff({ kind: "edge", at: { x: 0, y: 20, z: -5 }, normal: { x: -1, y: 0 } }, G54, ctx)
    if ("refused" in edge) throw new Error(edge.refused)
    expect(grblTouchOff({ kind: "bore", centre: { x: 0, y: 0 }, diameter: 20, depth: 3 }, G54, ctx)).toHaveProperty("refused")
  })

  test("a program of the kernel's own probing words on a post without them is refused", () => {
    const r = routineOf({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 })
    const generic = { ...dialectOf("fanuc")!, probing: undefined }
    expect(() => emitProgram(programOf("p", r.moves, G54), { header: false }, generic)).toThrow(/writes no probing/)
  })

  test("heidenhain writes a touch and refuses a step-level preset write with the reason", () => {
    const r = routineOf({ kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 })
    const text = posts["heidenhain"].emit(programOf("p", r.moves, G54), { header: false })
    expect(text).toContain("TCH PROBE 0.0 REF. PLANE Q94 Z-")
    const withOffset = compileActions(r, [{ kind: "set-offset", ref: G54, axes: { Z: "z" }, policy: { mode: "set" } }], ctx)
    expect(() => posts["heidenhain"].emit(programOf("p", withOffset, G54), { header: false })).toThrow(/preset/)
  })
})
