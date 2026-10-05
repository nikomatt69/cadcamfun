import { Api, CurrentUser, EnvBadRequest, EnvForbidden, EnvInternal, EnvNotFound, envErr, ok } from "@cadcamfun/api"
import type { ToolRow } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ToolRepo } from "../repos/tool-repo.ts"
import { StorageService } from "../services/storage.ts"
import { type EntityIO, exportEntities, exportMeta, importEntities, internal } from "./entity-io.ts"

export const ToolsStorageHandlers = HttpApiBuilder.group(Api, "toolsStorage", Effect.fn(function*(handlers) {
  const repo = yield* ToolRepo
  const storage = yield* StorageService
  const io: EntityIO<ToolRow> = {
    plural: "tools", noun: "tools", title: "Tools", type: "tool",
    exportRow: (t, by) => ({
      id: t.id, name: t.name, type: t.type, diameter: t.diameter, material: t.material,
      numberOfFlutes: t.numberOfFlutes, maxRPM: t.maxRPM, coolantType: t.coolantType, cuttingLength: t.cuttingLength,
      totalLength: t.totalLength, shankDiameter: t.shankDiameter, notes: t.notes, metadata: exportMeta(by)
    }),
    visibleByIds: repo.visibleByIds,
    listAll: (userId) => repo.list(userId, { includePublic: false }),
    isMember: repo.isMember,
    importMany: repo.importMany
  }
  const guard = Effect.fn("tools.storage.guard")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* envErr(EnvBadRequest, "Tool ID is required")
    const found = yield* repo.access(user.id, id)
    if (!found) return yield* envErr(EnvNotFound, "Tool not found")
    if (!found.allowed) return yield* envErr(EnvForbidden, "You do not have permission to access this tool")
    return found.row
  })
  // `exportEntities`/`importEntities` read the current user and the storage client
  // from the environment; the storage instance is a per-request resource here, so
  // it is provided explicitly. `CurrentUser` stays in the requirement set because
  // the middleware supplies it at request time.
  // `Exclude` cannot strip `StorageService` from a union of service markers, so
  // the narrowed type is asserted here rather than computed.
  const provide = <A, E, R>(e: Effect.Effect<A, E, R | StorageService>): Effect.Effect<A, E, never> =>
    e.pipe(Effect.provideService(StorageService, storage)) as never
  const exporter = (query: { ids?: string | ReadonlyArray<string> | undefined; format?: string | undefined }) =>
    provide(exportEntities(io)(query)).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal }))
  const importer = (payload: unknown) =>
    provide(importEntities(io)(payload)).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal }))

  return handlers
    .handle("save", ({ params, payload }) =>
      Effect.gen(function*() {
        yield* guard(params.id)
        if (!payload) return yield* envErr(EnvBadRequest, "Tool data is required")
        const storagePath = yield* storage.upload(storage.generateObjectPath("tool", params.id), payload as object)
        // Legacy parity: the path is only returned; the Tool row just gets a new updatedAt.
        yield* repo.touch(params.id)
        return ok({ storagePath }, "Tool saved to storage successfully")
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("read", ({ params, query }) =>
      Effect.gen(function*() {
        const tool = yield* guard(params.id)
        // Legacy parity: without `?path` the "last storage path" is the tool id itself.
        const storagePath = query.path || tool.id
        if (!storagePath) return yield* envErr(EnvNotFound, "This tool does not have storage data")
        if (query.signedUrl === "true") return ok({ signedUrl: yield* storage.signedUrl(storagePath) })
        return ok(yield* storage.download(storagePath))
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("remove", ({ params, query }) =>
      Effect.gen(function*() {
        yield* guard(params.id)
        // Legacy parity: the stored path list is always empty, so only an explicit `?path` can be deleted.
        if (!query.path) return yield* envErr(EnvNotFound, "This tool does not have storage data")
        yield* storage.delete(query.path)
        yield* repo.touch(params.id)
        return ok(null, "Tool storage data deleted successfully")
      }).pipe(Effect.catchTags({
        DatabaseError: internal,
        StorageError: () => Effect.fail(envErr(EnvInternal, "Failed to delete tool storage"))
      })))
    .handle("export", ({ query }) => exporter(query))
    .handle("import", ({ payload }) => importer(payload))
    .handle("exportById", ({ query }) => exporter(query))
    .handle("importById", ({ payload }) => importer(payload))
}))
