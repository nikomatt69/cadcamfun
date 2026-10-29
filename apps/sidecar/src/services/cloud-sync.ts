import { CloudProjectStatus, CloudProjectSummary, CloudTransfer, CompanionPairing, type CloudAsset, type CloudConnection } from "@cadcamfun/api"
import { type DatabaseError } from "@cadcamfun/db"
import { Context, Effect, Layer, Schema } from "effect"
import { CloudProjectRepo } from "../repos/cloud-project-repo.ts"
import { CloudConnections, CloudHttp, cloudOrigin, readCloudJson, type CloudCredentials } from "./cloud-connection.ts"
import { ASSET_MANIFEST, CloudSyncError, MAX_CLOUD_BODY, metadataOf, safeId, safeStorageKey, sha256, verifyCloudTransfer, type AssetMetadata } from "./cloud-transfer.ts"
import { StorageService } from "./storage.ts"
import type { Actor } from "./project-vcs.ts"

type Error = CloudSyncError | DatabaseError
type Export = Omit<CloudTransfer, "assets"> & { readonly assets: readonly AssetMetadata[] }

export class CloudSync extends Context.Service<CloudSync, {
  connection(userId: string): Effect.Effect<CloudConnection, CloudSyncError>
  setConnection(userId: string, value: CloudCredentials): Effect.Effect<CloudConnection, CloudSyncError>
  disconnect(userId: string): Effect.Effect<CloudConnection, CloudSyncError>
  enroll(userId: string, identityToken: string | undefined, input: { readonly origin: string; readonly name: string; readonly setupCode?: string }): Effect.Effect<CloudConnection, CloudSyncError>
  pair(userId: string, identityToken: string | undefined, name: string): Effect.Effect<typeof CompanionPairing.Type, CloudSyncError>
  projects(userId: string, identityToken: string | undefined): Effect.Effect<readonly CloudProjectSummary[], Error>
  status(projectId: string, userId: string): Effect.Effect<CloudProjectStatus, Error>
  publish(projectId: string, actor: Actor, identityToken: string | undefined): Effect.Effect<CloudProjectStatus, Error>
  fetch(projectId: string, userId: string, identityToken: string | undefined): Effect.Effect<CloudProjectStatus, Error>
  apply(projectId: string, userId: string, identityToken: string | undefined, expectedHead?: string): Effect.Effect<CloudProjectStatus, Error>
  clone(projectId: string, userId: string, identityToken: string | undefined): Effect.Effect<CloudProjectStatus, Error>
  send(projectId: string, actor: Actor, message?: string): Effect.Effect<CloudProjectStatus, Error>
  remoteProjects(userId: string): Effect.Effect<readonly CloudProjectSummary[], Error>
  remoteExport(projectId: string, userId: string): Effect.Effect<CloudTransfer, Error>
  remoteImport(projectId: string, userId: string, transfer: CloudTransfer, expectedHead: string | null): Effect.Effect<CloudProjectStatus, Error>
  receipt(projectId: string, userId: string, deviceId: string, head: string, state: "downloaded" | "applied"): Effect.Effect<CloudProjectStatus, Error>
}>()("cadcamfun/CloudSync") {
  static readonly layer = Layer.effect(CloudSync, Effect.gen(function*() {
    const projects = yield* CloudProjectRepo
    const connections = yield* CloudConnections
    const http = yield* CloudHttp
    const storage = yield* StorageService

    const enrollment = Effect.fn("CloudSync.enrollment")(function*(identity: string | undefined, input: { readonly origin: string; readonly name: string; readonly setupCode?: string }) {
      if (!identity?.trim()) return yield* new CloudSyncError({ code: "unauthorized", message: "Sign in before connecting to your cloud workspace." })
      return yield* Effect.tryPromise({ try: async () => {
        const origin = cloudOrigin(input.origin)
        if (!input.name.trim() || input.name.length > 100 || (input.setupCode?.length ?? 0) > 4096) throw new CloudSyncError({ code: "invalid", message: "Enter a device name of 1–100 characters and a valid setup code" })
        const response = await http.request(origin, "/api/cloud/enroll", {
          method: "POST", headers: { "x-identity-token": identity, "content-type": "application/json" }, body: JSON.stringify({ name: input.name.trim(), ...(input.setupCode ? { setupCode: input.setupCode } : {}) }),
        })
        if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new CloudSyncError({ code: "unauthorized", message: "The cloud refused this account or setup code." }) }
        if (!response.ok) { await response.body?.cancel(); throw new CloudSyncError({ code: "remote", message: `Cloud device enrollment failed (${response.status})` }) }
        const pairing = Schema.decodeUnknownSync(CompanionPairing)(await readCloudJson(response))
        const link = new URL(pairing.link)
        const workspaceId = link.searchParams.get("workspace") ?? ""
        const token = link.searchParams.get("token") ?? ""
        const linkedOrigin = cloudOrigin(link.searchParams.get("host") ?? "")
        if (link.protocol !== "cadcamfun:" || link.hostname !== "pair" || link.searchParams.get("mode") !== "cloud" || linkedOrigin !== origin || !/^[A-Za-z0-9_-]{1,128}$/u.test(workspaceId) || token.length < 16 || token.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(token)) throw new CloudSyncError({ code: "invalid", message: "The cloud returned invalid device credentials" })
        const announced = response.headers.get("x-cadcamfun-workspace-id")
        if (announced !== null && announced !== workspaceId) throw new CloudSyncError({ code: "unauthorized", message: "The cloud returned another workspace's pairing" })
        return { pairing, credentials: { origin, workspaceId, token } }
      }, catch: (cause) => cause instanceof CloudSyncError ? cause : new CloudSyncError({ code: "remote", message: "The cloud workspace could not enroll this device" }) })
    })

    const request = <S extends Schema.Top & { readonly DecodingServices: never }>(userId: string, identity: string | undefined, path: string, responseSchema: S, init: { readonly method?: string; readonly body?: unknown } = {}): Effect.Effect<S["Type"], CloudSyncError> => Effect.gen(function*() {
      if (!identity?.trim()) return yield* new CloudSyncError({ code: "unauthorized", message: "Sign in to your CADCAMFUN account before synchronizing with the cloud." })
      const connection = yield* connections.credentials(userId)
      return yield* Effect.tryPromise({
        try: async () => {
          const body = init.body === undefined ? undefined : JSON.stringify(init.body)
          if (body && new TextEncoder().encode(body).byteLength > MAX_CLOUD_BODY) throw new CloudSyncError({ code: "invalid", message: "This project exceeds the 64 MiB transfer limit" })
          const response = await http.request(connection.origin, path, {
            method: init.method ?? "GET",
            headers: { authorization: `Bearer ${connection.token}`, "x-identity-token": identity, "content-type": "application/json" },
            ...(body === undefined ? {} : { body }),
          })
          if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new CloudSyncError({ code: "unauthorized", message: "The cloud refused this account or device. Sign in again or renew the device pairing." }) }
          if (response.status === 404) { await response.body?.cancel(); throw new CloudSyncError({ code: "not-found", message: "This project is not available in the cloud workspace" }) }
          if (response.status === 409) { await response.body?.cancel(); throw new CloudSyncError({ code: "conflict", message: "The cloud project changed or has uncommitted work. Download and reconcile its changes before publishing." }) }
          if (!response.ok) { await response.body?.cancel(); throw new CloudSyncError({ code: "remote", message: `The cloud could not complete the request (${response.status})` }) }
          if (response.headers.get("x-cadcamfun-workspace-id") !== connection.workspaceId) { await response.body?.cancel(); throw new CloudSyncError({ code: "unauthorized", message: "The server is not the configured cloud workspace" }) }
          return Schema.decodeUnknownSync(responseSchema)(await readCloudJson(response))
        },
        catch: (cause) => cause instanceof CloudSyncError ? cause : new CloudSyncError({ code: "remote", message: "The cloud workspace is unavailable or returned an invalid response. Your local project is unchanged." }),
      })
    })

    const cache = Effect.fn("CloudSync.cacheAssets")(function*(transfer: CloudTransfer) {
      const checked = yield* Effect.try({ try: () => verifyCloudTransfer(transfer), catch: (cause) => cause instanceof CloudSyncError ? cause : new CloudSyncError({ code: "invalid", message: "Invalid cloud transfer" }) })
      for (const asset of transfer.assets) {
        const bytes = checked.assets.get(asset.id)
        if (!bytes) return yield* new CloudSyncError({ code: "missing-asset", message: "An uploaded project file is missing" })
        yield* storage.upload(`cloud/assets/${asset.sha256}`, bytes).pipe(Effect.mapError(() => new CloudSyncError({ code: "missing-asset", message: "An uploaded project file could not be stored" })))
      }
    })

    const withBodies = Effect.fn("CloudSync.assetBodies")(function*(transfer: Export) {
      const assets: CloudAsset[] = []
      for (const metadata of transfer.assets) {
        const bytes = yield* storage.downloadBytes(`cloud/assets/${metadata.sha256}`).pipe(Effect.mapError(() => new CloudSyncError({ code: "missing-asset", message: "A required project file could not be read" })))
        if (!bytes || bytes.byteLength !== metadata.size || sha256(bytes) !== metadata.sha256) return yield* new CloudSyncError({ code: "missing-asset", message: "A required project file is missing or damaged. Fetch the project again." })
        assets.push({ ...metadata, body: Buffer.from(bytes).toString("base64") })
      }
      const result: CloudTransfer = { ...transfer, assets }
      yield* Effect.try({ try: () => verifyCloudTransfer(result), catch: (cause) => cause instanceof CloudSyncError ? cause : new CloudSyncError({ code: "invalid", message: "Invalid cloud transfer" }) })
      return result
    })

    const installAssets = Effect.fn("CloudSync.installAssets")(function*(transfer: CloudTransfer) {
      const checked = yield* Effect.try({ try: () => verifyCloudTransfer(transfer), catch: (cause) => cause instanceof CloudSyncError ? cause : new CloudSyncError({ code: "invalid", message: "Invalid cloud transfer" }) })
      for (const asset of transfer.assets) {
        const existing = yield* storage.downloadBytes(asset.key).pipe(Effect.mapError(() => new CloudSyncError({ code: "missing-asset", message: "An existing uploaded file could not be checked" })))
        if (existing && sha256(existing) !== asset.sha256) return yield* new CloudSyncError({ code: "conflict", message: `Uploaded file ${asset.fileName} has different local content. Keep or rename it before applying.` })
        const bytes = checked.assets.get(asset.id)
        if (!existing && bytes) yield* storage.upload(asset.key, bytes).pipe(Effect.mapError(() => new CloudSyncError({ code: "missing-asset", message: "A required uploaded file could not be installed" })))
      }
    })

    const checkpoint = Effect.fn("CloudSync.checkpoint")(function*(id: string, actor: Actor, message: string, pending: boolean) {
      const captured = yield* projects.capture(id, actor.userId)
      const assets: AssetMetadata[] = []
      let total = 0
      for (const row of captured.uploads) {
        if (!row.objectId || !safeId(row.id) || !safeStorageKey(row.s3Key)) return yield* new CloudSyncError({ code: "invalid", message: "An uploaded project file has invalid metadata" })
        const bytes = yield* storage.downloadBytes(row.s3Key).pipe(Effect.mapError(() => new CloudSyncError({ code: "missing-asset", message: `Uploaded file ${row.fileName} could not be read` })))
        if (!bytes) return yield* new CloudSyncError({ code: "missing-asset", message: `Uploaded file ${row.fileName} is missing. Restore it before publishing.` })
        total += bytes.byteLength
        if (total > 16 * 1024 * 1024) return yield* new CloudSyncError({ code: "invalid", message: "Uploaded project files exceed the 16 MiB transfer limit" })
        const hash = sha256(bytes)
        yield* storage.upload(`cloud/assets/${hash}`, bytes).pipe(Effect.mapError(() => new CloudSyncError({ code: "missing-asset", message: "Uploaded project files could not be prepared" })))
        assets.push({ id: row.id, fileName: row.fileName, key: row.s3Key, contentType: row.s3ContentType, objectId: row.objectId, objectType: row.objectType ?? "PROJECT", size: bytes.byteLength, sha256: hash })
      }
      return yield* projects.commit(id, actor, captured.revision, assets, message.trim() || "Send project to desktop", pending)
    })

    const remoteExport = Effect.fn("CloudSync.remoteExport")(function*(id: string, userId: string) { return yield* withBodies(yield* projects.export(id, userId)) })
    const receipt = Effect.fn("CloudSync.acknowledge")(function*(id: string, userId: string, identity: string | undefined, head: string, state: "downloaded" | "applied") {
      const local = yield* connections.status(userId)
      yield* request(userId, identity, `/api/cloud/remote/projects/${encodeURIComponent(id)}/receipt`, CloudProjectStatus, { method: "POST", body: { deviceId: local.deviceId, head, state } })
    })

    return CloudSync.of({
      connection: connections.status,
      setConnection: connections.save,
      disconnect: connections.remove,
      enroll: Effect.fn("CloudSync.enroll")(function*(userId, identity, input) {
        const result = yield* enrollment(identity, input)
        return yield* connections.save(userId, result.credentials)
      }),
      pair: Effect.fn("CloudSync.pair")(function*(userId, identity, name) {
        const connection = yield* connections.credentials(userId)
        const result = yield* enrollment(identity, { origin: connection.origin, name })
        if (result.credentials.workspaceId !== connection.workspaceId) return yield* new CloudSyncError({ code: "unauthorized", message: "The server is not the configured cloud workspace" })
        return result.pairing
      }),
      projects: (userId, identity) => request(userId, identity, "/api/cloud/remote/projects", Schema.Array(CloudProjectSummary)),
      status: projects.status,
      publish: Effect.fn("CloudSync.publish")(function*(id, actor, identity) {
        if (!identity?.trim()) return yield* new CloudSyncError({ code: "unauthorized", message: "Sign in before publishing a project to the cloud." })
        yield* checkpoint(id, actor, "Publish project to cloud", false)
        const transfer = yield* remoteExport(id, actor.userId)
        const catalog = yield* request(actor.userId, identity, "/api/cloud/remote/projects", Schema.Array(CloudProjectSummary))
        const remote = catalog.find((item) => item.id === id)
        yield* request(actor.userId, identity, `/api/cloud/remote/projects/${encodeURIComponent(id)}`, CloudProjectStatus, { method: "PUT", body: { transfer, expectedHead: remote?.head ?? null } })
        const connection = yield* connections.credentials(actor.userId)
        return yield* projects.markRemote(id, actor.userId, connection.workspaceId, transfer.head, "applied")
      }),
      fetch: Effect.fn("CloudSync.fetch")(function*(id, userId, identity) {
        yield* projects.status(id, userId)
        const transfer = yield* request(userId, identity, `/api/cloud/remote/projects/${encodeURIComponent(id)}`, CloudTransfer)
        if (transfer.projectId !== id) return yield* new CloudSyncError({ code: "invalid", message: "The cloud returned another project" })
        yield* cache(transfer)
        const connection = yield* connections.credentials(userId)
        const staged = yield* projects.stage(id, userId, connection.workspaceId, transfer)
        yield* receipt(id, userId, identity, transfer.head, "downloaded")
        return staged
      }),
      apply: Effect.fn("CloudSync.apply")(function*(id, userId, identity, expectedHead) {
        if (!identity?.trim()) return yield* new CloudSyncError({ code: "unauthorized", message: "Sign in before applying a cloud version." })
        const connection = yield* connections.credentials(userId)
        const before = yield* projects.status(id, userId)
        if (before.dirty) return yield* new CloudSyncError({ code: "dirty", message: "Commit or preserve local changes before applying the cloud version." })
        if (expectedHead !== undefined && expectedHead !== before.localHead) return yield* new CloudSyncError({ code: "conflict", message: "The local branch changed. Review it before applying." })
        const staged = yield* projects.staged(id, userId, connection.workspaceId)
        const transfer = yield* withBodies(staged)
        yield* installAssets(transfer)
        const result = yield* projects.apply(id, userId, connection.workspaceId, transfer, before.localHead)
        yield* receipt(id, userId, identity, transfer.head, "applied")
        return result
      }),
      clone: Effect.fn("CloudSync.clone")(function*(id, userId, identity) {
        yield* projects.authorizeImport(id, userId)
        const transfer = yield* request(userId, identity, `/api/cloud/remote/projects/${encodeURIComponent(id)}`, CloudTransfer)
        if (transfer.projectId !== id) return yield* new CloudSyncError({ code: "invalid", message: "The cloud returned another project" })
        yield* cache(transfer)
        yield* installAssets(transfer)
        yield* projects.accept(id, userId, transfer, null, true)
        const connection = yield* connections.credentials(userId)
        const result = yield* projects.markRemote(id, userId, connection.workspaceId, transfer.head, "applied")
        yield* receipt(id, userId, identity, transfer.head, "applied")
        return result
      }),
      send: (id, actor, message) => checkpoint(id, actor, message ?? "Send project to desktop", true),
      remoteProjects: projects.list,
      remoteExport,
      remoteImport: Effect.fn("CloudSync.remoteImport")(function*(id, userId, transfer, expectedHead) {
        yield* projects.authorizeImport(id, userId)
        yield* cache(transfer)
        yield* installAssets(transfer)
        return yield* projects.accept(id, userId, transfer, expectedHead, expectedHead === null)
      }),
      receipt: projects.receipt,
    })
  }))
}
