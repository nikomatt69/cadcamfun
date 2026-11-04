import { commitMutation, Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, desc, eq, inArray, lt, notInArray } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"

const T = schema.probeReportTable
type Row = typeof T.$inferSelect

export type ProbeReportKind = Row["kind"]
export type ProbeReportSource = Row["source"]
export type ProbeReportVerdict = Row["verdict"]

/** What a list shows: everything but the report body. */
export interface ProbeReportSummaryRow {
  id: string
  projectId: string
  drawingId: string | null
  toolpathId: string | null
  machineConfigId: string | null
  setupId: string | null
  runId: string | null
  name: string
  kind: ProbeReportKind
  source: ProbeReportSource
  verdict: ProbeReportVerdict
  workOffset: string | null
  programHash: string | null
  sourceRevision: string | null
  measuredAt: string
  createdAt: string
  createdById: string
}
export interface ProbeReportRow extends ProbeReportSummaryRow { data: unknown }

export interface NewProbeReportRow {
  drawingId?: string | null | undefined
  toolpathId?: string | null | undefined
  machineConfigId?: string | null | undefined
  setupId?: string | null | undefined
  runId?: string | null | undefined
  name: string
  kind: ProbeReportKind
  source: ProbeReportSource
  verdict: ProbeReportVerdict
  workOffset?: string | null | undefined
  programHash?: string | null | undefined
  sourceRevision?: string | null | undefined
  data: unknown
  measuredAt?: Date | undefined
}

/** Reports kept per probe operation; older ones are pruned when a new one is written (a probe loop must not grow the file). */
export const PROBE_REPORTS_KEPT = 200

const summaryOf = (r: Row): ProbeReportSummaryRow => ({
  id: r.id, projectId: r.projectId, drawingId: r.drawingId, toolpathId: r.toolpathId, machineConfigId: r.machineConfigId,
  setupId: r.setupId, runId: r.runId, name: r.name, kind: r.kind, source: r.source, verdict: r.verdict, workOffset: r.workOffset,
  programHash: r.programHash, sourceRevision: r.sourceRevision, measuredAt: r.measuredAt.toISOString(), createdAt: r.createdAt.toISOString(),
  createdById: r.createdById
})
const rowOf = (r: Row): ProbeReportRow => ({ ...summaryOf(r), data: r.data })

/**
 * Probing and in-process inspection reports of a project (spec 73 §3.2). Access is the caller's job (the project check); the
 * repository only knows the project id, and every lookup is scoped by it so a report id of another project is "not found".
 * Writes go through `commitMutation` (an assistant command leaves its receipt) and announce `workspace.changed`.
 */
export class ProbeReportRepo extends Context.Service<ProbeReportRepo, {
  /** Newest first; `before` is an ISO `createdAt` cursor (exclusive). */
  list(projectId: string, f: { toolpathId?: string | undefined; limit: number; before?: string | undefined }): Effect.Effect<ProbeReportSummaryRow[], DatabaseError>
  get(projectId: string, reportId: string): Effect.Effect<ProbeReportRow | undefined, DatabaseError>
  /** Writes the report and prunes that operation's history down to `PROBE_REPORTS_KEPT`, in one transaction. */
  create(projectId: string, userId: string, input: NewProbeReportRow): Effect.Effect<ProbeReportRow, DatabaseError>
  remove(projectId: string, reportId: string): Effect.Effect<boolean, DatabaseError>
  /** The latest report of a probe operation (what `cam review` and the panel show as its verdict). */
  latestFor(projectId: string, toolpathId: string): Effect.Effect<ProbeReportRow | undefined, DatabaseError>
}>()("cadcamfun/ProbeReportRepo") {
  static readonly layer = Layer.effect(ProbeReportRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const events = yield* LiveEvents
    const announce = (projectId: string) => events.workspaceChanged(projectId)
    return ProbeReportRepo.of({
      list: (projectId, f) => query("probeReports.list", async (db) => {
        const before = f.before !== undefined ? new Date(f.before) : undefined
        const rows = await db.select().from(T).where(and(
          eq(T.projectId, projectId),
          f.toolpathId !== undefined ? eq(T.toolpathId, f.toolpathId) : undefined,
          before !== undefined && !Number.isNaN(before.getTime()) ? lt(T.createdAt, before) : undefined
        )).orderBy(desc(T.createdAt), desc(T.id)).limit(f.limit)
        return rows.map(summaryOf)
      }),
      get: (projectId, reportId) => query("probeReports.get", async (db) => {
        const [row] = await db.select().from(T).where(and(eq(T.projectId, projectId), eq(T.id, reportId))).limit(1)
        return row ? rowOf(row) : undefined
      }),
      create: (projectId, userId, input) => query("probeReports.create", (db) => commitMutation(db, "probeReports.create", (tx) => {
        // createdAt is strictly increasing per project so the list order and the `before` cursor never tie.
        const last = tx.select({ at: T.createdAt }).from(T).where(eq(T.projectId, projectId)).orderBy(desc(T.createdAt)).limit(1).get()
        const createdAt = new Date(Math.max(Date.now(), (last?.at.getTime() ?? 0) + 1))
        const saved = tx.insert(T).values({
          projectId, createdById: userId, name: input.name, kind: input.kind, source: input.source, verdict: input.verdict, data: input.data,
          drawingId: input.drawingId ?? null, toolpathId: input.toolpathId ?? null, machineConfigId: input.machineConfigId ?? null,
          setupId: input.setupId ?? null, runId: input.runId ?? null, workOffset: input.workOffset ?? null,
          programHash: input.programHash ?? null, sourceRevision: input.sourceRevision ?? null,
          measuredAt: input.measuredAt ?? createdAt, createdAt
        }).returning().get()
        if (!saved) throw new Error("Probe report was not created")
        if (saved.toolpathId !== null) {
          const keep = tx.select({ id: T.id }).from(T).where(and(eq(T.projectId, projectId), eq(T.toolpathId, saved.toolpathId)))
            .orderBy(desc(T.createdAt), desc(T.id)).limit(PROBE_REPORTS_KEPT).all().map((r) => r.id)
          tx.delete(T).where(and(eq(T.projectId, projectId), eq(T.toolpathId, saved.toolpathId), notInArray(T.id, keep))).run()
        }
        return { result: rowOf(saved), resourceId: saved.id, revision: saved.createdAt.toISOString() }
      })).pipe(Effect.tap(() => announce(projectId))),
      remove: (projectId, reportId) => query("probeReports.remove", (db) => commitMutation(db, "probeReports.remove", (tx) => {
        const row = tx.delete(T).where(and(eq(T.projectId, projectId), inArray(T.id, [reportId]))).returning({ id: T.id }).get()
        return { result: row !== undefined, resourceId: reportId, changed: row !== undefined }
      })).pipe(Effect.tap((removed) => removed ? announce(projectId) : Effect.void)),
      latestFor: (projectId, toolpathId) => query("probeReports.latestFor", async (db) => {
        const [row] = await db.select().from(T).where(and(eq(T.projectId, projectId), eq(T.toolpathId, toolpathId)))
          .orderBy(desc(T.createdAt), desc(T.id)).limit(1)
        return row ? rowOf(row) : undefined
      })
    })
  })).pipe(Layer.provide(LiveEvents.layer))
}
