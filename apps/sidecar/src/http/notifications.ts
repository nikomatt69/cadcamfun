import { Api, BadRequest, CurrentUser, InternalError, MAX_NOTIFICATION_PAGE, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { decodeCursor, NotificationRepo } from "../repos/notification-repo.ts"

const fail = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

/** A non-negative decimal integer; `parseInt` would accept `"5abc"` and `"1e3"`. */
const integer = (value: string | undefined, fallback: number): number | undefined =>
  value === undefined ? fallback : /^\d{1,9}$/.test(value) ? Number(value) : undefined

/** Largest offset accepted; a deeper page is reached with `cursor`, which does not rescan every skipped row. */
const MAX_OFFSET = 10_000

export const NotificationsHandlers = HttpApiBuilder.group(Api, "notifications", Effect.fn(function*(handlers) {
  const repo = yield* NotificationRepo
  return handlers
    .handle("list", ({ query }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const limit = integer(query.limit, 20)
      const offset = integer(query.offset, 0)
      if (limit === undefined || limit < 1 || limit > MAX_NOTIFICATION_PAGE) return yield* new BadRequest({ message: `limit must be an integer from 1 to ${MAX_NOTIFICATION_PAGE}` })
      if (offset === undefined || offset > MAX_OFFSET) return yield* new BadRequest({ message: `offset must be an integer from 0 to ${MAX_OFFSET}` })
      if (query.onlyUnread !== undefined && query.onlyUnread !== "true" && query.onlyUnread !== "false") return yield* new BadRequest({ message: "onlyUnread must be true or false" })
      const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
      if (query.cursor !== undefined && !after) return yield* new BadRequest({ message: "cursor is not one this server issued" })
      if (after && offset > 0) return yield* new BadRequest({ message: "Use either cursor or offset, not both" })
      return yield* repo.list(user.id, { limit, offset, onlyUnread: query.onlyUnread === "true", after })
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
