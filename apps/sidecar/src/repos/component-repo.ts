import type { ComponentCommentRow, ComponentDetail, ComponentFullDetail, ComponentRelationships, ComponentRow, ComponentVersionDetail, ComponentVersionRow } from "@cadcamfun/api"
import { commitMutation, Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"
import { orgIdsOf } from "./access.ts"

type Row = typeof schema.componentTable.$inferSelect
export const toComponentRow = (c: Row): ComponentRow => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })

type VersionRecord = typeof schema.componentVersionTable.$inferSelect
const toVersionRow = (v: VersionRecord): typeof ComponentVersionRow.Type => ({ ...v, createdAt: v.createdAt.toISOString() })
type CommentRecord = typeof schema.componentCommentTable.$inferSelect
type Author = { id: string; name: string | null; email: string | null; image: string | null }
const toCommentRow = (c: CommentRecord, user: Author): typeof ComponentCommentRow.Type => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), user })

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
  /**
   * The component when the user may use it: the project owner and the members of its organisation. The `isPublic` flag grants
   * nothing to other people (the app's data-isolation rule; legacy admitted public components to every reader).
   */
  access(userId: string, id: string): Effect.Effect<ComponentRow | undefined, DatabaseError>
  listVersions(componentId: string): Effect.Effect<Array<typeof ComponentVersionDetail.Type>, DatabaseError>
  getVersion(componentId: string, versionId: string): Effect.Effect<typeof ComponentVersionDetail.Type | undefined, DatabaseError>
  createVersion(componentId: string, userId: string, data: unknown, changeMessage: string): Effect.Effect<typeof ComponentVersionRow.Type, DatabaseError>
  /**
   * Restores a saved version in one transaction: the current data is first saved as a new version
   * ("Auto-saved before version restore"), then the component takes the version's data. `undefined` when the version is not the component's.
   */
  restoreVersion(componentId: string, versionId: string, userId: string, normalize: (data: unknown) => unknown): Effect.Effect<ComponentRow | undefined, DatabaseError>
  listComments(componentId: string): Effect.Effect<Array<typeof ComponentCommentRow.Type>, DatabaseError>
  findComment(componentId: string, commentId: string): Effect.Effect<{ userId: string } | undefined, DatabaseError>
  addComment(componentId: string, userId: string, content: string): Effect.Effect<typeof ComponentCommentRow.Type, DatabaseError>
  editComment(commentId: string, content: string): Effect.Effect<typeof ComponentCommentRow.Type, DatabaseError>
  removeComment(commentId: string): Effect.Effect<void, DatabaseError>
  isProjectOwner(userId: string, componentId: string): Effect.Effect<boolean, DatabaseError>
  /**
   * Components the user can see (own projects and their organisations'), newest first.
   * `search` narrows that set: legacy replaced the visibility filter with it and so listed other people's components.
   */
  search(userId: string, filter: { projectId?: string | undefined; type?: string | undefined; search?: string | undefined }): Effect.Effect<ComponentRow[], DatabaseError>
  /** The component with its project, the user's rights and how many drawings of the project mention it; `forbidden` when it exists but the user is no member. */
  details(userId: string, id: string): Effect.Effect<typeof ComponentFullDetail.Type | "forbidden" | undefined, DatabaseError>
  /** Components that reference this one (in `data.references`) and those it references, restricted to what the user can see. */
  relationships(userId: string, component: ComponentRow): Effect.Effect<typeof ComponentRelationships.Type, DatabaseError>
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
      const V = schema.componentVersionTable
      const C = schema.componentCommentTable
      const U = schema.userTable
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
        access: (userId, id) =>
          query("components.access", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const [hit] = await db.select({ c: T }).from(T).innerJoin(P, eq(T.projectId, P.id))
              .where(and(eq(T.id, id), or(eq(P.ownerId, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined))).limit(1)
            return hit ? toComponentRow(hit.c) : undefined
          }),
        listVersions: (componentId) =>
          query("components.listVersions", async (db) => {
            const rows = await db.select({ v: V, user: { name: U.name, email: U.email } }).from(V).innerJoin(U, eq(V.userId, U.id))
              .where(eq(V.componentId, componentId)).orderBy(desc(V.createdAt))
            return rows.map((r) => ({ ...toVersionRow(r.v), user: r.user }))
          }),
        getVersion: (componentId, versionId) =>
          query("components.getVersion", async (db) => {
            const [r] = await db.select({ v: V, user: { name: U.name, email: U.email } }).from(V).innerJoin(U, eq(V.userId, U.id))
              .where(and(eq(V.id, versionId), eq(V.componentId, componentId))).limit(1)
            return r ? { ...toVersionRow(r.v), user: r.user } : undefined
          }),
        createVersion: (componentId, userId, data, changeMessage) =>
          query("components.createVersion", (db) => commitMutation(db, "components.createVersion", (tx) => {
            const row = tx.insert(V).values({ componentId, data, changeMessage, userId }).returning().get()
            if (!row) throw new Error("Version was not created")
            return { result: toVersionRow(row), resourceId: componentId, revision: row.createdAt.toISOString() }
          })),
        restoreVersion: (componentId, versionId, userId, normalize) =>
          query("components.restoreVersion", (db) => commitMutation(db, "components.restoreVersion", (tx) => {
            const version = tx.select().from(V).where(and(eq(V.id, versionId), eq(V.componentId, componentId))).get()
            const previous = tx.select().from(T).where(eq(T.id, componentId)).get()
            if (!version || !previous) return { result: undefined, resourceId: componentId, changed: false }
            tx.insert(V).values({ componentId, data: previous.data, changeMessage: "Auto-saved before version restore", userId }).run()
            const row = tx.update(T).set({ data: normalize(version.data), updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)) }).where(eq(T.id, componentId)).returning().get()
            if (!row) throw new Error("Component disappeared during restore")
            return { result: toComponentRow(row), resourceId: componentId, previousRevision: previous.updatedAt.toISOString(), revision: row.updatedAt.toISOString() }
          })).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void)),
        listComments: (componentId) =>
          query("components.listComments", async (db) => {
            const rows = await db.select({ c: C, user: { id: U.id, name: U.name, email: U.email, image: U.image } }).from(C).innerJoin(U, eq(C.userId, U.id))
              .where(eq(C.componentId, componentId)).orderBy(desc(C.createdAt))
            return rows.map((r) => toCommentRow(r.c, r.user))
          }),
        findComment: (componentId, commentId) =>
          query("components.findComment", async (db) =>
            (await db.select({ userId: C.userId }).from(C).where(and(eq(C.id, commentId), eq(C.componentId, componentId))).limit(1))[0]),
        addComment: (componentId, userId, content) =>
          query("components.addComment", (db) => commitMutation(db, "components.addComment", (tx) => {
            const row = tx.insert(C).values({ componentId, content, userId }).returning().get()
            const user = row ? tx.select({ id: U.id, name: U.name, email: U.email, image: U.image }).from(U).where(eq(U.id, userId)).get() : undefined
            if (!row || !user) throw new Error("Comment was not created")
            return { result: toCommentRow(row, user), resourceId: row.id, revision: row.updatedAt.toISOString() }
          })),
        editComment: (commentId, content) =>
          query("components.editComment", (db) => commitMutation(db, "components.editComment", (tx) => {
            const previous = tx.select().from(C).where(eq(C.id, commentId)).get()
            if (!previous) throw new Error("Comment no longer exists")
            const row = tx.update(C).set({ content, updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)) }).where(eq(C.id, commentId)).returning().get()
            const user = row ? tx.select({ id: U.id, name: U.name, email: U.email, image: U.image }).from(U).where(eq(U.id, row.userId)).get() : undefined
            if (!row || !user) throw new Error("Comment disappeared during update")
            return { result: toCommentRow(row, user), resourceId: commentId, previousRevision: previous.updatedAt.toISOString(), revision: row.updatedAt.toISOString() }
          })),
        removeComment: (commentId) =>
          query("components.removeComment", (db) => commitMutation(db, "components.removeComment", (tx) => {
            const row = tx.delete(C).where(eq(C.id, commentId)).returning({ updatedAt: C.updatedAt }).get()
            return { result: undefined, resourceId: commentId, ...(row ? { previousRevision: row.updatedAt.toISOString() } : {}), changed: row !== undefined }
          })).pipe(Effect.asVoid),
        isProjectOwner: (userId, componentId) =>
          query("components.isProjectOwner", async (db) =>
            (await db.select({ id: T.id }).from(T).innerJoin(P, eq(T.projectId, P.id)).where(and(eq(T.id, componentId), eq(P.ownerId, userId))).limit(1)).length > 0),
        search: (userId, filter) =>
          query("components.search", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const visible = or(eq(P.ownerId, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined)
            const needle = filter.search ? `%${filter.search.replace(/[\\%_]/g, "\\$&")}%` : undefined
            const hits = await db.select({ c: T }).from(T).innerJoin(P, eq(T.projectId, P.id)).where(and(
              visible,
              filter.projectId ? eq(T.projectId, filter.projectId) : undefined,
              filter.type ? eq(T.type, filter.type) : undefined,
              needle ? or(sql`${T.name} like ${needle} escape '\\'`, sql`${T.description} like ${needle} escape '\\'`) : undefined
            )).orderBy(desc(T.updatedAt))
            return hits.map((hit) => toComponentRow(hit.c))
          }),
        details: (userId, id) =>
          query("components.details", async (db) => {
            const [hit] = await db.select({ c: T, p: P, owner: { id: schema.userTable.id, name: schema.userTable.name, email: schema.userTable.email } }).from(T)
              .innerJoin(P, eq(T.projectId, P.id)).innerJoin(schema.userTable, eq(P.ownerId, schema.userTable.id)).where(eq(T.id, id)).limit(1)
            if (!hit) return undefined
            const organization = hit.p.organizationId
              ? (await db.select({ id: schema.organizationTable.id, name: schema.organizationTable.name }).from(schema.organizationTable).where(eq(schema.organizationTable.id, hit.p.organizationId)).limit(1))[0]
              : undefined
            const roles = organization
              ? (await db.select({ role: schema.userOrganizationTable.role }).from(schema.userOrganizationTable)
                .where(and(eq(schema.userOrganizationTable.organizationId, organization.id), eq(schema.userOrganizationTable.userId, userId)))).map((r) => ({ role: r.role as string }))
              : []
            const owns = hit.p.ownerId === userId
            if (!owns && roles.length === 0) return "forbidden" as const
            const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(schema.drawingTable)
              .where(and(eq(schema.drawingTable.projectId, hit.p.id), like(schema.drawingTable.data, `%${id}%`)))
            return {
              ...toComponentRow(hit.c),
              project: { id: hit.p.id, name: hit.p.name, description: hit.p.description, ownerId: hit.p.ownerId, owner: hit.owner, organization: organization ? { ...organization, users: roles } : null },
              usageStats: { usedInDrawings: Number(n) },
              canEdit: owns || roles.some((r) => r.role === "ADMIN" || r.role === "MANAGER"),
              canDelete: owns || roles.some((r) => r.role === "ADMIN")
            }
          }),
        relationships: (userId, component) =>
          query("components.relationships", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const visible = await db.select({ c: T }).from(T).innerJoin(P, eq(T.projectId, P.id))
              .where(or(eq(P.ownerId, userId), orgIds.length ? inArray(P.organizationId, orgIds) : undefined))
            const refsOf = (data: unknown): string[] => {
              const value = typeof data === "string" ? (() => { try { return JSON.parse(data) as unknown } catch { return undefined } })() : data
              const refs = typeof value === "object" && value !== null ? (value as { references?: unknown }).references : undefined
              return Array.isArray(refs) ? refs.filter((r): r is string => typeof r === "string") : []
            }
            const slim = (c: Row) => ({ id: c.id, name: c.name, description: c.description, type: c.type, projectId: c.projectId, isPublic: c.isPublic })
            const referencing = visible.map((v) => v.c).filter((c) => c.id !== component.id && refsOf(c.data).includes(component.id))
            const wanted = new Set(refsOf(component.data))
            const referenced = visible.map((v) => v.c).filter((c) => wanted.has(c.id))
            return {
              relatedComponents: [...referencing, ...referenced].map(slim),
              relationships: [
                ...referencing.map((c) => ({ sourceId: c.id, targetId: component.id, type: "references" as const })),
                ...referenced.map((c) => ({ sourceId: component.id, targetId: c.id, type: "references" as const }))
              ]
            }
          }),
        projectOrganization: (projectId) =>
          query("components.projectOrganization", async (db) => (await db.select({ o: P.organizationId }).from(P).where(eq(P.id, projectId)).limit(1))[0]?.o ?? null),
        userName: (userId) =>
          query("components.userName", async (db) => (await db.select({ n: schema.userTable.name }).from(schema.userTable).where(eq(schema.userTable.id, userId)).limit(1))[0]?.n ?? null)
      })
    })
  ).pipe(Layer.provide(LiveEvents.layer))
}
