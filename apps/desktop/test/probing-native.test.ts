/**
 * Native probe cycles in the desktop (spec 73 §5.9): the machine's cycle package is chosen in the library, the panel asks the core
 * whether a cycle can be written natively (and names the same reason the post would), and Write program sends `native` with the
 * machine's package to the real sidecar.
 */
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { brep, cam } from "@cadcamfun/core"
import { DEFAULT_PROBING } from "../src/shared/state/settings.ts"
import { defaultOperation, type ProbeOperation } from "../src/features/cam/lib/probing/operation.ts"
import { macroStyleOf, nativePatch, nativeStatusOf } from "../src/features/cam/lib/probing/native.ts"
import { probingFormOf, writeProbe } from "../src/features/library/lib/machine-probing.ts"

setDefaultTimeout(90_000)

const profileOf = (config: Record<string, unknown>) => cam.kernel.profileOfConfig(config, "mill")
const inlineBore: ProbeOperation = { ...defaultOperation("bore", DEFAULT_PROBING), cycle: { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }, workOffset: "G54" }
const bore: ProbeOperation = { ...inlineBore, ...nativePatch(inlineBore, true) }

test("turning native on clears the conditions of the datum write, turning it off restores the limit", () => {
  const tolerant: ProbeOperation = { ...inlineBore, updateMode: "alarm-outside-tolerance" }
  const on = { ...tolerant, ...nativePatch(tolerant, true) }
  expect(on).toMatchObject({ native: true, deadband: 0, limit: 0, updateMode: "set" })
  const off = { ...on, ...nativePatch(on, false) }
  expect(off).toMatchObject({ native: false, deadband: 0.001, limit: 5 })
  // The inline operation with its limit is what the core refuses natively, with the reason.
  const refused = nativeStatusOf(inlineBore, { profile: profileOf({ probing: { stylusDiameter: 4, macroStyle: "renishaw" } }), defaults: DEFAULT_PROBING })
  expect(refused.ok === false && refused.detail).toMatch(/unconditionally/)
})

test("library: the cycle package and the tilted plane are written to the probe; inline is stored as absent", () => {
  let config: Record<string, unknown> = writeProbe({ probing: { stylusDiameter: 4 } }, "macroStyle", "renishaw")
  config = writeProbe(config, "tiltedPlane", true)
  expect(config.probing).toEqual({ stylusDiameter: 4, macroStyle: "renishaw", tiltedPlane: true })
  expect(probingFormOf(config).probe).toMatchObject({ macroStyle: "renishaw", tiltedPlane: true })
  expect(profileOf(config).probing).toMatchObject({ macroStyle: "renishaw", tiltedPlane: true })
  // Back to none: the key goes, so older readers see the configuration they know.
  const cleared = writeProbe(writeProbe(config, "macroStyle", "inline"), "tiltedPlane", undefined)
  expect(cleared.probing).toEqual({ stylusDiameter: 4 })
})

test("native status: no package, a cycle the package writes, and the core's own refusals", () => {
  expect(macroStyleOf(undefined)).toBeUndefined()
  expect(macroStyleOf(profileOf({ probing: { stylusDiameter: 4, macroStyle: "inline" } }))).toBeUndefined()
  const none = nativeStatusOf(bore, { profile: profileOf({ probing: { stylusDiameter: 4 } }), defaults: DEFAULT_PROBING })
  expect(none).toEqual({ ok: false, reason: "noPackage" })

  const renishaw = profileOf({ probing: { stylusDiameter: 4, macroStyle: "renishaw" } })
  const ok = nativeStatusOf(bore, { profile: renishaw, defaults: DEFAULT_PROBING })
  expect(ok.ok).toBe(true)
  if (ok.ok) { expect(ok.style).toBe("renishaw"); expect(ok.word).toMatch(/P98/) }

  const heidenhain = nativeStatusOf(bore, { profile: profileOf({ probing: { stylusDiameter: 4, macroStyle: "heidenhain-ts" } }), defaults: DEFAULT_PROBING })
  expect(heidenhain.ok && heidenhain.word).toMatch(/TCH PROBE 4\d\d/)

  // A tilted plane is refused by the core, with its reason.
  const tilted = nativeStatusOf({ ...bore, frame: { a: 30, b: 0, c: 0 } }, { profile: renishaw, defaults: DEFAULT_PROBING })
  expect(tilted.ok).toBe(false)
  if (!tilted.ok) { expect(tilted.reason).toBe("refused"); expect(tilted.detail).toMatch(/tilted/) }
  // Inspection checks are an action the cycle's result variables would not serve: refused too.
  const checked = nativeStatusOf({ ...bore, checks: [{ name: "diameter", kind: "size", result: "diameter", nominal: 20, lower: -0.02, upper: 0.02 }] }, { profile: renishaw, defaults: DEFAULT_PROBING })
  expect(checked.ok).toBe(false)
})

// ---------------------------------------------------------------- the real sidecar

let app: Awaited<ReturnType<typeof import("./helpers/live-app.ts").bootLiveApp>>
let hook: typeof import("../src/features/cam/hooks/useProbing.ts")
let stores: {
  multi: typeof import("../src/features/cam/store/multiToolpathStore.ts").useMultiToolpathStore
  probing: typeof import("../src/features/cam/store/probingStore.ts").useProbingStore
}

beforeAll(async () => {
  const { bootLiveApp } = await import("./helpers/live-app.ts")
  app = await bootLiveApp()
  hook = await import("../src/features/cam/hooks/useProbing.ts")
  stores = {
    multi: (await import("../src/features/cam/store/multiToolpathStore.ts")).useMultiToolpathStore,
    probing: (await import("../src/features/cam/store/probingStore.ts")).useProbingStore
  }
})
afterAll(async () => { await app?.dispose() })

test("Write program with native on writes the machine package's cycle; Simulate keeps the native program and runs the inline touches", async () => {
  const { makeProbingStoreService } = await import("../src/features/cam/api/probing.ts")
  const { PALETTE } = await import("../src/features/cam/lib/probing/cycle-palette.data.ts")
  const { probeCycles } = await import("../src/features/cam/lib/probing/cycles.ts")
  const call = app.sidecar.call
  const created = (await call("/api/machine-configs", { method: "POST", json: { name: "VMC native", type: "mill", config: { workVolume: { x: 800, y: 500, z: 500 }, maxSpindleSpeed: 10000, maxFeedRate: 10000, controller: "fanuc" } } })).body.data.id as string
  const config = (await call(`/api/machine-configs/${created}`, { method: "PUT", json: { name: "VMC native", config: { post: "fanuc", probing: { stylusDiameter: 4, toolNumber: 99, macroStyle: "renishaw" } } } })).body.data.config
  const machine = () => ({ id: created, name: "VMC native", type: "mill", config })
  const service = makeProbingStoreService(app.client)
  const run = <A, E>(effect: import("effect").Effect.Effect<A, E>) => app.state.runtime.run(effect)
  const block = brep.transformBrep(brep.makeBox(100, 60, 20), brep.translation({ x: 0, y: 0, z: -20 }))
  const drilled = brep.booleanBrep(block, brep.transformBrep(brep.makeCylinder(10, 40), brep.translation({ x: 30, y: 30, z: -30 })), "subtract").brep
  const elements = () => [{ id: "part", type: "brep", brep: drilled, x: 0, y: 0, z: 0 }]
  const deps = { run, service, machine, defaults: () => DEFAULT_PROBING, elements: () => elements() as never, projectId: () => null }
  const program = hook.createProbingProgram({ ...deps, parse: async () => undefined })
  const c = hook.createProbingController({ ...deps, program, stock: () => ({ x: 0, y: 0, width: 100, height: 60, topZ: 0 }), setups: () => [], insert: () => {} })
  stores.multi.getState().clearAllToolpaths()
  stores.probing.getState().reset()
  c.add(PALETTE.find((e) => e.id === "bore")!)
  const cycle = probeCycles(stores.multi.getState()).at(-1)!
  c.update(cycle.id, { cycle: { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }, workOffset: "G54" })
  c.update(cycle.id, nativePatch(stores.multi.getState().getToolpathById(cycle.id)!.probe!, true))
  await c.generate(cycle.id)
  expect(stores.probing.getState().error).toBeUndefined()
  const written = stores.probing.getState().programs[cycle.id]!
  expect(written.native).toMatch(/P98/)
  expect(written.nc).toContain("G65")
  await c.simulate(cycle.id)
  expect(stores.probing.getState().error).toBeUndefined()
  // The native program stays the one shown; the run carries no lines that would point into another text.
  expect(stores.probing.getState().programs[cycle.id]!.nc).toBe(written.nc)
  const result = stores.probing.getState().results[cycle.id]!
  expect(result.outcome.contacts.length).toBeGreaterThanOrEqual(4)
  expect(result.outcome.contacts.every((k) => k.line === undefined)).toBe(true)
})

test("only the posts the probing routes write are sent with a simulation", async () => {
  const { isProbingDialect } = await import("../src/features/cam/lib/probing/native.ts")
  for (const d of ["fanuc", "siemens", "heidenhain", "linuxcnc", "okuma", "grbl"]) expect(isProbingDialect(d)).toBe(true)
  for (const d of ["mach3", "marlin", ""]) expect(isProbingDialect(d)).toBe(false)
})
