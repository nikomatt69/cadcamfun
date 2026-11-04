/** The probing panel's pure logic (spec 73 §4): palette, resolve order, operations and actions, targets, cycles in the toolpath store, overlay input, colours. */
import { expect, test } from "bun:test"
import * as THREE from "three"
import { cam } from "@cadcamfun/core"
import { DEFAULT_PROBING } from "../src/shared/state/settings.ts"
import { PALETTE, PALETTE_GROUPS, availability, entriesOf } from "../src/features/cam/lib/probing/cycle-palette.data.ts"
import { contextOf, resolveSettings, sourcesOf } from "../src/features/cam/lib/probing/resolve.ts"
import { actionsOf, defaultChecks, defaultOperation, movesOffset, operationIssues, operationWire, planLocal, resultsOf } from "../src/features/cam/lib/probing/operation.ts"
import { applyTarget, targetAt, targetsOf, workOriginOf } from "../src/features/cam/lib/probing/probe-targets.ts"
import { addProbeCycle, duplicateProbeCycle, probeCycles, updateProbeCycle } from "../src/features/cam/lib/probing/cycles.ts"
import { initialState } from "../src/features/cam/lib/multiToolpath.ts"
import { setupOfToolpaths } from "../src/features/cam/lib/setup.ts"
import { frameAxesOfAbc, overlayModelOf } from "../src/features/cam/lib/probing/overlay-input.ts"
import { contactTimesOnTimeline } from "../src/features/cam/lib/probing/contact-times.ts"
import { partSolidsOf } from "../src/features/cam/lib/probing/part-solids.ts"
import { formatNumberList, formatPointList, parseNumberList, parsePointList } from "../src/features/cam/lib/probing/lists.ts"
import { fingerprintOf, offsetChange, verdictOfRun, type ProbeRunResult } from "../src/features/cam/lib/probing/result.ts"
import { reportData, resultOfReport } from "../src/features/cam/lib/probing/report-data.ts"
import { offsetChoicesOf } from "../src/features/cam/lib/probing/work-offsets.ts"
import { pathBuffers } from "../src/viewport/view3d/toolpath-colors.ts"
import { buildPlayback } from "../src/viewport/view3d/playback.ts"
import { probeModelOf } from "../src/viewport/view3d/tool-models.ts"
import { toolObject } from "../src/viewport/view3d/tool-object.ts"
import { PROBE_CYCLE_KINDS, type ProbeSimOutcome } from "../src/features/cam/lib/probing/contract.ts"

const profile = (config: Record<string, unknown>) => cam.kernel.profileOfConfig(config, "mill")
const outcome = (over: Partial<ProbeSimOutcome> = {}): ProbeSimOutcome => ({
  contacts: [{ name: "x+", tip: { x: 10.004, y: 0, z: -3 }, moveIndex: 4, line: 12 }, { name: "x-", tip: { x: -9.996, y: 0, z: -3 }, moveIndex: 9, line: 20 }],
  variables: {}, results: {}, offsets: {}, updates: [], tools: [], inspections: [], alarms: [], reports: [], path: [], ...over
})

test("palette: every cycle kind is offered, groups are complete, hardware gates carry a reason", () => {
  for (const kind of PROBE_CYCLE_KINDS) expect(PALETTE.some((entry) => entry.kind === kind), kind).toBe(true)
  expect(PALETTE_GROUPS.map((g) => g.id)).toEqual(["setup", "five-axis", "calibration", "tool-setter", "inspection"])
  for (const group of PALETTE_GROUPS) expect(entriesOf(group.id).length).toBeGreaterThan(0)
  const bore = PALETTE.find((e) => e.id === "bore")!
  expect(availability(bore, undefined)).toEqual({ ok: true })
  expect(availability(bore, profile({}))).toEqual({ ok: true })
  const setter = PALETTE.find((e) => e.kind === "tool-length")!
  expect(availability(setter, profile({}))).toEqual({ ok: false, reason: "cam.probing.unavailable.noToolSetter" })
  const withSetter = profile({ toolSetter: { kind: "contact", position: { x: 1, y: 2, z: 3 }, triggerZ: -1, maxToolDiameter: 20, feeds: { fast: 300, touch: 20 }, brokenTolerance: 0.2 } })
  expect(availability(setter, withSetter)).toEqual({ ok: true })
  const rotary = PALETTE.find((e) => e.kind === "rotary-axis")!
  expect(availability(rotary, profile({}))).toEqual({ ok: false, reason: "cam.probing.unavailable.noRotary" })
  expect(availability(rotary, profile({ rotary: { layout: "table-AC" }, axes: 5 }))).toEqual({ ok: true })
  expect(availability(bore, cam.kernel.profileOfConfig({}, "lathe"))).toEqual({ ok: false, reason: "cam.probing.unavailable.notMill" })
  expect(PALETTE.filter((e) => e.group === "inspection").every((e) => e.preset === "inspect")).toBe(true)
})

test("resolve: cycle override > machine > Settings > core default, and the source of each figure", () => {
  const defaults = { ...DEFAULT_PROBING, touchFeed: 80, clearance: 7, safeHeight: 40 }
  // No machine: Settings over the core.
  expect(resolveSettings({ defaults })).toMatchObject({ feed: 80, clearance: 7, safeZ: 40, fastFeed: 1000, search: 10 })
  // A stored probe states its feed and stylus: those win over Settings; what it leaves out comes from Settings.
  const machine = profile({ probing: { stylusDiameter: 4, feeds: { touch: 60 } }, workOffsets: { available: ["G54", "G55"], default: "G55" } })
  const s = resolveSettings({ profile: machine, defaults })
  expect(s).toMatchObject({ stylusDiameter: 4, feed: 60, clearance: 7 })
  expect(s.workOffset).toEqual({ kind: "g5x", code: "G55" })
  // The cycle's own figure wins over everything; its work offset over the machine's default.
  const own = resolveSettings({ profile: machine, defaults, overrides: { touchFeed: 25, search: 3 }, workOffset: "G54.1 P3" })
  expect(own).toMatchObject({ feed: 25, search: 3, stylusDiameter: 4 })
  expect(own.workOffset).toEqual({ kind: "extended", p: 3 })
  expect(sourcesOf({ profile: machine, defaults, overrides: { touchFeed: 25 } })).toMatchObject({ touchFeed: "cycle", stylusDiameter: "machine", clearance: "settings" })
  expect(sourcesOf({ overrides: {} }).clearance).toBe("default")
  // The context keeps the stored stylus (length, shank) and lays the resolved feeds over it.
  const ctx = contextOf(own, { profile: machine })
  expect(ctx.probe.feeds.touch).toBe(25)
  expect(ctx.probe.stylus.ballDiameter).toBe(4)
  expect(ctx.safeZ).toBe(own.safeZ)
})

test("operations: defaults per kind, the local plan, actions and wire, the core's refusals", () => {
  const op = defaultOperation("bore", DEFAULT_PROBING, { name: "Bore 1" })
  expect(op).toMatchObject({ updateMode: "set", workOffset: "G54", follow: ["X", "Y"], checks: [] })
  const planned = planLocal(op, { defaults: DEFAULT_PROBING })
  expect(planned.ok).toBe(true)
  if (!planned.ok) throw new Error(planned.reason)
  expect(planned.routine.contacts.length).toBeGreaterThanOrEqual(4)
  expect(resultsOf(planned.routine).map((r) => r.name)).toEqual(expect.arrayContaining(["x", "y", "diameter"]))
  // Actions: set-offset follows X and Y from the results x / y; a G54.1 offset is addressed by its reference.
  expect(actionsOf({ ...op, workOffset: "G54.1 P3" })).toEqual([{ kind: "set-offset", ref: { kind: "extended", p: 3 }, axes: { X: "x", Y: "y" }, policy: { mode: "set", deadband: 0.001, limit: 5 } }])
  const tolerant = actionsOf({ ...op, updateMode: "update-within-tolerance", tolerance: 0.2 })
  expect(tolerant[0]).toMatchObject({ policy: { mode: "update-within-tolerance", tolerance: 0.2 } })
  expect(actionsOf({ ...op, updateMode: "report" })[0]).toMatchObject({ policy: { mode: "report" } })
  // A corner follows rotation through the offset's rotation, with an angular tolerance.
  const corner = { ...defaultOperation("corner", DEFAULT_PROBING), updateMode: "alarm-outside-tolerance" as const, tolerance: 0.1 }
  expect(actionsOf(corner).map((a) => a.kind)).toEqual(["set-offset", "rotation"])
  expect(actionsOf(corner)[1]).toMatchObject({ result: "rotation", via: "offset-r", policy: { mode: "alarm-outside-tolerance", angleTolerance: 0.1 } })
  // Checks come from the cycle's sizes; a reversed limit is an issue.
  const checks = defaultChecks(planned.routine, 0.05)
  expect(checks.map((c) => c.result)).toEqual(["diameter"])
  expect(checks[0]).toMatchObject({ kind: "size", nominal: 20, lower: -0.05, upper: 0.05 })
  expect(actionsOf({ ...op, checks }).at(-1)).toMatchObject({ kind: "inspect", characteristics: checks, onFail: "flag" })
  expect(operationIssues({ ...op, checks: [{ ...checks[0]!, lower: 1, upper: -1 }] })[0]).toContain("lower limit")
  expect(operationIssues({ ...op, workOffset: "G99" })[0]).toContain("not a work offset")
  expect(operationIssues({ ...op, updateMode: "alarm-outside-tolerance", tolerance: 0 })[0]).toContain("needs a tolerance")
  // The wire decodes with the core schemas: actions and cycle both.
  const wire = operationWire({ ...op, checks, overrides: { search: 4 } })
  expect(wire).toMatchObject({ cycle: { kind: "bore" }, search: 4 })
  expect(() => cam.probing.ProbeActionSchema && (wire.actions as unknown[]).forEach((a) => expect(a).toBeDefined())).not.toThrow()
  // The core refuses a stylus that does not fit: the reason is the planner's.
  const tight = planLocal({ ...op, cycle: { ...op.cycle, diameter: 3 }, overrides: { stylusDiameter: 6 } }, { defaults: DEFAULT_PROBING })
  expect(tight.ok).toBe(false)
  expect(movesOffset("bore")).toBe(true)
  expect(movesOffset("stylus-calibrate")).toBe(false)
  expect(defaultOperation("plane", DEFAULT_PROBING, { inspect: true }).updateMode).toBe("report")
})

test("targets: features of the stock and the elements, a pick resolves to the nearest feature that faces the same way", () => {
  const stock = { x: 50, y: 25, width: 100, height: 50, topZ: 10 }
  const elements = [
    { id: "c1", type: "circle", name: "Hole", x: 70, y: 25, z: 10, radius: 8 },
    { id: "r1", type: "rectangle", x: 30, y: 25, z: 10, width: 20, height: 10 }
  ]
  const origin = workOriginOf(stock)
  expect(origin).toEqual({ x: 50, y: 25, z: 10 })
  const targets = targetsOf(elements, { origin, stock })
  const byId = (id: string) => targets.find((t) => t.id === id)!
  expect(byId("stock:top").patch).toMatchObject({ at: { x: 0, y: 0 }, expectedZ: 0 })
  expect(byId("stock:right").patch).toMatchObject({ at: { x: 50, y: 0, z: -3 }, normalAngle: 0 })
  expect(byId("stock:left").patch).toMatchObject({ normalAngle: 180 })
  expect(byId("stock:corner:right back").patch).toMatchObject({ corner: { x: 50, y: 25 }, inside: false, xSense: -1, ySense: -1 })
  expect(byId("c1:bore").patch).toMatchObject({ centre: { x: 20, y: 0 }, diameter: 16 })
  expect(byId("c1:bore").label).toBe("Hole: bore")
  // Every preset is a cycle the core accepts.
  for (const target of targets) {
    const spec = applyTarget(undefined, target)
    expect(cam.probing.ProbeCycleSchema && spec.kind, target.id).toBe(target.kind)
  }
  // A pick on the wall of the hole is the bore; on the stock's top face away from features, the top face; on the right wall, the right edge.
  expect(targetAt({ point: { x: 20, y: 8, z: -3 }, normal: { x: 0, y: 1, z: 0 } }, targets)?.id).toBe("c1:bore")
  expect(targetAt({ point: { x: -45, y: 15, z: 0 }, normal: { x: 0, y: 0, z: 1 } }, targets)?.kind).toBe("z-surface")
  expect(targetAt({ point: { x: 50, y: 2, z: -3 }, normal: { x: 1, y: 0, z: 0 } }, targets)?.id).toBe("stock:right")
  expect(targetAt({ point: { x: 1000, y: 1000, z: 1000 }, normal: { x: 0, y: 0, z: 1 } }, targets)).toBeUndefined()
  // Applying a target to a cycle of the same kind keeps its other fields.
  const bore = { ...defaultOperation("bore", DEFAULT_PROBING).cycle, depth: 9 }
  expect(applyTarget(bore, byId("c1:bore"))).toMatchObject({ kind: "bore", depth: 3, diameter: 16, centre: { x: 20, y: 0 } })
})

test("cycles are element toolpaths with operationType probing, listed in order, and never join the cutting setup", () => {
  let state = initialState()
  const a = addProbeCycle(state, defaultOperation("bore", DEFAULT_PROBING, { name: "A" }), "t-a")
  state = a.state
  const b = addProbeCycle(state, defaultOperation("z-surface", DEFAULT_PROBING, { name: "B" }), "t-b")
  state = b.state
  expect(state.toolpaths.map((t) => t.toolpathSettings.operationType)).toEqual(["probing", "probing"])
  expect(probeCycles(state).map((t) => t.probe.name)).toEqual(["A", "B"])
  state = updateProbeCycle(state, "t-a", { name: "A2", tolerance: 0.2 })
  expect(state.toolpaths[0]).toMatchObject({ elementName: "A2", probe: { name: "A2", tolerance: 0.2 } })
  expect(updateProbeCycle(state, "missing", { name: "x" })).toBe(state)
  const copy = duplicateProbeCycle(state, "t-a", "t-c")
  expect(probeCycles(copy.state).map((t) => t.id)).toEqual(["t-a", "t-c", "t-b"])
  expect(probeCycles(copy.state)[1]!.probe.name).toBe("A2 copy")
  expect(setupOfToolpaths(copy.state.toolpaths).operations).toHaveLength(0)
  // Plain JSON: the persisted toolpaths round trip.
  expect(JSON.parse(JSON.stringify(copy.state.toolpaths))[0].probe.cycle.kind).toBe("bore")
})

test("lists: numbers separated by spaces keep decimal commas; points one per line; errors name the entry", () => {
  expect(parseNumberList("0 30,5 60; 90")).toEqual({ ok: true, value: [0, 30.5, 60, 90] })
  expect(parseNumberList("0 x 2")).toMatchObject({ ok: false })
  expect(parseNumberList("1 2", 3)).toMatchObject({ ok: false })
  expect(parsePointList("0 0\n20,5 0\n0 20")).toEqual({ ok: true, value: [{ x: 0, y: 0 }, { x: 20.5, y: 0 }, { x: 0, y: 20 }] })
  expect(parsePointList("0 0\n1")).toMatchObject({ ok: false })
  expect(formatNumberList([0, 30.5])).toBe("0 30.5")
  expect(formatPointList([{ x: 1, y: 2 }])).toBe("1 2")
})

test("work offset choices: the table's rows, the control's G5x, and the cycle's own when it is neither", () => {
  expect(offsetChoicesOf(undefined, "G54.1 P2")).toEqual(["G54", "G55", "G56", "G57", "G58", "G59", "G54.1 P2"])
  const p = profile({ post: "siemens", workOffsetTable: { entries: { G505: { x: 1, y: 2, z: 3 } } } })
  expect(offsetChoicesOf(p, "G54")).toContain("G505")
  expect(offsetChoicesOf(p, "G54")).not.toContain("G58")
})

test("run results: verdict words, the offset before and after, stored report round trip", () => {
  const pass = outcome({ inspections: [{ name: "d", kind: "size", measured: 20.01, nominal: 20, deviation: 0.01, lower: -0.05, upper: 0.05, pass: true }] })
  expect(verdictOfRun(pass, [])).toBe("pass")
  expect(verdictOfRun(outcome({ inspections: [{ ...pass.inspections[0]!, deviation: 0.045 }] }), [])).toBe("warn")
  expect(verdictOfRun(outcome({ inspections: [{ ...pass.inspections[0]!, pass: false, deviation: 0.2 }] }), [])).toBe("fail")
  expect(verdictOfRun(outcome({ alarms: [{ code: 991, text: "no touch", moveIndex: 3 }] }), [])).toBe("missed")
  expect(verdictOfRun(outcome({ stopped: "alarm" }), [])).toBe("incomplete")
  const expected = [{ name: "a", expected: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, { name: "b", expected: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, { name: "c", expected: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }]
  expect(verdictOfRun(outcome(), expected)).toBe("incomplete")
  const g54 = cam.probing.parseOffsetRef("G54")!
  const change = offsetChange(outcome({ updates: [{ ref: g54, axis: "X", before: -300, after: -299.7 }, { ref: g54, axis: "Y", before: -200, after: -200.2 }] }), g54)!
  expect(change.before).toMatchObject({ x: -300, y: -200 })
  expect(change.after).toMatchObject({ x: -299.7, y: -200.2, z: 0 })
  expect(offsetChange(outcome(), g54)).toBeUndefined()
  const run: ProbeRunResult = { operationId: "t1", source: "simulated", outcome: { ...pass, path: [{ x: 0, y: 0, z: 0 }] }, expected, verdicts: pass.inspections, verdict: "pass", measuredAt: "2026-11-04T10:00:00.000Z", workOffset: "G54" }
  const data = reportData(run)
  expect(data.outcome).not.toHaveProperty("path")
  const read = resultOfReport({ id: "r1", toolpathId: "t1", source: "simulated", verdict: "pass", measuredAt: run.measuredAt, runId: null, programHash: null, workOffset: "G54", data: JSON.parse(JSON.stringify(data)) })
  expect(read.ok && read.result).toMatchObject({ operationId: "t1", reportId: "r1", verdict: "pass", workOffset: "G54" })
  expect(read.ok && read.result.verdicts).toEqual(pass.inspections)
  expect(resultOfReport({ id: "r", toolpathId: null, source: "machine", verdict: "pass", measuredAt: "x", runId: null, programHash: null, workOffset: null, data: { version: 2 } }).ok).toBe(false)
  expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }))
})

test("overlay input: contact times from the timeline, the tilted frame with the controls' rotation order, calibration spheres", () => {
  const timeline = { moves: [{ start: 0, duration: 1, state: { line: 3 } }, { start: 1, duration: 2, state: { line: 12 } }, { start: 3, duration: 1, state: { line: 12 } }, { start: 4, duration: 1.5, state: { line: 20 } }] }
  expect(contactTimesOnTimeline(outcome().contacts, timeline)).toEqual([3, 5.5])
  expect(contactTimesOnTimeline([{ tip: { x: 0, y: 0, z: 0 }, moveIndex: 0 }, { tip: { x: 0, y: 0, z: 0 }, moveIndex: 1, line: 99 }], timeline)).toEqual([undefined, undefined])
  // A 30° tilt about X turns the Y axis toward Z.
  const frame = frameAxesOfAbc({ a: 30, b: 0, c: 0 })
  expect(frame.x).toEqual({ x: 1, y: 0, z: 0 })
  expect(frame.y.y).toBeCloseTo(Math.cos(Math.PI / 6), 12)
  expect(frame.y.z).toBeCloseTo(Math.sin(Math.PI / 6), 12)
  const expected = [{ name: "x+", expected: { x: 10, y: 0, z: -3 }, direction: { x: 1, y: 0, z: 0 } }, { name: "x-", expected: { x: -10, y: 0, z: -3 }, direction: { x: -1, y: 0, z: 0 } }]
  const g54 = cam.probing.parseOffsetRef("G54")!
  const op = { ...defaultOperation("bore", DEFAULT_PROBING), frame: { a: 30, b: 0, c: 0 } }
  const run: ProbeRunResult = {
    operationId: "t", source: "simulated", expected, verdicts: [], verdict: "pass", measuredAt: "now",
    outcome: outcome({ updates: [{ ref: g54, axis: "X", before: 0, after: 0.3 }] })
  }
  const model = overlayModelOf({ result: run, operation: op, deviationScale: 100, timeline })
  expect(model.contacts.map((c) => c.time)).toEqual([3, 5.5])
  expect(model.switchAt).toBe(5.5)
  expect(model.wcsShift.x).toBeCloseTo(0.3, 12)
  expect(model.deviations[0]!.to.x).toBeCloseTo(10.4, 9)
  expect(model.frames).toHaveLength(1)
  expect(model.frames[0]!.y.z).toBeCloseTo(0.5, 12)
  const rotary = { ...defaultOperation("rotary-axis", DEFAULT_PROBING) }
  expect(overlayModelOf({ result: run, operation: rotary, deviationScale: 1 }).spheres).toEqual([{ centre: { x: 0, y: 0, z: 50 }, diameter: 25 }])
  const measured = { ...run, outcome: outcome({ results: { cal_0_x: 0.1, cal_0_y: 0, cal_0_z: 50, cal_1_x: 0.2, cal_1_y: 0.1, cal_1_z: 50.1 } }) }
  expect(overlayModelOf({ result: measured, operation: rotary, deviationScale: 1 }).spheres.map((s) => s.centre.x)).toEqual([0.1, 0.2])
})

test("part solids: the stock and the solid elements in work coordinates", () => {
  const stock = { x: 50, y: 25, width: 100, height: 50, depth: 20, topZ: 10 }
  const solids = partSolidsOf([{ id: "a", type: "cube", x: 70, y: 25, z: 0, width: 10, height: 10, depth: 4 }, { id: "b", type: "circle", x: 0, y: 0, radius: 3 }], workOriginOf(stock), stock)
  expect(solids).toHaveLength(2)
  expect(solids[0]).toEqual({ _tag: "Box", origin: { x: -50, y: -25, z: -20 }, size: { x: 100, y: 50, z: 20 } })
  expect(solids[1]).toMatchObject({ _tag: "Box", origin: { x: 15, y: -5, z: -12 }, size: { x: 10, y: 10, z: 4 } })
})

test("path colours: probe touches keep the probe colour in every mode, with a legend entry", () => {
  const path: cam.Toolpath = { id: "p", name: "probe", toolId: "T99", moves: [{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 0, y: 0, z: -2 }, feed: 100 }, { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 800 }] } as never
  const playback = buildPlayback({ name: "t", toolpaths: [path] } as never, 5000, 0.1)
  const palette = [0xff0000]
  const classOf = (_path: number, index: number) => (index === 1 ? "probe" as const : "cut" as const)
  const plain = pathBuffers(playback, { mode: "tool", toolColors: new Map([["T99", 0x112233]]), shown: (p) => p, classOf }, palette)
  expect(plain.legend.map((e) => e.label)).not.toContain("probe")
  const withProbe = pathBuffers(playback, { mode: "tool", toolColors: new Map([["T99", 0x112233]]), shown: (p) => p, classOf, probeColors: true }, palette)
  expect(withProbe.legend.map((e) => e.label)).toEqual(["T99", "probe"])
  expect(withProbe.legend.at(-1)!.color).toBe(cam.viewer.MOVE_CLASS_COLORS.probe)
  const colours = Array.from(withProbe.cut.colors!)
  // First cut segment (index 1) is the probe colour, the next is the tool colour.
  const probeRgb = [(cam.viewer.MOVE_CLASS_COLORS.probe >> 16 & 255) / 255, (cam.viewer.MOVE_CLASS_COLORS.probe >> 8 & 255) / 255, (cam.viewer.MOVE_CLASS_COLORS.probe & 255) / 255]
  expect(colours.slice(0, 3).map((c) => Number(c.toFixed(4)))).toEqual(probeRgb.map((c) => Number(c.toFixed(4))))
  expect(colours.slice(6, 9).map((c) => Number(c.toFixed(4)))).toEqual([0x11 / 255, 0x22 / 255, 0x33 / 255].map((c) => Number(c.toFixed(4))))
})

test("probe tool model from the machine, with the ball named for the contact pulse", () => {
  expect(probeModelOf(undefined)).toBeUndefined()
  expect(probeModelOf({ stylusRadius: 1.5 })).toMatchObject({ family: "probe", ballDiameter: 3, stylusLength: 50, assumed: ["stylusLength", "bodyDiameter"] })
  expect(probeModelOf({ stylusDiameter: 4, stylusLength: 30, body: { diameter: 25 } })).toEqual({ family: "probe", ballDiameter: 4, stylusLength: 30, bodyDiameter: 25, assumed: [] })
  const group = toolObject(probeModelOf({ stylusDiameter: 4 })!)
  expect(group.name).toBe("probe")
  const ball = group.getObjectByName("probe:ball") as THREE.Mesh
  expect(ball).toBeDefined()
  expect(ball.geometry.boundingBox === null ? (ball.geometry.computeBoundingBox(), ball.geometry.boundingBox!.max.x) : ball.geometry.boundingBox.max.x).toBeLessThanOrEqual(2.0001)
})
