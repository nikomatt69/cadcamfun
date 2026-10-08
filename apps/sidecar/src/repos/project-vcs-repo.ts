import { Database, DatabaseError, schema, type Db } from "@cadcamfun/db"
import type { Backend, Entity, ProjectSnapshot } from "@cadcamfun/vcs"
import { and, eq, like } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

/**
 * `@cadcamfun/vcs` storage over the `GitObject` / `GitRef` / `GitRepo` tables, scoped to one project.
 * The vcs library is synchronous, so this uses Drizzle's synchronous bun:sqlite calls.
 */
export const sqliteBackend = (db: Db, projectId: string): Backend => {
  const O = schema.gitObjectTable
  const R = schema.gitRefTable
  const head = (): typeof schema.gitRepoTable.$inferSelect => {
    db.insert(schema.gitRepoTable).values({ projectId }).onConflictDoNothing().run()
    return db.select().from(schema.gitRepoTable).where(eq(schema.gitRepoTable.projectId, projectId)).get()!
  }
  return {
    hasObject: (oid) => db.select({ oid: O.oid }).from(O).where(and(eq(O.projectId, projectId), eq(O.oid, oid))).get() !== undefined,
    getObject: (oid) => {
      const row = db.select().from(O).where(and(eq(O.projectId, projectId), eq(O.oid, oid))).get()
      return row ? { type: row.type, body: new Uint8Array(row.body) } : undefined
    },
    putObject: (oid, o) => void db.insert(O).values({ projectId, oid, type: o.type, body: Buffer.from(o.body) }).onConflictDoNothing().run(),
    getRef: (name) => db.select().from(R).where(and(eq(R.projectId, projectId), eq(R.name, name))).get()?.oid,
    setRef: (name, oid) => void db.insert(R).values({ projectId, name, oid }).onConflictDoUpdate({ target: [R.projectId, R.name], set: { oid } }).run(),
    deleteRef: (name) => void db.delete(R).where(and(eq(R.projectId, projectId), eq(R.name, name))).run(),
    listRefs: (prefix) => Object.fromEntries(db.select().from(R).where(and(eq(R.projectId, projectId), like(R.name, `${prefix}%`))).all().map((r) => [r.name, r.oid])),
    getHead: () => head().head,
    setHead: (ref) => void db.update(schema.gitRepoTable).set({ head: ref }).where(eq(schema.gitRepoTable.projectId, projectId)).run(),
  }
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

export class ProjectVcsRepo extends Context.Service<ProjectVcsRepo, {
  backend(projectId: string): Backend
  /** Current database state of a project as a repository snapshot (thumbnails are derived data and excluded). */
  snapshot(projectId: string): Effect.Effect<ProjectSnapshot | undefined, DatabaseError>
  /** Makes the database match `snapshot`: upserts present entities, deletes absent ones. */
  apply(projectId: string, snapshot: ProjectSnapshot, userId: string): Effect.Effect<void, DatabaseError>
  remote(projectId: string): Effect.Effect<string | null, DatabaseError>
  setRemote(projectId: string, remote: string | null): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/ProjectVcsRepo") {
  static readonly layer = Layer.effect(
    ProjectVcsRepo,
    Effect.gen(function*() {
      const { db, query } = yield* Database
      const P = schema.projectTable
      return ProjectVcsRepo.of({
        backend: (projectId) => sqliteBackend(db, projectId),
        snapshot: (projectId) =>
          query("vcs.snapshot", (db) => {
            const project = db.select().from(P).where(eq(P.id, projectId)).get()
            if (!project) return undefined
            const strip = <T extends { createdAt: Date; updatedAt: Date; thumbnail: string | null; projectId: string }>({ thumbnail: _t, projectId: _p, ...row }: T) =>
              ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }) as unknown as Entity
            return {
              project: { id: project.id, name: project.name, description: project.description, isPublic: project.isPublic },
              drawings: db.select().from(schema.drawingTable).where(eq(schema.drawingTable.projectId, projectId)).all().map(strip),
              components: db.select().from(schema.componentTable).where(eq(schema.componentTable.projectId, projectId)).all().map(strip),
              toolpaths: db.select().from(schema.toolpathTable).where(eq(schema.toolpathTable.projectId, projectId)).all().map(strip),
            } satisfies ProjectSnapshot
          }),
        apply: (projectId, s, userId) =>
          query("vcs.apply", (db) =>
            db.transaction((tx) => {
              const p = s.project as { name?: string; description?: string | null; isPublic?: boolean }
              tx.update(P).set({ ...(p.name && { name: p.name }), description: p.description ?? null, isPublic: p.isPublic ?? false }).where(eq(P.id, projectId)).run()
              const date = (v: unknown): Date => (typeof v === "string" ? new Date(v) : new Date())
              // Foreign keys to library rows (material, tool…) may not exist on this install; drop the link rather than fail.
              const exists = (table: typeof schema.materialTable | typeof schema.toolTable | typeof schema.machineConfigTable | typeof schema.drawingTable, id: unknown): string | null =>
                typeof id === "string" && tx.select({ id: table.id }).from(table).where(eq(table.id, id)).get() ? id : null
              const sync = <T extends { id: unknown }>(table: typeof schema.drawingTable | typeof schema.componentTable | typeof schema.toolpathTable, entities: readonly Entity[], values: (e: Entity) => T) => {
                const keep = new Set(entities.map((e) => e.id))
                for (const row of tx.select({ id: table.id }).from(table).where(eq(table.projectId, projectId)).all()) {
                  if (!keep.has(row.id)) tx.delete(table).where(eq(table.id, row.id)).run()
                }
                for (const e of entities) {
                  const v = values(e) as never
                  tx.insert(table).values(v).onConflictDoUpdate({ target: table.id, set: v }).run()
                }
              }
              const common = (e: Entity) => ({ id: e.id, name: String(e.name ?? "Untitled"), description: (e.description as string | null) ?? null, projectId, createdAt: date(e.createdAt), updatedAt: date(e.updatedAt) })
              sync(schema.drawingTable, s.drawings, (e) => ({ ...common(e), data: e.data ?? {} }))
              sync(schema.componentTable, s.components, (e) => ({ ...common(e), data: e.data ?? {}, type: (e.type as string | null) ?? null, isPublic: Boolean(e.isPublic) }))
              sync(schema.toolpathTable, s.toolpaths, (e) => ({
                ...common(e),
                data: e.data ?? null,
                type: (e.type as string | null) ?? null,
                operationType: (e.operationType as string | null) ?? null,
                gcode: (e.gcode as string | null) ?? null,
                isPublic: Boolean(e.isPublic),
                createdBy: typeof e.createdBy === "string" && tx.select({ id: schema.userTable.id }).from(schema.userTable).where(eq(schema.userTable.id, e.createdBy)).get() ? e.createdBy : userId,
                drawingId: exists(schema.drawingTable, e.drawingId),
                materialId: exists(schema.materialTable, e.materialId),
                toolId: exists(schema.toolTable, e.toolId),
                machineConfigId: exists(schema.machineConfigTable, e.machineConfigId),
              }))
            })),
        remote: (projectId) =>
          query("vcs.remote", (db) => {
            db.insert(schema.gitRepoTable).values({ projectId }).onConflictDoNothing().run()
            return db.select().from(schema.gitRepoTable).where(eq(schema.gitRepoTable.projectId, projectId)).get()?.remote ?? null
          }),
        setRemote: (projectId, remote) =>
          query("vcs.setRemote", (db) => {
            db.insert(schema.gitRepoTable).values({ projectId }).onConflictDoNothing().run()
            db.update(schema.gitRepoTable).set({ remote }).where(eq(schema.gitRepoTable.projectId, projectId)).run()
          }),
      })
    }),
  )
}
