import { createHash } from "node:crypto"
import { Deferred, Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { KvStore } from "./services/kv.ts"

/**
 * `Idempotency-Key` for the writes of the API (RM-03, "idempotent invocation receipts"). A client that retries a POST, PUT,
 * PATCH or DELETE after a lost answer sends the same key again and gets the **stored answer**, not a second write:
 *
 * - the key is scoped to the caller's credential, so two users can use the same key;
 * - the same key with another method, path or body is refused (422), it is never replayed;
 * - a second request that arrives while the first still runs waits for it and gets its answer;
 * - only answers below 500 whose body is bytes are stored (a failure may succeed on retry; streams are never stored);
 * - an entry lives 24 hours. Without the header nothing here runs.
 *
 * The record is a key-value row (`idem/<scope>/<key>`), no table of its own.
 */
const TTL_MS = 24 * 3600 * 1000
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])
const KEPT_HEADERS = ["content-type", "content-disposition"] as const

interface Stored { readonly fingerprint: string; readonly status: number; readonly headers: Record<string, string>; readonly body: string; readonly storedAt: number }

const sha = (text: string) => createHash("sha256").update(text).digest("hex")
const replay = (stored: Stored) =>
  HttpServerResponse.uint8Array(Buffer.from(stored.body, "base64"), {
    status: stored.status,
    contentType: stored.headers["content-type"] ?? "application/json",
    headers: { ...stored.headers, "idempotent-replayed": "true" }
  })
const refuse = (status: number, message: string) => HttpServerResponse.jsonUnsafe({ message }, { status })

export const idempotency = Effect.gen(function*() {
  const kv = yield* KvStore
  const running = new Map<string, Deferred.Deferred<Stored | undefined>>()
  let writes = 0

  /** Entries older than the TTL are dropped now and then (a row that is read after its time is dropped on the spot). */
  const sweep = Effect.gen(function*() {
    const cutoff = Date.now() - TTL_MS
    for (const entry of yield* kv.list("idem/")) if (Date.parse(entry.updatedAt) < cutoff) yield* kv.delete(entry.key)
  }).pipe(Effect.catch((e) => Effect.logWarning("Idempotency sweep failed", e)))

  // The router hands over the handler with the errors it leaves to the caller (`unhandled`); they pass through untouched.
  return (app: Effect.Effect<HttpServerResponse.HttpServerResponse, any, never>): Effect.Effect<HttpServerResponse.HttpServerResponse, any, HttpServerRequest.HttpServerRequest> => Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const supplied = request.headers["idempotency-key"]
    if (supplied === undefined || !MUTATING.has(request.method)) return yield* app
    if (supplied.length === 0 || supplied.length > 200) return refuse(400, "Idempotency-Key must have 1 to 200 characters")

    const credential = `${request.headers["authorization"] ?? ""}|${request.headers["x-session-token"] ?? ""}`
    const slot = `idem/${sha(credential).slice(0, 32)}/${sha(supplied).slice(0, 32)}`
    const body = yield* request.text.pipe(Effect.orElseSucceed(() => ""))
    const fingerprint = sha(`${request.method}\n${request.url}\n${body}`)
    const same = (stored: Stored) => stored.fingerprint === fingerprint
      ? replay(stored)
      : refuse(422, "Idempotency-Key was already used with a different request")

    const stored = yield* kv.get(slot).pipe(Effect.map((entry) => entry?.value as Stored | undefined), Effect.orElseSucceed(() => undefined))
    if (stored && Date.now() - stored.storedAt < TTL_MS) return same(stored)

    // A twin that is still running: wait for it and answer what it answered.
    const twin = running.get(slot)
    if (twin) {
      const settled = yield* Deferred.await(twin)
      if (settled) return same(settled)
    }

    const done = yield* Deferred.make<Stored | undefined>()
    running.set(slot, done)
    return yield* Effect.gen(function*() {
      const response = yield* app
      const bytes = response.body._tag === "Uint8Array" ? response.body.body : response.body._tag === "Empty" ? new Uint8Array() : undefined
      if (bytes === undefined || response.status >= 500) {
        yield* Deferred.succeed(done, undefined)
        return response
      }
      const headers: Record<string, string> = {}
      for (const name of KEPT_HEADERS) { const value = response.headers[name]; if (value !== undefined) headers[name] = value }
      if (response.body._tag === "Uint8Array") headers["content-type"] = response.body.contentType
      const record: Stored = { fingerprint, status: response.status, headers, body: Buffer.from(bytes).toString("base64"), storedAt: Date.now() }
      yield* kv.set(slot, record).pipe(Effect.catch((e) => Effect.logWarning("Idempotency record not stored", e)))
      yield* Deferred.succeed(done, record)
      if (++writes % 200 === 0) yield* sweep
      return response
    }).pipe(
      Effect.onExit(() => Effect.sync(() => { running.delete(slot) }).pipe(Effect.andThen(Deferred.succeed(done, undefined)))),
    )
  })
})
