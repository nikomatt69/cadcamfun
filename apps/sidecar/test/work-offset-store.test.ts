import { expect, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { Effect, Fiber, Layer, Stream } from "effect"
import { LiveEvents } from "../src/services/live-events.ts"
import { MachineConfigRepo } from "../src/repos/machine-config-repo.ts"
import { WorkOffsetStore, workOffsetTableOf } from "../src/repos/work-offset-store.ts"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const layer = () => WorkOffsetStore.layer.pipe(
  Layer.provideMerge(MachineConfigRepo.layer),
  Layer.provideMerge(Database.layer({ path: ":memory:", migrationsFolder }))
)

const SETTER = { kind: "contact" as const, position: { x: 400, y: -200, z: -350 }, triggerZ: -400, maxToolDiameter: 30, feeds: { fast: 500, touch: 20 }, brokenTolerance: 0.2 }

const seed = Effect.gen(function*() {
  const { query } = yield* Database
  const [owner, stranger] = yield* query("users", (db) => db.insert(schema.userTable).values([{ email: "o@example.com" }, { email: "s@example.com" }]).returning())
  const machines = yield* MachineConfigRepo
  const machine = yield* machines.create(owner!.id, { name: "VMC", type: "mill", isPublic: false, config: { maxSpindleSpeed: 12000, maxFeedRate: 10000, workVolume: { x: 800, y: 500, z: 500 }, probing: { stylusRadius: 1 } } })
  const shared = yield* machines.create(owner!.id, { name: "Shared", type: "mill", isPublic: true, config: { maxSpindleSpeed: 12000 } })
  return { owner: owner!.id, stranger: stranger!.id, machine: machine.id, shared: shared.id }
})

test("offsets: empty table, machine and per-setup rows, other config kept, history row per save, stale base writes nothing", async () => {
  const out = await Effect.runPromise(Effect.gen(function*() {
    const ids = yield* seed
    const store = yield* WorkOffsetStore
    const machines = yield* MachineConfigRepo
    const empty = yield* store.get(ids.owner, ids.machine)
    if ("refused" in empty) throw new Error(empty.message)
    const g54 = { G54: { x: 100.25, y: -50, z: -300.1, c: 0.002 } }
    const saved = yield* store.put(ids.owner, ids.machine, { entries: g54, baseUpdatedAt: empty.updatedAt })
    const setup = yield* store.put(ids.owner, ids.machine, { entries: { "G54.1 P3": { x: 1, y: 2, z: 3 } }, setupId: "s1" })
    const machineRows = yield* store.get(ids.owner, ids.machine)
    const setupRows = yield* store.get(ids.owner, ids.machine, "s1")
    const unknownSetup = yield* store.get(ids.owner, ids.machine, "s2")
    const stale = yield* store.put(ids.owner, ids.machine, { entries: {}, baseUpdatedAt: empty.updatedAt })
    const row = yield* machines.byId(ids.machine)
    const history = yield* machines.history(ids.machine)
    const dropSetup = yield* store.put(ids.owner, ids.machine, { entries: null, setupId: "s1" })
    const afterDrop = yield* machines.byId(ids.machine)
    return { empty, saved, setup, machineRows, setupRows, unknownSetup, stale, row, history, dropSetup, afterDrop }
  }).pipe(Effect.provide(layer())))
  expect(out.empty).toMatchObject({ entries: {}, setupId: null, isOwner: true })
  expect(out.saved).toMatchObject({ entries: { G54: { x: 100.25, y: -50, z: -300.1, c: 0.002 } } })
  expect(out.machineRows).toMatchObject({ entries: { G54: { x: 100.25 } } })
  expect(out.setupRows).toMatchObject({ setupId: "s1", entries: { "G54.1 P3": { x: 1, y: 2, z: 3 } } })
  expect(out.unknownSetup).toMatchObject({ setupId: "s2", entries: {} })
  expect(out.stale).toMatchObject({ refused: "conflict" })
  const config = out.row!.config as Record<string, unknown>
  expect(config.maxSpindleSpeed).toBe(12000)
  expect(config.probing).toEqual({ stylusRadius: 1 })
  expect(workOffsetTableOf(config).entries.G54?.x).toBe(100.25)
  expect(out.history).toHaveLength(2)
  expect(workOffsetTableOf(out.afterDrop!.config).bySetup).toEqual({})
})

test("access: a stranger reads and writes nothing (the machine-config permission rule); unknown id is not found", async () => {
  const out = await Effect.runPromise(Effect.gen(function*() {
    const ids = yield* seed
    const store = yield* WorkOffsetStore
    return {
      privateRead: yield* store.get(ids.stranger, ids.machine),
      publicRead: yield* store.get(ids.stranger, ids.shared),
      publicWrite: yield* store.put(ids.stranger, ids.shared, { entries: {} }),
      probeWrite: yield* store.putProbeConfig(ids.stranger, ids.shared, { probing: {} }),
      missing: yield* store.get(ids.owner, "nope")
    }
  }).pipe(Effect.provide(layer())))
  expect(out.privateRead).toMatchObject({ refused: "forbidden" })
  expect(out.publicRead).toMatchObject({ refused: "forbidden" })
  expect(out.publicWrite).toMatchObject({ refused: "forbidden" })
  expect(out.probeWrite).toMatchObject({ refused: "forbidden" })
  expect(out.missing).toMatchObject({ refused: "not-found" })
})

test("probe config: slices replace, null removes, omitted keeps", async () => {
  const out = await Effect.runPromise(Effect.gen(function*() {
    const ids = yield* seed
    const store = yield* WorkOffsetStore
    const first = yield* store.getProbeConfig(ids.owner, ids.machine)
    const put = yield* store.putProbeConfig(ids.owner, ids.machine, { toolSetter: SETTER, rotaryCalibration: { at: "2026-11-04" } })
    const removed = yield* store.putProbeConfig(ids.owner, ids.machine, { probing: null })
    return { first, put, removed }
  }).pipe(Effect.provide(layer())))
  expect(out.first).toMatchObject({ probing: { stylusRadius: 1 }, toolSetter: null, rotaryCalibration: null })
  expect(out.put).toMatchObject({ probing: { stylusRadius: 1 }, toolSetter: { kind: "contact", triggerZ: -400 }, rotaryCalibration: { at: "2026-11-04" } })
  expect(out.removed).toMatchObject({ probing: null, toolSetter: { kind: "contact" } })
})

test("a work-offset write announces resources.changed to the owner; a refused one announces nothing", async () => {
  const frames = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const ids = yield* seed
    const store = yield* WorkOffsetStore
    const events = yield* LiveEvents
    // The bus replays recent frames to a new subscriber: the two machines the seed created are frames 1 and 2.
    const source = yield* events.subscribe({ types: ["resources.changed"] })
    const collected = yield* Effect.forkDetach(Stream.runCollect(source.pipe(Stream.interruptWhen(Effect.sleep("400 millis")))))
    yield* store.put(ids.stranger, ids.machine, { entries: {} })
    yield* store.put(ids.owner, ids.machine, { entries: { G55: { x: 1, y: 2, z: 3 } } })
    yield* store.putProbeConfig(ids.owner, ids.machine, { toolSetter: { ...SETTER, kind: "laser" } })
    return { got: yield* Fiber.join(collected), owner: ids.owner }
  }).pipe(Effect.provide(layer()), Effect.provide(LiveEvents.layer))))
  expect(frames.got).toHaveLength(4)
  expect(frames.got.every((f) => f.type === "resources.changed" && f.userId === frames.owner)).toBe(true)
})
