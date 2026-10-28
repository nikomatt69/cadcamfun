import type { ComponentDetail, ComponentRow } from "@cadcamfun/api"
import { commitMutation, Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, desc, eq, inArray, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"
import { orgIdsOf } from "./access.ts"

type Row = typeof schema.componentTable.$inferSelect
export const toComponentRow = (c: Row): ComponentRow => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })

export interface ComponentPatch {
  name?: string; description?: string | null; data?: unknown; type?: string | null; isPublic?: boolean; thumbnail?: string | null
}

export class ComponentRepo extends Context.Service<ComponentRepo, {
  /** Visible when the user owns the project, belongs to its organisation, or the component is public. */
  find(userId: string, id: string): Effect.Effect<typeof ComponentDetail.Type | undefined, DatabaseError>
  /** Reusable components across every project the user can read, plus public components. */
  listVisible(userId: string): Effect.Effect<Array<typeof ComponentDetail.Type>, DatabaseError>
  listByProject(projectId: string): Effect.Effect<ComponentRow[], DatabaseError>
  create(projectId: string, d: { name: string; description?: string | null | undefined; data?: unknown; type?: string | null | undefined; isPublic?: boolean | undefined }): Effect.Effect<ComponentRow, DatabaseError>
  update(id: string, patch: ComponentPatch): Effect.Effect<ComponentRow, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
  projectOrganization(projectId: string): Effect.Effect<string | null, DatabaseError>
  userName(userId: string): Effect.Effect<string | null, DatabaseError>
}>()("cadcamfun/ComponentRepo") {
  static readonly layer = Layer.effect(
    ComponentRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const events = yield* LiveEvents
      const T = schema.componentTable
      const P = schema.projectTable
      return ComponentRepo.of({
        find: (userId, id) =>
          query("components.find", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const [hit] = await db.select({ c: T, project: { id: P.id, name: P.name, ownerId: P.ownerId } }).from(T).innerJoin(P, eq(T.projectId, P.id))
              .where(and(eq(T.id, id), or(eq(P.ownerId, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined)))
              .limit(1)
            return hit ? { ...toComponentRow(hit.c), project: hit.project } : undefined
          }),
        listVisible: (userId) =>
          query("components.listVisible", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const hits = await db.select({ c: T, project: { id: P.id, name: P.name, ownerId: P.ownerId } }).from(T).innerJoin(P, eq(T.projectId, P.id))
              .where(or(eq(P.ownerId, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined))
              .orderBy(desc(T.updatedAt))
            return hits.map((hit) => ({ ...toComponentRow(hit.c), project: hit.project }))
          }),
        listByProject: (projectId) =>
          query("components.listByProject", async (db) => (await db.select().from(T).where(eq(T.projectId, projectId)).orderBy(desc(T.updatedAt))).map(toComponentRow)),
        create: (projectId, d) =>
          query("components.create", (db) => commitMutation(db, "components.create", (tx) => {
            const row = tx.insert(T).values({ name: d.name, description: d.description ?? null, data: d.data || {}, type: d.type ?? null, isPublic: d.isPublic ?? false, projectId }).returning().get()
            if (!row) throw new Error("Component was not created")
            return { result: toComponentRow(row), resourceId: row.id, revision: row.updatedAt.toISOString() }
          })).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void)),
        update: (id, patch) =>
          query("components.update", (db) => commitMutation(db, "components.update", (tx) => {
            const previous = tx.select().from(T).where(eq(T.id, id)).get()
            if (!previous) throw new Error("Component no longer exists")
            const row = tx.update(T).set({ ...patch, updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)) }).where(eq(T.id, id)).returning().get()
            if (!row) throw new Error("Component disappeared during update")
            return { result: toComponentRow(row), resourceId: id, previousRevision: previous.updatedAt.toISOString(), revision: row.updatedAt.toISOString() }
          })).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void)),
        remove: (id) => query("components.remove", (db) => commitMutation(db, "components.remove", (tx) => {
          const row = tx.delete(T).where(eq(T.id, id)).returning({ projectId: T.projectId, updatedAt: T.updatedAt }).get()
          return { result: row, resourceId: id, ...(row ? { previousRevision: row.updatedAt.toISOString() } : {}), changed: row !== undefined }
        })).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void), Effect.asVoid),
        projectOrganization: (projectId) =>
          query("components.projectOrganization", async (db) => (await db.select({ o: P.organizationId }).from(P).where(eq(P.id, projectId)).limit(1))[0]?.o ?? null),
        userName: (userId) =>
          query("components.userName", async (db) => (await db.select({ n: schema.userTable.name }).from(schema.userTable).where(eq(schema.userTable.id, userId)).limit(1))[0]?.n ?? null)
      })
    })
  ).pipe(Layer.provide(LiveEvents.layer))
}
