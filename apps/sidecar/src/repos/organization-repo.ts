import { Forbidden, OrganizationDetails, OrganizationRow, OrganizationSummary } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, count, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

type Input = typeof import("@cadcamfun/api").OrganizationBody.Type
const row = (value: typeof schema.organizationTable.$inferSelect) => Schema.decodeUnknownSync(OrganizationRow)({
  ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString()
})

export class OrganizationRepo extends Context.Service<OrganizationRepo, {
  list(userId: string): Effect.Effect<ReadonlyArray<typeof OrganizationSummary.Type>, DatabaseError>
  create(userId: string, input: Input): Effect.Effect<typeof OrganizationRow.Type, DatabaseError>
  get(userId: string, id: string): Effect.Effect<typeof OrganizationDetails.Type | undefined, DatabaseError | Forbidden>
  update(userId: string, id: string, input: Input): Effect.Effect<typeof OrganizationRow.Type | undefined, DatabaseError | Forbidden>
  remove(userId: string, id: string): Effect.Effect<void, DatabaseError | Forbidden>
}>()("cadcamfun/OrganizationRepo") {
  static readonly layer = Layer.effect(OrganizationRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const O = schema.organizationTable
    const M = schema.userOrganizationTable
    const role = Effect.fn("OrganizationRepo.role")(function*(userId: string, id: string) {
      const [membership] = yield* query("organizations.role", (db) => db.select().from(M)
        .where(and(eq(M.userId, userId), eq(M.organizationId, id))).limit(1))
      if (!membership) return yield* new Forbidden({ message: "You are not a member of this organization" })
      return membership.role
    })
    return OrganizationRepo.of({
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
        return yield* query("organizations.create", (db) => db.transaction((tx) => {
          const organization = tx.insert(O).values({ name: input.name, description: input.description ?? null }).returning().get()
          tx.insert(M).values({ userId, organizationId: organization.id, role: "ADMIN" }).run()
          return row(organization)
        }))
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
      update: Effect.fn("OrganizationRepo.update")(function*(userId, id, input) {
        if ((yield* role(userId, id)) === "MEMBER") {
          return yield* new Forbidden({ message: "You do not have permission to update this organization" })
        }
        return yield* query("organizations.update", async (db) => {
          const [updated] = await db.update(O).set({ name: input.name, description: input.description, updatedAt: new Date() })
            .where(eq(O.id, id)).returning()
          return updated ? row(updated) : undefined
        })
      }),
      remove: Effect.fn("OrganizationRepo.remove")(function*(userId, id) {
        if ((yield* role(userId, id)) !== "ADMIN") return yield* new Forbidden({ message: "Only admins can delete an organization" })
        yield* query("organizations.remove", async (db) => { await db.delete(O).where(eq(O.id, id)) })
      })
    })
  }))
}
