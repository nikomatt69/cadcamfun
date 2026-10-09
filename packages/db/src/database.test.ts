import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database, schema } from "./index.ts"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname
const run = <A, E>(eff: Effect.Effect<A, E, Database>) =>
  Effect.runPromise(eff.pipe(Effect.provide(Database.layer({ path: ":memory:", migrationsFolder }))))

describe("Database layer", () => {
  test("migrates and round-trips rows through Drizzle", () =>
    run(Effect.gen(function*() {
      const { query } = yield* Database
      const [user] = yield* query("insert user", (db) =>
        db.insert(schema.userTable).values({ email: "a@b.c", name: "Ada" }).returning())
      expect(user!.id).toBeTruthy()
      expect(user!.publicProfile).toBe(true)
      expect(user!.createdAt).toBeInstanceOf(Date)

      const [project] = yield* query("insert project", (db) =>
        db.insert(schema.projectTable).values({ name: "Bracket", ownerId: user!.id }).returning())
      const found = yield* query("select", (db) =>
        db.select().from(schema.projectTable).where(eq(schema.projectTable.id, project!.id)))
      expect(found).toHaveLength(1)
    })))

  test("foreign keys are enforced, restrict by default, cascade where declared", () =>
    run(Effect.gen(function*() {
      const { query } = yield* Database
      const orphan = yield* query("orphan", (db) =>
        db.insert(schema.projectTable).values({ name: "x", ownerId: "nope" })).pipe(Effect.flip)
      expect(orphan._tag).toBe("DatabaseError")

      const [u] = yield* query("u", (db) => db.insert(schema.userTable).values({ email: "c@d.e" }).returning())
      yield* query("p", (db) => db.insert(schema.projectTable).values({ name: "y", ownerId: u!.id }))
      yield* query("s", (db) =>
        db.insert(schema.sessionTable).values({ token: "t", userId: u!.id, expiresAt: new Date(Date.now() + 1000) }))

      // Project.ownerId has no onDelete in the original schema -> restrict.
      const blocked = yield* query("del", (db) =>
        db.delete(schema.userTable).where(eq(schema.userTable.id, u!.id))).pipe(Effect.flip)
      expect(blocked._tag).toBe("DatabaseError")

      yield* query("del project", (db) => db.delete(schema.projectTable))
      yield* query("del user", (db) => db.delete(schema.userTable).where(eq(schema.userTable.id, u!.id)))
      // Session.userId is onDelete: cascade.
      expect(yield* query("sessions", (db) => db.select().from(schema.sessionTable))).toHaveLength(0)
    })))

  test("LocalKeyValue stores JSON-compatible state by key and updates timestamps on upsert", () =>
    run(Effect.gen(function*() {
      const { query } = yield* Database
      const table = schema.localKeyValueTable
      const value = { projectId: "p1", selectedIds: ["a", "b"] }
      yield* query("kv insert", (db) => db.insert(table).values({ key: "ai.context.p1", value }))
      const [before] = yield* query("kv read", (db) => db.select().from(table).where(eq(table.key, "ai.context.p1")))
      expect(before?.value).toEqual(value)
      expect(before?.updatedAt).toBeInstanceOf(Date)

      yield* query("kv update", (db) => db.insert(table).values({ key: "ai.context.p1", value: { projectId: "p1" } })
        .onConflictDoUpdate({ target: table.key, set: { value: { projectId: "p1" }, updatedAt: new Date() } }))
      const [after] = yield* query("kv read updated", (db) => db.select().from(table).where(eq(table.key, "ai.context.p1")))
      expect(after?.value).toEqual({ projectId: "p1" })
      expect(after?.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime())
    })))
})
