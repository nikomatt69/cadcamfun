import { Api, BadRequest, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ConversationRepo } from "../repos/conversation-repo.ts"
import { OrganizationRepo } from "../repos/organization-repo.ts"
import { NotificationService } from "../services/notifications.ts"

const fail = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

/** `?limit=` and `?page=` the way legacy read them (`parseInt || default`), but bounded: a page is at most 100 rows. */
const bounded = (raw: string | undefined, fallback: number, max: number) => Math.min(max, Math.max(1, Number.parseInt(raw ?? "", 10) || fallback))

export const ConversationsHandlers = HttpApiBuilder.group(Api, "conversations", Effect.fn(function*(handlers) {
  const repo = yield* ConversationRepo
  const organizations = yield* OrganizationRepo
  const notifications = yield* NotificationService

  /** Only participants read or write a conversation. */
  const participant = Effect.fn("conversations.participant")(function*(conversationId: string) {
    const user = yield* CurrentUser
    const found = yield* repo.participation(user.id, conversationId)
    if (!found) return yield* new Forbidden({ message: "You are not a participant in this conversation" })
    return { user, organizationId: found.organizationId }
  })
  const member = Effect.fn("conversations.member")(function*(organizationId: string) {
    const user = yield* CurrentUser
    if (!(yield* organizations.membership(user.id, organizationId))) return yield* new Forbidden({ message: "You are not a member of this organization" })
    return user
  })

  return handlers
    .handle("list", ({ params, query }) => Effect.gen(function*() {
      const user = yield* member(params.id)
      return yield* repo.list(user.id, params.id, bounded(query.page, 1, Number.MAX_SAFE_INTEGER), bounded(query.limit, 10, 100))
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch conversations"))))
    .handle("create", ({ params, payload }) => Effect.gen(function*() {
      const user = yield* member(params.id)
      if (!payload.participantIds) return yield* new BadRequest({ message: "Participant IDs are required" })
      const isGroupChat = payload.isGroupChat ?? false
      // Only members of the organisation can be added; anyone else is dropped, as in legacy.
      const others = (yield* repo.members(params.id, payload.participantIds)).filter((id) => id !== user.id)
      if (others.length === 0) return yield* new BadRequest({ message: "No valid participants: they must be members of this organization" })
      if (!isGroupChat && payload.participantIds.length === 1) {
        const existing = yield* repo.findDirect(params.id, user.id, payload.participantIds[0]!)
        if (existing) return existing
      }
      return yield* repo.create(params.id, user.id, { name: payload.name ?? null, isGroupChat, participantIds: others })
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create conversation"))))
    .handle("get", ({ params }) => Effect.gen(function*() {
      const { user } = yield* participant(params.id)
      const conversation = yield* repo.detail(params.id, user.id)
      if (!conversation) return yield* new NotFound({ message: "Conversation not found" })
      return conversation
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch conversation"))))
    .handle("rename", ({ params, payload }) => Effect.gen(function*() {
      yield* participant(params.id)
      const renamed = yield* repo.rename(params.id, payload.name ?? null)
      if (renamed === undefined) return yield* new NotFound({ message: "Conversation not found" })
      if (renamed === "not-group") return yield* new BadRequest({ message: "Can only update group chat details" })
      return renamed
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update conversation"))))
    .handle("messages", ({ params, query }) => Effect.gen(function*() {
      yield* participant(params.id)
      return yield* repo.messages(params.id, query.cursor, bounded(query.limit, 20, 100))
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch messages"))))
    .handle("send", ({ params, payload }) => Effect.gen(function*() {
      const { user, organizationId } = yield* participant(params.id)
      if (!payload.content) return yield* new BadRequest({ message: "Message content is required" })
      const message = yield* repo.send(params.id, user.id, { content: payload.content, fileId: payload.fileId || null, fileUrl: payload.fileUrl || null })
      // The other participants are told; a failure here never fails the send.
      yield* notifications.newMessage({ messageId: message.id, senderId: user.id, conversationId: params.id, content: message.content, senderName: message.sender.name || "User", organizationId })
        .pipe(Effect.catch((e) => Effect.logError("Error creating message notifications", e)))
      return message
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create message"))))
    .handle("read", ({ params }) => Effect.gen(function*() {
      const { user } = yield* participant(params.id)
      yield* repo.markRead(user.id, params.id)
      return { success: true as const }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to mark messages as read"))))
}))
