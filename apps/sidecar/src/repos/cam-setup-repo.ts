import type { CamSetupDocument } from "@cadcamfun/api"
import { commitMutation, Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, asc, eq, like } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"

type Doc = typeof CamSetupDocument.Type
type Stored = { name: string; setup: Doc["setup"]; createdAt: string }
const T = schema.localKeyValueTable

/** One saved setup is one key-value row, `camSetup/<projectId>/<setupId>`; its `updatedAt` is the document revision. */
const prefix = (projectId: string) => `camSetup/${projectId}/`
const keyOf = (projectId: string, setupId: string) => `${prefix(projectId)}${setupId}`
const toDoc = (projectId: string, row: typeof T.$inferSelect): Doc => {
  const value = row.value as Stored
  return { id: row.key.slice(prefix(projectId).length), projectId, name: value.name, setup: value.setup, createdAt: value.createdAt, updatedAt: row.updatedAt.toISOString() }
}

/**
 * Saved multi-operation setups of a project (RM-02). They go through `commitMutation` like every other document, so the write
 * and its receipt are one transaction, a stale `baseUpdatedAt` commits nothing, and an assistant command leaves its receipt.
 * Access is the caller's job (the project check); the repository only knows the project id.
 */
export class CamSetupRepo extends Context.Service<CamSetupRepo, {
  list(projectId: string): Effect.Effect<Doc[], DatabaseError>
  get(projectId: string, setupId: string): Effect.Effect<Doc | undefined, DatabaseError>
  save(projectId: string, input: { name: string; setup: Doc["setup"] }): Effect.Effect<Doc, DatabaseError>
  /** `"conflict"` when `base` is given and no longer current, `undefined` when the setup is gone; nothing is written in either case. */
  update(projectId: string, setupId: string, patch: { name?: string | undefined; setup?: Doc["setup"] | undefined }, base: string | undefined): Effect.Effect<Doc | "conflict" | undefined, DatabaseError>
  remove(projectId: string, setupId: string): Effect.Effect<boolean, DatabaseError>
}>()("cadcamfun/CamSetupRepo") {
  static readonly layer = Layer.effect(CamSetupRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const events = yield* LiveEvents
    const announce = (projectId: string) => events.workspaceChanged(projectId)
    return CamSetupRepo.of({
      list: (projectId) => query("camSetups.list", async (db) =>
        // `_` and `%` cannot occur in a uuid project id, so the prefix is a safe LIKE pattern.
        (await db.select().from(T).where(like(T.key, `${prefix(projectId)}%`)).orderBy(asc(T.updatedAt))).map((row) => toDoc(projectId, row))),
      get: (projectId, setupId) => query("camSetups.get", async (db) => {
        const [row] = await db.select().from(T).where(eq(T.key, keyOf(projectId, setupId))).limit(1)
        return row ? toDoc(projectId, row) : undefined
      }),
      save: (projectId, input) => query("camSetups.save", (db) => commitMutation(db, "camSetups.save", (tx) => {
        const setupId = crypto.randomUUID()
        const now = new Date()
        const row = tx.insert(T).values({ key: keyOf(projectId, setupId), value: { name: input.name, setup: input.setup, createdAt: now.toISOString() } satisfies Stored, updatedAt: now }).returning().get()
        return { result: toDoc(projectId, row), resourceId: setupId, revision: row.updatedAt.toISOString() }
      })).pipe(Effect.tap(() => announce(projectId))),
      update: (projectId, setupId, patch, base) => query("camSetups.update", (db) => commitMutation(db, "camSetups.update", (tx) => {
        const key = keyOf(projectId, setupId)
        const previous = tx.select().from(T).where(eq(T.key, key)).get()
        if (!previous) return { result: undefined as Doc | "conflict" | undefined, resourceId: setupId, changed: false }
        if (base !== undefined && previous.updatedAt.toISOString() !== base) return { result: "conflict" as const, resourceId: setupId, changed: false }
        const value = previous.value as Stored
        const next: Stored = { name: patch.name ?? value.name, setup: patch.setup ?? value.setup, createdAt: value.createdAt }
        const row = tx.update(T).set({ value: next, updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)) }).where(eq(T.key, key)).returning().get()
        if (!row) throw new Error("Saved setup disappeared during update")
        return { result: toDoc(projectId, row) as Doc | "conflict" | undefined, resourceId: setupId, previousRevision: previous.updatedAt.toISOString(), revision: row.updatedAt.toISOString() }
      })).pipe(Effect.tap((doc) => doc !== undefined && doc !== "conflict" ? announce(projectId) : Effect.void)),
      remove: (projectId, setupId) => query("camSetups.remove", (db) => commitMutation(db, "camSetups.remove", (tx) => {
        const row = tx.delete(T).where(and(eq(T.key, keyOf(projectId, setupId)))).returning({ updatedAt: T.updatedAt }).get()
        return { result: row !== undefined, resourceId: setupId, ...(row ? { previousRevision: row.updatedAt.toISOString() } : {}), changed: row !== undefined }
      })).pipe(Effect.tap((removed) => removed ? announce(projectId) : Effect.void))
    })
  })).pipe(Layer.provide(LiveEvents.layer))
}
