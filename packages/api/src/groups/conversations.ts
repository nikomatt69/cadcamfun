import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"

const NullStr = Schema.NullOr(Schema.String)

/** Organisation chat (legacy `conversation/*` and `organizations/:id/conversations`). */
const UserLite = Schema.Struct({ id: Schema.String, name: NullStr, image: NullStr })
const UserWithEmail = Schema.Struct({ ...UserLite.fields, email: NullStr })

/** A conversation with its participants, as creating and renaming return it. */
export const ConversationWithParticipants = Schema.Struct({
  id: Schema.String,
  name: NullStr,
  organizationId: Schema.String,
  isGroupChat: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  participants: Schema.Array(Schema.Struct({
    id: Schema.String, userId: Schema.String, conversationId: Schema.String, joinedAt: Schema.String, lastReadAt: NullStr, user: UserWithEmail
  }))
})

export const ConversationMessage = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  senderId: Schema.String,
  conversationId: Schema.String,
  fileId: NullStr,
  fileUrl: NullStr,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  sender: UserLite
})

/** One row of the organisation's conversation list: a name made from the other participants when the chat has none. */
export const ConversationListItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  isGroupChat: Schema.Boolean,
  lastMessage: Schema.NullOr(Schema.Struct({ id: Schema.String, content: Schema.String, createdAt: Schema.String, senderId: Schema.String, sender: UserLite })),
  messageCount: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  participants: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, image: NullStr, joinedAt: Schema.String })),
  lastReadAt: NullStr
})
export const ConversationPage = Schema.Struct({
  conversations: Schema.Array(ConversationListItem),
  pagination: Schema.Struct({ total: Schema.Number, page: Schema.Number, limit: Schema.Number, pages: Schema.Number, hasMore: Schema.Boolean })
})

export const ConversationDetail = Schema.Struct({
  id: Schema.String,
  name: NullStr,
  isGroupChat: Schema.Boolean,
  organizationId: Schema.String,
  organizationName: Schema.String,
  participants: Schema.Array(Schema.Struct({ ...UserWithEmail.fields, joinedAt: Schema.String, lastReadAt: NullStr })),
  createdAt: Schema.String,
  updatedAt: Schema.String
})

/** `participantIds` is optional in the schema so that a missing one answers with the legacy 400 text. */
export const ConversationCreateBody = Schema.Struct({
  name: Schema.optional(NullStr),
  participantIds: Schema.optional(Schema.Array(Schema.String)),
  isGroupChat: Schema.optional(Schema.Boolean)
})
export const ConversationPatchBody = Schema.Struct({ name: Schema.optional(NullStr) })
export const MessageBody = Schema.Struct({ content: Schema.optional(Schema.String), fileId: Schema.optional(NullStr), fileUrl: Schema.optional(NullStr) })
export const MessagePage = Schema.Struct({ messages: Schema.Array(ConversationMessage), hasMore: Schema.Boolean, nextCursor: NullStr })

const id = { id: Schema.String }

export class ConversationsGroup extends HttpApiGroup.make("conversations")
  .add(
    HttpApiEndpoint.get("list", "/api/organizations/:id/conversations", {
      params: id, query: { page: Schema.optional(Schema.String), limit: Schema.optional(Schema.String) },
      success: ConversationPage, error: [BadRequest, Forbidden, InternalError]
    }),
    // A direct chat that exists already is returned as is: it answers 201 like a new one (one success schema per endpoint).
    HttpApiEndpoint.post("create", "/api/organizations/:id/conversations", {
      params: id, payload: ConversationCreateBody, success: ConversationWithParticipants.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, Forbidden, InternalError]
    }),
    // Reading a conversation marks it read for the caller.
    HttpApiEndpoint.get("get", "/api/conversation/:id", { params: id, success: ConversationDetail, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.patch("rename", "/api/conversation/:id", {
      params: id, payload: ConversationPatchBody, success: ConversationWithParticipants, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("messages", "/api/conversation/:id/messages", {
      params: id, query: { cursor: Schema.optional(Schema.String), limit: Schema.optional(Schema.String) },
      success: MessagePage, error: [BadRequest, Forbidden, InternalError]
    }),
    HttpApiEndpoint.post("send", "/api/conversation/:id/messages", {
      params: id, payload: MessageBody, success: ConversationMessage.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, Forbidden, InternalError]
    }),
    HttpApiEndpoint.post("read", "/api/conversation/:id/read", { params: id, success: Schema.Struct({ success: Schema.Literal(true) }), error: [BadRequest, Forbidden, InternalError] })
  )
{}
