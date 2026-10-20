import type { DrawingDetail, DrawingRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"
import { cam } from "@cadcamfun/core"
import { createHash } from "node:crypto"

type Row = typeof schema.drawingTable.$inferSelect

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object"
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value

/**
 * The content hash of a stored drawing: what a compare-and-swap compares. It covers the whole stored document (elements,
 * stock, settings), not the drawing's id, and is independent of key order. It is not the parametric history's revision
 * (`historyRevision`, one element's history) nor the CAM source revision (`drawingRevision`, elements and stock).
 */
export const drawingContentHash = (data: unknown): string => createHash("sha256").update(JSON.stringify(canonical(data ?? {}))).digest("hex")

/** A compare-and-swap found a drawing that changed since it was read; nothing was written. */
export class DrawingConflict extends Error {
  constructor(readonly drawingId: string) {
    super("The drawing changed while this tool was working (another window or turn saved it). Nothing was overwritten: inspect it again and retry.")
    this.name = "DrawingConflict"
  }
}

/** The answer of a compare-and-swap write: the receipt of the stored change, or the hash that was found instead. */
export type DrawingWrite =
  | { readonly ok: true; readonly drawingId: string; readonly previousHash: string; readonly contentHash: string; readonly updatedAt: string }
  | { readonly ok: false; readonly reason: "conflict"; readonly drawingId: string; readonly expectedHash: string; readonly currentHash: string }
  | { readonly ok: false; readonly reason: "missing"; readonly drawingId: string }
export const toDrawingRow = (d: Row): DrawingRow => ({ ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })

export class DrawingRepo extends Context.Service<DrawingRepo, {
  /** Drawing with its project and the caller's role in the project's organisation (legacy `include`). */
  find(userId: string, id: string): Effect.Effect<typeof DrawingDetail.Type | undefined, DatabaseError>
  listByProject(projectId: string): Effect.Effect<DrawingRow[], DatabaseError>
  create(projectId: string, d: { name: string; description?: string | null | undefined; data?: unknown }): Effect.Effect<DrawingRow, DatabaseError>
  update(id: string, d: { name?: string | undefined; description?: string | null | undefined; data?: unknown; thumbnail?: string | null | undefined }): Effect.Effect<DrawingRow, DatabaseError>
  /**
   * Replaces the document only if it still has the content the caller read (`expectedHash`): the check and the write are one
   * transaction, so a concurrent save (another window, another turn) is a conflict and is never overwritten.
   */
  writeIfUnchanged(id: string, expectedHash: string, data: unknown): Effect.Effect<DrawingWrite, DatabaseError>
  /**
   * Stores the drawing's CAM stock and invalidates programs generated against the previous raw piece. With `expectedHash`
   * it is a compare-and-swap like `writeIfUnchanged`: a drawing that changed since it was read is a `DrawingConflict`.
   */
  configureStock(id: string, stock: unknown, expectedHash?: string): Effect.Effect<ReadonlyArray<string>, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/DrawingRepo") {
  static readonly layer = Layer.effect(
    DrawingRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const events = yield* LiveEvents
      const T = schema.drawingTable
      const announceDrawing = (id: string) => query("drawings.changedProject", async (db) =>
        (await db.select({ projectId: T.projectId }).from(T).where(eq(T.id, id)))[0]
      ).pipe(Effect.flatMap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void))
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
          }).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void)),
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
          }).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void)),
        writeIfUnchanged: (id, expectedHash, data) => query("drawings.writeIfUnchanged", (db) => db.transaction((tx): DrawingWrite => {
          const row = tx.select({ data: T.data }).from(T).where(eq(T.id, id)).get()
          if (!row) return { ok: false, reason: "missing", drawingId: id }
          const currentHash = drawingContentHash(row.data)
          if (currentHash !== expectedHash) return { ok: false, reason: "conflict", drawingId: id, expectedHash, currentHash }
          const updatedAt = new Date()
          tx.update(T).set({ data, updatedAt }).where(eq(T.id, id)).run()
          return { ok: true, drawingId: id, previousHash: currentHash, contentHash: drawingContentHash(data), updatedAt: updatedAt.toISOString() }
        })).pipe(Effect.tap((result) => result.ok ? announceDrawing(id) : Effect.void)),
        configureStock: (id, stock, expectedHash) => query("drawings.configureStock", (db) => db.transaction((tx) => {
          const drawing = tx.select().from(T).where(eq(T.id, id)).get()
          if (!drawing) throw new Error("Drawing disappeared before stock update.")
          if (expectedHash !== undefined && drawingContentHash(drawing.data) !== expectedHash) throw new DrawingConflict(id)
          const data = drawing.data !== null && typeof drawing.data === "object" ? drawing.data as Record<string, unknown> : {}
          const invalidated: string[] = []
          const paths = tx.select().from(schema.toolpathTable).where(eq(schema.toolpathTable.drawingId, id)).all()
          for (const path of paths) {
            const stored = path.data !== null && typeof path.data === "object" ? path.data as Record<string, unknown> : {}
            const request = stored["request"] !== null && typeof stored["request"] === "object" ? stored["request"] as Record<string, unknown> : undefined
            const geometry = request?.["geometry"] !== null && typeof request?.["geometry"] === "object" ? request["geometry"] as Record<string, unknown> : {}
            const fresh = { ...stored }
            for (const key of ["response", "verification", "kernelArtifact", "kernelRequest", "sourceRevision", "operations"]) delete fresh[key]
            if (fresh["format"] === "cadcamfun-cam") {
              fresh["gcode"] = ""
              fresh["program"] = cam.makeProgram(path.name, [], {})
              fresh["stock"] = stock
              const source = fresh["drawing"] !== null && typeof fresh["drawing"] === "object" ? fresh["drawing"] as Record<string, unknown> : {}
              fresh["drawing"] = { ...source, stock }
            }
            if (request) fresh["request"] = { ...request, geometry: { ...geometry, stock } }
            tx.update(schema.toolpathTable).set({ data: fresh, gcode: null, updatedAt: new Date() }).where(eq(schema.toolpathTable.id, path.id)).run()
            invalidated.push(path.id)
          }
          tx.update(T).set({ data: { ...data, stock }, updatedAt: new Date() }).where(eq(T.id, id)).run()
          return invalidated
        })).pipe(Effect.tap(() => announceDrawing(id))),
        remove: (id) => query("drawings.remove", async (db) => (await db.delete(T).where(eq(T.id, id)).returning({ projectId: T.projectId }))[0]).pipe(Effect.tap((row) => row ? events.workspaceChanged(row.projectId) : Effect.void), Effect.asVoid)
      })
    })
  ).pipe(Layer.provide(LiveEvents.layer))
}
