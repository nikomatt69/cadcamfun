import { type CloudConnection } from "@cadcamfun/api"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { lookup } from "node:dns/promises"
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { isIP } from "node:net"
import { join } from "node:path"
import { checkServerIdentity, type PeerCertificate } from "node:tls"
import { AppConfigService } from "../config.ts"
import { CloudSyncError, MAX_CLOUD_BODY, sha256 } from "./cloud-transfer.ts"

const ConnectionSchema = Schema.Struct({ origin: Schema.String, workspaceId: Schema.String, token: Schema.String })
export type CloudCredentials = typeof ConnectionSchema.Type

/** Rejects non-origin URLs, credentials, redirects and private network targets at the connection boundary. */
export const cloudOrigin = (value: string): string => {
  let url: URL
  try { url = new URL(value) } catch { throw new CloudSyncError({ code: "invalid", message: "Enter a valid HTTPS cloud origin" }) }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.port && url.port !== "443")) throw new CloudSyncError({ code: "invalid", message: "The cloud address must be an HTTPS origin on port 443" })
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") || isIP(url.hostname.replace(/^\[|\]$/gu, ""))) throw new CloudSyncError({ code: "invalid", message: "Use the public DNS name of the cloud workspace" })
  return url.origin
}

const privateAddress = (value: string): boolean => {
  if (isIP(value) === 4) {
    const bytes = value.split(".").map(Number)
    return bytes[0] === 0 || bytes[0] === 10 || bytes[0] === 127 || bytes[0] === 169 && bytes[1] === 254 || bytes[0] === 172 && (bytes[1] ?? 0) >= 16 && (bytes[1] ?? 0) <= 31 || bytes[0] === 192 && (bytes[1] === 168 || bytes[1] === 0) || bytes[0] === 100 && (bytes[1] ?? 0) >= 64 && (bytes[1] ?? 0) <= 127 || bytes[0] === 198 && (bytes[1] === 18 || bytes[1] === 19 || bytes[1] === 51 && bytes[2] === 100) || bytes[0] === 203 && bytes[1] === 0 && bytes[2] === 113 || (bytes[0] ?? 0) >= 224
  }
  const normalized = value.toLowerCase()
  return !/^[23]/u.test(normalized) || normalized.startsWith("2001:db8:") || normalized.startsWith("2002:")
}

/** The validated IP is also the connection target, so a second DNS answer cannot rebind the request to a private host. */
export const cloudNetworkTarget = (origin: string, addresses: readonly { readonly address: string }[]): { readonly hostname: string; readonly target: URL } => {
  const validated = new URL(cloudOrigin(origin))
  if (addresses.length === 0 || addresses.some((entry) => !isIP(entry.address) || privateAddress(entry.address))) throw new CloudSyncError({ code: "invalid", message: "The cloud workspace must resolve only to public network addresses" })
  const address = addresses.find((entry) => isIP(entry.address) === 4)?.address ?? addresses[0]?.address
  if (!address) throw new CloudSyncError({ code: "invalid", message: "The cloud workspace has no public address" })
  const target = new URL(validated)
  target.hostname = isIP(address) === 6 ? `[${address}]` : address
  return { hostname: validated.hostname, target }
}

/** Tests replace this seam, rather than adding a production switch that weakens public-origin checks. */
export class CloudHttp extends Context.Service<CloudHttp, {
  request(origin: string, path: string, init: RequestInit): Promise<Response>
}>()("cadcamfun/CloudHttp") {
  static readonly layer = Layer.succeed(CloudHttp, CloudHttp.of({
    request: async (origin, path, init) => {
      const validated = cloudOrigin(origin)
      if ((!path.startsWith("/api/cloud/remote/") && path !== "/api/cloud/enroll") || path.includes("\\") || path.includes("..")) throw new CloudSyncError({ code: "invalid", message: "Invalid cloud API path" })
      const addresses = await lookup(new URL(validated).hostname, { all: true })
      const { hostname, target } = cloudNetworkTarget(validated, addresses)
      target.pathname = path
      const headers = new Headers(init.headers)
      headers.set("host", hostname)
      return fetch(target, {
        ...init, headers, redirect: "error", signal: init.signal ?? AbortSignal.timeout(120_000),
        tls: { serverName: hostname, rejectUnauthorized: true, checkServerIdentity: (_peer: string, certificate: PeerCertificate) => checkServerIdentity(hostname, certificate) },
      })
    },
  }))
}

export const readCloudJson = async (response: Response): Promise<unknown> => {
  if (!response.body) throw new CloudSyncError({ code: "remote", message: "The cloud returned an empty response" })
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const result = await reader.read()
    if (result.done) break
    size += result.value.byteLength
    if (size > MAX_CLOUD_BODY) {
      await reader.cancel()
      throw new CloudSyncError({ code: "remote", message: "The cloud response exceeds the transfer limit" })
    }
    chunks.push(result.value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new CloudSyncError({ code: "remote", message: "The cloud returned invalid JSON" }) }
}

export class CloudConnections extends Context.Service<CloudConnections, {
  status(userId: string): Effect.Effect<CloudConnection, CloudSyncError>
  credentials(userId: string): Effect.Effect<CloudCredentials, CloudSyncError>
  save(userId: string, input: CloudCredentials): Effect.Effect<CloudConnection, CloudSyncError>
  remove(userId: string): Effect.Effect<CloudConnection, CloudSyncError>
}>()("cadcamfun/CloudConnections") {
  static readonly layer = Layer.effect(CloudConnections, Effect.gen(function*() {
    const { dataDir } = yield* AppConfigService
    const database = yield* Database
    const folder = join(dataDir, "cloud-connections")
    const pathOf = (userId: string) => join(folder, `${sha256(userId)}.json`)
    const read = (userId: string) => Effect.tryPromise({
      try: async () => {
        const raw = await readFile(pathOf(userId), "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error))
        return raw === undefined ? undefined : Schema.decodeUnknownSync(ConnectionSchema)(JSON.parse(raw))
      },
      catch: () => new CloudSyncError({ code: "invalid", message: "The saved cloud connection could not be read" }),
    })
    const deviceId = () => database.query("cloud.device", (db) => {
      const key = "cloud:device-id"
      const current = db.select().from(schema.localKeyValueTable).where(eq(schema.localKeyValueTable.key, key)).get()?.value
      if (typeof current === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(current)) return current
      const value = crypto.randomUUID()
      db.insert(schema.localKeyValueTable).values({ key, value }).onConflictDoUpdate({ target: schema.localKeyValueTable.key, set: { value } }).run()
      return value
    }).pipe(Effect.mapError(() => new CloudSyncError({ code: "invalid", message: "The desktop device identity could not be read" })))
    const status = Effect.fn("CloudConnections.status")(function*(userId: string) {
      const saved = yield* read(userId)
      return { configured: saved !== undefined, origin: saved?.origin ?? null, workspaceId: saved?.workspaceId ?? null, deviceId: yield* deviceId() }
    })
    const clearStages = (userId: string) => database.query("cloud.clearStages", (db) => {
      const projects = db.select({ id: schema.projectTable.id }).from(schema.projectTable).where(eq(schema.projectTable.ownerId, userId)).all()
      for (const project of projects) db.delete(schema.localKeyValueTable).where(eq(schema.localKeyValueTable.key, `cloud:project:${project.id}`)).run()
    }).pipe(Effect.mapError(() => new CloudSyncError({ code: "invalid", message: "The previous cloud downloads could not be detached" })))
    return CloudConnections.of({
      status,
      credentials: Effect.fn("CloudConnections.credentials")(function*(userId) {
        const saved = yield* read(userId)
        if (!saved) return yield* new CloudSyncError({ code: "invalid", message: "Connect a cloud workspace first" })
        return saved
      }),
      save: Effect.fn("CloudConnections.save")(function*(userId, input) {
        const validated = yield* Effect.try({ try: () => {
          const origin = cloudOrigin(input.origin)
          if (!/^[A-Za-z0-9_-]{1,128}$/u.test(input.workspaceId) || input.token.length < 16 || input.token.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(input.token)) throw new Error("Invalid connection")
          return { ...input, origin }
        }, catch: () => new CloudSyncError({ code: "invalid", message: "Use a valid cloud origin, workspace identifier and device token" }) })
        const previous = yield* read(userId)
        if (previous && (previous.origin !== validated.origin || previous.workspaceId !== validated.workspaceId)) yield* clearStages(userId)
        yield* Effect.tryPromise({ try: async () => {
          await mkdir(folder, { recursive: true, mode: 0o700 })
          await chmod(folder, 0o700)
          const target = pathOf(userId)
          const temporary = `${target}.${crypto.randomUUID()}.tmp`
          try {
            await writeFile(temporary, JSON.stringify(validated), { mode: 0o600, flag: "wx" })
            await rename(temporary, target)
          } finally { await rm(temporary, { force: true }) }
        }, catch: () => new CloudSyncError({ code: "invalid", message: "The cloud connection could not be saved" }) })
        return yield* status(userId)
      }),
      remove: Effect.fn("CloudConnections.remove")(function*(userId) {
        yield* clearStages(userId)
        yield* Effect.tryPromise({ try: () => rm(pathOf(userId), { force: true }), catch: () => new CloudSyncError({ code: "invalid", message: "The cloud connection could not be removed" }) })
        return yield* status(userId)
      }),
    })
  }))
}
