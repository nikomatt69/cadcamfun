import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { generateCertificate, hashToken, isCompanionRoute, newToken, pairingLink, startGateway, fingerprintOf, type Gateway, type CompanionCertificate, type TokenRecord } from "../src/services/companion-gateway.ts"

let upstream: ReturnType<typeof Bun.serve>
let gateway: Gateway
let cert: CompanionCertificate
let tokens: TokenRecord[]
let valid: string
const seen: Array<{ method: string; path: string; auth: string | null; body: string }> = []
const touched: string[] = []

beforeAll(async () => {
  upstream = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url)
      seen.push({ method: req.method, path: url.pathname + url.search, auth: req.headers.get("authorization"), body: await req.text() })
      if (url.pathname === "/api/ai/chat/stream") {
        return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"hi"}\n\n')); c.close() } }), { headers: { "content-type": "text/event-stream" } })
      }
      return Response.json({ ok: true })
    },
  })
  cert = await generateCertificate()
  const t = newToken()
  valid = t.token
  tokens = [{ id: t.id, name: "iPhone", hash: hashToken(t.token), createdAt: new Date().toISOString(), lastSeen: null }]
  gateway = startGateway({
    certificate: cert,
    port: 0,
    upstream: () => ({ port: upstream.port!, token: "REAL-SIDECAR-TOKEN" }),
    tokens: async () => tokens,
    touch: (id) => void touched.push(id),
  })
})
afterAll(() => {
  gateway.stop()
  upstream.stop(true)
})

// Trust is by pinned fingerprint on the phone; here the test client trusts the self-signed certificate directly.
const call = (path: string, init: RequestInit & { token?: string | null } = {}) => {
  const { token = valid, ...rest } = init
  return fetch(`https://127.0.0.1:${gateway.port}${path}`, {
    ...rest,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(rest.headers as Record<string, string> | undefined) },
    tls: { rejectUnauthorized: false },
  } as RequestInit)
}

describe("companion gateway", () => {
  test("the certificate fingerprint is the SHA-256 the phone pins", async () => {
    expect(cert.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(fingerprintOf(cert.cert)).toBe(cert.fingerprint)
    const link = pairingLink({ host: "192.168.1.20", port: 8443, token: valid, fingerprint: cert.fingerprint, name: "Studio" })
    expect(link.startsWith("cadcamfun://pair?host=https%3A%2F%2F192.168.1.20%3A8443")).toBe(true)
  })

  test("rejects missing and wrong tokens, never forwarding them", async () => {
    const before = seen.length
    expect((await call("/api/projects", { token: null })).status).toBe(401)
    expect((await call("/api/projects", { token: "x".repeat(43) })).status).toBe(401)
    expect(seen.length).toBe(before)
  })

  test("forwards allowed routes with the real bearer, not the companion token", async () => {
    const res = await call("/api/projects/p1/pulls?state=open")
    expect(res.status).toBe(200)
    const last = seen.at(-1)!
    expect(last).toMatchObject({ method: "GET", path: "/api/projects/p1/pulls?state=open", auth: "Bearer REAL-SIDECAR-TOKEN" })
    expect(touched).toContain(tokens[0]!.id)
    const post = await call("/api/projects/p1/pulls/2/merge", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })
    expect(post.status).toBe(200)
    expect(seen.at(-1)).toMatchObject({ method: "POST", body: "{}" })
  })

  test("refuses everything outside the allow-list", async () => {
    const before = seen.length
    for (const [method, path] of [["PUT", "/api/ai/credentials"], ["GET", "/api/billing/status"], ["GET", "/api/companion"], ["DELETE", "/api/projects/p1"], ["GET", "/api/projects/p1/drawings"], ["POST", "/api/plugins/install"]] as const) {
      expect((await call(path, { method })).status).toBe(403)
    }
    expect(seen.length).toBe(before)
  })

  test("streams the assistant's SSE through unchanged", async () => {
    const res = await call("/api/ai/chat/stream", { method: "POST", body: JSON.stringify({ message: "hi" }) })
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(await res.text()).toBe('data: {"type":"delta","text":"hi"}\n\n')
  })

  test("a revoked token stops working immediately", async () => {
    const saved = tokens
    tokens = []
    expect((await call("/api/projects")).status).toBe(401)
    tokens = saved
    expect((await call("/api/projects")).status).toBe(200)
  })

  test("route policy", () => {
    expect(isCompanionRoute("GET", "/api/projects")).toBe(true)
    expect(isCompanionRoute("POST", "/api/projects")).toBe(false)
    expect(isCompanionRoute("GET", "/api/projects/x/vcs/log")).toBe(true)
    expect(isCompanionRoute("GET", "/api/projects/x/../../billing")).toBe(false)
    // GitHub sync needs the owner's GitHub token and is desktop-only.
    for (const path of ["remote", "push", "pull"]) expect(isCompanionRoute("POST", `/api/projects/x/vcs/${path}`)).toBe(false)
    expect(isCompanionRoute("POST", "/api/projects/x/vcs/commit")).toBe(true)
  })

  test("repeated failures are rate limited", async () => {
    const g = startGateway({ certificate: cert, port: 0, upstream: () => ({ port: upstream.port!, token: "t" }), tokens: async () => [] })
    try {
      const hit = () => fetch(`https://127.0.0.1:${g.port}/api/projects`, { headers: { authorization: "Bearer nope" }, tls: { rejectUnauthorized: false } } as RequestInit)
      for (let i = 0; i < 10; i++) expect((await hit()).status).toBe(401)
      expect((await hit()).status).toBe(429)
    } finally {
      g.stop()
    }
  })
})
