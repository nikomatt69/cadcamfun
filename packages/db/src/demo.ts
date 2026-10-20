import { Effect } from "effect"
import { closeSync, mkdirSync, openSync } from "node:fs"
import { dirname } from "node:path"
import { Database, DatabaseError, schema } from "./index.ts"

/** A new database is safer to share than a redacted copy with unknown sensitive columns. */
export const createDemoDatabase = Effect.fn("Database.createDemo")(function*(path: string) {
  yield* Effect.try({
    try: () => {
      if (!path || path === ":memory:") throw new Error("Demo requires a new file path")
      mkdirSync(dirname(path), { recursive: true })
      closeSync(openSync(path, "wx", 0o600))
    },
    catch: (cause) => new DatabaseError({ operation: "demo.create", cause })
  })
  return yield* Effect.gen(function*() {
    const database = yield* Database
    yield* database.query("demo.seed", (db) => db.transaction((tx) => {
      const timestamp = new Date("2026-01-01T00:00:00.000Z")
      tx.insert(schema.userTable).values({
        id: "demo-user", name: "Synthetic demo", email: "demo@example.invalid",
        publicProfile: false, createdAt: timestamp, updatedAt: timestamp
      }).run()
      tx.insert(schema.projectTable).values({
        id: "demo-project", ownerId: "demo-user", name: "Synthetic example project",
        description: "Invented demonstration data. Contains no production designs or personal information.",
        createdAt: timestamp, updatedAt: timestamp
      }).run()
    }))
    return yield* database.compact()
  }).pipe(Effect.provide(Database.layer({
    path, migrationsFolder: new URL("../drizzle", import.meta.url).pathname
  })))
})
