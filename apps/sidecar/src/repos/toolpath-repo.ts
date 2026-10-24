import type { ToolpathRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import type { Db } from "@cadcamfun/db"
import { and, desc, eq, inArray, like, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"
import { orgIdsOf } from "./access.ts"

type Row = typeof schema.toolpathTable.$inferSelect
export const toToolpathRow = (t: Row): ToolpathRow => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })

export interface ToolpathInput {
  name?: string | undefined; description?: string | null | undefined; data?: unknown; gcode?: string | null | undefined
  type?: string | null | undefined; operationType?: string | null | undefined; isPublic?: boolean | undefined; thumbnail?: string | null | undefined
  materialId?: string | null | undefined; machineConfigId?: string | null | undefined; toolId?: string | null | undefined
}

export interface ToolpathVersionEntry {
  readonly id: string; readonly toolpathId: string; readonly data: unknown; readonly gcode: string | null; readonly changeMessage: string | null
  readonly userId: string; readonly createdAt: string
}
export interface ToolpathCommentEntry {
  readonly id: string; readonly toolpathId: string; readonly content: string; readonly userId: string; readonly createdAt: string; readonly updatedAt: string
  readonly user: { readonly id: string; readonly name: string | null; readonly email: string | null; readonly image: string | null } | null
}

const toVersion = (v: typeof schema.toolpathVersionTable.$inferSelect): ToolpathVersionEntry => ({
  id: v.id, toolpathId: v.toolpathId, data: v.data, gcode: v.gcode, changeMessage: v.changeMessage, userId: v.userId, createdAt: v.createdAt.toISOString()
})

const userRefs = async (db: Db, ids: ReadonlyArray<string>) => {
  const uniq = [...new Set(ids)]
  const rows = uniq.length ? await db.select({ id: schema.userTable.id, name: schema.userTable.name, email: schema.userTable.email, image: schema.userTable.image })
    .from(schema.userTable).where(inArray(schema.userTable.id, uniq)) : []
  return new Map(rows.map((r) => [r.id, r]))
}

const withAuthors = async (db: Db, rows: ReadonlyArray<typeof schema.toolpathCommentTable.$inferSelect>): Promise<ToolpathCommentEntry[]> => {
  const users = await userRefs(db, rows.map((r) => r.userId))
  return rows.map((r) => ({
    id: r.id, toolpathId: r.toolpathId, content: r.content, userId: r.userId,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), user: users.get(r.userId) ?? null
  }))
}

export class ToolpathRepo extends Context.Service<ToolpathRepo, {
  list(userId: string, f: { projectId?: string | undefined; type?: string | undefined; operationType?: string | undefined; search?: string | undefined }): Effect.Effect<ToolpathRow[], DatabaseError>
  /** Visible when created by the user, in one of their organisations' projects, or public. */
  find(userId: string, id: string): Effect.Effect<{ row: ToolpathRow; project: { id: string; name: string; ownerId: string; organizationId: string | null }; canWrite: boolean } | undefined, DatabaseError>
  create(userId: string, d: ToolpathInput & { name: string; projectId: string; drawingId?: string; applyDefaults?: boolean }): Effect.Effect<ToolpathRow, DatabaseError>
  update(id: string, patch: Partial<ToolpathInput>): Effect.Effect<ToolpathRow, DatabaseError>
  /**
   * Compare-and-set: inside one synchronous transaction, reads the toolpath and its drawing's data, and applies `patch`
   * only while `guard` still holds for both. `undefined` when the row is gone or the guard failed: nothing was written.
   */
  updateWhere(id: string, guard: (row: ToolpathRow, drawingData: unknown) => boolean, patch: (row: ToolpathRow) => Partial<ToolpathInput>): Effect.Effect<ToolpathRow | undefined, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
  listForDrawing(drawingId: string): Effect.Effect<Array<ToolpathRow & { Material: unknown; MachineConfig: unknown; Tool: unknown }>, DatabaseError>
  /** Project-scoped list used by the envelope route: own, public, or organisation members' toolpaths, with project/organisation names. */
  listForProject(userId: string, projectId: string): Effect.Effect<unknown[], DatabaseError>
  drawingWithProject(userId: string, drawingId: string): Effect.Effect<{ projectId: string } | undefined, DatabaseError>
  listVersions(toolpathId: string): Effect.Effect<Array<ToolpathVersionEntry & { user: { name: string | null; email: string | null } | null }>, DatabaseError>
  findVersion(toolpathId: string, versionId: string): Effect.Effect<ToolpathVersionEntry | undefined, DatabaseError>
  createVersion(toolpathId: string, userId: string, v: { data?: unknown; gcode?: string | undefined; changeMessage?: string | undefined }): Effect.Effect<ToolpathVersionEntry, DatabaseError>
  listComments(toolpathId: string): Effect.Effect<ToolpathCommentEntry[], DatabaseError>
  findComment(commentId: string): Effect.Effect<{ id: string; toolpathId: string; userId: string } | undefined, DatabaseError>
  createComment(toolpathId: string, userId: string, content: string): Effect.Effect<ToolpathCommentEntry, DatabaseError>
  updateComment(commentId: string, content: string): Effect.Effect<ToolpathCommentEntry, DatabaseError>
  removeComment(commentId: string): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/ToolpathRepo") {
  static readonly layer = Layer.effect(
    ToolpathRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const events = yield* LiveEvents
      const T = schema.toolpathTable
      const P = schema.projectTable
      const V = schema.toolpathVersionTable
      const C = schema.toolpathCommentTable
      return ToolpathRepo.of({
        list: (userId, f) =>
          query("toolpaths.list", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const visible = or(eq(T.createdBy, userId), eq(P.ownerId, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined)
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
              .where(and(eq(T.id, id), or(eq(T.createdBy, userId), eq(P.ownerId, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined)))
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
          }).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void)),
        update: (id, patch) =>
          query("toolpaths.update", async (db) => {
            const [row] = await db.update(T).set({ ...patch, updatedAt: new Date() }).where(eq(T.id, id)).returning()
            return toToolpathRow(row!)
          }).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void)),
        updateWhere: (id, guard, patch) =>
          query("toolpaths.updateWhere", (db) => db.transaction((tx) => {
            const current = tx.select().from(T).where(eq(T.id, id)).get()
            if (!current) return undefined
            const row = toToolpathRow(current)
            const drawing = current.drawingId === null ? undefined : tx.select({ data: schema.drawingTable.data }).from(schema.drawingTable).where(eq(schema.drawingTable.id, current.drawingId)).get()
            if (!guard(row, drawing?.data)) return undefined
            const [updated] = tx.update(T).set({ ...patch(row), updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) }).where(eq(T.id, id)).returning().all()
            return updated === undefined ? undefined : toToolpathRow(updated)
          })).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void)),
        remove: (id) => query("toolpaths.remove", async (db) => (await db.delete(T).where(eq(T.id, id)).returning({ projectId: T.projectId }))[0]).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void), Effect.asVoid),
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
            const [project] = await db.select({ name: P.name, organizationId: P.organizationId }).from(P).where(eq(P.id, projectId)).limit(1)
            // Access to the project is checked by the handler; every toolpath in it belongs to its owner / organization.
            const rows = await db.select().from(T)
              .where(eq(T.projectId, projectId))
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
          }),
        listVersions: (toolpathId) =>
          query("toolpaths.listVersions", async (db) => {
            const rows = await db.select().from(V).where(eq(V.toolpathId, toolpathId)).orderBy(desc(V.createdAt))
            const users = await userRefs(db, rows.map((r) => r.userId))
            return rows.map((r) => ({ ...toVersion(r), user: users.get(r.userId) ?? null }))
          }),
        findVersion: (toolpathId, versionId) =>
          query("toolpaths.findVersion", async (db) => {
            const [row] = await db.select().from(V).where(and(eq(V.id, versionId), eq(V.toolpathId, toolpathId))).limit(1)
            return row ? toVersion(row) : undefined
          }),
        createVersion: (toolpathId, userId, v) =>
          query("toolpaths.createVersion", async (db) => {
            const [row] = await db.insert(V).values({
              toolpathId, userId, data: v.data ?? null, gcode: v.gcode ?? null, changeMessage: v.changeMessage ?? ""
            }).returning()
            return toVersion(row!)
          }),
        listComments: (toolpathId) =>
          query("toolpaths.listComments", async (db) => {
            const rows = await db.select().from(C).where(eq(C.toolpathId, toolpathId)).orderBy(desc(C.createdAt))
            return withAuthors(db, rows)
          }),
        findComment: (commentId) =>
          query("toolpaths.findComment", async (db) => {
            const [row] = await db.select({ id: C.id, toolpathId: C.toolpathId, userId: C.userId }).from(C).where(eq(C.id, commentId)).limit(1)
            return row
          }),
        createComment: (toolpathId, userId, content) =>
          query("toolpaths.createComment", async (db) => {
            const [row] = await db.insert(C).values({ toolpathId, userId, content }).returning()
            return (await withAuthors(db, [row!]))[0]!
          }),
        updateComment: (commentId, content) =>
          query("toolpaths.updateComment", async (db) => {
            const [row] = await db.update(C).set({ content, updatedAt: new Date() }).where(eq(C.id, commentId)).returning()
            return (await withAuthors(db, [row!]))[0]!
          }),
        removeComment: (commentId) => query("toolpaths.removeComment", async (db) => void (await db.delete(C).where(eq(C.id, commentId))))
      })
    })
  ).pipe(Layer.provide(LiveEvents.layer))
}
