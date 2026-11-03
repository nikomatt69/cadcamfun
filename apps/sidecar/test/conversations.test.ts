import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { schema } from "@cadcamfun/db"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let orgId: string
type Person = { id: string; headers: Record<string, string> }
let me: Person
let ann: Person
let bob: Person
let outsider: Person

const person = async (email: string, name: string, member: boolean): Promise<Person> => {
  const password = "test-password-long"
  expect((await app.call("/api/auth/signup", { method: "POST", json: { email, name, password, confirmPassword: password } })).status).toBe(201)
  const signin = await app.call("/api/auth/signin-direct", { method: "POST", json: { email, password } })
  const headers = { "x-session-token": signin.body.token }
  const id = (await app.call("/api/user/profile", { headers })).body.id
  if (member) {
    const database = await app.database()
    await app.Effect.runPromise(database.query("test.membership", (db) => db.insert(schema.userOrganizationTable).values({ userId: id, organizationId: orgId, role: "MEMBER" })))
  }
  return { id, headers }
}
const as = (p: Person) => ({ headers: p.headers })
const post = (path: string, json: unknown, p?: Person) => app.call(path, { method: "POST", json, ...(p ? as(p) : {}) })

beforeAll(async () => {
  app = await makeApp()
  orgId = (await app.call("/api/organizations", { method: "POST", json: { name: "Chat shop" } })).body.id
  me = { id: (await app.call("/api/user/profile")).body.id, headers: {} }
  ann = await person("ann@example.com", "Ann Lathe", true)
  bob = await person("bob@example.com", "Bob Mill", true)
  outsider = await person("outsider@example.com", "Olga Out", false)
})
afterAll(async () => { await app.dispose() })

describe("organization conversations", () => {
  let direct: string
  let group: string

  test("creating needs a member, participant ids and at least one valid other member", async () => {
    expect((await post(`/api/organizations/${orgId}/conversations`, { participantIds: [ann.id] }, outsider)).status).toBe(403)
    expect((await post(`/api/organizations/${orgId}/conversations`, {})).body.message).toBe("Participant IDs are required")
    // A non-member is dropped; nobody valid left means nothing to talk to.
    expect((await post(`/api/organizations/${orgId}/conversations`, { participantIds: [outsider.id] })).status).toBe(400)
  })

  test("a direct chat is created once and found again, in either direction", async () => {
    const first = await post(`/api/organizations/${orgId}/conversations`, { participantIds: [ann.id] })
    expect(first.status).toBe(201)
    direct = first.body.id
    expect(first.body).toMatchObject({ isGroupChat: false, name: null, organizationId: orgId })
    expect(first.body.participants.map((p: { userId: string }) => p.userId).sort()).toEqual([me.id, ann.id].sort())
    expect((await post(`/api/organizations/${orgId}/conversations`, { participantIds: [ann.id] })).body.id).toBe(direct)
    expect((await post(`/api/organizations/${orgId}/conversations`, { participantIds: [me.id] }, ann)).body.id).toBe(direct)

    const g = await post(`/api/organizations/${orgId}/conversations`, { participantIds: [ann.id, bob.id, outsider.id], isGroupChat: true, name: "Shop floor" })
    group = g.body.id
    expect(g.body).toMatchObject({ isGroupChat: true, name: "Shop floor" })
    expect(g.body.participants).toHaveLength(3)
  })

  test("messages: content required, participants only, pages walk back from the newest with a cursor", async () => {
    expect((await post(`/api/conversation/${direct}/messages`, {})).body.message).toBe("Message content is required")
    const refused = await post(`/api/conversation/${direct}/messages`, { content: "hi" }, bob)
    expect(refused.status).toBe(403)
    expect(refused.body.message).toBe("You are not a participant in this conversation")
    expect((await app.call(`/api/conversation/${direct}/messages`, as(outsider))).status).toBe(403)

    for (const n of [1, 2, 3, 4, 5]) {
      const sent = await post(`/api/conversation/${direct}/messages`, { content: `m${n}` }, n % 2 ? undefined : ann)
      expect(sent.status).toBe(201)
      expect(sent.body).toMatchObject({ content: `m${n}`, senderId: n % 2 ? me.id : ann.id, conversationId: direct, fileId: null, fileUrl: null })
      expect(Object.keys(sent.body.sender).sort()).toEqual(["id", "image", "name"])
    }
    const newest = (await app.call(`/api/conversation/${direct}/messages?limit=2`)).body
    expect(newest.messages.map((m: { content: string }) => m.content)).toEqual(["m4", "m5"])
    expect(newest.hasMore).toBe(true)
    const older = (await app.call(`/api/conversation/${direct}/messages?limit=2&cursor=${newest.nextCursor}`)).body
    expect(older.messages.map((m: { content: string }) => m.content)).toEqual(["m2", "m3"])
    const oldest = (await app.call(`/api/conversation/${direct}/messages?limit=2&cursor=${older.nextCursor}`)).body
    expect(oldest).toMatchObject({ hasMore: false, nextCursor: null })
    expect(oldest.messages.map((m: { content: string }) => m.content)).toEqual(["m1"])
  })

  test("the list shows my chats with the other person's name, the last message, a count and a page", async () => {
    const page = (await app.call(`/api/organizations/${orgId}/conversations`)).body
    expect(page.pagination).toEqual({ total: 2, page: 1, limit: 10, pages: 1, hasMore: false })
    const row = page.conversations.find((c: { id: string }) => c.id === direct)
    expect(row).toMatchObject({ name: "Ann Lathe", isGroupChat: false, messageCount: 5, lastMessage: { content: "m5", senderId: me.id, sender: { name: expect.any(String) } }, lastReadAt: null })
    expect(page.conversations.find((c: { id: string }) => c.id === group).name).toBe("Shop floor")
    // The direct chat saw the latest message: it comes first.
    expect(page.conversations[0].id).toBe(direct)

    expect((await app.call(`/api/organizations/${orgId}/conversations?limit=1&page=2`)).body).toMatchObject({ pagination: { total: 2, page: 2, limit: 1, pages: 2, hasMore: false } })
    expect((await app.call(`/api/organizations/${orgId}/conversations`, as(outsider))).status).toBe(403)
    // Bob is not in the direct chat.
    const bobs = (await app.call(`/api/organizations/${orgId}/conversations`, as(bob))).body
    expect(bobs.conversations.map((c: { id: string }) => c.id)).toEqual([group])
  })

  test("reading a conversation, or posting to /read, moves lastReadAt; the detail names the organisation", async () => {
    const first = await app.call(`/api/conversation/${direct}`)
    expect(first.body).toMatchObject({ id: direct, organizationId: orgId, organizationName: "Chat shop", isGroupChat: false })
    expect(first.body.participants.find((p: { id: string }) => p.id === me.id).lastReadAt).toBeNull()
    expect(Object.keys(first.body.participants[0]).sort()).toEqual(["email", "id", "image", "joinedAt", "lastReadAt", "name"])
    const second = await app.call(`/api/conversation/${direct}`)
    expect(second.body.participants.find((p: { id: string }) => p.id === me.id).lastReadAt).toBeTruthy()

    expect((await post(`/api/conversation/${direct}/read`, {}, ann)).body).toEqual({ success: true })
    expect((await post(`/api/conversation/${direct}/read`, {}, bob)).status).toBe(403)
    expect((await app.call("/api/conversation/nope")).status).toBe(403)
  })

  test("only a group chat can be renamed", async () => {
    expect((await app.call(`/api/conversation/${direct}`, { method: "PATCH", json: { name: "x" } })).body.message).toBe("Can only update group chat details")
    const renamed = await app.call(`/api/conversation/${group}`, { method: "PATCH", json: { name: "Night shift" }, ...as(ann) })
    expect(renamed.status).toBe(200)
    expect(renamed.body).toMatchObject({ id: group, name: "Night shift", isGroupChat: true })
    expect((await app.call(`/api/conversation/${group}`, { method: "PATCH", json: { name: "x" }, ...as(outsider) })).status).toBe(403)
  })

  test("a message tells the other participants, not the sender", async () => {
    await post(`/api/conversation/${group}/messages`, { content: "Tool crib is open" }, bob)
    const mine = JSON.stringify((await app.call("/api/notifications")).body)
    expect(mine).toContain("Tool crib is open")
    expect(mine).toContain("Bob Mill")
    expect(JSON.stringify((await app.call("/api/notifications", as(bob))).body)).not.toContain("Tool crib is open")
  })
})
