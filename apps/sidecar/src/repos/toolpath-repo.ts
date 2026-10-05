import type { ToolpathRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, desc, eq, inArray, like, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { orgIdsOf } from "./access.ts"

type Row = typeof schema.toolpathTable.$inferSelect
export const toToolpathRow = (t: Row): ToolpathRow => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })

export interface ToolpathInput {
  name?: string | undefined; description?: string | null | undefined; data?: unknown; gcode?: string | null | undefined
  type?: string | null | undefined; operationType?: string | null | undefined; isPublic?: boolean | undefined; thumbnail?: string | null | undefined
  materialId?: string | null | undefined; machineConfigId?: string | null | undefined; toolId?: string | null | undefined
}

export class ToolpathRepo extends Context.Service<ToolpathRepo, {
  list(userId: string, f: { projectId?: string | undefined; type?: string | undefined; operationType?: string | undefined; search?: string | undefined; includePublic: boolean }): Effect.Effect<ToolpathRow[], DatabaseError>
  /** Visible when created by the user, in one of their organisations' projects, or public. */
  find(userId: string, id: string): Effect.Effect<{ row: ToolpathRow; project: { id: string; name: string; ownerId: string; organizationId: string | null }; canWrite: boolean } | undefined, DatabaseError>
  create(userId: string, d: ToolpathInput & { name: string; projectId: string; drawingId?: string; applyDefaults?: boolean }): Effect.Effect<ToolpathRow, DatabaseError>
  update(id: string, patch: Partial<ToolpathInput>): Effect.Effect<ToolpathRow, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
  listForDrawing(drawingId: string): Effect.Effect<Array<ToolpathRow & { Material: unknown; MachineConfig: unknown; Tool: unknown }>, DatabaseError>
  /** Project-scoped list used by the envelope route: own, public, or organisation members' toolpaths, with project/organisation names. */
  listForProject(userId: string, projectId: string): Effect.Effect<unknown[], DatabaseError>
  drawingWithProject(userId: string, drawingId: string): Effect.Effect<{ projectId: string } | undefined, DatabaseError>
}>()("cadcamfun/ToolpathRepo") {
  static readonly layer = Layer.effect(
    ToolpathRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const T = schema.toolpathTable
      const P = schema.projectTable
      return ToolpathRepo.of({
        list: (userId, f) =>
          query("toolpaths.list", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const visible = or(eq(T.createdBy, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined, f.includePublic ? eq(T.isPublic, true) : undefined)
            // Deviation from legacy: `search` narrows the visible set instead of replacing it.
            const search = f.search ? or(like(T.name, `%${f.search}%`), like(T.description, `%${f.search}%`)) : undefined
            const rows = await db.select({ t: T }).from(T).innerJoin(P, eq(T.projectId, P.id))
              .where(and(visible, search, f.projectId ? eq(T.projectId, f.projectId) : undefined, f.type ? eq(T.type, f.type) : undefined,
                f.operationType ? eq(T.operationType, f.operationType) : undefined))
              .orderBy(desc(T.updatedAt))
            return rows.map((r) => toToolpathRow(r.t))
          }),
        find: (userId, id) =>
          query("toolpaths.find", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const [hit] = await db.select({ t: T, p: { id: P.id, name: P.name, ownerId: P.ownerId, organizationId: P.organizationId } })
              .from(T).innerJoin(P, eq(T.projectId, P.id))
              .where(and(eq(T.id, id), or(eq(T.createdBy, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined, eq(T.isPublic, true))))
              .limit(1)
            if (!hit) return undefined
            let canWrite = hit.t.createdBy === userId
            if (!canWrite && hit.p.organizationId) {
              const [m] = await db.select({ role: schema.userOrganizationTable.role }).from(schema.userOrganizationTable)
                .where(and(eq(schema.userOrganizationTable.userId, userId), eq(schema.userOrganizationTable.organizationId, hit.p.organizationId))).limit(1)
              canWrite = !!m && (m.role === "ADMIN" || m.role === "MANAGER")
            }
            return { row: toToolpathRow(hit.t), project: hit.p, canWrite }
          }),
        create: (userId, d) =>
          query("toolpaths.create", async (db) => {
            const [row] = await db.insert(T).values({
              name: d.name, description: d.description ?? null, data: d.data || {},
              // `/api/toolpaths` and the project route default these; the drawing route stores them as given.
              gcode: d.applyDefaults === false ? (d.gcode ?? null) : (d.gcode || ""),
              projectId: d.projectId,
              type: d.applyDefaults === false ? (d.type ?? null) : (d.type || "mill"),
              operationType: d.applyDefaults === false ? (d.operationType ?? null) : (d.operationType || "contour"),
              isPublic: d.isPublic || false, thumbnail: d.thumbnail ?? null, createdBy: userId,
              drawingId: d.drawingId ?? null, materialId: d.materialId ?? null, machineConfigId: d.machineConfigId ?? null, toolId: d.toolId ?? null
            }).returning()
            return toToolpathRow(row!)
          }),
        update: (id, patch) =>
          query("toolpaths.update", async (db) => {
            const [row] = await db.update(T).set({ ...patch, updatedAt: new Date() }).where(eq(T.id, id)).returning()
            return toToolpathRow(row!)
          }),
        remove: (id) => query("toolpaths.remove", async (db) => void (await db.delete(T).where(eq(T.id, id)))),
        listForDrawing: (drawingId) =>
          query("toolpaths.listForDrawing", async (db) => {
            const rows = await db.select().from(T).where(eq(T.drawingId, drawingId)).orderBy(desc(T.updatedAt))
            const out = []
            for (const r of rows) {
              const [m] = r.materialId ? await db.select({ id: schema.materialTable.id, name: schema.materialTable.name }).from(schema.materialTable).where(eq(schema.materialTable.id, r.materialId)) : []
              const [mc] = r.machineConfigId ? await db.select({ id: schema.machineConfigTable.id, name: schema.machineConfigTable.name, type: schema.machineConfigTable.type }).from(schema.machineConfigTable).where(eq(schema.machineConfigTable.id, r.machineConfigId)) : []
              const [tl] = r.toolId ? await db.select({ id: schema.toolTable.id, name: schema.toolTable.name, type: schema.toolTable.type, diameter: schema.toolTable.diameter }).from(schema.toolTable).where(eq(schema.toolTable.id, r.toolId)) : []
              out.push({ ...toToolpathRow(r), Material: m ?? null, MachineConfig: mc ?? null, Tool: tl ?? null })
            }
            return out
          }),
        listForProject: (userId, projectId) =>
          query("toolpaths.listForProject", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const [project] = await db.select({ name: P.name, organizationId: P.organizationId }).from(P).where(eq(P.id, projectId)).limit(1)
            const isOrgMember = !!project?.organizationId && orgIds.includes(project.organizationId)
            const rows = await db.select().from(T)
              .where(and(eq(T.projectId, projectId), or(eq(T.createdBy, userId), eq(T.isPublic, true), isOrgMember ? eq(T.projectId, projectId) : undefined)))
              .orderBy(desc(T.updatedAt))
            const org = project?.organizationId
              ? (await db.select({ name: schema.organizationTable.name }).from(schema.organizationTable).where(eq(schema.organizationTable.id, project.organizationId)))[0] ?? null
              : null
            return rows.map((r) => ({ ...toToolpathRow(r), project: { name: project?.name ?? "", organization: org } }))
          }),
        drawingWithProject: (userId, drawingId) =>
          query("toolpaths.drawingWithProject", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const [hit] = await db.select({ projectId: schema.drawingTable.projectId }).from(schema.drawingTable)
              .innerJoin(P, eq(schema.drawingTable.projectId, P.id))
              .where(and(eq(schema.drawingTable.id, drawingId), or(eq(P.ownerId, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined)))
              .limit(1)
            return hit
          })
      })
    })
  )
}
