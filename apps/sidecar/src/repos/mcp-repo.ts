/**
 * Rows of the legacy `MCPServerConfig` table behind `/api/mcp/config*`.
 *
 * The legacy collection route wrote to three different places (the in-memory Claude
 * registry, Prisma, and a config file); v6 keeps one local registry — these rows — and
 * the three `?source=` variants differ only in their envelope, so the HTTP layer can
 * keep the legacy wire format.
 */
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import type { McpServerEntry } from "@cadcamfun/api"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"

type DbRow = typeof schema.mCPServerConfigTable.$inferSelect
type DbValues = Partial<typeof schema.mCPServerConfigTable.$inferInsert>

const toEntry = (row: DbRow): McpServerEntry => ({
  id: row.id,
  name: row.name,
  type: row.type,
  url: row.url,
  command: row.command,
  args: row.args ?? null,
  workingDirectory: row.workingDirectory,
  enabled: row.enabled,
  userId: row.userId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
})

export class McpRepo extends Context.Service<McpRepo, {
  /** Every server of the local profile, the legacy `findMany({ where: { userId } })`. */
  list(userId: string): Effect.Effect<ReadonlyArray<McpServerEntry>, DatabaseError>
  /** `findUnique({ where: { id } })`: the `:id` routes never checked ownership, and do not now. */
  find(id: string): Effect.Effect<McpServerEntry | undefined, DatabaseError>
  findByName(userId: string, name: string): Effect.Effect<McpServerEntry | undefined, DatabaseError>
  create(userId: string, values: DbValues & { id?: string; name: string }): Effect.Effect<McpServerEntry, DatabaseError>
  update(id: string, values: DbValues): Effect.Effect<McpServerEntry | undefined, DatabaseError>
  remove(id: string): Effect.Effect<boolean, DatabaseError>
  /** Config file import: drop the profile's servers, insert the given ones, return how many landed. */
  replaceAll(userId: string, entries: ReadonlyArray<DbValues & { id: string; name: string }>): Effect.Effect<number, DatabaseError>
}>()("cadcamfun/McpRepo") {
  static readonly layer = Layer.effect(McpRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const events = yield* LiveEvents
    const T = schema.mCPServerConfigTable
    const one = async (db: Parameters<Parameters<typeof query>[1]>[0], id: string) => {
      const [row] = await db.select().from(T).where(eq(T.id, id)).limit(1)
      return row === undefined ? undefined : toEntry(row)
    }
    return McpRepo.of({
      list: (userId) => query("mcp.list", async (db) =>
        (await db.select().from(T).where(eq(T.userId, userId))).map(toEntry)),
      find: (id) => query("mcp.find", (db) => one(db, id)),
      findByName: (userId, name) => query("mcp.findByName", async (db) => {
        const [row] = await db.select().from(T).where(eq(T.name, name)).limit(1)
        return row === undefined || row.userId !== userId ? undefined : toEntry(row)
      }),
      create: (userId, values) => query("mcp.create", async (db) => {
        const [row] = await db.insert(T).values({ ...values, userId }).returning()
        if (row === undefined) throw new Error("insert produced no row")
        return { entry: toEntry(row), userId: row.userId }
      }).pipe(Effect.tap(({ userId: owner }) => owner ? events.resourcesChanged(owner) : Effect.void), Effect.map(({ entry }) => entry)),
      update: (id, values) => query("mcp.update", async (db) => {
        const [row] = await db.update(T).set(values).where(eq(T.id, id)).returning()
        return row === undefined ? undefined : { entry: toEntry(row), userId: row.userId }
      }).pipe(
        Effect.tap((found) => found?.userId ? events.resourcesChanged(found.userId) : Effect.void),
        Effect.map((found) => found?.entry)
      ),
      remove: (id) => query("mcp.remove", async (db) => {
        const rows = await db.delete(T).where(eq(T.id, id)).returning({ userId: T.userId })
        return rows[0]
      }).pipe(
        Effect.tap((removed) => removed?.userId ? events.resourcesChanged(removed.userId) : Effect.void),
        Effect.map((removed) => removed !== undefined)
      ),
      // The sync driver rejects an async callback, so the whole swap runs inside one
      // synchronous transaction: drop the profile's rows, insert the imported ones.
      replaceAll: (userId, entries) => query("mcp.replaceAll", (db) => db.transaction((tx) => {
        tx.delete(T).where(eq(T.userId, userId)).run()
        for (const entry of entries) tx.insert(T).values({ ...entry, userId }).run()
        return entries.length
      })).pipe(Effect.tap(() => events.resourcesChanged(userId)))
    })
  })).pipe(Layer.provide(LiveEvents.layer))
}
