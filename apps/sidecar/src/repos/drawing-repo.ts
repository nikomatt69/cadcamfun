import type { DrawingDetail, DrawingRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

type Row = typeof schema.drawingTable.$inferSelect
export const toDrawingRow = (d: Row): DrawingRow => ({ ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })

export class DrawingRepo extends Context.Service<DrawingRepo, {
  /** Drawing with its project and the caller's role in the project's organisation (legacy `include`). */
  find(userId: string, id: string): Effect.Effect<typeof DrawingDetail.Type | undefined, DatabaseError>
  listByProject(projectId: string): Effect.Effect<DrawingRow[], DatabaseError>
  create(projectId: string, d: { name: string; description?: string | null | undefined; data?: unknown }): Effect.Effect<DrawingRow, DatabaseError>
  update(id: string, d: { name?: string | undefined; description?: string | null | undefined; data?: unknown; thumbnail?: string | null | undefined }): Effect.Effect<DrawingRow, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/DrawingRepo") {
  static readonly layer = Layer.effect(
    DrawingRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const T = schema.drawingTable
      return DrawingRepo.of({
        find: (userId, id) =>
          query("drawings.find", async (db) => {
            const [row] = await db.select().from(T).where(eq(T.id, id)).limit(1)
            if (!row) return undefined
            const [project] = await db.select({ id: schema.projectTable.id, name: schema.projectTable.name, ownerId: schema.projectTable.ownerId, organizationId: schema.projectTable.organizationId })
              .from(schema.projectTable).where(eq(schema.projectTable.id, row.projectId)).limit(1)
            let organization: { id: string; users: { role: string }[] } | null = null
            if (project?.organizationId) {
              const members = await db.select({ role: schema.userOrganizationTable.role, userId: schema.userOrganizationTable.userId })
                .from(schema.userOrganizationTable).where(eq(schema.userOrganizationTable.organizationId, project.organizationId))
              organization = { id: project.organizationId, users: members.filter((m) => m.userId === userId).map((m) => ({ role: m.role })) }
            }
            return { ...toDrawingRow(row), project: { id: project!.id, name: project!.name, ownerId: project!.ownerId, organization } }
          }),
        listByProject: (projectId) =>
          query("drawings.listByProject", async (db) => (await db.select().from(T).where(eq(T.projectId, projectId)).orderBy(desc(T.updatedAt))).map(toDrawingRow)),
        create: (projectId, d) =>
          query("drawings.create", async (db) => {
            const [row] = await db.insert(T).values({ name: d.name, description: d.description ?? null, data: d.data || {}, projectId }).returning()
            return toDrawingRow(row!)
          }),
        update: (id, d) =>
          query("drawings.update", async (db) => {
            const [row] = await db.update(T).set({
              ...(d.name && { name: d.name }),
              ...(d.description !== undefined && { description: d.description }),
              ...(d.data ? { data: d.data } : {}),
              ...(d.thumbnail && { thumbnail: d.thumbnail }),
              updatedAt: new Date()
            }).where(eq(T.id, id)).returning()
            return toDrawingRow(row!)
          }),
        remove: (id) => query("drawings.remove", async (db) => void (await db.delete(T).where(eq(T.id, id))))
      })
    })
  )
}
