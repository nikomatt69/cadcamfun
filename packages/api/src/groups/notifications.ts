import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError, NotFound } from "../errors.ts"

const nullable = Schema.NullOr(Schema.String)
export const NotificationRow = Schema.Struct({
  id: Schema.String, type: Schema.Literals(["NEW_MESSAGE", "PROJECT_CREATED", "COMPONENT_CREATED", "MEMBER_JOINED", "ORGANIZATION_INVITATION", "PR_OPENED", "PR_MERGED", "PR_REVIEWED", "AI_COMMITTED", "WORKFLOW_FAILED", "WORKFLOW_PASSED"]),
  title: Schema.String, content: Schema.String, isRead: Schema.Boolean, createdAt: Schema.String,
  userId: Schema.String, organizationId: nullable, projectId: nullable, componentId: nullable, messageId: nullable, linkUrl: nullable
})
export const NotificationUpdate = Schema.Struct({ isRead: Schema.Boolean })
const id = { id: Schema.String }
export class NotificationsGroup extends HttpApiGroup.make("notifications")
  .add(
    HttpApiEndpoint.get("list", "/api/notifications", {
      query: { limit: Schema.optional(Schema.String), offset: Schema.optional(Schema.String), onlyUnread: Schema.optional(Schema.String) },
      success: Schema.Struct({ notifications: Schema.Array(NotificationRow), unreadCount: Schema.Number }), error: InternalError
    }),
    HttpApiEndpoint.put("update", "/api/notifications/:id", { params: id, payload: NotificationUpdate, success: NotificationRow, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.delete("remove", "/api/notifications/:id", { params: id, success: Schema.Struct({ message: Schema.String }), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("markAllRead", "/api/notifications/mark-all-read", { success: Schema.Struct({ message: Schema.String, count: Schema.Number }), error: InternalError })
  )
{}
