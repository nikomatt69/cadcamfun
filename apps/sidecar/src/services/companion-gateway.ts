/**
 * The companion gateway: the only way anything but the desktop webview reaches the sidecar (spec 13 §6).
 *
 * It is a separate HTTPS listener (off by default) that authenticates a *scoped, revocable* token, checks the request
 * against a small route allow-list, and forwards it to the loopback API with the real bearer token. A paired phone
 * therefore never holds the sidecar's own token and can never reach credentials, plugins, files or billing.
 * The phone pins the certificate's SHA-256 fingerprint, which it learns from the pairing QR code.
 */
import { createHash, randomBytes, timingSafeEqual, X509Certificate } from "node:crypto"
import { networkInterfaces } from "node:os"
import { generate } from "selfsigned"

export interface CompanionCertificate {
  readonly cert: string
  readonly key: string
  /** SHA-256 of the DER certificate, lowercase hex without separators (what the phone pins). */
  readonly fingerprint: string
}

export const fingerprintOf = (pem: string): string => new X509Certificate(pem).fingerprint256.replaceAll(":", "").toLowerCase()

export interface NetworkAddress {
  readonly address: string
  readonly family: string | number
  readonly internal: boolean
}

const isV4 = (family: string | number): boolean => family === "IPv4" || family === 4
const isV6 = (family: string | number): boolean => family === "IPv6" || family === 6

const ipv4Octets = (address: string): readonly number[] | undefined => {
  const parts = address.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return undefined
  return parts
}

/**
 * Higher is preferred as the QR's primary host. The phone still tries every
 * positive-score address (Wi-Fi, iPhone Personal Hotspot, Tailscale).
 *
 * 192.168/10 first (same Wi-Fi), then Apple's hotspot net, other RFC1918,
 * then Tailscale CGNAT / ULA. Link-local, loopback and public addresses are
 * excluded so a stale cellular IP never ends up in the QR.
 */
export const rankAddress = (address: string, family: string | number): number => {
  if (isV4(family)) {
    const oct = ipv4Octets(address)
    if (!oct) return 0
    const a = oct[0]!, b = oct[1]!, c = oct[2]!
    if (a === 192 && b === 168) return 100
    if (a === 10) return 90
    // iPhone / iPad Personal Hotspot and USB tethering (Apple uses 172.20.10.0/28, sometimes /24).
    if (a === 172 && b === 20 && c === 10) return 85
    if (a === 172 && b >= 16 && b <= 31) return 70
    if (a === 100 && b >= 64 && b <= 127) return 60
    return 0
  }
  if (!isV6(family)) return 0
  const lower = address.toLowerCase()
  if (lower.startsWith("fe80:") || lower === "::1") return 0
  if (lower.startsWith("fd7a:115c:a1e0:")) return 55
  if (lower.startsWith("fd") || lower.startsWith("fc")) return 50
  return 0
}

const MAX_PAIRING_HOSTS = 6

/** Reachable companion addresses, best first. Pure so tests can inject interfaces. */
export const reachableAddressesFrom = (ifs: readonly NetworkAddress[]): string[] => {
  // The gateway binds IPv4 (`0.0.0.0`); IPv6 Tailscale ULAs are ranked but not advertised.
  const scored = ifs
    .filter((i) => !i.internal && isV4(i.family))
    .map((i) => ({ address: i.address, score: rankAddress(i.address, i.family) }))
    .filter((i) => i.score > 0)
  scored.sort((a, b) => b.score - a.score)
  const out: string[] = []
  const seen = new Set<string>()
  for (const { address } of scored) {
    if (seen.has(address)) continue
    seen.add(address)
    out.push(address)
    if (out.length >= MAX_PAIRING_HOSTS) break
  }
  return out
}

export const reachableAddresses = (): string[] =>
  reachableAddressesFrom(Object.values(networkInterfaces()).flatMap((list) => list ?? []))

export const generateCertificate = async (): Promise<CompanionCertificate> => {
  const pems = await generate([{ name: "commonName", value: "cadcamfun-companion" }], {
    // Pinning makes expiry meaningless to the phone, but a default one-year certificate would still stop Bun's own TLS stack.
    notAfterDate: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000),
    keyType: "ec",
    curve: "P-256",
    extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }, ...reachableAddresses().map((ip) => ({ type: 7 as const, ip }))] }],
  })
  return { cert: pems.cert, key: pems.private, fingerprint: fingerprintOf(pems.cert) }
}

// ── route policy ────────────────────────────────────────────────────────────

interface Rule {
  readonly methods: readonly string[]
  readonly path: RegExp
}

/** Everything a phone may call. Anything else (credentials, plugins, files, billing, /api/companion itself…) is refused. */
export const COMPANION_ROUTES: readonly Rule[] = [
  { methods: ["GET"], path: /^\/api\/health$/ },
  { methods: ["GET"], path: /^\/api\/auth\/get-session$/ },
  // Project list + single-project read so the phone can show a richer header (description, owner, org).
  // Creating a project from the phone: the new project belongs to the signed-in account and starts with its own repository.
  { methods: ["GET", "POST"], path: /^\/api\/projects$/ },
  { methods: ["GET", "PUT", "DELETE"], path: /^\/api\/projects\/[^/]+$/ },
  // Managing a project's contents from the phone: create, rename and delete drawings, components and toolpaths. The stored
  // CAD document itself (reading `/api/drawings/:id`, `/api/components/:id`) and the editors stay on the desktop.
  { methods: ["POST"], path: /^\/api\/projects\/[^/]+\/(drawings|components)$/ },
  { methods: ["POST"], path: /^\/api\/toolpaths$/ },
  { methods: ["PUT", "DELETE"], path: /^\/api\/(drawings|components|toolpaths)\/[^/]+$/ },
  // The user's own resources: materials, tools and machine configurations (storage and export/import stay on the desktop).
  { methods: ["GET", "POST"], path: /^\/api\/(materials|tools|machine-configs)$/ },
  { methods: ["GET", "PUT", "DELETE"], path: /^\/api\/(materials|tools|machine-configs)\/(?!export-import$)[^/]+$/ },
  { methods: ["POST"], path: /^\/api\/machine-configs\/[^/]+\/clone$/ },
  // Read-only workspace: summaries, meshes and toolpath polylines. The stored CAD document and every write stay off the phone.
  { methods: ["GET"], path: /^\/api\/projects\/[^/]+\/workspace(?:\/[^/]+)*$/ },
  // GitHub sync (`vcs/remote|push|pull`) needs the owner's GitHub token and stays on the desktop.
  // Commit, branch, checkout, restore, review and merge are phone features (spec 13 §6) and stay allowed: none of them
  // loses data (git keeps every commit, restore is a new commit, checkout refuses a dirty working copy, an AI actor
  // cannot merge into `main`). What the gateway adds is a per-device write budget and attribution: the device id travels to
  // the sidecar so the `ActivityLog` row of every history-changing action names the phone that asked for it.
  { methods: ["GET", "POST"], path: /^\/api\/projects\/[^/]+\/(vcs\/(?!remote$|push$|pull$)[^/]+|pulls|actions)(\/.*)?$/ },
  // Live SSE stream of vcs / workflow / AI activity; the only push channel the phone has.
  { methods: ["GET"], path: /^\/api\/projects\/[^/]+\/events$/ },
  { methods: ["GET"], path: /^\/api\/events$/ },
  // Notifications (read + mark-read + delete). The phone sees its user's activity across the desktop.
  { methods: ["GET"], path: /^\/api\/notifications\/?$/ },
  { methods: ["POST"], path: /^\/api\/notifications\/mark-all-read$/ },
  { methods: ["PUT"], path: /^\/api\/notifications\/[^/]+$/ },
  { methods: ["DELETE"], path: /^\/api\/notifications\/[^/]+$/ },
  // Organizations at desktop parity (same contract the desktop UI uses): list/create/detail/update/delete.
  // Membership and role checks stay in the sidecar handlers; the gateway only admits the routes.
  { methods: ["GET", "POST"], path: /^\/api\/organizations$/ },
  { methods: ["GET", "PUT", "DELETE"], path: /^\/api\/organizations\/[^/]+$/ },
  // Production costs share the desktop contracts and user/organization checks.
  { methods: ["GET", "POST"], path: /^\/api\/production-costs\/(estimates|material-costs|operation-costs|tool-wear)$/ },
  { methods: ["GET", "PUT", "DELETE"], path: /^\/api\/production-costs\/(estimates|material-costs|operation-costs|tool-wear)\/(?!calculate$)[^/]+$/ },
  { methods: ["POST"], path: /^\/api\/production-costs\/estimates\/calculate$/ },
  { methods: ["GET"], path: /^\/api\/ai\/status$/ },
  { methods: ["GET"], path: /^\/api\/ai\/models$/ },
  { methods: ["GET"], path: /^\/api\/ai\/providers$/ },
  { methods: ["POST"], path: /^\/api\/ai\/models\/refresh$/ },
  { methods: ["GET"], path: /^\/api\/ai\/agents$/ },
  { methods: ["POST"], path: /^\/api\/ai\/(chat\/stream|chat\/abort|chat\/queue|permission\/reply|sessions\/state|sessions\/control|sessions\/prompt)$/ },
  // The phone's per-session SSE stream (spec 13 §5); the handler checks the session owner and project.
  { methods: ["GET"], path: /^\/api\/ai\/sessions\/[^/]+\/stream$/ },
  // The phone's conversation list and one conversation's bounded history (nikcli mobile session list / detail).
  { methods: ["GET"], path: /^\/api\/ai\/sessions$/ },
  { methods: ["GET"], path: /^\/api\/ai\/sessions\/[^/]+\/messages$/ },
]

export const isCompanionRoute = (method: string, pathname: string): boolean =>
  COMPANION_ROUTES.some((r) => r.methods.includes(method.toUpperCase()) && r.path.test(pathname))

// ── tokens ──────────────────────────────────────────────────────────────────

export interface TokenRecord {
  readonly id: string
  readonly name: string
  /** SHA-256 of the token; the token itself is shown once, at pairing. */
  readonly hash: string
  readonly createdAt: string
  readonly lastSeen: string | null
}

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

export const newToken = (): { id: string; token: string } => ({ id: randomBytes(6).toString("hex"), token: randomBytes(32).toString("base64url") })

export const findToken = (records: readonly TokenRecord[], token: string): TokenRecord | undefined => {
  const hash = Buffer.from(hashToken(token))
  // Compare against every record so timing does not reveal which prefix matched.
  let found: TokenRecord | undefined
  for (const r of records) {
    const candidate = Buffer.from(r.hash)
    if (candidate.length === hash.length && timingSafeEqual(candidate, hash)) found = r
  }
  return found
}

// ── request policy ──────────────────────────────────────────────────────────

/** How the gateway treats one allowed request: streams never time out, writes have their own budget. */
export interface RoutePolicy {
  readonly kind: "stream" | "read" | "write"
  /** Largest request body accepted, in bytes. */
  readonly maxBody: number
  /** Time allowed for the desktop's response headers; undefined for long-lived streams. */
  readonly timeoutMs: number | undefined
}

/** A prompt may carry five 5 MB images as base64 (`MAX_ATTACHMENTS` × `MAX_IMAGE_BYTES` × 4/3) plus its text. */
export const PROMPT_BODY_LIMIT = 36 * 1024 * 1024
/** Every other write is a small JSON document (commit message, review, workflow YAML, a mark-read). */
export const WRITE_BODY_LIMIT = 1024 * 1024
export const READ_TIMEOUT_MS = 60_000
/** A merge runs its workflows before it answers, and a prompt waits up to a minute for the host to open the session. */
export const WRITE_TIMEOUT_MS = 120_000

const STREAM_ROUTES: readonly Rule[] = [
  { methods: ["GET"], path: /^\/api\/projects\/[^/]+\/events$/ },
  { methods: ["GET"], path: /^\/api\/events$/ },
  { methods: ["GET"], path: /^\/api\/ai\/sessions\/[^/]+\/stream$/ },
  { methods: ["POST"], path: /^\/api\/ai\/chat\/stream$/ },
]
const PROMPT_ROUTES = /^\/api\/ai\/(chat\/stream|sessions\/prompt|chat\/queue)$/

/**
 * POST routes that only read. The write budget refills one token per second, so a phone that polls the
 * assistant's state with a POST would spend the same budget as its commits and starve itself. These
 * routes change nothing on the desktop, so they take a request token and no write token.
 */
const READ_ONLY_POST_ROUTES: readonly RegExp[] = [/^\/api\/ai\/sessions\/state$/]

export const routePolicy = (method: string, pathname: string): RoutePolicy => {
  const upper = method.toUpperCase()
  const body = PROMPT_ROUTES.test(pathname) ? PROMPT_BODY_LIMIT : WRITE_BODY_LIMIT
  if (STREAM_ROUTES.some((r) => r.methods.includes(upper) && r.path.test(pathname))) return { kind: "stream", maxBody: upper === "GET" ? 0 : body, timeoutMs: undefined }
  if (upper === "GET" || upper === "HEAD") return { kind: "read", maxBody: 0, timeoutMs: READ_TIMEOUT_MS }
  // A read-only POST still carries a body, so it keeps a body limit; only the write token is spared.
  if (READ_ONLY_POST_ROUTES.some((r) => r.test(pathname))) return { kind: "read", maxBody: body, timeoutMs: READ_TIMEOUT_MS }
  return { kind: "write", maxBody: body, timeoutMs: WRITE_TIMEOUT_MS }
}

/** A token bucket: `capacity` requests at once, refilled at `perSecond`. */
export class TokenBucket {
  private tokens: number
  private at: number

  constructor(private readonly capacity: number, private readonly perSecond: number, now: number) {
    this.tokens = capacity
    this.at = now
  }

  /** Takes one token; otherwise the seconds until one is available. */
  take(now: number): { readonly ok: true } | { readonly ok: false; readonly retryAfter: number } {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.at) / 1000) * this.perSecond)
    this.at = now
    if (this.tokens >= 1) {
      this.tokens -= 1
      return { ok: true }
    }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - this.tokens) / this.perSecond)) }
  }
}

export interface DeviceLimits {
  /** Any request: bursts of a screen's parallel reads, sustained polling. */
  readonly requests: { readonly capacity: number; readonly perSecond: number }
  /** Requests that change something (commit, merge, prompt, mark-read). */
  readonly writes: { readonly capacity: number; readonly perSecond: number }
  /** Long-lived SSE streams open at once (one per followed conversation plus the activity stream). */
  readonly streams: number
}

export const DEFAULT_DEVICE_LIMITS: DeviceLimits = {
  requests: { capacity: 240, perSecond: 20 },
  writes: { capacity: 60, perSecond: 1 },
  streams: 12,
}

/** The header that tells the sidecar which paired device a forwarded request came from (never accepted from outside). */
export const COMPANION_DEVICE_HEADER = "x-cadcamfun-companion-device"

/** One line per phone request: who, what, outcome, how long. Never the token, a body or a query string. */
export interface GatewayRequestLog {
  readonly device: string | null
  readonly ip: string
  readonly method: string
  readonly path: string
  readonly status: number
  readonly ms: number
  readonly kind: RoutePolicy["kind"] | "refused"
  /** Why the gateway answered itself instead of the desktop. */
  readonly reason?: "unauthorized" | "forbidden" | "rate-limited" | "too-large" | "timeout" | "unavailable" | "streams"
}

// ── server ──────────────────────────────────────────────────────────────────

export interface GatewayOptions {
  readonly certificate: CompanionCertificate
  readonly port: number
  /** The loopback sidecar and its real bearer token. */
  readonly upstream: () => { readonly port: number; readonly token: string }
  readonly tokens: () => Promise<readonly TokenRecord[]>
  readonly touch?: (id: string) => void
  readonly limits?: DeviceLimits
  readonly log?: (entry: GatewayRequestLog) => void
  /** Overrides the per-kind timeouts, for tests. */
  readonly timeouts?: { readonly readMs?: number; readonly writeMs?: number }
}

export interface Gateway {
  readonly port: number
  stop(): void
}

const FAILURE_WINDOW_MS = 60_000
const FAILURE_LIMIT = 10

/** Reads at most `limit` bytes of a request body; undefined when it is larger. */
const readBody = async (request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      return undefined
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** The response body with a callback when the stream ends for any reason (finished, failed, or cancelled by the phone). */
const onBodyEnd = (response: Response, end: () => void): Response => {
  if (!response.body) {
    end()
    return response
  }
  let ended = false
  const finish = () => { if (!ended) { ended = true; end() } }
  const reader = response.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          finish()
          controller.close()
        } else controller.enqueue(value)
      } catch (error) {
        finish()
        controller.error(error)
      }
    },
    cancel(reason) {
      finish()
      return reader.cancel(reason)
    },
  })
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

export const startGateway = (options: GatewayOptions): Gateway => {
  const limits = options.limits ?? DEFAULT_DEVICE_LIMITS
  const failures = new Map<string, { count: number; since: number }>()
  const buckets = new Map<string, { requests: TokenBucket; writes: TokenBucket; streams: number }>()
  const blocked = (ip: string, now: number): boolean => {
    const f = failures.get(ip)
    if (!f) return false
    if (now - f.since > FAILURE_WINDOW_MS) {
      failures.delete(ip)
      return false
    }
    return f.count >= FAILURE_LIMIT
  }
  const fail = (ip: string, now: number): void => {
    const f = failures.get(ip)
    if (!f || now - f.since > FAILURE_WINDOW_MS) failures.set(ip, { count: 1, since: now })
    else f.count++
  }
  const budgetOf = (device: string, now: number) => {
    let budget = buckets.get(device)
    if (!budget) {
      budget = {
        requests: new TokenBucket(limits.requests.capacity, limits.requests.perSecond, now),
        writes: new TokenBucket(limits.writes.capacity, limits.writes.perSecond, now),
        streams: 0,
      }
      buckets.set(device, budget)
    }
    return budget
  }

  const server = Bun.serve({
    port: options.port,
    hostname: "0.0.0.0",
    tls: { cert: options.certificate.cert, key: options.certificate.key },
    // A model writing a long tool call is silent for a while; Bun's maximum idle timeout.
    idleTimeout: 255,
    // The hard ceiling; each route has its own, smaller limit below.
    maxRequestBodySize: PROMPT_BODY_LIMIT,
    async fetch(request, srv) {
      const started = Date.now()
      const ip = srv.requestIP(request)?.address ?? "unknown"
      const url = new URL(request.url)
      let device: string | null = null
      let kind: GatewayRequestLog["kind"] = "refused"
      const answer = (response: Response, reason?: GatewayRequestLog["reason"]): Response => {
        options.log?.({ device, ip, method: request.method, path: url.pathname, status: response.status, ms: Date.now() - started, kind, ...(reason ? { reason } : {}) })
        return response
      }
      const refuse = (status: number, message: string, reason: GatewayRequestLog["reason"], headers?: Record<string, string>) =>
        answer(Response.json({ message }, { status, ...(headers ? { headers } : {}) }), reason)

      if (blocked(ip, started)) return refuse(429, "Too many failed attempts", "rate-limited")
      const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
      const record = bearer ? findToken(await options.tokens(), bearer) : undefined
      if (!record) {
        fail(ip, started)
        return refuse(401, "Unauthorized", "unauthorized")
      }
      device = record.id
      if (!isCompanionRoute(request.method, url.pathname)) return refuse(403, "Not available to a companion device", "forbidden")
      const policy = routePolicy(request.method, url.pathname)
      kind = policy.kind
      const budget = budgetOf(record.id, started)
      const allowed = budget.requests.take(started)
      const write = policy.kind === "write" || (policy.kind === "stream" && request.method !== "GET")
      const writeAllowed = allowed.ok && write ? budget.writes.take(started) : allowed
      if (!writeAllowed.ok) return refuse(429, "Too many requests from this device. Wait a moment.", "rate-limited", { "retry-after": String(writeAllowed.retryAfter) })
      const declared = Number(request.headers.get("content-length") ?? "0")
      if (Number.isFinite(declared) && declared > policy.maxBody && request.method !== "GET" && request.method !== "HEAD") {
        return refuse(413, "The request is too large for the desktop.", "too-large")
      }
      if (policy.kind === "stream" && budget.streams >= limits.streams) {
        return refuse(429, "Too many live connections from this device. Close a conversation and retry.", "streams", { "retry-after": "5" })
      }
      options.touch?.(record.id)

      let body: Uint8Array<ArrayBuffer> | undefined
      if (request.method !== "GET" && request.method !== "HEAD") {
        body = await readBody(request, policy.maxBody)
        if (!body) return refuse(413, "The request is too large for the desktop.", "too-large")
      }

      const upstream = options.upstream()
      const headers = new Headers(request.headers)
      headers.set("authorization", `Bearer ${upstream.token}`)
      headers.delete("host")
      headers.delete("content-length")
      headers.delete("cookie")
      // Attribution for the audit trail; whatever the phone sent under this name is replaced, never trusted.
      headers.set(COMPANION_DEVICE_HEADER, record.id)

      const controller = new AbortController()
      const abort = () => controller.abort()
      request.signal.addEventListener("abort", abort, { once: true })
      const timeoutMs = policy.kind === "read" ? options.timeouts?.readMs ?? policy.timeoutMs : policy.kind === "write" ? options.timeouts?.writeMs ?? policy.timeoutMs : undefined
      let timedOut = false
      const timer = timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
      if (policy.kind === "stream") budget.streams++
      const release = () => {
        if (policy.kind === "stream") budget.streams = Math.max(0, budget.streams - 1)
        request.signal.removeEventListener("abort", abort)
      }
      try {
        const response = await fetch(`http://127.0.0.1:${upstream.port}${url.pathname}${url.search}`, {
          method: request.method,
          headers,
          ...(body !== undefined ? { body } : {}),
          signal: controller.signal,
        })
        // The deadline covers the desktop's answer, not the time the phone takes to download it.
        clearTimeout(timer)
        return answer(onBodyEnd(response, release))
      } catch {
        clearTimeout(timer)
        release()
        if (timedOut) return refuse(504, "The desktop took too long to answer.", "timeout")
        return refuse(502, "Desktop unavailable", "unavailable")
      }
    },
  })
  return { port: server.port ?? options.port, stop: () => void server.stop(true) }
}

const originFor = (host: string, port: number): string => {
  const ipv6 = host.includes(":")
  return ipv6 ? `https://[${host}]:${port}` : `https://${host}:${port}`
}

export const pairingLink = (input: { host: string; port: number; token: string; fingerprint: string; name: string; hosts?: readonly string[] }): string => {
  const params = new URLSearchParams({ host: originFor(input.host, input.port), token: input.token, fp: input.fingerprint, name: input.name })
  const extras = (input.hosts ?? []).filter((h) => h !== input.host)
  if (extras.length > 0) params.set("hosts", extras.map((h) => originFor(h, input.port)).join(","))
  return `cadcamfun://pair?${params}`
}

/** Best private address of this machine, the default host in the pairing link. */
export const defaultHost = (): string => reachableAddresses()[0] ?? "127.0.0.1"

/** Every private/overlay address the phone should try, best first. */
export const pairingHosts = (preferred?: string): string[] => {
  const listed = reachableAddresses()
  const extra = preferred?.trim()
  if (!extra) return listed.length > 0 ? listed : ["127.0.0.1"]
  return [extra, ...listed.filter((h) => h !== extra)]
}
