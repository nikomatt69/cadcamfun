/**
 * Kernel progress on the live stream: the frame shape, delivery to members of the project and not to a stranger, and the
 * manufacture route accepting a progress target only for a project the caller can open.
 */
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { Effect, Fiber, Layer, Stream } from "effect"
import { frameVisibleTo } from "../src/http/events.ts"
import { camProgressFrame, camProgressReporter } from "../src/services/cam-progress.ts"
import { runKernelRequest } from "../src/services/cam-program.ts"
import { LiveEvents } from "../src/services/live-events.ts"
import { ProjectRepo } from "../src/repos/project-repo.ts"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(120_000)

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const Live = ProjectRepo.layer.pipe(Layer.provideMerge(Database.layer({ path: ":memory:", migrationsFolder })))

test("frames carry the operation and stage; a project member receives them in order, a stranger nothing", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const { db } = yield* Database
    const projects = yield* ProjectRepo
    const events = yield* LiveEvents
    const owner = db.insert(schema.userTable).values({ email: "owner@test.local" }).returning().get()
    const stranger = db.insert(schema.userTable).values({ email: "stranger@test.local" }).returning().get()
    const project = yield* projects.create(owner.id, { name: "Plate" } as never)
    const collect = (userId: string) => Effect.gen(function*() {
      const source = yield* events.subscribe({})
      return yield* Effect.forkDetach(Stream.runCollect(source.pipe(
        Stream.filterEffect((event) => frameVisibleTo(userId, event, projects)),
        Stream.filter((event) => event.type === "cam.progress"),
        Stream.take(4)
      )).pipe(Effect.timeout("500 millis"), Effect.orElseSucceed(() => [] as ReadonlyArray<never>)))
    })
    const ownerStream = yield* collect(owner.id)
    const strangerStream = yield* collect(stranger.id)
    const report = camProgressReporter(events, project.id, "run-1")
    report({ stage: "operations", operation: { id: "rough", index: 0, count: 2 } })
    report({ stage: "post" })
    report({ stage: "evidence" })
    report("done")
    const got = Array.from(yield* Fiber.join(ownerStream)) as ReadonlyArray<Record<string, unknown>>
    expect(got.map((f) => [f["phase"], f["stage"] ?? null, f["operationId"] ?? null])).toEqual([["running", "operations", "rough"], ["running", "post", null], ["running", "evidence", null], ["done", null, null]])
    expect(got[0]).toMatchObject({ type: "cam.progress", projectId: project.id, runId: "run-1", index: 0, count: 2 })
    expect((yield* Fiber.join(strangerStream)).length).toBe(0)
  }).pipe(Effect.provide(Live), Effect.provide(LiveEvents.layer))))
})

test("the frame of a cancelled run says so and has no stage", () => {
  expect(camProgressFrame("p", "r", "cancelled", "t")).toEqual({ type: "cam.progress", projectId: "p", runId: "r", phase: "cancelled", at: "t" })
})

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

test("manufacture takes a progress target only for a project the caller can open", async () => {
  const request = { schemaVersion: 1, id: "p1", name: "Plate", material: "6061", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] }
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Progress" } })).body.id
  const ok = await app.call("/api/toolpaths/manufacture", { method: "POST", json: { ...request, progress: { projectId: project, runId: "run-a" } } })
  expect(ok.status).toBe(200)
  expect(ok.body.status).toBe("ok")
  const refused = await app.call("/api/toolpaths/manufacture", { method: "POST", json: { ...request, progress: { projectId: "nope", runId: "run-b" } } })
  expect(refused.status).toBe(400)
  const plain = await app.call("/api/toolpaths/manufacture", { method: "POST", json: request })
  expect(plain.status).toBe(200)
})

test("a dropped request ends the worker and announces the run as cancelled", async () => {
  const seen: Array<string> = []
  const payload = {
    schemaVersion: 1 as const, id: "heavy", name: "Dome", material: "6061", resolution: 0.05,
    elements: [{ id: "base", type: "cube", x: 0, y: 0, z: 4, width: 90, height: 90, depth: 8 }, { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 30 }]
  }
  const fiber = Effect.runFork(runKernelRequest(payload as never, (p) => { seen.push(typeof p === "string" ? p : p.stage) }))
  await Bun.sleep(1200)
  await Effect.runPromise(Fiber.interrupt(fiber))
  expect(seen.at(-1)).toBe("cancelled")
  const frozen = seen.length
  await Bun.sleep(800)
  expect(seen.length).toBe(frozen)
})
