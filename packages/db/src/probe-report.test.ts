import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database, schema } from "./index.ts"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname
const run = <A, E>(eff: Effect.Effect<A, E, Database>) =>
  Effect.runPromise(eff.pipe(Effect.provide(Database.layer({ path: ":memory:", migrationsFolder }))))

/** Spec 73: a probe report keeps its JSON, survives its toolpath (set null) and goes with its project (cascade). */
test("ProbeReport round-trips data, outlives its toolpath and is removed with its project", () =>
  run(Effect.gen(function*() {
    const { query } = yield* Database
    const [user] = yield* query("user", (db) => db.insert(schema.userTable).values({ email: "probe@example.com" }).returning())
    const [project] = yield* query("project", (db) => db.insert(schema.projectTable).values({ name: "Plate", ownerId: user!.id }).returning())
    const [toolpath] = yield* query("toolpath", (db) =>
      db.insert(schema.toolpathTable).values({ name: "Probe bore", projectId: project!.id, createdBy: user!.id }).returning())
    const data = { verdict: "pass", operations: [{ index: 0, cycle: "bore", measured: [{ label: "diameter", value: 20.004, nominal: 20, verdict: "pass" }] }] }
    const [report] = yield* query("report", (db) => db.insert(schema.probeReportTable).values({
      projectId: project!.id, toolpathId: toolpath!.id, name: "Bore check", kind: "part", source: "simulated", verdict: "pass",
      workOffset: "G54", programHash: "abc", data, createdById: user!.id,
    }).returning())
    expect(report!.data).toEqual(data)
    expect(report!.measuredAt).toBeInstanceOf(Date)

    yield* query("drop toolpath", (db) => db.delete(schema.toolpathTable).where(eq(schema.toolpathTable.id, toolpath!.id)))
    const [kept] = yield* query("kept", (db) => db.select().from(schema.probeReportTable))
    expect(kept!.toolpathId).toBeNull()

    yield* query("drop project", (db) => db.delete(schema.projectTable).where(eq(schema.projectTable.id, project!.id)))
    expect(yield* query("gone", (db) => db.select().from(schema.probeReportTable))).toHaveLength(0)
  })))
