/**
 * The Probing tab's buttons against the real sidecar (spec 73 §4): Write program, Simulate, the 3D overlay model of a real run, the
 * measured offsets saved to the machine, and calibrations written back. The typed client talks to the in-process handlers; the kernel
 * jobs are the real ones.
 */
import { afterAll, beforeAll, beforeEach, expect, setDefaultTimeout, test } from "bun:test"
import { brep, cam } from "@cadcamfun/core"
import { bootLiveApp } from "./helpers/live-app.ts"
import { DEFAULT_PROBING } from "../src/shared/state/settings.ts"
import { makeProbingStoreService } from "../src/features/cam/api/probing.ts"
import { makeToolpathGenerator } from "../src/features/cam/api/generator.ts"
import { createProbeOverlay } from "../src/viewport/view3d/probe-overlay.ts"
import { PALETTE } from "../src/features/cam/lib/probing/cycle-palette.data.ts"
import { probeCycles } from "../src/features/cam/lib/probing/cycles.ts"
import { overlayModelOf } from "../src/features/cam/lib/probing/overlay-input.ts"
import { useMultiToolpathStore } from "../src/features/cam/store/multiToolpathStore.ts"
import { useProbingStore } from "../src/features/cam/store/probingStore.ts"
import { useWorkOffsetStore } from "../src/features/cam/store/workOffsetStore.ts"
import { useInspectionStore } from "../src/features/cam/store/inspectionStore.ts"

setDefaultTimeout(90_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
// Imported after the DOM is installed: the hook pulls in compiled templates.
let hook: typeof import("../src/features/cam/hooks/useProbing.ts")
let machineId = ""
let projectId = ""
let config: Record<string, unknown> = {}

const plate = () => {
  const block = brep.transformBrep(brep.makeBox(100, 60, 20), brep.translation({ x: 0, y: 0, z: -20 }))
  return brep.booleanBrep(block, brep.transformBrep(brep.makeCylinder(10, 40), brep.translation({ x: 30, y: 30, z: -30 })), "subtract").brep
}
const elements = () => [{ id: "part", type: "brep", brep: plate(), x: 0, y: 0, z: 0 }]

beforeAll(async () => {
  app = await bootLiveApp()
  hook = await import("../src/features/cam/hooks/useProbing.ts")
  const call = app.sidecar.call
  projectId = (await call("/api/projects", { method: "POST", json: { name: "Probing live" } })).body.id
  machineId = (await call("/api/machine-configs", { method: "POST", json: { name: "VMC", type: "mill", config: { workVolume: { x: 800, y: 500, z: 500 }, maxSpindleSpeed: 10000, maxFeedRate: 10000, controller: "fanuc" } } })).body.data.id
  const updated = await call(`/api/machine-configs/${machineId}`, { method: "PUT", json: { name: "VMC", config: { post: "fanuc", rotary: { layout: "table-AC", tilt: { min: -120, max: 120 }, pivot: { x: 0, y: 0, z: 100 } }, probing: { stylusDiameter: 4, toolNumber: 99 }, workOffsetTable: { entries: { G54: { x: -300, y: -200, z: -400 } } } } } })
  config = updated.body.data.config
})
afterAll(async () => { await app.dispose() })
beforeEach(() => {
  useMultiToolpathStore.getState().clearAllToolpaths()
  useProbingStore.getState().reset()
  useWorkOffsetStore.getState().reset()
  useInspectionStore.getState().reset()
})

const controller = () => {
  const service = makeProbingStoreService(app.client)
  const run = <A, E>(effect: import("effect").Effect.Effect<A, E>) => app.state.runtime.run(effect)
  const machine = () => ({ id: machineId, name: "VMC", type: "mill", config })
  const deps = { run, service, machine, defaults: () => DEFAULT_PROBING, elements: () => elements() as never, stock: () => ({ x: 0, y: 0, width: 100, height: 60, topZ: 0 }), projectId: () => projectId }
  const generator = makeToolpathGenerator(app.client)
  const program = hook.createProbingProgram({ ...deps, parse: (nc) => run(generator.parse(nc, "Probing")) })
  return hook.createProbingController({ ...deps, program, setups: () => [], insert: () => {}, onMachineProbing: () => {} })
}
const added = (id: string) => {
  const c = controller()
  c.add(PALETTE.find((e) => e.id === id)!)
  return { c, cycle: probeCycles(useMultiToolpathStore.getState()).at(-1)! }
}

test("the default corner cycle, rotation on: a program for Fanuc through G68, for Siemens in the offset, and the simulation brings it", async () => {
  const { c, cycle } = added("corner")
  c.update(cycle.id, { cycle: { kind: "corner", corner: { x: 100, y: 60 }, inside: false, xSense: -1, ySense: -1, depth: 5, touchesPerEdge: 2 }, workOffset: "G54", follow: ["X", "Y", "R"] })
  useProbingStore.getState().setDialect?.("fanuc")
  await c.generate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  expect(useProbingStore.getState().programs[cycle.id]!.nc).toMatch(/G68/)
  await c.simulate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const run = useProbingStore.getState().results[cycle.id]!
  expect(useProbingStore.getState().programs[cycle.id]!.parsed).toBeDefined()
  expect(run.outcome.contacts.every((contact) => contact.line !== undefined)).toBe(true)
  // Every contact is paired with its own planned touch: a corner on the drawn part is within a hair of where it was planned.
  expect(run.expected.length).toBe(run.outcome.contacts.length)
  run.outcome.contacts.forEach((contact, i) => {
    expect(Math.hypot(contact.tip.x - run.expected[i]!.expected.x, contact.tip.y - run.expected[i]!.expected.y)).toBeLessThan(1e-3)
  })
})

test("Write program, Simulate a misplaced part, the overlay shows the real run, Save offsets reaches the machine", async () => {
  const { c, cycle } = added("bore")
  c.update(cycle.id, { cycle: { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }, workOffset: "G54" })
  await c.generate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const program = useProbingStore.getState().programs[cycle.id]!
  expect(program.nc).toMatch(/G31/)
  expect(program.nc).not.toMatch(/\bM0?[34]\b/)
  expect(program.hash).toMatch(/^[0-9a-f]{64}$/)

  await c.loadOffsets()
  useProbingStore.getState().setMisplacement({ x: 0.3, y: -0.2 })
  await c.simulate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const run = useProbingStore.getState().results[cycle.id]!
  expect(run.verdict).toBe("pass")
  expect(run.outcome.contacts.length).toBeGreaterThanOrEqual(4)
  expect(run.programHash).toBe(useProbingStore.getState().programs[cycle.id]!.hash!)
  expect(run.outcome.updates.map((u) => u.axis).sort()).toEqual(["X", "Y"])

  const updated = useMultiToolpathStore.getState().getToolpathById(cycle.id)!.probe!
  const model = overlayModelOf({ result: run, operation: updated, deviationScale: 100 })
  expect(model.contacts).toHaveLength(run.outcome.contacts.length)
  expect(model.deviations.length).toBe(run.expected.length)
  expect(Math.max(...model.deviations.map((d) => d.magnitude))).toBeGreaterThan(0.1)
  expect(model.wcsShift.x).toBeCloseTo(0.3, 3)
  expect(model.wcsShift.y).toBeCloseTo(-0.2, 3)

  // Show in 3D: the program of the run is what plays, and its lines place the contacts and the offset change in time.
  const played = useProbingStore.getState().programs[cycle.id]!
  expect(played.parsed).toBeDefined()
  const parsed = played.parsed!
  const timeline = cam.viewer.buildTimeline(parsed.program, parsed.motion, 3000, cam.viewer.programStart("mill", parsed.program))
  expect(run.outcome.contacts.every((contact) => typeof contact.line === "number")).toBe(true)
  const timed = overlayModelOf({ result: run, operation: updated, deviationScale: 100, timeline })
  const times = timed.contacts.map((contact) => contact.time!)
  expect(times.every((time) => typeof time === "number")).toBe(true)
  for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!)
  expect(timed.switchAt).toBeGreaterThanOrEqual(times.at(-1)!)
  const overlay = createProbeOverlay(timed)
  overlay.update(times[0]! - 0.001)
  expect(overlay.root.getObjectByName("probe:contact:0")!.visible).toBe(false)
  overlay.update(times[0]!)
  expect(overlay.root.getObjectByName("probe:contact:0")!.visible).toBe(true)
  expect(overlay.root.getObjectByName(`probe:contact:${times.length - 1}`)!.visible).toBe(false)
  expect(overlay.root.getObjectByName("probe:wcs:after")!.visible).toBe(false)
  overlay.update(timed.switchAt! )
  expect(overlay.root.getObjectByName("probe:wcs:after")!.visible).toBe(true)
  overlay.dispose()

  c.applyMeasured(cycle.id)
  await c.saveOffsets()
  const table = (await app.sidecar.call(`/api/machine-configs/${machineId}/work-offsets`)).body
  expect(table.entries.G54.x).toBeCloseTo(-299.7, 3)
  expect(table.entries.G54.y).toBeCloseTo(-200.2, 3)
})

test("a stylus calibration on a ring is written to the machine's probe", async () => {
  const { c, cycle } = added("stylus-calibrate")
  c.update(cycle.id, { cycle: { kind: "stylus-calibrate", artefact: { kind: "ring", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 } } })
  await c.simulate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const calibration = c.calibrationOf(cycle.id)
  expect(calibration?.kind).toBe("stylus")
  await c.applyCalibration(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const stored = (await app.sidecar.call(`/api/machine-configs/${machineId}/probe`)).body
  expect(stored.probing.calibration.effectiveRadius).toBeCloseTo(2, 2)
  expect(stored.probing.stylusDiameter).toBe(4)
})

test("a rotary calibration: Write program, Simulate a table off its pivot, write the pivot back", async () => {
  const { c, cycle } = added("rotary-axis")
  c.update(cycle.id, { cycle: { kind: "rotary-axis", axis: "A", sphere: { centre: { x: 0, y: 0, z: 150 }, diameter: 25 }, angles: [-60, -30, 0, 30, 60] }, overrides: { safeZ: 260 } })
  await c.generate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  expect(useProbingStore.getState().programs[cycle.id]?.nc.length).toBeGreaterThan(10)
  useProbingStore.getState().setMisplacement({ x: 0.03, y: -0.02, z: 100.05 })
  await c.simulate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const run = useProbingStore.getState().results[cycle.id]!
  expect(run.verdict).toBe("pass")
  const updated = useMultiToolpathStore.getState().getToolpathById(cycle.id)!.probe!
  expect(overlayModelOf({ result: run, operation: updated, deviationScale: 100 }).spheres).toHaveLength(5)
  await c.applyCalibration(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const stored = (await app.sidecar.call(`/api/machine-configs/${machineId}/probe`)).body
  expect(stored.rotaryCalibration.pivotMeasured.y).toBeCloseTo(-0.02, 2)
})

test("a rotary calibration as a job operation: Simulate on the believed table keeps its record and lines", async () => {
  const { c, cycle } = added("rotary-axis")
  c.update(cycle.id, { cycle: { kind: "rotary-axis", axis: "A", sphere: { centre: { x: 0, y: 0, z: 150 }, diameter: 25 }, angles: [-60, -30, 0, 30, 60] }, overrides: { safeZ: 260 } })
  await c.simulate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const run = useProbingStore.getState().results[cycle.id]!
  expect(run.verdict).toBe("pass")
  expect(run.calibration?.kind).toBe("rotary")
  expect(run.outcome.contacts[0]?.line).toBeGreaterThan(0)
  expect(useProbingStore.getState().programs[cycle.id]?.parsed).toBeDefined()
})

test("a native cycle needs a machine that has one; the written program says what it does not prove", async () => {
  config = { ...config, probing: { ...(config.probing as object), macroStyle: "renishaw" } }
  const { c, cycle } = added("bore")
  c.update(cycle.id, { cycle: { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }, native: true, deadband: 0, limit: 0 })
  await c.generate(cycle.id)
  expect(useProbingStore.getState().error).toBeUndefined()
  const program = useProbingStore.getState().programs[cycle.id]!
  expect(program.native).toContain("G65")
  expect(program.nc).toContain("G65")
  config = { ...config, probing: { ...(config.probing as object), macroStyle: "inline" } }
})
