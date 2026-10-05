import { NotificationRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, count, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

const row = (value: typeof schema.notificationTable.$inferSelect) =>
  Schema.decodeUnknownSync(NotificationRow)({ ...value, createdAt: value.createdAt.toISOString() })

export class NotificationRepo extends Context.Service<NotificationRepo, {
  list(userId: string, options: { limit: number; offset: number; onlyUnread: boolean }): Effect.Effect<{
    notifications: ReadonlyArray<typeof NotificationRow.Type>; unreadCount: number
  }, DatabaseError>
  update(userId: string, id: string, isRead: boolean): Effect.Effect<typeof NotificationRow.Type | undefined, DatabaseError>
  remove(userId: string, id: string): Effect.Effect<boolean, DatabaseError>
  markAllRead(userId: string): Effect.Effect<number, DatabaseError>
}>()("cadcamfun/NotificationRepo") {
  static readonly layer = Layer.effect(NotificationRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const T = schema.notificationTable
    const own = (userId: string, id: string) => and(eq(T.userId, userId), eq(T.id, id))
    return NotificationRepo.of({
      list: Effect.fn("NotificationRepo.list")(function*(userId, options) {
        return yield* query("notifications.list", async (db) => {
          const notifications = await db.select().from(T).where(and(eq(T.userId, userId),
            options.onlyUnread ? eq(T.isRead, false) : undefined)).orderBy(desc(T.createdAt))
            .limit(options.limit).offset(options.offset)
          const [unread] = await db.select({ n: count() }).from(T).where(and(eq(T.userId, userId), eq(T.isRead, false)))
          return { notifications: notifications.map(row), unreadCount: unread?.n ?? 0 }
        })
      }),
      update: Effect.fn("NotificationRepo.update")(function*(userId, id, isRead) {
        return yield* query("notifications.update", async (db) => {
          const [updated] = await db.update(T).set({ isRead }).where(own(userId, id)).returning()
          return updated ? row(updated) : undefined
        })
      }),
      remove: Effect.fn("NotificationRepo.remove")(function*(userId, id) {
        return yield* query("notifications.remove", async (db) =>
          (await db.delete(T).where(own(userId, id)).returning({ id: T.id })).length > 0)
      }),
      markAllRead: Effect.fn("NotificationRepo.markAllRead")(function*(userId) {
        return yield* query("notifications.markAllRead", async (db) =>
          (await db.update(T).set({ isRead: true }).where(and(eq(T.userId, userId), eq(T.isRead, false))).returning({ id: T.id })).length)
      })
    })
  }))
}
