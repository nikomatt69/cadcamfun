import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Context, Data, Effect, Layer } from "effect"

export class KvError extends Data.TaggedError("KvError")<{ readonly operation: string; readonly cause: unknown }> {}

export interface KvEntry {
  readonly key: string
  readonly value: unknown
  readonly updatedAt: string
}

const toKvError = (operation: string) => (cause: DatabaseError) => new KvError({ operation, cause })

const isJsonValue = (value: unknown, seen = new Set<object>()): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every((item) => isJsonValue(item, seen))
  seen.delete(value)
  return valid
}

/** SQLite-backed JSON key-value repository; all access goes through the shared Database Effect service. */
export class KvStore extends Context.Service<KvStore, {
  get(key: string): Effect.Effect<KvEntry | undefined, KvError>
  set(key: string, value: unknown): Effect.Effect<KvEntry, KvError>
  delete(key: string): Effect.Effect<boolean, KvError>
  list(prefix?: string): Effect.Effect<ReadonlyArray<KvEntry>, KvError>
}>()("cadcamfun/KvStore") {
  static readonly layer = Layer.effect(KvStore, Effect.gen(function*() {
    const { query } = yield* Database
    const table = schema.localKeyValueTable

    const get = (key: string) => query("kv.get", async (db) => {
      const rows = await db.select().from(table).where(eq(table.key, key)).limit(1)
      const row = rows[0]
      return row ? { key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() } : undefined
    }).pipe(Effect.mapError(toKvError("get")))

    const set = (key: string, value: unknown) => Effect.gen(function*() {
      if (key.trim() === "" || key.length > 512) {
        return yield* Effect.fail(new KvError({ operation: "set", cause: "Key must contain 1 to 512 characters." }))
      }
      if (!isJsonValue(value)) {
        return yield* Effect.fail(new KvError({ operation: "set", cause: "Value must be JSON-compatible." }))
      }
      const now = new Date()
      const rows = yield* query("kv.set", (db) => db.insert(table).values({ key, value, updatedAt: now })
        .onConflictDoUpdate({ target: table.key, set: { value, updatedAt: now } }).returning())
        .pipe(Effect.mapError(toKvError("set")))
      const row = rows[0]
      if (!row) return yield* Effect.fail(new KvError({ operation: "set", cause: "SQLite returned no row after saving a key." }))
      return { key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() }
    })

    const remove = (key: string) => query("kv.delete", async (db) => {
      const rows = await db.delete(table).where(eq(table.key, key)).returning({ key: table.key })
      return rows.length > 0
    }).pipe(Effect.mapError(toKvError("delete")))

    const list = (prefix?: string) => query("kv.list", async (db) => {
      const rows = await db.select().from(table).orderBy(table.key)
      return rows.filter((row) => prefix === undefined || row.key.startsWith(prefix))
        .map((row) => ({ key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() }))
    }).pipe(Effect.mapError(toKvError("list")))

    return KvStore.of({ get, set, delete: remove, list })
  }))
}
