import { SessionUser } from "@cadcamfun/api"
import { Database, schema } from "@cadcamfun/db"
import { and, eq, isNull } from "drizzle-orm"
import { Context, Data, Effect, Layer, Redacted } from "effect"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { AppConfigService } from "../config.ts"
import { getLocalPort, announced } from "../startup.ts"
import {
  defaultHost, fingerprintOf, generateCertificate, hashToken, newToken, pairingGrantLink, pairingHosts, startGateway,
  type CompanionCertificate, type Gateway, type GatewayRequestLog, type TokenRecord,
} from "./companion-gateway.ts"
import { KvStore } from "./kv.ts"

export class CompanionError extends Data.TaggedError("CompanionError")<{ readonly code: "unavailable" | "invalid" | "not-found"; readonly message: string }> {}

export interface CompanionAccount { readonly id: string; readonly email: string | null; readonly name: string | null }
export interface CompanionDevice {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly lastSeen: string | null
  readonly userId: string
  readonly email: string | null
}
export interface CompanionState {
  readonly enabled: boolean
  readonly port: number | null
  readonly fingerprint: string | null
  readonly host: string
  readonly devices: ReadonlyArray<CompanionDevice>
}

const SETTINGS = "companion.settings"
const TOKEN_PREFIX = "companion.token."
const DEFAULT_PORT = 8443
/** How long a QR code can be redeemed. The device token issued afterwards lasts until it is revoked. */
export const PAIRING_TTL_MS = 120_000
/** NikCLI writes `lastUsedAt` at most every five minutes; a phone poll must not become a write per request. */
const LAST_SEEN_INTERVAL_MS = 300_000
const LOCAL_EMAIL = "local@cadcamfun.local"
const USED = "This pairing code has expired or was already used. Show a new QR code on the desktop."

interface StoredToken { readonly id?: unknown; readonly name?: unknown; readonly hash?: unknown; readonly createdAt?: unknown; readonly lastSeen?: unknown }

const iso = (value: Date | null): string | null => value ? value.toISOString() : null

/** Lifecycle of the phone-facing gateway: certificate, scoped device tokens, on/off. Off by default. */
export class Companion extends Context.Service<Companion, {
  status: Effect.Effect<CompanionState>
  enable(port?: number): Effect.Effect<CompanionState, CompanionError>
  disable: Effect.Effect<CompanionState, CompanionError>
  /** A short-lived single-use QR bound to the account that is signed in on the desktop right now. */
  pair(name: string, host: string | undefined, user: CompanionAccount): Effect.Effect<{ id: string; link: string; expiresAt: string }, CompanionError>
  /** Turns that QR into a device token. The raw token is returned once. */
  redeem(code: string): Effect.Effect<{ id: string; token: string; name: string; user: CompanionAccount }, CompanionError>
  revoke(id: string): Effect.Effect<CompanionState, CompanionError>
  /** The account a still-valid device row names, when the gateway's proof matches that row. */
  actor(deviceId: string, userId: string): Effect.Effect<SessionUser | undefined>
}>()("cadcamfun/Companion") {
  static readonly layer = Layer.effect(Companion, Effect.gen(function*() {
    const config = yield* AppConfigService
    const kv = yield* KvStore
    const { query } = yield* Database
    const dir = join(config.dataDir, "companion")
    let gateway: Gateway | undefined
    let certificate: CompanionCertificate | undefined
    let migrated = false
    const seenWrites = new Map<string, number>()
    // The gateway runs outside Effect; its request lines go through this layer's logger (stderr JSON in the app, never stdout).
    const runLog = Effect.runForkWith(yield* Effect.context<never>())
    const logRequest = (entry: GatewayRequestLog): void => {
      const line = entry.status >= 500 ? Effect.logWarning("Companion request") : Effect.logInfo("Companion request")
      runLog(line.pipe(Effect.annotateLogs({
        "companion.device": entry.device ?? "unpaired",
        "companion.ip": entry.ip,
        "companion.kind": entry.kind,
        "http.method": entry.method,
        "http.path": entry.path,
        "http.status": entry.status,
        "http.duration_ms": entry.ms,
        ...(entry.reason ? { "companion.refused": entry.reason } : {}),
      })))
    }

    const settings = Effect.gen(function*() {
      const v = (yield* kv.get(SETTINGS))?.value as { enabled?: boolean; port?: number } | undefined
      return { enabled: v?.enabled === true, port: typeof v?.port === "number" ? v.port : DEFAULT_PORT }
    }).pipe(Effect.catchTag("KvError", (e) => Effect.logWarning("Unable to load companion settings", e).pipe(Effect.as({ enabled: false, port: DEFAULT_PORT }))))

    const devices = schema.companionDeviceTable
    const codes = schema.companionPairingCodeTable
    const users = schema.userTable

    const activeRows = Effect.gen(function*() {
      const now = new Date()
      return yield* query("companion.devices", (db) => db.select({
        id: devices.id,
        name: devices.name,
        hash: devices.hash,
        createdAt: devices.createdAt,
        lastSeenAt: devices.lastSeenAt,
        expiresAt: devices.expiresAt,
        userId: devices.userId,
        email: users.email,
        userName: users.name,
      }).from(devices).leftJoin(users, eq(devices.userId, users.id)).all()
        .filter((row) => row.expiresAt === null || row.expiresAt > now))
    })

    // Phones paired before device rows lived in SQLite keep working, bound to the local profile.
    const migrate = Effect.gen(function*() {
      if (migrated) return
      const legacy = yield* kv.list(TOKEN_PREFIX).pipe(Effect.catchTag("KvError", () => Effect.succeed([] as { key: string; value: unknown }[])))
      const pending = legacy.flatMap((entry) => {
        const value = entry.value as StoredToken
        if (typeof value?.id !== "string" || typeof value.hash !== "string" || typeof value.name !== "string") return []
        return [{ key: entry.key, id: value.id, name: value.name, hash: value.hash, createdAt: typeof value.createdAt === "string" ? new Date(value.createdAt) : new Date(), lastSeen: typeof value.lastSeen === "string" ? new Date(value.lastSeen) : null }]
      })
      if (pending.length === 0) { migrated = true; return }
      const local = (yield* query("companion.migrate.local", (db) => db.select({ id: users.id }).from(users).where(eq(users.email, LOCAL_EMAIL)).limit(1)))[0]
      if (!local) return
      yield* query("companion.migrate", (db) => {
        for (const row of pending) {
          db.insert(devices).values({ id: row.id, userId: local.id, name: row.name, hash: row.hash, createdAt: row.createdAt, lastSeenAt: row.lastSeen, expiresAt: null }).onConflictDoNothing().run()
        }
      })
      for (const row of pending) yield* kv.delete(row.key).pipe(Effect.catchTag("KvError", () => Effect.succeed(false)))
      migrated = true
    }).pipe(Effect.catchTag("DatabaseError", (e) => Effect.logWarning("Could not migrate companion devices", e)))

    const records = Effect.gen(function*() {
      yield* migrate
      const rows = yield* activeRows
      return rows.map((row): TokenRecord => ({
        id: row.id,
        name: row.name,
        hash: row.hash,
        createdAt: row.createdAt.toISOString(),
        lastSeen: iso(row.lastSeenAt),
        userId: row.userId,
        expiresAt: iso(row.expiresAt),
      }))
    }).pipe(Effect.catchTag("DatabaseError", (e) => Effect.logWarning("Unable to load companion devices", e).pipe(Effect.as([] as TokenRecord[]))))

    const loadCertificate = Effect.tryPromise({
      try: async () => {
        if (certificate) return certificate
        await mkdir(dir, { recursive: true })
        try {
          const [cert, key] = await Promise.all([readFile(join(dir, "cert.pem"), "utf8"), readFile(join(dir, "key.pem"), "utf8")])
          certificate = { cert, key, fingerprint: fingerprintOf(cert) }
        } catch {
          certificate = await generateCertificate()
          await writeFile(join(dir, "cert.pem"), certificate.cert)
          await writeFile(join(dir, "key.pem"), certificate.key, { mode: 0o600 })
          await chmod(join(dir, "key.pem"), 0o600)
        }
        return certificate
      },
      catch: (e) => new CompanionError({ code: "unavailable", message: `Could not prepare the gateway certificate: ${String(e)}` }),
    })

    const state: Effect.Effect<CompanionState> = Effect.gen(function*() {
      yield* migrate
      const s = yield* settings
      const list = yield* activeRows.pipe(Effect.catchTag("DatabaseError", (e) => Effect.logWarning("Unable to load companion devices", e).pipe(Effect.as([]))))
      return {
        enabled: gateway !== undefined,
        port: gateway?.port ?? (s.enabled ? s.port : null),
        fingerprint: certificate?.fingerprint ?? null,
        host: defaultHost(),
        devices: list.map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt.toISOString(), lastSeen: iso(row.lastSeenAt), userId: row.userId, email: row.email ?? null })),
      }
    })

    const start = (port: number) =>
      Effect.gen(function*() {
        const cert = yield* loadCertificate
        const local = getLocalPort()
        if (local === undefined) return yield* new CompanionError({ code: "unavailable", message: "The sidecar is not listening yet" })
        gateway?.stop()
        // Tokens are read per request so a revoked device is refused immediately.
        gateway = yield* Effect.try({
          try: () => startGateway({
            certificate: cert,
            port,
            upstream: () => ({ port: getLocalPort() ?? local, token: Redacted.value(config.token) }),
            tokens: () => Effect.runPromise(records),
            touch: (id) => {
              const now = Date.now()
              const previous = seenWrites.get(id) ?? 0
              if (now - previous < LAST_SEEN_INTERVAL_MS) return
              seenWrites.set(id, now)
              void Effect.runPromise(query("companion.touch", (db) => db.update(devices).set({ lastSeenAt: new Date(now) }).where(eq(devices.id, id))).pipe(
                Effect.catchTag("DatabaseError", (e) => Effect.logWarning("Could not record companion last-seen", e)),
              ))
            },
            redeem: (code) => Effect.runPromise(redeem(code).pipe(
              Effect.map((body) => Response.json(body, { status: 201 })),
              Effect.catch((error) => Effect.succeed(Response.json(
                { message: error.message },
                { status: error.code === "invalid" ? 400 : error.code === "not-found" ? 404 : 500 },
              ))),
            )),
            log: logRequest,
          }),
          catch: (e) => new CompanionError({ code: "unavailable", message: `Could not start the gateway on port ${port}: ${String(e)}` }),
        })
        yield* kv.set(SETTINGS, { enabled: true, port }).pipe(Effect.catchTag("KvError", (e) =>
          Effect.sync(() => { gateway?.stop(); gateway = undefined }).pipe(
            Effect.andThen(Effect.fail(new CompanionError({ code: "unavailable", message: `Could not save gateway settings: ${e.operation}` })))
          )
        ))
      })

    const redeem = (code: string) => Effect.gen(function*() {
      const trimmed = code.trim()
      if (trimmed.length < 16 || trimmed.length > 256 || /[^A-Za-z0-9_-]/u.test(trimmed)) return yield* new CompanionError({ code: "invalid", message: USED })
      yield* migrate
      const hash = hashToken(trimmed)
      const issued = yield* query("companion.redeem", (db) => db.transaction((tx) => {
        const row = tx.select().from(codes).where(eq(codes.codeHash, hash)).get()
        if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) return undefined
        const now = new Date()
        // Claim before inserting the device. A losing racer updates zero rows and
        // leaves no CompanionDevice behind. deviceId is set after the insert so
        // the foreign key is satisfied; a later failure rolls the claim back too.
        const claimed = tx.update(codes).set({ consumedAt: now }).where(and(eq(codes.id, row.id), isNull(codes.consumedAt))).returning({ id: codes.id }).all()
        if (claimed.length === 0) return undefined
        const fresh = newToken()
        tx.insert(devices).values({
          id: fresh.id, userId: row.userId, name: row.name, hash: hashToken(fresh.token), createdAt: now, lastSeenAt: null, expiresAt: null,
        }).run()
        tx.update(codes).set({ deviceId: fresh.id }).where(eq(codes.id, row.id)).run()
        return { id: fresh.id, token: fresh.token, name: row.name, userId: row.userId }
      })).pipe(Effect.mapError((e) => new CompanionError({ code: "unavailable", message: `Could not redeem the pairing code: ${e.operation}` })))
      if (!issued) return yield* new CompanionError({ code: "invalid", message: USED })
      const account = (yield* query("companion.redeem.user", (db) => db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, issued.userId)).limit(1))
        .pipe(Effect.mapError((e) => new CompanionError({ code: "unavailable", message: `Could not resolve the paired account: ${e.operation}` }))))[0]
      if (!account) return yield* new CompanionError({ code: "invalid", message: USED })
      return { id: issued.id, token: issued.token, name: issued.name, user: account }
    })

    yield* Effect.addFinalizer(() => Effect.sync(() => { gateway?.stop(); gateway = undefined }))
    // Resume after a restart once the API answers (the gateway forwards to it).
    yield* Effect.gen(function*() {
      const s = yield* settings
      if (!s.enabled) return
      yield* Effect.promise(() => announced)
      yield* start(s.port).pipe(Effect.catch((e) => Effect.logWarning("Companion gateway did not resume", e.message)))
    }).pipe(Effect.forkScoped)

    return Companion.of({
      status: state,
      enable: (port) => Effect.gen(function*() {
        if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) return yield* new CompanionError({ code: "invalid", message: "Port must be between 1024 and 65535" })
        yield* start(port ?? (yield* settings).port)
        return yield* state
      }),
      disable: Effect.gen(function*() {
        yield* kv.set(SETTINGS, { ...(yield* settings), enabled: false }).pipe(Effect.mapError((e) => new CompanionError({ code: "unavailable", message: `Could not save gateway settings: ${e.operation}` })))
        gateway?.stop()
        gateway = undefined
        return yield* state
      }),
      pair: (name, host, user) => Effect.gen(function*() {
        const label = name.trim()
        if (!label || label.length > 60) return yield* new CompanionError({ code: "invalid", message: "Device name is required (up to 60 characters)" })
        if (!user.id) return yield* new CompanionError({ code: "invalid", message: "Sign in on this computer before linking a phone" })
        yield* migrate
        const cert = yield* loadCertificate
        const fresh = newToken()
        const now = Date.now()
        const expiresAt = new Date(now + PAIRING_TTL_MS)
        yield* query("companion.pair", (db) => db.insert(codes).values({
          id: fresh.id, userId: user.id, name: label, codeHash: hashToken(fresh.token), expiresAt, consumedAt: null, deviceId: null, createdAt: new Date(now),
        }).run()).pipe(Effect.mapError((e) => new CompanionError({ code: "unavailable", message: `Could not save the pairing code: ${e.operation}` })))
        const s = yield* settings
        const hosts = pairingHosts(host)
        return {
          id: fresh.id,
          expiresAt: expiresAt.toISOString(),
          link: pairingGrantLink({ host: hosts[0]!, port: gateway?.port ?? s.port, code: fresh.token, fingerprint: cert.fingerprint, name: label, hosts, expiresAt: expiresAt.getTime() }),
        }
      }),
      redeem,
      revoke: (id) => Effect.gen(function*() {
        const removed = yield* query("companion.revoke", (db) => db.delete(devices).where(eq(devices.id, id)).returning({ id: devices.id }).all())
          .pipe(Effect.mapError((e) => new CompanionError({ code: "unavailable", message: `Could not revoke the device token: ${e.operation}` })))
        if (removed.length === 0) return yield* new CompanionError({ code: "not-found", message: "Device not found" })
        seenWrites.delete(id)
        return yield* state
      }),
      actor: (deviceId, userId) => activeRows.pipe(
        Effect.map((rows) => {
          const row = rows.find((item) => item.id === deviceId && item.userId === userId)
          return row ? new SessionUser({ id: row.userId, email: row.email ?? null, name: row.userName ?? null }) : undefined
        }),
        Effect.catchTag("DatabaseError", (e) => Effect.logWarning("Could not resolve paired device", e).pipe(Effect.as(undefined))),
      ),
    })
  }))
}
