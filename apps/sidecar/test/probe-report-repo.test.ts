import { expect, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { PROBE_REPORTS_KEPT, ProbeReportRepo } from "../src/repos/probe-report-repo.ts"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const layer = () => ProbeReportRepo.layer.pipe(Layer.provideMerge(Database.layer({ path: ":memory:", migrationsFolder })))

/** A user, two projects and a probe toolpath in the first one: the rows a report hangs off. */
const seed = Effect.gen(function*() {
  const { query } = yield* Database
  return yield* query("seed", async (db) => {
    const [user] = await db.insert(schema.userTable).values({ email: "probe@example.com", name: "Probe" }).returning()
    const [a] = await db.insert(schema.projectTable).values({ name: "A", ownerId: user!.id }).returning()
    const [b] = await db.insert(schema.projectTable).values({ name: "B", ownerId: user!.id }).returning()
    const [tp] = await db.insert(schema.toolpathTable).values({ name: "Probe bore", projectId: a!.id, createdBy: user!.id, type: "mill", operationType: "probing", data: { format: "cadcamfun-probe" } }).returning()
    return { userId: user!.id, a: a!.id, b: b!.id, toolpathId: tp!.id }
  })
})

const report = (over: Record<string, unknown> = {}) => ({ name: "Bore", kind: "part" as const, source: "simulated" as const, verdict: "pass" as const, data: { checks: [] }, ...over })

test("create, get, list newest first, scoped by project, latest per operation, remove", async () => {
  const out = await Effect.runPromise(Effect.gen(function*() {
    const ids = yield* seed
    const repo = yield* ProbeReportRepo
    const first = yield* repo.create(ids.a, ids.userId, report({ toolpathId: ids.toolpathId, workOffset: "G54", programHash: "h1" }))
    const second = yield* repo.create(ids.a, ids.userId, report({ toolpathId: ids.toolpathId, verdict: "fail", data: { checks: [{ name: "Ø20" }] } }))
    const loose = yield* repo.create(ids.a, ids.userId, report({ kind: "rotary", name: "C axis" }))
    const list = yield* repo.list(ids.a, { limit: 10 })
    const onlyOp = yield* repo.list(ids.a, { toolpathId: ids.toolpathId, limit: 10 })
    const page = yield* repo.list(ids.a, { limit: 10, before: second.createdAt })
    const latest = yield* repo.latestFor(ids.a, ids.toolpathId)
    const otherProject = yield* repo.get(ids.b, first.id)
    const got = yield* repo.get(ids.a, second.id)
    const removedElsewhere = yield* repo.remove(ids.b, first.id)
    const removed = yield* repo.remove(ids.a, first.id)
    const again = yield* repo.remove(ids.a, first.id)
    return { ids, first, second, loose, list, onlyOp, page, latest, otherProject, got, removedElsewhere, removed, again }
  }).pipe(Effect.provide(layer())))
  expect(out.first).toMatchObject({ workOffset: "G54", programHash: "h1", verdict: "pass", createdById: out.ids.userId })
  expect(out.list.map((r) => r.id)).toEqual([out.loose.id, out.second.id, out.first.id])
  expect("data" in out.list[0]!).toBe(false)
  expect(out.onlyOp.map((r) => r.id)).toEqual([out.second.id, out.first.id])
  expect(out.page.map((r) => r.id)).toEqual([out.first.id])
  expect(out.latest?.id).toBe(out.second.id)
  expect(out.latest?.verdict).toBe("fail")
  expect(out.otherProject).toBeUndefined()
  expect(out.got?.data).toEqual({ checks: [{ name: "Ø20" }] })
  expect(out.removedElsewhere).toBe(false)
  expect([out.removed, out.again]).toEqual([true, false])
})

test("a probe operation keeps only its newest reports; deleting the operation keeps its reports, deleting the project drops them", async () => {
  const out = await Effect.runPromise(Effect.gen(function*() {
    const ids = yield* seed
    const repo = yield* ProbeReportRepo
    const { query } = yield* Database
    // Write the overflow rows directly (fast), then one report through the repository, which prunes.
    yield* query("fill", async (db) => {
      const base = Date.now() - 1_000_000
      const rows = Array.from({ length: PROBE_REPORTS_KEPT + 5 }, (_, i) => ({
        projectId: ids.a, toolpathId: ids.toolpathId, createdById: ids.userId, name: `r${i}`, kind: "part" as const, source: "simulated" as const,
        verdict: "pass" as const, data: {}, createdAt: new Date(base + i), measuredAt: new Date(base + i)
      }))
      await db.insert(schema.probeReportTable).values(rows)
    })
    const newest = yield* repo.create(ids.a, ids.userId, report({ toolpathId: ids.toolpathId }))
    const kept = yield* repo.list(ids.a, { toolpathId: ids.toolpathId, limit: 1000 })
    yield* query("dropOp", (db) => db.delete(schema.toolpathTable).where(eq(schema.toolpathTable.id, ids.toolpathId)))
    const orphan = yield* repo.get(ids.a, newest.id)
    yield* query("dropProject", (db) => db.delete(schema.projectTable).where(eq(schema.projectTable.id, ids.a)))
    const gone = yield* repo.get(ids.a, newest.id)
    return { newest, kept, orphan, gone }
  }).pipe(Effect.provide(layer())))
  expect(out.kept).toHaveLength(PROBE_REPORTS_KEPT)
  expect(out.kept[0]!.id).toBe(out.newest.id)
  expect(out.kept.some((r) => r.name === "r0")).toBe(false)
  expect(out.orphan?.toolpathId).toBeNull()
  expect(out.gone).toBeUndefined()
})
