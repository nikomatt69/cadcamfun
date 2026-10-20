import type { ProjectRow, ProjectWithRelations } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, count, eq, inArray, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

type Db = Database["Service"]["db"]

export interface ProjectInput {
  readonly name: string
  readonly description?: string | null | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

const iso = (d: Date) => d.toISOString()
const toRow = (p: typeof schema.projectTable.$inferSelect): ProjectRow => ({
  ...p,
  createdAt: iso(p.createdAt),
  updatedAt: iso(p.updatedAt)
})

/** Organisation ids the user belongs to, with their roles. */
const memberships = (db: Db, userId: string) =>
  db.select({ organizationId: schema.userOrganizationTable.organizationId, role: schema.userOrganizationTable.role })
    .from(schema.userOrganizationTable)
    .where(eq(schema.userOrganizationTable.userId, userId))

async function hydrate(db: Db, rows: ReadonlyArray<typeof schema.projectTable.$inferSelect>): Promise<ProjectWithRelations[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const ownerIds = [...new Set(rows.map((r) => r.ownerId))]
  const orgIds = [...new Set(rows.flatMap((r) => (r.organizationId ? [r.organizationId] : [])))]
  const [owners, orgs, drawings, components] = await Promise.all([
    db.select({ id: schema.userTable.id, name: schema.userTable.name, email: schema.userTable.email })
      .from(schema.userTable).where(inArray(schema.userTable.id, ownerIds)),
    orgIds.length === 0
      ? Promise.resolve([])
      : db.select({ id: schema.organizationTable.id, name: schema.organizationTable.name })
        .from(schema.organizationTable).where(inArray(schema.organizationTable.id, orgIds)),
    db.select({ projectId: schema.drawingTable.projectId, n: count() }).from(schema.drawingTable)
      .where(inArray(schema.drawingTable.projectId, ids)).groupBy(schema.drawingTable.projectId),
    db.select({ projectId: schema.componentTable.projectId, n: count() }).from(schema.componentTable)
      .where(inArray(schema.componentTable.projectId, ids)).groupBy(schema.componentTable.projectId)
  ])
  const ownerById = new Map(owners.map((o) => [o.id, o]))
  const orgById = new Map(orgs.map((o) => [o.id, o]))
  const dCount = new Map(drawings.map((d) => [d.projectId, d.n]))
  const cCount = new Map(components.map((c) => [c.projectId, c.n]))
  return rows.map((r) => ({
    ...toRow(r),
    owner: ownerById.get(r.ownerId) ?? { id: r.ownerId, name: null, email: null },
    organization: r.organizationId ? (orgById.get(r.organizationId) ?? null) : null,
    _count: { drawings: dCount.get(r.id) ?? 0, components: cCount.get(r.id) ?? 0 }
  }))
}

export type Access = { readonly project: ProjectWithRelations; readonly orgRole: "ADMIN" | "MANAGER" | "MEMBER" | undefined }

export class ProjectRepo extends Context.Service<ProjectRepo, {
  /** Own projects, projects of the user's organisations, and public projects (newest first). */
  list(userId: string): Effect.Effect<ProjectWithRelations[], DatabaseError>
  /** Project the user owns or reaches through an organisation, plus their role there (legacy `findFirst` rule). */
  find(userId: string, id: string): Effect.Effect<Access | undefined, DatabaseError>
  isMember(userId: string, organizationId: string): Effect.Effect<boolean, DatabaseError>
  create(userId: string, input: ProjectInput): Effect.Effect<ProjectRow, DatabaseError>
  update(id: string, patch: { name: string; description?: string | null | undefined; organizationId?: string | null | undefined }): Effect.Effect<ProjectWithRelations, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/ProjectRepo") {
  static readonly layer = Layer.effect(
    ProjectRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const T = schema.projectTable
      return ProjectRepo.of({
        list: (userId) =>
          query("projects.list", async (db) => {
            const orgIds = (await memberships(db, userId)).map((m) => m.organizationId)
            const rows = await db.select().from(T)
              .where(or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined))
              .orderBy(T.updatedAt)
            return hydrate(db, rows.reverse())
          }),
        find: (userId, id) =>
          query("projects.find", async (db) => {
            const ms = await memberships(db, userId)
            const orgIds = ms.map((m) => m.organizationId)
            const [row] = await db.select().from(T)
              .where(and(eq(T.id, id), or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined)))
              .limit(1)
            if (!row) return undefined
            const [project] = await hydrate(db, [row])
            return { project: project!, orgRole: ms.find((m) => m.organizationId === row.organizationId)?.role }
          }),
        isMember: (userId, organizationId) =>
          query("projects.isMember", async (db) => {
            const ms = await memberships(db, userId)
            return ms.some((m) => m.organizationId === organizationId)
          }),
        create: (userId, input) =>
          query("projects.create", async (db) => {
            const [row] = await db.insert(T).values({
              name: input.name,
              description: input.description ?? null,
              ownerId: userId,
              organizationId: input.organizationId ?? null,
              isPublic: input.isPublic || false
            }).returning()
            return toRow(row!)
          }),
        update: (id, patch) =>
          query("projects.update", async (db) => {
            const [current] = await db.select().from(T).where(eq(T.id, id)).limit(1)
            const [row] = await db.update(T).set({
              name: patch.name,
              description: patch.description ?? null,
              organizationId: patch.organizationId ?? current?.organizationId ?? null,
              updatedAt: new Date()
            }).where(eq(T.id, id)).returning()
            return (await hydrate(db, [row!]))[0]!
          }),
        remove: (id) =>
          query("projects.remove", async (db) => {
            // Activity and AI-analysis rows point at items by plain id (no foreign key), so cascades miss them.
            const ids = [
              id,
              ...(await db.select({ id: schema.drawingTable.id }).from(schema.drawingTable).where(eq(schema.drawingTable.projectId, id))).map((r) => r.id),
              ...(await db.select({ id: schema.componentTable.id }).from(schema.componentTable).where(eq(schema.componentTable.projectId, id))).map((r) => r.id),
              ...(await db.select({ id: schema.toolpathTable.id }).from(schema.toolpathTable).where(eq(schema.toolpathTable.projectId, id))).map((r) => r.id)
            ]
            await db.delete(T).where(eq(T.id, id))
            await db.delete(schema.activityLogTable).where(inArray(schema.activityLogTable.itemId, ids))
            await db.delete(schema.aIAnalysisLogTable).where(inArray(schema.aIAnalysisLogTable.objectId, ids))
          })
      })
    })
  )
}
