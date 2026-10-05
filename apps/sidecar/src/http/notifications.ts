import { Api, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { NotificationRepo } from "../repos/notification-repo.ts"

const fail = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const NotificationsHandlers = HttpApiBuilder.group(Api, "notifications", Effect.fn(function*(handlers) {
  const repo = yield* NotificationRepo
  return handlers
    .handle("list", ({ query }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const limit = Number.parseInt(query.limit ?? "20", 10)
      const offset = Number.parseInt(query.offset ?? "0", 10)
      if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(offset) || offset < 0) {
        return yield* new InternalError({ message: "Failed to fetch notifications" })
      }
      return yield* repo.list(user.id, { limit, offset, onlyUnread: query.onlyUnread === "true" })
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch notifications"))))
    .handle("update", ({ params, payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const notification = yield* repo.update(user.id, params.id, payload.isRead)
      if (!notification) return yield* new NotFound({ message: "Notification not found" })
      return notification
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update notification"))))
    .handle("remove", ({ params }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!(yield* repo.remove(user.id, params.id))) return yield* new NotFound({ message: "Notification not found" })
      return { message: "Notification deleted successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete notification"))))
    .handle("markAllRead", () => Effect.gen(function*() {
      const user = yield* CurrentUser
      const count = yield* repo.markAllRead(user.id)
      return { message: "All notifications marked as read", count }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to mark all notifications as read"))))
}))
