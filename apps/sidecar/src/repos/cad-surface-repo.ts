/**
 * CAD surface repository — spec 14 §5.1.
 *
 * Wraps the pure surfacing helpers in `@cadcamfun/core` (Box chamfer, sweep,
 * loft, shell, …) with three responsibilities the runtime owns:
 *
 *   1. Effect-typed boundaries: every operation returns an `Effect` so the
 *      caller can compose, race, retry, or schedule it.
 *   2. Persistence: results land as a `MeshAsset` row plus an audit-log
 *      entry in `CadOperationLog`. The mesh is stored as JSON-friendly
 *      arrays so a future migration to a binary format is a pure write-side
 *      concern.
 *   3. OpenTelemetry spans: every operation runs inside `Effect.withSpan`,
 *      so the trace id and span id are captured into `CadOperationLog` for
 *      observability back-propagation.
 *
 * The pure math stays in `packages/core`; this file is the only place that
 * owns DB + telemetry wiring for surface operations, and it does so without
 * touching the runtime weight budget (no new third-party dependency was
 * added in this slice).
 */
import type { cad } from "@cadcamfun/core"
import { chamferBox, chamferCylinderTop, loftMesh, meshBounds, meshVolume, shellMesh, sweepMesh, type BoxSolid, type CylinderSolid, type Mesh } from "@cadcamfun/core"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, count, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { trace } from "@opentelemetry/api"

type Db = Database["Service"]["db"]

export interface ChamferBoxInput {
  readonly box: BoxSolid
  readonly distance: number
}

export interface ChamferCylinderTopInput {
  readonly cylinder: CylinderSolid
  readonly distance: number
}

export interface SweepInput {
  readonly profile: ReadonlyArray<{ readonly x: number; readonly y: number }>
  readonly path: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>
}

export interface LoftInput {
  readonly sections: ReadonlyArray<{ readonly z: number; readonly polygon: ReadonlyArray<{ readonly x: number; readonly y: number }> }>
}

export interface ShellInput {
  readonly mesh: Mesh
  readonly thickness: number
}

export interface MeshAssetView {
  readonly id: string
  readonly projectId: string
  readonly kind: string
  readonly vertexCount: number
  readonly triangleCount: number
  readonly signedVolume: number
  readonly bounds: ReturnType<typeof meshBounds>
  readonly mesh: { readonly positions: ReadonlyArray<number>; readonly indices: ReadonlyArray<number> }
  readonly traceId: string | null
  readonly spanId: string | null
  readonly createdAt: Date
}

const meshToJSON = (mesh: Mesh): { positions: ReadonlyArray<number>; indices: ReadonlyArray<number> } => ({
  positions: Array.from(mesh.positions),
  indices: Array.from(mesh.indices)
})

/** Compact summary of a mesh, used for the `MeshAsset.stats` JSON column. */
const meshStats = (kind: string, mesh: Mesh): { kind: string; vertexCount: number; triangleCount: number; signedVolume: number; bounds: ReturnType<typeof meshBounds> } => ({
  kind,
  vertexCount: mesh.positions.length / 3,
  triangleCount: mesh.indices.length / 3,
  signedVolume: meshVolume(mesh),
  bounds: meshBounds(mesh)
})

const OK = "ok" as const
const ERR = "error" as const

/**
 * Span id helper. When a span is active in the Effect runtime the OTel
 * bridge exposes its context; otherwise we emit null and the row falls back
 * to its primary key for ordering.
 */
const currentSpanIds = (): { readonly traceId: string | null; readonly spanId: string | null } => {
  const span = trace.getActiveSpan()
  if (span === undefined) return { traceId: null, spanId: null }
  const ctx = span.spanContext()
  return { traceId: ctx.traceId, spanId: ctx.spanId }
}

export class CadSurfaceRepo extends Context.Service<CadSurfaceRepo, {
  chamferBox(projectId: string, input: ChamferBoxInput): Effect.Effect<MeshAssetView, DatabaseError>
  chamferCylinderTop(projectId: string, input: ChamferCylinderTopInput): Effect.Effect<MeshAssetView, DatabaseError>
  sweep(projectId: string, input: SweepInput): Effect.Effect<MeshAssetView, DatabaseError>
  loft(projectId: string, input: LoftInput): Effect.Effect<MeshAssetView, DatabaseError>
  shell(projectId: string, input: ShellInput): Effect.Effect<MeshAssetView, DatabaseError>
  /** Recent surface operations across the project, newest first. */
  recentLog(projectId: string, limit?: number): Effect.Effect<ReadonlyArray<{ readonly id: string; readonly operation: string; readonly outcome: "ok" | "error"; readonly durationMs: number; readonly traceId: string | null; readonly createdAt: Date }>, DatabaseError>
  countByKind(projectId: string): Effect.Effect<ReadonlyArray<{ readonly kind: string; readonly n: number }>, DatabaseError>
}>()("cadcamfun/CadSurfaceRepo") {
  static readonly layer = Layer.effect(CadSurfaceRepo, Effect.gen(function*() {
    const { query } = yield* Database
    return CadSurfaceRepo.of({
      chamferBox: (projectId, input) =>
        runWithSpan("cad.chamferBox", projectId, "chamferBox", input, () => Promise.resolve(chamferBox(input.box, input.distance))),
      chamferCylinderTop: (projectId, input) =>
        runWithSpan("cad.chamferCylinderTop", projectId, "chamferCylinderTop", input, () => Promise.resolve(chamferCylinderTop(input.cylinder, input.distance))),
      sweep: (projectId, input) =>
        runWithSpan("cad.sweep", projectId, "sweep", input, () => Promise.resolve(sweepMesh(input.profile, input.path))),
      loft: (projectId, input) =>
        runWithSpan("cad.loft", projectId, "loft", input, () => Promise.resolve(loftMesh(input.sections))),
      shell: (projectId, input) =>
        runWithSpan("cad.shell", projectId, "shell", input, () => Promise.resolve(shellMesh(input.mesh, input.thickness))),
      recentLog: (projectId, limit) =>
        query("cadSurfaceRepo.recentLog", async (db) => {
          const rows = await db.select({
            id: schema.cadOperationLogTable.id,
            operation: schema.cadOperationLogTable.operation,
            outcome: schema.cadOperationLogTable.outcome,
            durationMs: schema.cadOperationLogTable.durationMs,
            traceId: schema.cadOperationLogTable.traceId,
            createdAt: schema.cadOperationLogTable.createdAt
          }).from(schema.cadOperationLogTable)
            .where(eq(schema.cadOperationLogTable.projectId, projectId))
            .orderBy(desc(schema.cadOperationLogTable.createdAt))
            .limit(limit ?? 20)
          return rows.map((r) => ({ ...r, createdAt: r.createdAt }))
        }),
      countByKind: (projectId) =>
        query("cadSurfaceRepo.countByKind", async (db) => {
          const rows = await db.select({ kind: schema.meshAssetTable.kind, n: count() })
            .from(schema.meshAssetTable)
            .where(and(eq(schema.meshAssetTable.projectId, projectId)))
            .groupBy(schema.meshAssetTable.kind)
          return rows.map((r) => ({ kind: r.kind, n: r.n }))
        })
    })
  }))
}

/**
 * Generic runner for a surface operation: emits the OTel span, persists the
 * result to Drizzle, audits the call. Error path goes through the same
 * auditor so the log shows the failure mode alongside its inputs.
 */
const runWithSpan = <A>(
  spanName: string,
  projectId: string,
  kind: string,
  inputs: unknown,
  run: () => Promise<Mesh>
): Effect.Effect<MeshAssetView, DatabaseError> =>
  Effect.gen(function*() {
    const { query } = yield* Database
    const startedAt = Date.now()
    const result = yield* Effect.tryPromise({
      try: () => run(),
      catch: (error) => error instanceof Error ? error : new Error(String(error))
    }).pipe(
      Effect.catchAll((error) => Effect.gen(function*() {
        const ids = currentSpanIds()
        yield* query("cadSurfaceRepo.logError", async (db) => {
          await db.insert(schema.cadOperationLogTable).values({
            projectId,
            operation: kind,
            meshAssetId: null,
            outcome: ERR,
            durationMs: Date.now() - startedAt,
            inputs: JSON.stringify(inputs),
            error: error.message,
            traceId: ids.traceId,
            spanId: ids.spanId
          })
        })
        return yield* Effect.fail(error)
      }))
    )
    const durationMs = Date.now() - startedAt
    const ids = currentSpanIds()
    return yield* query("cadSurfaceRepo.persist", async (db): Promise<MeshAssetView> => {
      const [inserted] = await db.insert(schema.meshAssetTable).values({
        projectId,
        kind,
        inputs: JSON.stringify(inputs),
        stats: JSON.stringify(meshStats(kind, result)),
        mesh: JSON.stringify(meshToJSON(result))
      }).returning()
      if (!inserted) throw new Error("meshAsset insert returned no row")
      await db.insert(schema.cadOperationLogTable).values({
        projectId,
        operation: kind,
        meshAssetId: inserted.id,
        outcome: OK,
        durationMs,
        inputs: JSON.stringify(inputs),
        error: null,
        traceId: ids.traceId,
        spanId: ids.spanId
      })
      return {
        id: inserted.id,
        projectId: inserted.projectId,
        kind: inserted.kind,
        vertexCount: inserted.stats ? JSON.parse(inserted.stats).vertexCount : 0,
        triangleCount: inserted.stats ? JSON.parse(inserted.stats).triangleCount : 0,
        signedVolume: inserted.stats ? JSON.parse(inserted.stats).signedVolume : 0,
        bounds: meshBounds(result),
        mesh: meshToJSON(result),
        traceId: ids.traceId,
        spanId: ids.spanId,
        createdAt: inserted.createdAt
      }
    })
  }).pipe(
    Effect.withSpan(spanName, {
      attributes: {
        "cadcamfun.project_id": projectId,
        "cadcamfun.operation": kind
      }
    })
  )

// Re-export the type for callers that import the repo just for the view shape.
export type { cad }
