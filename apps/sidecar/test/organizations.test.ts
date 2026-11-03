import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { schema } from "@cadcamfun/db"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let orgId: string
let adminId: string
type Person = { id: string; headers: Record<string, string> }
let manager: Person
let member: Person
let stranger: Person

/** Signs a user up and in; the membership (if any) is seeded straight into the database, because joining an organisation goes through invitations. */
const person = async (email: string, name: string, role?: "ADMIN" | "MANAGER" | "MEMBER"): Promise<Person> => {
  const password = "test-password-long"
  expect((await app.call("/api/auth/signup", { method: "POST", json: { email, name, password, confirmPassword: password } })).status).toBe(201)
  const signin = await app.call("/api/auth/signin-direct", { method: "POST", json: { email, password } })
  const headers = { "x-session-token": signin.body.token }
  const id = (await app.call("/api/user/profile", { headers })).body.id
  if (role) {
    const database = await app.database()
    await app.Effect.runPromise(database.query("test.membership", (db) => db.insert(schema.userOrganizationTable).values({ userId: id, organizationId: orgId, role })))
  }
  return { id, headers }
}
const members = async (headers?: Record<string, string>) => (await app.call(`/api/organizations/${orgId}/members`, headers ? { headers } : {})).body

beforeAll(async () => {
  app = await makeApp()
  const created = await app.call("/api/organizations", { method: "POST", json: { name: "Shop" } })
  orgId = created.body.id
  adminId = (await app.call("/api/user/profile")).body.id
  manager = await person("manager@example.com", "Mia Manager", "MANAGER")
  member = await person("member@example.com", "Max Member", "MEMBER")
  stranger = await person("stranger-org@example.com", "Sam Stranger")
})
afterAll(async () => { await app.dispose() })

describe("/api/organizations/:id/members", () => {
  test("GET lists members by name, search matches name or e-mail, non-members get 403", async () => {
    const all = await members()
    expect(all.map((m: { user: { name: string } }) => m.user.name)).toEqual([...all.map((m: { user: { name: string } }) => m.user.name)].sort())
    expect(all).toHaveLength(3)
    expect(all.find((m: { userId: string }) => m.userId === manager.id)).toMatchObject({ role: "MANAGER", organizationId: orgId, user: { email: "manager@example.com" } })
    expect(Object.keys(all[0].user).sort()).toEqual(["email", "id", "image", "name"])
    expect((await app.call(`/api/organizations/${orgId}/members?search=max`)).body.map((m: { userId: string }) => m.userId)).toEqual([member.id])
    expect((await app.call(`/api/organizations/${orgId}/members?search=manager@`)).body.map((m: { userId: string }) => m.userId)).toEqual([manager.id])
    expect((await app.call(`/api/organizations/${orgId}/members?search=%25`)).body).toEqual([])
    const refused = await app.call(`/api/organizations/${orgId}/members`, { headers: stranger.headers })
    expect(refused.status).toBe(403)
    expect(refused.body.message).toBe("You are not a member of this organization")
  })

  test("PUT: staff only, a manager cannot make or change an Admin, the last Admin cannot step down", async () => {
    const put = (headers: Record<string, string> | undefined, json: unknown) => app.call(`/api/organizations/${orgId}/members`, { method: "PUT", json, ...(headers ? { headers } : {}) })
    expect((await put(member.headers, { memberId: member.id, role: "ADMIN" })).body.message).toBe("You do not have permission to update member roles")
    expect((await put(undefined, { memberId: member.id })).body.message).toBe("Member ID and role are required")
    expect((await put(undefined, { memberId: member.id, role: "OWNER" })).status).toBe(400)
    expect((await put(manager.headers, { memberId: member.id, role: "ADMIN" })).body.message).toBe("Managers cannot promote members to Admin")
    expect((await put(manager.headers, { memberId: adminId, role: "MEMBER" })).body.message).toBe("Managers cannot update Admin roles")
    expect((await put(undefined, { memberId: stranger.id, role: "MEMBER" })).status).toBe(404)
    expect((await put(undefined, { memberId: adminId, role: "MEMBER" })).body.message).toStartWith("Cannot demote the last Admin")

    const promoted = await put(undefined, { memberId: member.id, role: "MANAGER" })
    expect(promoted.status).toBe(200)
    expect(promoted.body).toMatchObject({ userId: member.id, role: "MANAGER", user: { name: "Max Member" } })
    expect((await put(manager.headers, { memberId: member.id, role: "MEMBER" })).body.role).toBe("MEMBER")
  })

  test("DELETE: staff only, a manager cannot remove an Admin, the last Admin cannot leave, then the member is gone", async () => {
    const del = (headers: Record<string, string> | undefined, json: unknown) => app.call(`/api/organizations/${orgId}/members`, { method: "DELETE", json, ...(headers ? { headers } : {}) })
    expect((await del(member.headers, { memberId: manager.id })).body.message).toBe("You do not have permission to remove members")
    expect((await del(undefined, {})).body.message).toBe("Member ID is required")
    expect((await del(undefined, { memberId: stranger.id })).status).toBe(404)
    expect((await del(manager.headers, { memberId: adminId })).body.message).toBe("Managers cannot remove Admins")
    expect((await del(undefined, { memberId: adminId })).body.message).toStartWith("Cannot remove the last Admin")

    expect((await del(manager.headers, { memberId: member.id })).body).toEqual({ message: "Member removed successfully" })
    expect((await members()).map((m: { userId: string }) => m.userId)).not.toContain(member.id)
  })
})

describe("/api/organizations/:id/invite", () => {
  const invite = (headers: Record<string, string> | undefined, json: unknown) => app.call(`/api/organizations/${orgId}/invite`, { method: "POST", json, ...(headers ? { headers } : {}) })

  test("staff only; e-mail and role are checked; a manager cannot invite an Admin; members cannot be invited again", async () => {
    expect((await invite(stranger.headers, { email: "x@example.com" })).body.message).toBe("You do not have permission to invite members")
    expect((await invite(undefined, {})).body.message).toBe("Email is required")
    expect((await invite(undefined, { email: "x@example.com", role: "OWNER" })).status).toBe(400)
    expect((await invite(manager.headers, { email: "x@example.com", role: "ADMIN" })).body.message).toBe("Managers cannot invite Admins")
    expect((await invite(undefined, { email: "Manager@Example.com" })).body.message).toBe("User is already a member of this organization")
  })

  test("a new invitation answers 201 with the link, a repeated one the same status with a fresh token and the same id", async () => {
    const first = await invite(manager.headers, { email: "New.Hire@example.com", role: "MANAGER" })
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ message: "Invitation created and sent", invitation: { email: "new.hire@example.com", role: "MANAGER" } })
    expect(first.body.inviteUrl).toMatch(/^\/invitations\/[0-9a-f]{64}$/)
    expect(Date.parse(first.body.invitation.expiresAt) - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000)

    const again = await invite(undefined, { email: "new.hire@example.com" })
    expect(again.status).toBe(201)
    expect(again.body.message).toBe("Invitation updated and sent")
    expect(again.body.invitation).toMatchObject({ id: first.body.invitation.id, role: "MEMBER" })
    expect(again.body.inviteUrl).not.toBe(first.body.inviteUrl)
  })
})

describe("/api/organizations/:id/projects", () => {
  test("members list the organisation's projects with owner and counts; creating one names the organisation; strangers get 403", async () => {
    const refused = await app.call(`/api/organizations/${orgId}/projects`, { headers: stranger.headers })
    expect(refused.status).toBe(403)
    expect((await app.call(`/api/organizations/${orgId}/projects`, { method: "POST", json: { name: "x" }, headers: stranger.headers })).status).toBe(403)
    expect((await app.call(`/api/organizations/${orgId}/projects`, { method: "POST", json: {} })).body.message).toBe("Project name is required")

    const made = await app.call(`/api/organizations/${orgId}/projects`, { method: "POST", json: { name: "Gearbox", description: "shared" }, headers: manager.headers })
    expect(made.status).toBe(201)
    expect(made.body).toMatchObject({ name: "Gearbox", description: "shared", ownerId: manager.id, organizationId: orgId })

    const list = await app.call(`/api/organizations/${orgId}/projects`)
    expect(list.body).toHaveLength(1)
    expect(list.body[0]).toMatchObject({ id: made.body.id, owner: { id: manager.id, email: "manager@example.com" }, _count: { drawings: 0, components: 0 } })
    // The other members hear about it.
    const notes = (await app.call("/api/notifications")).body
    expect(JSON.stringify(notes)).toContain("Gearbox")
  })
})

describe("/api/invitations/:token/accept", () => {
  const accept = (token: string, headers?: Record<string, string>) => app.call(`/api/invitations/${token}/accept`, { method: "POST", ...(headers ? { headers } : {}) })
  const tokenOf = (url: string) => url.replace("/invitations/", "")

  test("the invited account joins with the invited role and the invitation is used up", async () => {
    const invited = await person("guest@example.com", "Gina Guest")
    const sent = await app.call(`/api/organizations/${orgId}/invite`, { method: "POST", json: { email: "guest@example.com", role: "MANAGER" } })
    const token = tokenOf(sent.body.inviteUrl)

    expect((await accept("nope", invited.headers)).body.message).toBe("Invitation not found or has already been used")
    expect((await accept(token, stranger.headers)).body.message).toBe("You are not authorized to accept this invitation")
    const joined = await accept(token, invited.headers)
    expect(joined.status).toBe(200)
    expect(joined.body).toEqual({ message: "Invitation accepted successfully", organization: { id: orgId, name: "Shop" } })
    expect((await members()).find((m: { userId: string }) => m.userId === invited.id)).toMatchObject({ role: "MANAGER" })
    expect((await accept(token, invited.headers)).status).toBe(404)
    expect((await app.call("/api/organizations", { headers: invited.headers })).body.map((o: { id: string }) => o.id)).toContain(orgId)
  })

  test("an expired invitation is refused, and so is one for an account that is a member already", async () => {
    const late = await person("late@example.com", "Lena Late")
    const sent = await app.call(`/api/organizations/${orgId}/invite`, { method: "POST", json: { email: "late@example.com" } })
    const database = await app.database()
    await app.Effect.runPromise(database.query("test.expire", (db) => db.update(schema.organizationInvitationTable).set({ expiresAt: new Date(Date.now() - 1000) })))
    expect((await accept(tokenOf(sent.body.inviteUrl), late.headers)).body.message).toBe("Invitation has expired")

    // Seed a fresh invitation for an account that joined through another door.
    await app.Effect.runPromise(database.query("test.member", (db) => db.insert(schema.userOrganizationTable).values({ userId: late.id, organizationId: orgId, role: "MEMBER" })))
    await app.Effect.runPromise(database.query("test.invitation", (db) => db.insert(schema.organizationInvitationTable)
      .values({ email: "late@example.com", role: "MEMBER", token: "dup-token", organizationId: orgId, expiresAt: new Date(Date.now() + 60_000) })))
    expect((await accept("dup-token", late.headers)).body.message).toBe("You are already a member of this organization")
  })
})
