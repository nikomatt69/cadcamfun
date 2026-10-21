import { Api, CreateMachineConfig, CurrentUser, EnvBadRequest, EnvForbidden, EnvInternal, EnvNotFound, envErr, okAuth } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { MachineConfigRepo } from "../repos/machine-config-repo.ts"
import { internal } from "./entity-io.ts"

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const MACHINE_TYPES = ["mill", "lathe", "printer", "laser"]
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export const MachineConfigsHandlers = HttpApiBuilder.group(Api, "machineConfigs", Effect.fn(function*(handlers) {
  const repo = yield* MachineConfigRepo
  const load = Effect.fn("machineConfigs.load")(function*(id: string, notFound: string) {
    const user = yield* CurrentUser
    if (!id) return yield* envErr(EnvBadRequest, "Machine configuration ID is required")
    const found = yield* repo.find(user.id, id)
    if (!found) return yield* envErr(EnvNotFound, notFound)
    return { user, ...found }
  })
  const guarded = Effect.fn("machineConfigs.guarded")(function*(id: string) {
    const f = yield* load(id, "Machine configuration not found")
    if (!f.permission.hasAccess) {
      return yield* envErr(EnvForbidden, `You do not have permission to access this machine configuration. ${f.permission.reason || ""}`)
    }
    return f
  })

  return handlers
    .handle("defaults", () =>
      // The built-in catalogue of machines, in the shape the library stores: what the Resources list shows as the
      // default machines, and what the kernel plans against when no configuration is chosen.
      Effect.succeed(okAuth(cam.kernel.DEFAULT_MACHINE_CONFIGS)))
    .handle("list", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const page = Math.max(1, Number(query.page) || 1)
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE))
        const { rows, total } = yield* repo.list(user.id, { type: query.type, search: query.search, page, limit })
        return okAuth({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
      }).pipe(Effect.catchTag("DatabaseError", internal)))
    .handle("create", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const parsed = yield* Schema.decodeUnknownEffect(CreateMachineConfig)(payload).pipe(
          Effect.mapError((e) => envErr(EnvBadRequest, "Invalid request data: " + e.message)))
        const view = yield* repo.create(user.id, { ...parsed, isPublic: parsed.isPublic ?? false })
        return okAuth({ ...view, isOwner: true, usageCount: 0 }, "Machine configuration created successfully")
      }).pipe(Effect.catchTag("DatabaseError", internal)))
    .handle("get", ({ params }) =>
      Effect.gen(function*() {
        const f = yield* guarded(params.id)
        return okAuth({ ...f.view, isOwner: f.permission.isOwner, usageCount: f.usageCount })
      }).pipe(Effect.catchTag("DatabaseError", internal)))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        const f = yield* guarded(params.id)
        if (!f.permission.isOwner) return yield* envErr(EnvForbidden, "Only the owner can update this machine configuration")
        const body = (isObj(payload) ? payload : {}) as { name?: string; description?: string | null; type?: string; config?: Record<string, unknown>; isPublic?: boolean }
        if (!body.name) return yield* envErr(EnvBadRequest, "Machine configuration name is required")
        if (body.type && !MACHINE_TYPES.includes(body.type)) {
          return yield* envErr(EnvBadRequest, "Valid machine type is required (mill, lathe, printer, or laser)")
        }
        const base = isObj(f.row.config) ? f.row.config : {}
        if (body.config) {
          const wv = { ...(isObj(base.workVolume) ? base.workVolume : {}), ...(isObj(body.config.workVolume) ? body.config.workVolume : {}) }
          const merged = { ...base, ...body.config, workVolume: wv } as Record<string, unknown> & { workVolume: Record<string, unknown> }
          if (!merged.maxSpindleSpeed) return yield* envErr(EnvBadRequest, "Maximum spindle speed is required in the configuration")
          if (!merged.maxFeedRate) return yield* envErr(EnvBadRequest, "Maximum feed rate is required in the configuration")
          if (typeof wv.x !== "number" || typeof wv.y !== "number" || typeof wv.z !== "number") {
            return yield* envErr(EnvBadRequest, "Work volume dimensions (x, y, z) are required in the configuration")
          }
        }
        const updated = yield* repo.update(params.id, {
          name: body.name,
          description: body.description !== undefined ? body.description : f.row.description,
          // Legacy parity: shallow merge of the stored config with the body config.
          config: body.config ? { ...base, ...body.config } : f.row.config,
          type: body.type || f.row.type,
          isPublic: body.isPublic !== undefined ? body.isPublic : f.row.isPublic
        })
        return okAuth({ ...updated.view, isOwner: true, usageCount: updated.usageCount }, "Machine configuration updated successfully")
      }).pipe(Effect.catchTag("DatabaseError", internal)))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const f = yield* guarded(params.id)
        if (!f.permission.isOwner) return yield* envErr(EnvForbidden, "Only the owner can delete this machine configuration")
        const usage = yield* repo.usage(params.id)
        if (usage > 0) {
          return yield* envErr(EnvBadRequest, `Cannot delete machine configuration as it is being used by ${usage} toolpath${usage > 1 ? "s" : ""}`)
        }
        yield* repo.remove(params.id)
        return okAuth(null, "Machine configuration deleted successfully")
      }).pipe(Effect.catchTag("DatabaseError", internal)))
    .handle("clone", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!params.id) return yield* envErr(EnvBadRequest, "Machine configuration ID is required")
        const found = yield* repo.find(user.id, params.id)
        if (!found) return yield* envErr(EnvNotFound, "Source machine configuration not found")
        const src = found.row
        if (src.ownerId !== user.id) {
          return yield* envErr(EnvForbidden, "You do not have permission to clone this machine configuration")
        }
        const name = isObj(payload) && typeof payload.name === "string" && payload.name ? payload.name : `${src.name} (Copy)`
        const view = yield* repo.create(user.id, { name, description: src.description, type: src.type, config: src.config, isPublic: false })
        return okAuth({ ...view, isOwner: true, usageCount: 0 }, "Machine configuration cloned successfully")
      }).pipe(Effect.catchTag("DatabaseError", internal)))
}))

export { EnvInternal }
