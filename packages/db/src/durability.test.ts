import { describe, expect, test } from "bun:test"
import { Effect, ManagedRuntime } from "effect"
import { Database, schema } from "./index.ts"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname

describe("hosted database acknowledgement barrier", () => {
  test("a later read waits until an earlier mutation is durable", async () => {
    let calls = 0
    let release: () => void = () => {}
    let reached: () => void = () => {}
    const entered = new Promise<void>((resolve) => { reached = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    const runtime = ManagedRuntime.make(Database.layer({ path: ":memory:", migrationsFolder, onMutation: async (snapshot) => {
      expect(snapshot().byteLength).toBeGreaterThan(0)
      if (++calls === 2) { reached(); await gate }
    } }))
    try {
      const database = await runtime.runPromise(Effect.service(Database))
      const write = runtime.runPromise(database.query("insert", (db) => db.insert(schema.userTable).values({ email: "barrier@example.test" }).run()))
      await entered
      let readCompleted = false
      const read = runtime.runPromise(database.query("read", (db) => db.select().from(schema.userTable).all())).then((rows) => { readCompleted = true; return rows })
      await Promise.resolve()
      expect(readCompleted).toBe(false)
      release()
      await write
      expect((await read)[0]?.email).toBe("barrier@example.test")
      expect(calls).toBe(2)
    } finally { release(); await runtime.dispose() }
  })

  test("failed durable publication prevents a subsequent successful project read", async () => {
    let calls = 0
    const runtime = ManagedRuntime.make(Database.layer({ path: ":memory:", migrationsFolder, onMutation: async () => { if (++calls > 1) throw new Error("R2 unavailable") } }))
    try {
      const database = await runtime.runPromise(Effect.service(Database))
      await expect(runtime.runPromise(database.query("insert", (db) => db.insert(schema.userTable).values({ email: "unconfirmed@example.test" }).run()))).rejects.toThrow()
      await expect(runtime.runPromise(database.query("read", (db) => db.select().from(schema.userTable).all()))).rejects.toThrow()
      expect(calls).toBe(2)
    } finally { await runtime.dispose() }
  })
})
