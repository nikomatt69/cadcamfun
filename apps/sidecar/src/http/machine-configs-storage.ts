import { Api, CurrentUser, EnvBadRequest, EnvForbidden, EnvInternal, EnvNotFound, envErr, ok } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { MachineConfigRepo, type MachineConfigView } from "../repos/machine-config-repo.ts"
import { StorageService } from "../services/storage.ts"
import { type EntityIO, exportEntities, exportMeta, importEntities, internal } from "./entity-io.ts"

const storagePathOf = (config: unknown): string | undefined =>
  config && typeof config === "object" ? (config as { storagePath?: string }).storagePath : undefined

export const MachineConfigsStorageHandlers = HttpApiBuilder.group(Api, "machineConfigsStorage", Effect.fn(function*(handlers) {
  const repo = yield* MachineConfigRepo
  const storage = yield* StorageService
  const io: EntityIO<MachineConfigView> = {
    plural: "machine-configs", noun: "machine configurations", title: "Machine configurations", type: "machine-config",
    exportRow: (c, by) => ({ id: c.id, name: c.name, description: c.description, type: c.type, config: c.config, metadata: exportMeta(by) }),
    visibleByIds: repo.visibleByIds,
    // Legacy lists via the bucket index; locally: the user's own configs.
    listAll: (userId) => repo.list(userId, { includePublic: false, page: 1, limit: 100000 }).pipe(Effect.map((r) => r.rows)),
    isMember: () => Effect.succeed(true),
    importMany: repo.importMany
  }
  const provide = <A, E, R>(e: Effect.Effect<A, E, R | StorageService>): Effect.Effect<A, E, Exclude<R, StorageService>> =>
    e.pipe(Effect.provideService(StorageService, storage)) as never

  const guard = Effect.fn("machineConfigs.storage.guard")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* envErr(EnvBadRequest, "Machine configuration ID is required")
    const row = yield* repo.byId(id)
    if (!row) return yield* envErr(EnvNotFound, "Machine configuration not found")
    if (!(row.ownerId === user.id || row.isPublic)) {
      return yield* envErr(EnvForbidden, "You do not have permission to access this machine configuration")
    }
    return { user, row }
  })

  return handlers
    .handle("save", ({ params, payload }) =>
      Effect.gen(function*() {
        const { user, row } = yield* guard(params.id)
        if (row.ownerId !== user.id) return yield* envErr(EnvForbidden, "Only the owner can modify this machine configuration")
        if (!payload) return yield* envErr(EnvBadRequest, "Machine configuration data is required")
        const storagePath = yield* storage.upload(storage.generateObjectPath("machine-config", params.id), payload as object)
        const base = typeof row.config === "object" && row.config ? row.config : {}
        yield* repo.setConfig(params.id, { ...base, storagePath })
        return ok({ storagePath }, "Machine configuration saved to storage successfully")
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("read", ({ params, query }) =>
      Effect.gen(function*() {
        const { row } = yield* guard(params.id)
        const storagePath = storagePathOf(row.config)
        if (!storagePath) return yield* envErr(EnvNotFound, "This machine configuration does not have storage data")
        if (query.signedUrl === "true") return ok({ signedUrl: yield* storage.signedUrl(storagePath) })
        return ok(yield* storage.download(storagePath))
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const { user, row } = yield* guard(params.id)
        if (row.ownerId !== user.id) return yield* envErr(EnvForbidden, "Only the owner can delete this machine configuration")
        const storagePath = storagePathOf(row.config)
        if (!storagePath) return yield* envErr(EnvNotFound, "This machine configuration does not have storage data")
        yield* storage.delete(storagePath)
        const { storagePath: _removed, ...rest } = (typeof row.config === "object" && row.config ? row.config : {}) as Record<string, unknown>
        yield* repo.setConfig(params.id, rest)
        return ok(null, "Machine configuration storage data deleted successfully")
      }).pipe(Effect.catchTags({
        DatabaseError: internal,
        StorageError: () => Effect.fail(envErr(EnvInternal, "Failed to delete machine configuration storage"))
      })))
    .handle("export", ({ query }) => provide(exportEntities(io)(query)).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("import", ({ payload }) => provide(importEntities(io)(payload)).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
}))
