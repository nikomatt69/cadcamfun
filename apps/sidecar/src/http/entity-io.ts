import { CurrentUser, EnvBadRequest, EnvForbidden, EnvInternal, EnvNotFound, envErr, ok } from "@cadcamfun/api"
import type { DatabaseError } from "@cadcamfun/db"
import { Effect } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import JSZip from "jszip"
import type { ImportResults } from "../repos/import-loop.ts"
import { type ObjectType, type StorageError, StorageService } from "../services/storage.ts"

/** Maps repository/storage failures to the legacy envelope 500. */
export const internal = (e: unknown) => Effect.logError("request failed", e).pipe(
  Effect.andThen(Effect.fail(envErr(EnvInternal, e instanceof Error ? e.message : "An unexpected error occurred"))))

export interface EntityIO<Row extends { id: string; name: string }> {
  /** Plural used in file names, messages and ZIP index key: "materials", "tools". */
  readonly plural: string
  /** Lower-case noun for "No accessible … found": "materials", "machine configurations". */
  readonly noun: string
  /** Capitalised plural for messages: "Materials". */
  readonly title: string
  readonly type: ObjectType
  exportRow(row: Row, userId: string): object
  visibleByIds(userId: string, ids: ReadonlyArray<string>): Effect.Effect<ReadonlyArray<Row>, DatabaseError>
  listAll(userId: string): Effect.Effect<ReadonlyArray<Row>, DatabaseError>
  isMember(userId: string, organizationId: string): Effect.Effect<boolean, DatabaseError>
  importMany(userId: string, items: ReadonlyArray<Record<string, unknown>>, mode: string): Effect.Effect<ImportResults, DatabaseError>
}

export const exportMeta = (userId: string) => ({ exportedAt: new Date().toISOString(), exportedBy: userId, version: "1.0", schemaVersion: "1.0" })
const safeName = (name: string) => `${name.replace(/[^a-z0-9]/gi, "_")}.json`

/** Legacy export-import GET: `?ids=&format=json|zip|bucket`. */
export const exportEntities = <Row extends { id: string; name: string }>(io: EntityIO<Row>) =>
  Effect.fn(`${io.plural}.export`)(function*(query: { ids?: string | ReadonlyArray<string> | undefined; format?: string | undefined }) {
    const user = yield* CurrentUser
    const storage = yield* StorageService
    const format = query.format ?? "json"
    const ids = query.ids === undefined ? undefined : typeof query.ids === "string" ? [query.ids] : query.ids
    const rows = ids ? yield* io.visibleByIds(user.id, ids) : yield* io.listAll(user.id)
    if (rows.length === 0) return yield* envErr(EnvNotFound, `No accessible ${io.noun} found`)
    const data = rows.map((r) => io.exportRow(r, user.id))
    const stamp = Date.now()
    switch (format) {
      case "json":
        return HttpServerResponse.jsonUnsafe(data, { headers: { "content-disposition": `attachment; filename="${io.plural}-export-${stamp}.json"` } })
      case "zip": {
        const zip = new JSZip()
        for (const r of rows) zip.file(safeName(r.name), JSON.stringify(io.exportRow(r, user.id), null, 2))
        zip.file("index.json", JSON.stringify({
          exported_at: new Date().toISOString(),
          [io.plural]: rows.map((r) => ({ id: r.id, name: r.name, filename: safeName(r.name) }))
        }, null, 2))
        const bytes = yield* Effect.tryPromise({ try: () => zip.generateAsync({ type: "uint8array" }), catch: (cause) => cause }).pipe(Effect.catch(internal))
        return HttpServerResponse.uint8Array(bytes, {
          contentType: "application/zip",
          headers: { "content-disposition": `attachment; filename="${io.plural}-export-${stamp}.zip"` }
        })
      }
      case "bucket": {
        const path = yield* storage.upload(storage.generateObjectPath(io.type, user.id), JSON.stringify(data, null, 2))
        return HttpServerResponse.jsonUnsafe(ok({ path }, `${io.title} exported to bucket successfully`))
      }
      default:
        return yield* envErr(EnvBadRequest, "Unsupported export format")
    }
  })

/** Legacy export-import POST: `{ data | path, importMode, organizationId }`. */
export const importEntities = <Row extends { id: string; name: string }>(io: EntityIO<Row>) =>
  Effect.fn(`${io.plural}.import`)(function*(payload: unknown) {
    const user = yield* CurrentUser
    const storage = yield* StorageService
    const body = (payload ?? {}) as { data?: unknown; path?: string; importMode?: string; organizationId?: string }
    const { importMode = "create", organizationId } = body
    let importData: unknown
    if (body.data) importData = body.data
    else if (body.path) importData = yield* storage.download(body.path)
    else return yield* envErr(EnvBadRequest, "No import data provided")
    if (!importData) return yield* envErr(EnvBadRequest, "Invalid import data")
    if (organizationId && !(yield* io.isMember(user.id, organizationId))) {
      return yield* envErr(EnvForbidden, "You do not have access to this organization")
    }
    const items = (Array.isArray(importData) ? importData : [importData]) as Record<string, unknown>[]
    return ok(yield* io.importMany(user.id, items, importMode), `${io.title} imported successfully`)
  })

export type { DatabaseError, StorageError }
