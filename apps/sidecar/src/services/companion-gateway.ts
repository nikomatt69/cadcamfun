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

const lanAddresses = (): string[] =>
  Object.values(networkInterfaces()).flatMap((list) => (list ?? []).filter((i) => !i.internal && i.family === "IPv4").map((i) => i.address))

export const generateCertificate = async (): Promise<CompanionCertificate> => {
  const pems = await generate([{ name: "commonName", value: "cadcamfun-companion" }], {
    // Pinning makes expiry meaningless to the phone, but a default one-year certificate would still stop Bun's own TLS stack.
    notAfterDate: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000),
    keyType: "ec",
    curve: "P-256",
    extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }, ...lanAddresses().map((ip) => ({ type: 7 as const, ip }))] }],
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
  // Project list + single-project read so the phone can show a richer header (description, owner, org).
  { methods: ["GET"], path: /^\/api\/projects$/ },
  { methods: ["GET"], path: /^\/api\/projects\/[^/]+$/ },
  // GitHub sync (`vcs/remote|push|pull`) needs the owner's GitHub token and stays on the desktop.
  // Reference rule for future hardening: `vcs/restore`, `vcs/commit` and `vcs/checkout` are destructive enough
  // that a phone session should be refused them (403) and only a desktop-initiated session allowed; today the
  // route below still matches them, so this note documents the intended next step rather than an active gate.
  { methods: ["GET", "POST"], path: /^\/api\/projects\/[^/]+\/(vcs\/(?!remote$|push$|pull$)[^/]+|pulls|actions)(\/.*)?$/ },
  // Live SSE stream of vcs / workflow / AI activity; the only push channel the phone has.
  { methods: ["GET"], path: /^\/api\/projects\/[^/]+\/events$/ },
  // Notifications (read + mark-read + delete). The phone sees its user's activity across the desktop.
  { methods: ["GET"], path: /^\/api\/notifications\/?$/ },
  { methods: ["POST"], path: /^\/api\/notifications\/mark-all-read$/ },
  { methods: ["PUT"], path: /^\/api\/notifications\/[^/]+$/ },
  { methods: ["DELETE"], path: /^\/api\/notifications\/[^/]+$/ },
  { methods: ["GET"], path: /^\/api\/ai\/status$/ },
  { methods: ["GET"], path: /^\/api\/ai\/models$/ },
  { methods: ["POST"], path: /^\/api\/ai\/(chat\/stream|chat\/abort|chat\/queue|permission\/reply)$/ },
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

// ── server ──────────────────────────────────────────────────────────────────

export interface GatewayOptions {
  readonly certificate: CompanionCertificate
  readonly port: number
  /** The loopback sidecar and its real bearer token. */
  readonly upstream: () => { readonly port: number; readonly token: string }
  readonly tokens: () => Promise<readonly TokenRecord[]>
  readonly touch?: (id: string) => void
}

export interface Gateway {
  readonly port: number
  stop(): void
}

const FAILURE_WINDOW_MS = 60_000
const FAILURE_LIMIT = 10

export const startGateway = (options: GatewayOptions): Gateway => {
  const failures = new Map<string, { count: number; since: number }>()
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

  const server = Bun.serve({
    port: options.port,
    hostname: "0.0.0.0",
    tls: { cert: options.certificate.cert, key: options.certificate.key },
    // A model writing a long tool call is silent for a while; Bun's maximum idle timeout.
    idleTimeout: 255,
    async fetch(request, srv) {
      const ip = srv.requestIP(request)?.address ?? "unknown"
      const now = Date.now()
      if (blocked(ip, now)) return Response.json({ message: "Too many failed attempts" }, { status: 429 })
      const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
      const record = bearer ? findToken(await options.tokens(), bearer) : undefined
      if (!record) {
        fail(ip, now)
        return Response.json({ message: "Unauthorized" }, { status: 401 })
      }
      const url = new URL(request.url)
      if (!isCompanionRoute(request.method, url.pathname)) return Response.json({ message: "Not available to a companion device" }, { status: 403 })
      options.touch?.(record.id)
      const upstream = options.upstream()
      const headers = new Headers(request.headers)
      headers.set("authorization", `Bearer ${upstream.token}`)
      headers.delete("host")
      try {
        return await fetch(`http://127.0.0.1:${upstream.port}${url.pathname}${url.search}`, {
          method: request.method,
          headers,
          body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
          signal: request.signal,
          // Required by the fetch spec when streaming a request body.
          ...(request.body ? { duplex: "half" } : {}),
        } as RequestInit)
      } catch {
        return Response.json({ message: "Desktop unavailable" }, { status: 502 })
      }
    },
  })
  return { port: server.port ?? options.port, stop: () => void server.stop(true) }
}

export const pairingLink = (input: { host: string; port: number; token: string; fingerprint: string; name: string }): string =>
  `cadcamfun://pair?${new URLSearchParams({ host: `https://${input.host}:${input.port}`, token: input.token, fp: input.fingerprint, name: input.name })}`

/** The first private IPv4 address of this machine, the default host in the pairing link. */
export const defaultHost = (): string => lanAddresses()[0] ?? "127.0.0.1"
