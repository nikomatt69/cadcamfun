import { describe, expect, test } from "bun:test"
import { Database } from "@cadcamfun/db"
import { Effect, Exit, Layer } from "effect"
import { KvStore } from "../src/services/kv.ts"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const layer = KvStore.layer.pipe(Layer.provide(Database.layer({ path: ":memory:", migrationsFolder })))

describe("SQLite-backed KvStore", () => {
  test("round-trips JSON, filters prefixes, upserts, and deletes", async () => {
    const result = await Effect.runPromise(Effect.gen(function*() {
      const kv = yield* KvStore
      const first = yield* kv.set("ai.context.project-1", { selected: ["a", "b"] })
      const next = yield* kv.set("ai.context.project-1", { selected: ["c"] })
      yield* kv.set("ui.theme", "dark")
      const got = yield* kv.get("ai.context.project-1")
      const listed = yield* kv.list("ai.context.")
      const removed = yield* kv.delete("ui.theme")
      const missing = yield* kv.get("ui.theme")
      return { first, next, got, listed, removed, missing }
    }).pipe(Effect.provide(layer)))

    expect(result.first.value).toEqual({ selected: ["a", "b"] })
    expect(result.next.value).toEqual({ selected: ["c"] })
    expect(result.got?.value).toEqual({ selected: ["c"] })
    expect(result.listed.map((entry) => entry.key)).toEqual(["ai.context.project-1"])
    expect(result.removed).toBe(true)
    expect(result.missing).toBeUndefined()
  })

  test("rejects non-JSON values and leaves the database unchanged", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const kv = yield* KvStore
      yield* kv.set("ai.context.invalid", { nested: Number.NaN })
    }).pipe(Effect.provide(layer)))

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(JSON.stringify(exit.cause)).toContain("KvError")
  })
})
