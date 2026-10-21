import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError, NotFound } from "../errors.ts"

const nullable = Schema.NullOr(Schema.String)
export const NotificationRow = Schema.Struct({
  id: Schema.String, type: Schema.Literals(["NEW_MESSAGE", "PROJECT_CREATED", "COMPONENT_CREATED", "MEMBER_JOINED", "ORGANIZATION_INVITATION", "PR_OPENED", "PR_MERGED", "PR_REVIEWED", "AI_COMMITTED", "WORKFLOW_FAILED", "WORKFLOW_PASSED"]),
  title: Schema.String, content: Schema.String, isRead: Schema.Boolean, createdAt: Schema.String,
  userId: Schema.String, organizationId: nullable, projectId: nullable, componentId: nullable, messageId: nullable, linkUrl: nullable
})
export type NotificationRow = typeof NotificationRow.Type
export const NotificationUpdate = Schema.Struct({ isRead: Schema.Boolean })
/**
 * One page of the feed, newest first. `unreadCount` counts every unread row of the user, whatever the filter or page.
 * `nextCursor` continues after the last row (null on the last page); unlike `offset` it neither repeats nor skips a row
 * when new notifications arrive between two pages.
 */
export const NotificationPage = Schema.Struct({
  notifications: Schema.Array(NotificationRow), unreadCount: Schema.Number, nextCursor: Schema.NullOr(Schema.String)
})
export type NotificationPage = typeof NotificationPage.Type
/**
 * Notification types that also raise a native OS popup (desktop via the Tauri notification
 * plugin, phone via a local Expo notification). Every type stays in the synced feed; only
 * these interrupt. Single source shared by sidecar tests, desktop and mobile so the three
 * surfaces can never drift on what counts as important.
 */
export const NATIVE_NOTIFICATION_TYPES: ReadonlyArray<NotificationRow["type"]> = ["WORKFLOW_FAILED", "PR_OPENED", "PR_REVIEWED", "AI_COMMITTED", "ORGANIZATION_INVITATION"]
export const isNativeNotificationType = (type: string): boolean => (NATIVE_NOTIFICATION_TYPES as ReadonlyArray<string>).includes(type)
/** Largest page; a bigger `limit` is a 400, not silently clamped, so a client never mistakes a short page for the end. */
export const MAX_NOTIFICATION_PAGE = 100
const id = { id: Schema.String }
export class NotificationsGroup extends HttpApiGroup.make("notifications")
  .add(
    HttpApiEndpoint.get("list", "/api/notifications", {
      query: { limit: Schema.optional(Schema.String), offset: Schema.optional(Schema.String), cursor: Schema.optional(Schema.String), onlyUnread: Schema.optional(Schema.String) },
      success: NotificationPage, error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.put("update", "/api/notifications/:id", { params: id, payload: NotificationUpdate, success: NotificationRow, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.delete("remove", "/api/notifications/:id", { params: id, success: Schema.Struct({ message: Schema.String }), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("markAllRead", "/api/notifications/mark-all-read", { success: Schema.Struct({ message: Schema.String, count: Schema.Number }), error: InternalError })
  )
{}
