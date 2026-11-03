import { Forbidden, OrganizationDetails, OrganizationMembership, OrganizationRow, OrganizationSummary } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, asc, count, eq, or, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { LiveEvents } from "../services/live-events.ts"

type Input = typeof import("@cadcamfun/api").OrganizationBody.Type
const row = (value: typeof schema.organizationTable.$inferSelect) => Schema.decodeUnknownSync(OrganizationRow)({
  ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString()
})

type Role = "ADMIN" | "MANAGER" | "MEMBER"
export type Membership = typeof OrganizationMembership.Type

export class OrganizationRepo extends Context.Service<OrganizationRepo, {
  list(userId: string): Effect.Effect<ReadonlyArray<typeof OrganizationSummary.Type>, DatabaseError>
  create(userId: string, input: Input): Effect.Effect<typeof OrganizationRow.Type, DatabaseError>
  get(userId: string, id: string): Effect.Effect<typeof OrganizationDetails.Type | undefined, DatabaseError | Forbidden>
  update(userId: string, id: string, input: Input, base?: string): Effect.Effect<typeof OrganizationRow.Type | "conflict" | undefined, DatabaseError | Forbidden>
  remove(userId: string, id: string): Effect.Effect<void, DatabaseError | Forbidden>
  /** The user's role in the organisation, `undefined` when they are no member. */
  membership(userId: string, organizationId: string): Effect.Effect<Role | undefined, DatabaseError>
  /** Members with their user, by name; `search` matches name or e-mail. */
  members(organizationId: string, search?: string): Effect.Effect<Membership[], DatabaseError>
  member(organizationId: string, userId: string): Effect.Effect<Membership | undefined, DatabaseError>
  setRole(organizationId: string, userId: string, role: Role): Effect.Effect<Membership | undefined, DatabaseError>
  removeMember(organizationId: string, userId: string): Effect.Effect<void, DatabaseError>
  adminCount(organizationId: string): Effect.Effect<number, DatabaseError>
  /** The user with this e-mail is a member already. */
  isMemberByEmail(organizationId: string, email: string): Effect.Effect<boolean, DatabaseError>
  name(organizationId: string): Effect.Effect<string | undefined, DatabaseError>
  /** Joins the organisation the invitation (by token) is for; the invitation is used up in the same transaction. */
  acceptInvitation(userId: string, token: string): Effect.Effect<
    { _tag: "joined"; organization: { id: string; name: string } } | { _tag: "no-user" | "not-found" | "expired" | "wrong-user" | "already-member" },
    DatabaseError
  >
  /** One open invitation per e-mail and organisation: a repeated invite renews role, token and expiry. */
  invite(organizationId: string, email: string, role: Role, token: string, expiresAt: Date): Effect.Effect<{ id: string; email: string; role: Role; expiresAt: string; renewed: boolean }, DatabaseError>
}>()("cadcamfun/OrganizationRepo") {
  static readonly layer = Layer.effect(OrganizationRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const events = yield* LiveEvents
    const changed = (userId: string, organizationId: string) =>
      events.publish({ type: "organizations.changed", userId, organizationId, at: new Date().toISOString() })
    const O = schema.organizationTable
    const M = schema.userOrganizationTable
    const role = Effect.fn("OrganizationRepo.role")(function*(userId: string, id: string) {
      const [membership] = yield* query("organizations.role", (db) => db.select().from(M)
        .where(and(eq(M.userId, userId), eq(M.organizationId, id))).limit(1))
      if (!membership) return yield* new Forbidden({ message: "You are not a member of this organization" })
      return membership.role
    })
    const U = schema.userTable
    const I = schema.organizationInvitationTable
    const membershipRow = (r: { m: typeof M.$inferSelect; user: { id: string; name: string | null; email: string | null; image: string | null } }): Membership =>
      ({ id: r.m.id, userId: r.m.userId, organizationId: r.m.organizationId, role: r.m.role, joinedAt: r.m.joinedAt.toISOString(), user: r.user })
    const userRef = { id: U.id, name: U.name, email: U.email, image: U.image }
    return OrganizationRepo.of({
      membership: (userId, organizationId) => query("organizations.membership", async (db) =>
        (await db.select({ role: M.role }).from(M).where(and(eq(M.userId, userId), eq(M.organizationId, organizationId))).limit(1))[0]?.role),
      members: (organizationId, search) => query("organizations.members", async (db) => {
        // `like` is case-insensitive for ASCII in SQLite; `%` and `_` typed by the user are matched literally.
        const needle = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : undefined
        const rows = await db.select({ m: M, user: userRef }).from(M).innerJoin(U, eq(M.userId, U.id))
          .where(and(eq(M.organizationId, organizationId), needle ? or(sql`${U.name} like ${needle} escape '\\'`, sql`${U.email} like ${needle} escape '\\'`) : undefined))
          .orderBy(asc(U.name))
        return rows.map(membershipRow)
      }),
      member: (organizationId, userId) => query("organizations.member", async (db) => {
        const [r] = await db.select({ m: M, user: userRef }).from(M).innerJoin(U, eq(M.userId, U.id))
          .where(and(eq(M.organizationId, organizationId), eq(M.userId, userId))).limit(1)
        return r ? membershipRow(r) : undefined
      }),
      setRole: (organizationId, userId, role) => query("organizations.setRole", async (db) => {
        await db.update(M).set({ role }).where(and(eq(M.organizationId, organizationId), eq(M.userId, userId)))
        const [r] = await db.select({ m: M, user: userRef }).from(M).innerJoin(U, eq(M.userId, U.id))
          .where(and(eq(M.organizationId, organizationId), eq(M.userId, userId))).limit(1)
        return r ? membershipRow(r) : undefined
      }).pipe(Effect.tap(() => changed(userId, organizationId))),
      removeMember: (organizationId, userId) => query("organizations.removeMember", async (db) => {
        await db.delete(M).where(and(eq(M.organizationId, organizationId), eq(M.userId, userId)))
      }).pipe(Effect.tap(() => changed(userId, organizationId))),
      adminCount: (organizationId) => query("organizations.adminCount", async (db) =>
        (await db.select({ n: count() }).from(M).where(and(eq(M.organizationId, organizationId), eq(M.role, "ADMIN"))))[0]?.n ?? 0),
      isMemberByEmail: (organizationId, email) => query("organizations.isMemberByEmail", async (db) =>
        (await db.select({ id: M.id }).from(M).innerJoin(U, eq(M.userId, U.id)).where(and(eq(M.organizationId, organizationId), eq(U.email, email))).limit(1)).length > 0),
      name: (organizationId) => query("organizations.name", async (db) =>
        (await db.select({ name: O.name }).from(O).where(eq(O.id, organizationId)).limit(1))[0]?.name),
      acceptInvitation: (userId, token) => query("organizations.acceptInvitation", (db) => db.transaction((tx) => {
        const user = tx.select({ email: U.email }).from(U).where(eq(U.id, userId)).get()
        if (!user) return { _tag: "no-user" as const }
        const invitation = tx.select().from(I).where(eq(I.token, token)).get()
        if (!invitation) return { _tag: "not-found" as const }
        if (Date.now() > invitation.expiresAt.getTime()) return { _tag: "expired" as const }
        if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) return { _tag: "wrong-user" as const }
        if (tx.select({ id: M.id }).from(M).where(and(eq(M.userId, userId), eq(M.organizationId, invitation.organizationId))).get()) return { _tag: "already-member" as const }
        tx.insert(M).values({ userId, organizationId: invitation.organizationId, role: invitation.role }).run()
        tx.delete(I).where(eq(I.id, invitation.id)).run()
        const organization = tx.select({ id: O.id, name: O.name }).from(O).where(eq(O.id, invitation.organizationId)).get()
        return { _tag: "joined" as const, organization: organization ?? { id: invitation.organizationId, name: "" } }
      })).pipe(Effect.tap((outcome) => outcome._tag === "joined" ? changed(userId, outcome.organization.id) : Effect.void)),
      invite: (organizationId, email, role, token, expiresAt) => query("organizations.invite", (db) => db.transaction((tx) => {
        const existing = tx.select().from(I).where(and(eq(I.organizationId, organizationId), eq(I.email, email))).get()
        const saved = existing
          ? tx.update(I).set({ role, token, expiresAt }).where(eq(I.id, existing.id)).returning().get()
          : tx.insert(I).values({ email, role, token, organizationId, expiresAt }).returning().get()
        if (!saved) throw new Error("Invitation was not saved")
        return { id: saved.id, email: saved.email, role: saved.role, expiresAt: saved.expiresAt.toISOString(), renewed: existing !== undefined }
      })),
      list: Effect.fn("OrganizationRepo.list")(function*(userId) {
        return yield* query("organizations.list", async (db) => {
          const organizations = await db.select({ organization: O, role: M.role }).from(M)
            .innerJoin(O, eq(M.organizationId, O.id)).where(eq(M.userId, userId))
          return Promise.all(organizations.map(async ({ organization, role }) => {
            const [users] = await db.select({ n: count() }).from(M).where(eq(M.organizationId, organization.id))
            const [projects] = await db.select({ n: count() }).from(schema.projectTable)
              .where(eq(schema.projectTable.organizationId, organization.id))
            return Schema.decodeUnknownSync(OrganizationSummary)({ ...row(organization), role,
              userCount: users?.n ?? 0, projectCount: projects?.n ?? 0 })
          }))
        })
      }),
      create: Effect.fn("OrganizationRepo.create")(function*(userId, input) {
        const created = yield* query("organizations.create", (db) => db.transaction((tx) => {
          const organization = tx.insert(O).values({ name: input.name, description: input.description ?? null }).returning().get()
          tx.insert(M).values({ userId, organizationId: organization.id, role: "ADMIN" }).run()
          return row(organization)
        }))
        yield* changed(userId, created.id)
        return created
      }),
      get: Effect.fn("OrganizationRepo.get")(function*(userId, id) {
        const userRole = yield* role(userId, id)
        return yield* query("organizations.get", async (db) => {
          const [organization] = await db.select().from(O).where(eq(O.id, id)).limit(1)
          if (!organization) return undefined
          const members = await db.select({ id: schema.userTable.id, name: schema.userTable.name,
            email: schema.userTable.email, image: schema.userTable.image, role: M.role, joinedAt: M.joinedAt })
            .from(M).innerJoin(schema.userTable, eq(M.userId, schema.userTable.id)).where(eq(M.organizationId, id))
          const [projects] = await db.select({ n: count() }).from(schema.projectTable).where(eq(schema.projectTable.organizationId, id))
          return Schema.decodeUnknownSync(OrganizationDetails)({ ...row(organization), userRole,
            projectCount: projects?.n ?? 0, members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })) })
        })
      }),
      update: Effect.fn("OrganizationRepo.update")(function*(userId, id, input, base) {
        if ((yield* role(userId, id)) === "MEMBER") {
          return yield* new Forbidden({ message: "You do not have permission to update this organization" })
        }
        const updated = yield* query("organizations.update", async (db) => {
          // With `base` the check and the write are one transaction: nobody's save is overwritten.
          const outcome = db.transaction((tx) => {
            const current = tx.select().from(O).where(eq(O.id, id)).get()
            if (!current) return undefined
            if (base !== undefined && current.updatedAt.toISOString() !== base) return "conflict" as const
            return tx.update(O).set({ name: input.name, description: input.description, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) })
              .where(eq(O.id, id)).returning().get()
          })
          return outcome === undefined ? undefined : outcome === "conflict" ? outcome : row(outcome)
        })
        if (updated && updated !== "conflict") yield* changed(userId, id)
        return updated
      }),
      remove: Effect.fn("OrganizationRepo.remove")(function*(userId, id) {
        if ((yield* role(userId, id)) !== "ADMIN") return yield* new Forbidden({ message: "Only admins can delete an organization" })
        yield* query("organizations.remove", async (db) => { await db.delete(O).where(eq(O.id, id)) })
        yield* changed(userId, id)
      })
    })
  })).pipe(Layer.provide(LiveEvents.layer))
}
