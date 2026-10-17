import { Database, DatabaseError, schema, type Db } from "@cadcamfun/db"
import type { Backend, Entity, ProjectSnapshot } from "@cadcamfun/vcs"
import { and, eq, inArray, like, notExists } from "drizzle-orm"
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

/** `user.name` / `user.email` of a commit signature. */
export interface GitIdentity {
  readonly name: string
  readonly email: string
}

/** A user's default identity, from their account: the local desktop user has a placeholder address. */
const defaultIdentity = (user: { name: string | null; email: string | null }): GitIdentity => ({
  name: user.name?.trim() || user.email?.split("@")[0] || "User",
  email: user.email?.trim() || "unknown@cadcamfun.local",
})

export class ProjectVcsRepo extends Context.Service<ProjectVcsRepo, {
  backend(projectId: string): Backend
  /** Current database state of a project as a repository snapshot (thumbnails are derived data and excluded). */
  snapshot(projectId: string): Effect.Effect<ProjectSnapshot | undefined, DatabaseError>
  /** Makes the database match `snapshot`: upserts present entities, deletes absent ones. */
  apply(projectId: string, snapshot: ProjectSnapshot, userId: string): Effect.Effect<void, DatabaseError>
  /** Appends to the legacy `ActivityLog`, so version-control actions show up in the same audit trail as every other change. */
  audit(userId: string, projectId: string, action: string, details: Record<string, unknown>): Effect.Effect<void, DatabaseError>
  remote(projectId: string): Effect.Effect<string | null, DatabaseError>
  setRemote(projectId: string, remote: string | null): Effect.Effect<void, DatabaseError>
  /** The user's git identity; created from their account name and email the first time it is asked for. Undefined for an unknown user. */
  gitProfile(userId: string): Effect.Effect<GitIdentity | undefined, DatabaseError>
  setGitProfile(userId: string, identity: GitIdentity): Effect.Effect<GitIdentity, DatabaseError>
  /** Creates the git identity of every user that has none yet; returns how many were created. */
  ensureGitProfiles(): Effect.Effect<number, DatabaseError>
}>()("cadcamfun/ProjectVcsRepo") {
  static readonly layer = Layer.effect(
    ProjectVcsRepo,
    Effect.gen(function*() {
      const { db, query } = yield* Database
      const P = schema.projectTable
      const G = schema.gitProfileTable
      return ProjectVcsRepo.of({
        backend: (projectId) => sqliteBackend(db, projectId),
        snapshot: (projectId) =>
          query("vcs.snapshot", (db) => {
            const project = db.select().from(P).where(eq(P.id, projectId)).get()
            if (!project) return undefined
            const dated = (row: { createdAt: Date; updatedAt: Date }) => ({ createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })
            // Thumbnails are derived; owners and organisations are properties of an installation, not of the model.
            const entity = (row: Record<string, unknown> & { createdAt: Date; updatedAt: Date }, drop: ReadonlyArray<string>): Entity => {
              const copy: Record<string, unknown> = { ...row, ...dated(row) }
              for (const key of drop) delete copy[key]
              return copy as unknown as Entity
            }
            const toolpaths = db.select().from(schema.toolpathTable).where(eq(schema.toolpathTable.projectId, projectId)).all()
            const used = (pick: (t: (typeof toolpaths)[number]) => string | null) => [...new Set(toolpaths.flatMap((t) => { const v = pick(t); return v ? [v] : [] }))]
            const library = <T extends { createdAt: Date; updatedAt: Date }>(table: typeof schema.materialTable | typeof schema.toolTable | typeof schema.machineConfigTable, ids: string[], drop: string[]) =>
              (ids.length === 0 ? [] : db.select().from(table).where(inArray(table.id, ids)).all() as unknown as Array<Record<string, unknown> & T>).map((r) => entity(r, drop))
            const toolpathIds = toolpaths.map((t) => t.id)
            return {
              project: { id: project.id, name: project.name, description: project.description, isPublic: project.isPublic },
              drawings: db.select().from(schema.drawingTable).where(eq(schema.drawingTable.projectId, projectId)).all().map((r) => entity(r, ["thumbnail", "projectId"])),
              components: db.select().from(schema.componentTable).where(eq(schema.componentTable.projectId, projectId)).all().map((r) => entity(r, ["thumbnail", "projectId"])),
              toolpaths: toolpaths.map((r) => entity(r, ["thumbnail", "projectId"])),
              materials: library(schema.materialTable, used((t) => t.materialId), ["ownerId", "organizationId"]),
              tools: library(schema.toolTable, used((t) => t.toolId), ["ownerId", "organizationId"]),
              machineConfigs: library(schema.machineConfigTable, used((t) => t.machineConfigId), ["ownerId"]),
              costs: toolpathIds.length === 0 ? [] : db.select().from(schema.productionCostEstimateTable).where(inArray(schema.productionCostEstimateTable.toolpathId, toolpathIds)).all().map((r) => entity(r, ["ownerId", "organizationId", "operationCostId"])),
            } satisfies ProjectSnapshot
          }),
        apply: (projectId, s, userId) =>
          query("vcs.apply", (db) =>
            db.transaction((tx) => {
              const p = s.project as { name?: string; description?: string | null; isPublic?: boolean }
              tx.update(P).set({ ...(p.name && { name: p.name }), description: p.description ?? null, isPublic: p.isPublic ?? false }).where(eq(P.id, projectId)).run()
              const date = (v: unknown): Date => (typeof v === "string" ? new Date(v) : new Date())
              const dates = (e: Entity) => ({ createdAt: date(e.createdAt), updatedAt: date(e.updatedAt) })
              const str = (v: unknown): string | null => (typeof v === "string" ? v : null)

              // Library items first (toolpaths point at them). They are shared across projects: create what is missing and
              // update an item only when this user owns it, so merging a project never rewrites someone else's library.
              const upsertLibrary = (table: typeof schema.materialTable | typeof schema.toolTable | typeof schema.machineConfigTable, entities: readonly Entity[] | undefined, columns: (e: Entity) => Record<string, unknown>) => {
                for (const e of entities ?? []) {
                  const existing = tx.select({ id: table.id, ownerId: table.ownerId }).from(table).where(eq(table.id, e.id)).get()
                  const values = { id: e.id, name: String(e.name ?? "Untitled"), isPublic: Boolean(e.isPublic), ...dates(e), ...columns(e) } as never
                  if (!existing) tx.insert(table).values({ ...(values as object), ownerId: userId } as never).run()
                  else if (existing.ownerId === null || existing.ownerId === userId) tx.update(table).set(values).where(eq(table.id, e.id)).run()
                }
              }
              upsertLibrary(schema.materialTable, s.materials, (e) => ({ description: str(e.description), properties: e.properties ?? {} }))
              upsertLibrary(schema.toolTable, s.tools, (e) => ({
                type: String(e.type ?? "endmill"), diameter: Number(e.diameter ?? 0), material: String(e.material ?? ""), numberOfFlutes: (e.numberOfFlutes as number | null) ?? null,
                maxRPM: (e.maxRPM as number | null) ?? null, coolantType: str(e.coolantType), cuttingLength: (e.cuttingLength as number | null) ?? null,
                totalLength: (e.totalLength as number | null) ?? null, shankDiameter: (e.shankDiameter as number | null) ?? null, notes: str(e.notes),
                cornerRadius: (e.cornerRadius as number | null) ?? null, tipAngle: (e.tipAngle as number | null) ?? null, threadPitch: (e.threadPitch as number | null) ?? null, holderDiameter: (e.holderDiameter as number | null) ?? null, holderLength: (e.holderLength as number | null) ?? null, stickout: (e.stickout as number | null) ?? null,
              }))
              upsertLibrary(schema.machineConfigTable, s.machineConfigs, (e) => ({ type: String(e.type ?? "mill"), description: str(e.description), config: e.config ?? {} }))

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
              const common = (e: Entity) => ({ id: e.id, name: String(e.name ?? "Untitled"), description: str(e.description), projectId, ...dates(e) })
              sync(schema.drawingTable, s.drawings, (e) => ({ ...common(e), data: e.data ?? {} }))
              sync(schema.componentTable, s.components, (e) => ({ ...common(e), data: e.data ?? {}, type: str(e.type), isPublic: Boolean(e.isPublic) }))
              sync(schema.toolpathTable, s.toolpaths, (e) => ({
                ...common(e),
                data: e.data ?? null,
                type: str(e.type),
                operationType: str(e.operationType),
                gcode: str(e.gcode),
                isPublic: Boolean(e.isPublic),
                createdBy: typeof e.createdBy === "string" && tx.select({ id: schema.userTable.id }).from(schema.userTable).where(eq(schema.userTable.id, e.createdBy)).get() ? e.createdBy : userId,
                drawingId: exists(schema.drawingTable, e.drawingId),
                materialId: exists(schema.materialTable, e.materialId),
                toolId: exists(schema.toolTable, e.toolId),
                machineConfigId: exists(schema.machineConfigTable, e.machineConfigId),
              }))

              // Cost estimates belong to a toolpath: drop the ones whose estimate is gone from the tree, upsert the rest.
              const C = schema.productionCostEstimateTable
              const toolpathIds = tx.select({ id: schema.toolpathTable.id }).from(schema.toolpathTable).where(eq(schema.toolpathTable.projectId, projectId)).all().map((r) => r.id)
              const keepCosts = new Set((s.costs ?? []).map((c) => c.id))
              for (const row of toolpathIds.length === 0 ? [] : tx.select({ id: C.id }).from(C).where(inArray(C.toolpathId, toolpathIds)).all()) {
                if (!keepCosts.has(row.id)) tx.delete(C).where(eq(C.id, row.id)).run()
              }
              for (const c of s.costs ?? []) {
                if (typeof c.toolpathId !== "string" || !toolpathIds.includes(c.toolpathId)) continue
                const num = (k: string) => Number(c[k] ?? 0)
                const v = {
                  id: c.id, toolpathId: c.toolpathId, materialCost: num("materialCost"), toolWearCost: num("toolWearCost"), machineTime: num("machineTime"), machineTimeCost: num("machineTimeCost"),
                  operatorTime: num("operatorTime"), operatorTimeCost: num("operatorTimeCost"), setupCost: num("setupCost"), totalCost: num("totalCost"),
                  currencyCode: String(c.currencyCode ?? "EUR"), details: c.details ?? {}, ownerId: userId, ...dates(c),
                }
                tx.insert(C).values(v).onConflictDoUpdate({ target: C.id, set: v }).run()
              }
            })),
        audit: (userId, projectId, action, details) =>
          query("vcs.audit", (db) => void db.insert(schema.activityLogTable).values({ userId, itemId: projectId, itemType: "project", action, details }).run()),
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
        gitProfile: (userId) =>
          query("vcs.gitProfile", (db) => {
            const row = db.select().from(G).where(eq(G.userId, userId)).get()
            if (row) return { name: row.name, email: row.email }
            const user = db.select({ name: schema.userTable.name, email: schema.userTable.email }).from(schema.userTable).where(eq(schema.userTable.id, userId)).get()
            if (!user) return undefined
            const identity = defaultIdentity(user)
            db.insert(G).values({ userId, ...identity }).onConflictDoNothing().run()
            return identity
          }),
        setGitProfile: (userId, identity) =>
          query("vcs.setGitProfile", (db) => {
            db.insert(G).values({ userId, ...identity }).onConflictDoUpdate({ target: G.userId, set: { ...identity, updatedAt: new Date() } }).run()
            return identity
          }),
        ensureGitProfiles: () =>
          query("vcs.ensureGitProfiles", (db) => {
            const missing = db.select({ id: schema.userTable.id, name: schema.userTable.name, email: schema.userTable.email }).from(schema.userTable)
              .where(notExists(db.select({ userId: G.userId }).from(G).where(eq(G.userId, schema.userTable.id)))).all()
            for (const user of missing) db.insert(G).values({ userId: user.id, ...defaultIdentity(user) }).onConflictDoNothing().run()
            return missing.length
          }),
      })
    }),
  )
}
