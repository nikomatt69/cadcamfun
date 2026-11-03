import type { ConversationDetail, ConversationMessage, ConversationPage, ConversationWithParticipants } from "@cadcamfun/api"
import type { Db } from "@cadcamfun/db"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

const C = schema.conversationTable
const P = schema.conversationParticipantTable
const Msg = schema.messageTable
const U = schema.userTable

type Created = typeof ConversationWithParticipants.Type
type Detail = typeof ConversationDetail.Type
type Message = typeof ConversationMessage.Type
type Page = typeof ConversationPage.Type
const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** Participants of the conversations, with their user (name, image, e-mail), grouped by conversation. */
const participantsOf = async (db: Db, ids: ReadonlyArray<string>) => {
  if (ids.length === 0) return new Map<string, Array<{ p: typeof P.$inferSelect; user: { id: string; name: string | null; email: string | null; image: string | null } }>>()
  const rows = await db.select({ p: P, user: { id: U.id, name: U.name, email: U.email, image: U.image } }).from(P)
    .innerJoin(U, eq(P.userId, U.id)).where(inArray(P.conversationId, [...ids])).orderBy(P.joinedAt)
  const byConversation = new Map<string, typeof rows>()
  for (const r of rows) byConversation.set(r.p.conversationId, [...(byConversation.get(r.p.conversationId) ?? []), r])
  return byConversation
}

const withParticipants = async (db: Db, conversation: typeof C.$inferSelect): Promise<Created> => ({
  id: conversation.id, name: conversation.name, organizationId: conversation.organizationId, isGroupChat: conversation.isGroupChat,
  createdAt: conversation.createdAt.toISOString(), updatedAt: conversation.updatedAt.toISOString(),
  participants: ((await participantsOf(db, [conversation.id])).get(conversation.id) ?? []).map(({ p, user }) => ({
    id: p.id, userId: p.userId, conversationId: p.conversationId, joinedAt: p.joinedAt.toISOString(), lastReadAt: iso(p.lastReadAt), user
  }))
})

const toMessage = (m: typeof Msg.$inferSelect, sender: Message["sender"]): Message => ({
  id: m.id, content: m.content, senderId: m.senderId, conversationId: m.conversationId, fileId: m.fileId, fileUrl: m.fileUrl,
  createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString(), sender
})

export class ConversationRepo extends Context.Service<ConversationRepo, {
  /** The organisation the conversation belongs to when the user takes part in it. */
  participation(userId: string, conversationId: string): Effect.Effect<{ organizationId: string } | undefined, DatabaseError>
  /** The ids among `ids` that are members of the organisation. */
  members(organizationId: string, ids: ReadonlyArray<string>): Effect.Effect<string[], DatabaseError>
  /** The conversations of the organisation the user takes part in, newest activity first. */
  list(userId: string, organizationId: string, page: number, limit: number): Effect.Effect<Page, DatabaseError>
  /** The one-to-one conversation of exactly these two people in the organisation. */
  findDirect(organizationId: string, a: string, b: string): Effect.Effect<Created | undefined, DatabaseError>
  create(organizationId: string, creatorId: string, input: { name: string | null; isGroupChat: boolean; participantIds: ReadonlyArray<string> }): Effect.Effect<Created, DatabaseError>
  /** The conversation with its organisation and participants; `markRead` also moves the caller's `lastReadAt`. */
  detail(conversationId: string, markReadFor?: string): Effect.Effect<Detail | undefined, DatabaseError>
  /** Sets the name of a group chat; `"not-group"` for a direct chat, `undefined` when it is gone. */
  rename(conversationId: string, name: string | null): Effect.Effect<Created | "not-group" | undefined, DatabaseError>
  markRead(userId: string, conversationId: string): Effect.Effect<void, DatabaseError>
  messages(conversationId: string, cursor: string | undefined, limit: number): Effect.Effect<{ messages: Message[]; hasMore: boolean; nextCursor: string | null }, DatabaseError>
  send(conversationId: string, senderId: string, input: { content: string; fileId: string | null; fileUrl: string | null }): Effect.Effect<Message, DatabaseError>
}>()("cadcamfun/ConversationRepo") {
  static readonly layer = Layer.effect(ConversationRepo, Effect.gen(function*() {
    const { query } = yield* Database
    return ConversationRepo.of({
      participation: (userId, conversationId) => query("conversations.participation", async (db) =>
        (await db.select({ organizationId: C.organizationId }).from(P).innerJoin(C, eq(P.conversationId, C.id))
          .where(and(eq(P.userId, userId), eq(P.conversationId, conversationId))).limit(1))[0]),
      members: (organizationId, ids) => query("conversations.members", async (db) =>
        ids.length === 0 ? [] : (await db.select({ userId: schema.userOrganizationTable.userId }).from(schema.userOrganizationTable)
          .where(and(eq(schema.userOrganizationTable.organizationId, organizationId), inArray(schema.userOrganizationTable.userId, [...ids])))).map((r) => r.userId)),
      list: (userId, organizationId, page, limit) => query("conversations.list", async (db) => {
        const mine = and(eq(C.organizationId, organizationId), eq(P.userId, userId))
        const [{ n: total } = { n: 0 }] = await db.select({ n: count() }).from(C).innerJoin(P, eq(P.conversationId, C.id)).where(mine)
        const rows = await db.select({ c: C }).from(C).innerJoin(P, eq(P.conversationId, C.id)).where(mine)
          .orderBy(desc(C.updatedAt)).limit(limit).offset((page - 1) * limit)
        const ids = rows.map((r) => r.c.id)
        const participants = await participantsOf(db, ids)
        const counts = ids.length === 0 ? [] : await db.select({ id: Msg.conversationId, n: count() }).from(Msg).where(inArray(Msg.conversationId, ids)).groupBy(Msg.conversationId)
        const messageCount = new Map(counts.map((c) => [c.id, c.n]))
        const conversations = await Promise.all(rows.map(async ({ c }) => {
          const people = participants.get(c.id) ?? []
          const others = people.filter(({ p }) => p.userId !== userId).map(({ user }) => ({ name: user.name || "Unnamed User" }))
          const [last] = await db.select({ m: Msg, sender: { id: U.id, name: U.name, image: U.image } }).from(Msg).innerJoin(U, eq(Msg.senderId, U.id))
            .where(eq(Msg.conversationId, c.id)).orderBy(desc(Msg.createdAt), desc(sql`${Msg}.rowid`)).limit(1)
          return {
            id: c.id,
            name: c.name || (others.length === 1 ? others[0]!.name : others.map((o) => o.name).join(", ")),
            isGroupChat: c.isGroupChat,
            lastMessage: last ? { id: last.m.id, content: last.m.content, createdAt: last.m.createdAt.toISOString(), senderId: last.m.senderId, sender: last.sender } : null,
            messageCount: messageCount.get(c.id) ?? 0,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
            participants: people.map(({ p, user }) => ({ id: user.id, name: user.name || "Unnamed User", image: user.image, joinedAt: p.joinedAt.toISOString() })),
            lastReadAt: iso(people.find(({ p }) => p.userId === userId)?.p.lastReadAt ?? null)
          }
        }))
        return { conversations, pagination: { total, page, limit, pages: Math.ceil(total / limit), hasMore: (page - 1) * limit + limit < total } }
      }),
      findDirect: (organizationId, a, b) => query("conversations.findDirect", async (db) => {
        const candidates = await db.select({ c: C }).from(C).innerJoin(P, eq(P.conversationId, C.id))
          .where(and(eq(C.organizationId, organizationId), eq(C.isGroupChat, false), eq(P.userId, a))).orderBy(desc(C.updatedAt))
        const participants = await participantsOf(db, candidates.map((r) => r.c.id))
        const wanted = new Set([a, b])
        const hit = candidates.find(({ c }) => {
          const ids = new Set((participants.get(c.id) ?? []).map(({ p }) => p.userId))
          return ids.size === wanted.size && [...wanted].every((id) => ids.has(id))
        })
        return hit ? withParticipants(db, hit.c) : undefined
      }),
      create: (organizationId, creatorId, input) => query("conversations.create", async (db) => {
        const created = db.transaction((tx) => {
          const conversation = tx.insert(C).values({ name: input.isGroupChat ? input.name : null, isGroupChat: input.isGroupChat, organizationId }).returning().get()
          for (const userId of new Set([creatorId, ...input.participantIds])) tx.insert(P).values({ userId, conversationId: conversation.id }).run()
          return conversation
        })
        return withParticipants(db, created)
      }),
      detail: (conversationId, markReadFor) => query("conversations.detail", async (db) => {
        const [hit] = await db.select({ c: C, organizationName: schema.organizationTable.name }).from(C)
          .innerJoin(schema.organizationTable, eq(C.organizationId, schema.organizationTable.id)).where(eq(C.id, conversationId)).limit(1)
        if (!hit) return undefined
        // The caller's own `lastReadAt` in the answer is the value *before* this read, as legacy returned it.
        const people = (await participantsOf(db, [conversationId])).get(conversationId) ?? []
        if (markReadFor) await db.update(P).set({ lastReadAt: new Date() }).where(and(eq(P.userId, markReadFor), eq(P.conversationId, conversationId)))
        return {
          id: hit.c.id, name: hit.c.name, isGroupChat: hit.c.isGroupChat, organizationId: hit.c.organizationId, organizationName: hit.organizationName,
          participants: people.map(({ p, user }) => ({ ...user, joinedAt: p.joinedAt.toISOString(), lastReadAt: iso(p.lastReadAt) })),
          createdAt: hit.c.createdAt.toISOString(), updatedAt: hit.c.updatedAt.toISOString()
        }
      }),
      rename: (conversationId, name) => query("conversations.rename", async (db) => {
        const [found] = await db.select().from(C).where(eq(C.id, conversationId)).limit(1)
        if (!found) return undefined
        if (!found.isGroupChat) return "not-group" as const
        const [updated] = await db.update(C).set({ name, updatedAt: new Date() }).where(eq(C.id, conversationId)).returning()
        return withParticipants(db, updated!)
      }),
      markRead: (userId, conversationId) => query("conversations.markRead", async (db) => {
        await db.update(P).set({ lastReadAt: new Date() }).where(and(eq(P.userId, userId), eq(P.conversationId, conversationId)))
      }),
      messages: (conversationId, cursor, limit) => query("conversations.messages", async (db) => {
        // Newest first, ties on the millisecond broken by insertion order; the cursor is the id of the oldest message of the previous page.
        const order = [desc(Msg.createdAt), desc(sql`${Msg}.rowid`)]
        let before = undefined
        if (cursor) {
          const [at] = await db.select({ createdAt: Msg.createdAt, rowid: sql<number>`${Msg}.rowid` }).from(Msg).where(and(eq(Msg.id, cursor), eq(Msg.conversationId, conversationId))).limit(1)
          if (at) before = or(lt(Msg.createdAt, at.createdAt), and(eq(Msg.createdAt, at.createdAt), sql`${Msg}.rowid < ${at.rowid}`))
        }
        const rows = await db.select({ m: Msg, sender: { id: U.id, name: U.name, image: U.image } }).from(Msg).innerJoin(U, eq(Msg.senderId, U.id))
          .where(and(eq(Msg.conversationId, conversationId), before)).orderBy(...order).limit(limit + 1)
        const hasMore = rows.length > limit
        const page = (hasMore ? rows.slice(0, limit) : rows).reverse()
        return { messages: page.map((r) => toMessage(r.m, r.sender)), hasMore, nextCursor: hasMore ? page[0]!.m.id : null }
      }),
      send: (conversationId, senderId, input) => query("conversations.send", async (db) => db.transaction((tx) => {
        const row = tx.insert(Msg).values({ content: input.content, senderId, conversationId, fileId: input.fileId, fileUrl: input.fileUrl }).returning().get()
        tx.update(C).set({ updatedAt: new Date() }).where(eq(C.id, conversationId)).run()
        const sender = tx.select({ id: U.id, name: U.name, image: U.image }).from(U).where(eq(U.id, senderId)).get()
        return toMessage(row, sender ?? { id: senderId, name: null, image: null })
      }))
    })
  }))
}
