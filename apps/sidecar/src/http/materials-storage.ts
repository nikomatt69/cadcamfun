import { Api, CurrentUser, EnvBadRequest, EnvForbidden, EnvInternal, EnvNotFound, envErr, ok } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import type { MaterialRow } from "@cadcamfun/api"
import { MaterialRepo } from "../repos/material-repo.ts"
import { StorageService } from "../services/storage.ts"
import { type EntityIO, exportEntities, exportMeta, importEntities, internal } from "./entity-io.ts"

const storagePathOf = (properties: unknown): string | undefined =>
  properties && typeof properties === "object" ? (properties as { storagePath?: string }).storagePath : undefined

export const MaterialsStorageHandlers = HttpApiBuilder.group(Api, "materialsStorage", Effect.fn(function*(handlers) {
  const repo = yield* MaterialRepo
  const storage = yield* StorageService
  const io: EntityIO<MaterialRow> = {
    plural: "materials", noun: "materials", title: "Materials", type: "material",
    exportRow: (m, by) => ({ id: m.id, name: m.name, description: m.description, properties: m.properties || {}, metadata: exportMeta(by) }),
    visibleByIds: (userId, ids) => repo.visibleByIds(userId, ids) as never,
    listAll: (userId) => repo.list(userId, { includePublic: false }),
    isMember: repo.isMember,
    importMany: repo.importMany
  }

  // `Exclude` cannot strip `StorageService` from a union of service markers, so
  // the narrowed type is asserted here rather than computed.
  const provide = <A, E, R>(e: Effect.Effect<A, E, R | StorageService>): Effect.Effect<A, E, never> =>
    e.pipe(Effect.provideService(StorageService, storage)) as never
  const guard = Effect.fn("materials.storage.guard")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* envErr(EnvBadRequest, "Material ID is required")
    const found = yield* repo.access(user.id, id)
    if (!found) return yield* envErr(EnvNotFound, "Material not found")
    if (!found.allowed) return yield* envErr(EnvForbidden, "You do not have permission to access this material")
    return found.row
  })

  return handlers
    .handle("save", ({ params, payload }) =>
      Effect.gen(function*() {
        const material = yield* guard(params.id)
        if (!payload) return yield* envErr(EnvBadRequest, "Material data is required")
        const storagePath = yield* storage.upload(storage.generateObjectPath("material", params.id), payload as object)
        const properties = typeof material.properties === "object" && material.properties ? material.properties : {}
        yield* repo.setProperties(params.id, { ...properties, storagePath })
        return ok({ storagePath }, "Material saved to storage successfully")
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("read", ({ params, query }) =>
      Effect.gen(function*() {
        const material = yield* guard(params.id)
        const storagePath = storagePathOf(material.properties)
        if (!storagePath) return yield* envErr(EnvNotFound, "This material does not have storage data")
        if (query.signedUrl === "true") return ok({ signedUrl: yield* storage.signedUrl(storagePath) })
        return ok(yield* storage.download(storagePath))
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const material = yield* guard(params.id)
        const storagePath = storagePathOf(material.properties)
        if (!storagePath) return yield* envErr(EnvNotFound, "This material does not have storage data")
        yield* storage.delete(storagePath)
        // Legacy parity: the properties are written back unchanged (the storagePath stays), only updatedAt moves.
        yield* repo.setProperties(params.id, typeof material.properties === "object" ? { ...(material.properties as object) } : {})
        return ok(null, "Material storage data deleted successfully")
      }).pipe(Effect.catchTags({
        DatabaseError: internal,
        StorageError: () => Effect.fail(envErr(EnvInternal, "Failed to delete material storage"))
      })))
    .handle("export", ({ query }) => provide(exportEntities(io)(query)).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("import", ({ payload }) => provide(importEntities(io)(payload)).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
}))
