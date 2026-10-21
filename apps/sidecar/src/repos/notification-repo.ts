import { NotificationRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, count, desc, eq, lt, or } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { LiveEvents } from "../services/live-events.ts"

const row = (value: typeof schema.notificationTable.$inferSelect) =>
  Schema.decodeUnknownSync(NotificationRow)({ ...value, createdAt: value.createdAt.toISOString() })

/** Position after a row in the feed's order (newest first, id breaking ties). Opaque to clients. */
export interface NotificationCursor {
  readonly createdAt: number
  readonly id: string
}

export const encodeCursor = (cursor: NotificationCursor): string => Buffer.from(`${cursor.createdAt}:${cursor.id}`, "utf8").toString("base64url")

export const decodeCursor = (value: string): NotificationCursor | undefined => {
  if (value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined
  const text = Buffer.from(value, "base64url").toString("utf8")
  const split = text.indexOf(":")
  const createdAt = Number(text.slice(0, split))
  const id = text.slice(split + 1)
  if (split <= 0 || !Number.isSafeInteger(createdAt) || createdAt < 0 || id.length === 0) return undefined
  return { createdAt, id }
}

export class NotificationRepo extends Context.Service<NotificationRepo, {
  list(userId: string, options: { limit: number; offset: number; onlyUnread: boolean; after?: NotificationCursor | undefined }): Effect.Effect<{
    notifications: ReadonlyArray<typeof NotificationRow.Type>; unreadCount: number; nextCursor: string | null
  }, DatabaseError>
  update(userId: string, id: string, isRead: boolean): Effect.Effect<typeof NotificationRow.Type | undefined, DatabaseError>
  remove(userId: string, id: string): Effect.Effect<boolean, DatabaseError>
  markAllRead(userId: string): Effect.Effect<number, DatabaseError>
}>()("cadcamfun/NotificationRepo") {
  static readonly layer = Layer.effect(NotificationRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const events = yield* LiveEvents
    const T = schema.notificationTable
    const own = (userId: string, id: string) => and(eq(T.userId, userId), eq(T.id, id))
    return NotificationRepo.of({
      list: Effect.fn("NotificationRepo.list")(function*(userId, options) {
        return yield* query("notifications.list", async (db) => {
          const after = options.after
            ? or(lt(T.createdAt, new Date(options.after.createdAt)), and(eq(T.createdAt, new Date(options.after.createdAt)), lt(T.id, options.after.id)))
            : undefined
          // One row past the page says whether there is a next one without a second count query.
          const rows = await db.select().from(T).where(and(eq(T.userId, userId), options.onlyUnread ? eq(T.isRead, false) : undefined, after))
            .orderBy(desc(T.createdAt), desc(T.id)).limit(options.limit + 1).offset(options.offset)
          const page = rows.slice(0, options.limit)
          const last = page.at(-1)
          const nextCursor = rows.length > options.limit && last ? encodeCursor({ createdAt: last.createdAt.getTime(), id: last.id }) : null
          const [unread] = await db.select({ n: count() }).from(T).where(and(eq(T.userId, userId), eq(T.isRead, false)))
          return { notifications: page.map(row), unreadCount: unread?.n ?? 0, nextCursor }
        })
      }),
      update: Effect.fn("NotificationRepo.update")(function*(userId, id, isRead) {
        const updated = yield* query("notifications.update", async (db) => {
          const [found] = await db.update(T).set({ isRead }).where(own(userId, id)).returning()
          return found ? row(found) : undefined
        })
        if (updated) yield* events.publish({ type: "notification.updated", notification: updated, at: new Date().toISOString() })
        return updated
      }),
      remove: Effect.fn("NotificationRepo.remove")(function*(userId, id) {
        const removed = yield* query("notifications.remove", async (db) =>
          (await db.delete(T).where(own(userId, id)).returning({ id: T.id })).length > 0)
        if (removed) yield* events.publish({ type: "notification.deleted", notificationId: id, userId, at: new Date().toISOString() })
        return removed
      }),
      markAllRead: Effect.fn("NotificationRepo.markAllRead")(function*(userId) {
        const changed = yield* query("notifications.markAllRead", async (db) =>
          (await db.update(T).set({ isRead: true }).where(and(eq(T.userId, userId), eq(T.isRead, false))).returning({ id: T.id })).length)
        if (changed > 0) yield* events.publish({ type: "notification.readAll", userId, count: changed, at: new Date().toISOString() })
        return changed
      })
    })
  })).pipe(Layer.provide(LiveEvents.layer))
}
