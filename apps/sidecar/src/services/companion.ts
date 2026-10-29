import type { SessionUser } from "@cadcamfun/api"
import { Context, Data, Effect, Layer, Redacted } from "effect"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { AppConfigService } from "../config.ts"
import { getLocalPort, announced } from "../startup.ts"
import {
  cloudPairingLink, defaultHost, fingerprintOf, generateCertificate, hashToken, newToken, pairingHosts, pairingLink, startGateway,
  type CompanionCertificate, type Gateway, type GatewayRequestLog, type TokenRecord,
} from "./companion-gateway.ts"
import { AuthTokens } from "./auth-tokens.ts"
import { KvStore } from "./kv.ts"
import { Identity } from "./identity.ts"
import { flushHostedState } from "./cloud-checkpoint.ts"

export class CompanionError extends Data.TaggedError("CompanionError")<{ readonly code: "unavailable" | "invalid" | "not-found"; readonly message: string }> {}

export interface CompanionDevice { readonly id: string; readonly name: string; readonly createdAt: string; readonly lastSeen: string | null }
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
/** Lifetime of the session token the gateway mints for each forwarded request. */
const SESSION_SECONDS = 300

/** Lifecycle of the phone-facing gateway: certificate, scoped device tokens, on/off. Off by default. */
export class Companion extends Context.Service<Companion, {
  status: Effect.Effect<CompanionState>
  enable(port?: number): Effect.Effect<CompanionState, CompanionError>
  disable: Effect.Effect<CompanionState, CompanionError>
  /**
   * Creates a device token (shown once, inside the link) and returns the pairing link for the QR code. `user` is the signed-in
   * desktop account the device will act as; undefined for the local profile.
   */
  pair(name: string, host?: string, user?: SessionUser): Effect.Effect<{ id: string; link: string }, CompanionError>
  /** Gives devices paired before devices had an account (or while signed out) to the signed-in desktop account. */
  adopt(user: SessionUser): Effect.Effect<void>
  revoke(id: string): Effect.Effect<CompanionState, CompanionError>
}>()("cadcamfun/Companion") {
  static readonly layer = Layer.effect(Companion, Effect.gen(function*() {
    const config = yield* AppConfigService
    const kv = yield* KvStore
    const authTokens = yield* AuthTokens
    const identity = yield* Identity
    const hosted = config.runtime === "server"
    const dir = join(config.dataDir, "companion")
    let gateway: Gateway | undefined
    let certificate: CompanionCertificate | undefined
    let touches = new Map<string, string>()
    // The gateway runs outside Effect; its request lines go through this layer's logger (stderr JSON in the app, never stdout).
    const runLog = Effect.runForkWith(yield* Effect.context<never>())
    const runTokens = Effect.runPromiseWith(yield* Effect.context<never>())
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
      return { enabled: hosted || v?.enabled === true, port: hosted ? config.gatewayPort ?? 8080 : typeof v?.port === "number" ? v.port : DEFAULT_PORT }
    }).pipe(Effect.catchTag("KvError", (e) => Effect.logWarning("Unable to load companion settings", e).pipe(Effect.as({ enabled: false, port: DEFAULT_PORT }))))
    const tokens = Effect.gen(function*() {
      const records = (yield* kv.list(TOKEN_PREFIX)).map((e) => e.value as TokenRecord)
      return records.map((r) => ({ ...r, lastSeen: touches.get(r.id) ?? r.lastSeen }))
    }).pipe(Effect.catchTag("KvError", (e) => Effect.logWarning("Unable to load companion devices", e).pipe(Effect.as([]))))
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
      const s = yield* settings
      const list = yield* tokens
      return {
        enabled: gateway !== undefined,
        port: gateway?.port ?? (s.enabled ? s.port : null),
        fingerprint: certificate?.fingerprint ?? null,
        host: hosted && config.publicOrigin ? new URL(config.publicOrigin).hostname : defaultHost(),
        devices: list.map(({ id, name, createdAt, lastSeen }) => ({ id, name, createdAt, lastSeen })),
      }
    })

    const hostedOwner = Effect.fn("Companion.hostedOwner")(function*(token: string) {
      const principal = yield* identity.verify(token)
      // Resolve the local account only after the immutable subject matched: an unrelated first sign-in must not adopt it.
      if (!config.cloudOwnerSubject || principal.subject !== config.cloudOwnerSubject) return yield* new CompanionError({ code: "invalid", message: "This account does not own the cloud workspace" })
      return yield* identity.user(token)
    })

    const createPair = Effect.fn("Companion.pair")(function*(name: string, host?: string, user?: SessionUser) {
      const label = name.trim()
      if (!label || label.length > 60) return yield* new CompanionError({ code: "invalid", message: "Device name is required (up to 60 characters)" })
      if (hosted && (!user || !config.publicOrigin || !config.workspaceId)) return yield* new CompanionError({ code: "invalid", message: "A cloud device must be enrolled by its signed-in owner" })
      const { id, token } = newToken()
      const record: TokenRecord = { id, name: label, hash: hashToken(token), createdAt: new Date().toISOString(), lastSeen: null, ...(user ? { userId: user.id } : {}) }
      yield* kv.set(`${TOKEN_PREFIX}${id}`, record).pipe(Effect.mapError((e) => new CompanionError({ code: "unavailable", message: `Could not save the device token: ${e.operation}` })))
      if (hosted && config.publicOrigin && config.workspaceId) return { id, link: cloudPairingLink({ origin: config.publicOrigin, workspaceId: config.workspaceId, token, name: label }) }
      const cert = yield* loadCertificate
      const s = yield* settings
      const hosts = pairingHosts(host)
      const primary = hosts[0] ?? "127.0.0.1"
      return { id, link: pairingLink({ host: primary, port: gateway?.port ?? s.port, token, fingerprint: cert.fingerprint, name: label, hosts }) }
    })

    const start = (port: number) =>
      Effect.gen(function*() {
        const cert = hosted ? undefined : yield* loadCertificate
        if (hosted && (!config.workspaceId || !config.cloudInternalToken)) return yield* new CompanionError({ code: "invalid", message: "The hosted gateway requires workspace and coordinator configuration" })
        const local = getLocalPort()
        if (local === undefined) return yield* new CompanionError({ code: "unavailable", message: "The sidecar is not listening yet" })
        gateway?.stop()
        // Tokens are read per request so a revoked device is refused immediately; `touch` only updates memory.
        gateway = yield* Effect.try({
          try: () => startGateway({
            ...(cert ? { certificate: cert } : {}),
            port,
            upstream: () => ({ port: getLocalPort() ?? local, token: Redacted.value(config.token) }),
            tokens: () => runTokens(tokens),
            touch: (id) => void touches.set(id, new Date().toISOString()),
            session: (record) => record.userId === undefined ? undefined : authTokens.sign({ userId: record.userId, email: "", type: "session" }, SESSION_SECONDS),
            log: logRequest,
            ...(hosted && config.workspaceId && config.cloudInternalToken ? {
              hosted: {
                workspaceId: config.workspaceId,
                internalToken: Redacted.value(config.cloudInternalToken),
                verifyIdentity: async (token: string) => ({ userId: (await runTokens(hostedOwner(token))).id }),
                enroll: async (name: string, token: string) => runTokens(createPair(name, undefined, await runTokens(hostedOwner(token)))),
                persist: () => flushHostedState(config),
              },
            } : {}),
          }),
          catch: (e) => new CompanionError({ code: "unavailable", message: `Could not start the gateway on port ${port}: ${String(e)}` }),
        })
        yield* kv.set(SETTINGS, { enabled: true, port }).pipe(Effect.catchTag("KvError", (e) =>
          Effect.sync(() => { gateway?.stop(); gateway = undefined }).pipe(
            Effect.andThen(Effect.fail(new CompanionError({ code: "unavailable", message: `Could not save gateway settings: ${e.operation}` })))
          )
        ))
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
        if (hosted && port !== undefined && port !== (config.gatewayPort ?? 8080)) return yield* new CompanionError({ code: "invalid", message: "The hosted gateway port is configured at startup" })
        if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) return yield* new CompanionError({ code: "invalid", message: "Port must be between 1024 and 65535" })
        yield* start(port ?? (yield* settings).port)
        return yield* state
      }),
      disable: Effect.gen(function*() {
        if (hosted) return yield* new CompanionError({ code: "invalid", message: "Stop the hosted runtime to disable its gateway" })
        yield* kv.set(SETTINGS, { ...(yield* settings), enabled: false }).pipe(Effect.mapError((e) => new CompanionError({ code: "unavailable", message: `Could not save gateway settings: ${e.operation}` })))
        gateway?.stop()
        gateway = undefined
        return yield* state
      }),
      adopt: (user) => Effect.gen(function*() {
        for (const entry of yield* kv.list(TOKEN_PREFIX)) {
          const record = entry.value as TokenRecord
          if (record.userId === undefined) yield* kv.set(entry.key, { ...record, userId: user.id })
        }
      }).pipe(Effect.catchTag("KvError", (e) => Effect.logWarning("Unable to assign companion devices", e))),
      pair: createPair,
      revoke: (id) => Effect.gen(function*() {
        if (!(yield* kv.delete(`${TOKEN_PREFIX}${id}`).pipe(Effect.mapError((e) => new CompanionError({ code: "unavailable", message: `Could not revoke the device token: ${e.operation}` }))))) return yield* new CompanionError({ code: "not-found", message: "Device not found" })
        touches.delete(id)
        return yield* state
      }),
    })
  }))
}
