import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { COMPANION_DEVICE_HEADER, generateCertificate, hashToken, isCompanionRoute, newToken, pairingHosts, pairingLink, rankAddress, reachableAddressesFrom, routePolicy, startGateway, fingerprintOf, TokenBucket, WRITE_BODY_LIMIT, type Gateway, type CompanionCertificate, type GatewayRequestLog, type TokenRecord } from "../src/services/companion-gateway.ts"

let upstream: ReturnType<typeof Bun.serve>
let gateway: Gateway
let cert: CompanionCertificate
let tokens: TokenRecord[]
let valid: string
const seen: Array<{ method: string; path: string; auth: string | null; body: string; device: string | null }> = []
const logs: GatewayRequestLog[] = []
const touched: string[] = []

beforeAll(async () => {
  upstream = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url)
      seen.push({ method: req.method, path: url.pathname + url.search, auth: req.headers.get("authorization"), body: await req.text(), device: req.headers.get(COMPANION_DEVICE_HEADER) })
      if (url.pathname === "/api/projects/slow") {
        await Bun.sleep(400)
        return Response.json({ late: true })
      }
      if (url.pathname === "/api/projects/p1/events") {
        // An SSE stream that greets at once, then stays open and silent past the read timeout.
        return new Response(new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode(": hi\n\n")); await Bun.sleep(300); c.enqueue(new TextEncoder().encode("data: {}\n\n")); c.close() } }), { headers: { "content-type": "text/event-stream" } })
      }
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
    log: (entry) => void logs.push(entry),
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

  test("ranks Wi-Fi above Personal Hotspot above Tailscale and drops public/cellular", () => {
    expect(rankAddress("192.168.1.20", "IPv4")).toBeGreaterThan(rankAddress("172.20.10.4", "IPv4"))
    expect(rankAddress("172.20.10.4", "IPv4")).toBeGreaterThan(rankAddress("100.64.96.71", "IPv4"))
    expect(rankAddress("10.0.0.5", 4)).toBeGreaterThan(rankAddress("100.64.96.71", 4))
    expect(rankAddress("8.8.8.8", "IPv4")).toBe(0)
    expect(rankAddress("fe80::1", "IPv6")).toBe(0)
    const hosts = reachableAddressesFrom([
      { address: "100.64.96.71", family: "IPv4", internal: false },
      { address: "172.20.10.4", family: "IPv4", internal: false },
      { address: "192.168.1.20", family: "IPv4", internal: false },
      { address: "127.0.0.1", family: "IPv4", internal: true },
      { address: "fd7a:115c:a1e0::1", family: "IPv6", internal: false },
    ])
    expect(hosts).toEqual(["192.168.1.20", "172.20.10.4", "100.64.96.71"])
  })

  test("the pairing link lists every private address so the phone can race them", () => {
    const link = pairingLink({ host: "192.168.1.20", port: 8443, token: valid, fingerprint: cert.fingerprint, name: "Studio", hosts: ["192.168.1.20", "172.20.10.4", "100.64.96.71"] })
    const url = new URL(link)
    expect(url.searchParams.get("host")).toBe("https://192.168.1.20:8443")
    expect(url.searchParams.get("hosts")).toBe("https://172.20.10.4:8443,https://100.64.96.71:8443")
    expect(pairingHosts("172.20.10.4")[0]).toBe("172.20.10.4")
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
    for (const [method, path] of [["PUT", "/api/ai/credentials"], ["GET", "/api/billing/status"], ["GET", "/api/companion"], ["DELETE", "/api/projects/p1"], ["GET", "/api/projects/p1/drawings"], ["POST", "/api/plugins/install"], ["DELETE", "/api/ai/sessions/s1"]] as const) {
      expect((await call(path, { method })).status).toBe(403)
    }
    expect(seen.length).toBe(before)
  })

  test("forwards session recovery and native question decisions", async () => {
    for (const path of ["sessions/state", "sessions/control"]) {
      expect((await call(`/api/ai/${path}`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } })).status).toBe(200)
      expect(seen.at(-1)).toMatchObject({ method: "POST", path: `/api/ai/${path}`, auth: "Bearer REAL-SIDECAR-TOKEN" })
    }
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

  test("the live event stream and the notification feed are reachable", () => {
    // The SSE stream is the phone's only push channel; without it the app can only be right after
    // a manual refresh.
    expect(isCompanionRoute("GET", "/api/projects/x/events")).toBe(true)
    // Notifications are the user's activity feed, shared with the desktop.
    expect(isCompanionRoute("GET", "/api/notifications")).toBe(true)
    expect(isCompanionRoute("POST", "/api/notifications/mark-all-read")).toBe(true)
    expect(isCompanionRoute("PUT", "/api/notifications/n1")).toBe(true)
    expect(isCompanionRoute("DELETE", "/api/notifications/n1")).toBe(true)
    expect(isCompanionRoute("GET", "/api/ai/agents")).toBe(true)
    expect(isCompanionRoute("PUT", "/api/ai/agents")).toBe(false)
    // The conversation list and history are read-only for the phone.
    expect(isCompanionRoute("GET", "/api/ai/sessions")).toBe(true)
    expect(isCompanionRoute("GET", "/api/ai/sessions/ses_1/messages")).toBe(true)
    expect(isCompanionRoute("POST", "/api/ai/sessions/ses_1/messages")).toBe(false)
    expect(isCompanionRoute("DELETE", "/api/ai/sessions")).toBe(false)
    expect(isCompanionRoute("POST", "/api/ai/sessions/remove")).toBe(false)
    // Creating a notification is the desktop's job, never the phone's.
    expect(isCompanionRoute("POST", "/api/notifications")).toBe(false)
    // The gateway's own admin surface stays unreachable.
    expect(isCompanionRoute("GET", "/api/companion/devices")).toBe(false)
  })

  test("workspace preview is read-only and the stored document routes stay closed", () => {
    const project = "/api/projects/proj"
    for (const path of [
      `${project}/workspace/drawings`,
      `${project}/workspace/drawings/d1/preview`,
      `${project}/workspace/components`,
      `${project}/workspace/components/c1/preview`,
      `${project}/workspace/toolpaths`,
      `${project}/workspace/toolpaths/t1`,
      `${project}/workspace/toolpaths/t1/preview`,
      `${project}/workspace/library`,
    ]) {
      expect(isCompanionRoute("GET", path)).toBe(true)
      expect(isCompanionRoute("POST", path)).toBe(false)
      expect(isCompanionRoute("PUT", path)).toBe(false)
      expect(isCompanionRoute("DELETE", path)).toBe(false)
    }
    // The existing document routes embed the CAD JSON. The phone uses the workspace summaries instead.
    expect(isCompanionRoute("GET", `${project}/drawings`)).toBe(false)
    expect(isCompanionRoute("PUT", `${project}/drawings/d1`)).toBe(false)
    expect(isCompanionRoute("POST", "/api/drawings/d1")).toBe(false)
    expect(isCompanionRoute("GET", "/api/library")).toBe(false)
    expect(isCompanionRoute("POST", "/api/toolpaths/parse")).toBe(false)
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

  test("the device id reaches the sidecar for the audit trail and cannot be spoofed by the phone", async () => {
    await call("/api/projects", { headers: { [COMPANION_DEVICE_HEADER]: "someone-else" } })
    expect(seen.at(-1)?.device).toBe(tokens[0]!.id)
  })

  test("every request is logged with device, route, status and duration, never the token or the query", async () => {
    logs.length = 0
    await call("/api/projects/p1/pulls?secret=1")
    await call("/api/billing/status")
    await call("/api/projects", { token: "y".repeat(43) })
    expect(logs.map((entry) => [entry.path, entry.status, entry.reason ?? null])).toEqual([
      ["/api/projects/p1/pulls", 200, null],
      ["/api/billing/status", 403, "forbidden"],
      ["/api/projects", 401, "unauthorized"],
    ])
    expect(logs[0]).toMatchObject({ device: tokens[0]!.id, method: "GET", kind: "read" })
    expect(logs[2]!.device).toBeNull()
    expect(logs.every((entry) => entry.ms >= 0)).toBe(true)
    expect(JSON.stringify(logs)).not.toContain(valid)
    expect(JSON.stringify(logs)).not.toContain("secret")
  })

  test("route policy: streams never time out, writes and prompts have their own body limits", () => {
    expect(routePolicy("GET", "/api/ai/sessions/s1/stream")).toMatchObject({ kind: "stream", timeoutMs: undefined })
    expect(routePolicy("GET", "/api/projects/p/events")).toMatchObject({ kind: "stream", timeoutMs: undefined })
    expect(routePolicy("POST", "/api/ai/chat/stream").kind).toBe("stream")
    expect(routePolicy("GET", "/api/projects/p/workspace/drawings/d/preview")).toMatchObject({ kind: "read", maxBody: 0 })
    expect(routePolicy("POST", "/api/projects/p/vcs/commit")).toMatchObject({ kind: "write", maxBody: WRITE_BODY_LIMIT })
    expect(routePolicy("POST", "/api/ai/sessions/prompt").maxBody).toBeGreaterThan(30 * 1024 * 1024)
  })

  test("an oversized body is refused with 413 before it reaches the desktop, declared or chunked", async () => {
    const before = seen.length
    const big = "x".repeat(WRITE_BODY_LIMIT + 1)
    expect((await call("/api/projects/p1/vcs/commit", { method: "POST", body: big, headers: { "content-type": "application/json" } })).status).toBe(413)
    const chunked = new ReadableStream({ start(c) { for (let i = 0; i < 3; i++) c.enqueue(new TextEncoder().encode("y".repeat(WRITE_BODY_LIMIT / 2))); c.close() } })
    expect((await call("/api/projects/p1/vcs/commit", { method: "POST", body: chunked, headers: { "content-type": "application/json" } })).status).toBe(413)
    expect(seen.length).toBe(before)
  })

  test("a slow desktop answer is a 504 on a read route, while a quiet stream stays open", async () => {
    const t = newToken()
    const g = startGateway({ certificate: cert, port: 0, upstream: () => ({ port: upstream.port!, token: "t" }), tokens: async () => [{ id: t.id, name: "p", hash: hashToken(t.token), createdAt: "", lastSeen: null }], timeouts: { readMs: 150 } })
    try {
      const get = (path: string) => fetch(`https://127.0.0.1:${g.port}${path}`, { headers: { authorization: `Bearer ${t.token}` }, tls: { rejectUnauthorized: false } } as RequestInit)
      const slow = await get("/api/projects/slow")
      expect(slow.status).toBe(504)
      expect((await slow.json()).message).toContain("too long")
      const stream = await get("/api/projects/p1/events")
      expect(stream.status).toBe(200)
      expect(await stream.text()).toBe(": hi\n\ndata: {}\n\n")
    } finally {
      g.stop()
    }
  })

  test("per-device budgets: writes and open streams are capped with 429 and Retry-After, other devices unaffected", async () => {
    const a = newToken()
    const b = newToken()
    const records = [a, b].map((t) => ({ id: t.id, name: "p", hash: hashToken(t.token), createdAt: "", lastSeen: null }))
    const g = startGateway({
      certificate: cert, port: 0, upstream: () => ({ port: upstream.port!, token: "t" }), tokens: async () => records,
      limits: { requests: { capacity: 100, perSecond: 1 }, writes: { capacity: 2, perSecond: 0.01 }, streams: 1 },
    })
    try {
      const send = (token: string, path: string, method = "GET") => fetch(`https://127.0.0.1:${g.port}${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(method === "GET" ? {} : { body: "{}" }), tls: { rejectUnauthorized: false } } as RequestInit)
      expect((await send(a.token, "/api/notifications/mark-all-read", "POST")).status).toBe(200)
      expect((await send(a.token, "/api/notifications/mark-all-read", "POST")).status).toBe(200)
      const limited = await send(a.token, "/api/notifications/mark-all-read", "POST")
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)
      // Reads still pass, and another phone has its own budget.
      expect((await send(a.token, "/api/projects")).status).toBe(200)
      expect((await send(b.token, "/api/notifications/mark-all-read", "POST")).status).toBe(200)

      const open = await send(a.token, "/api/projects/p1/events")
      expect(open.status).toBe(200)
      expect((await send(a.token, "/api/projects/p1/events")).status).toBe(429)
      await open.text()
      // The slot is released once the first stream ends.
      const again = await send(a.token, "/api/projects/p1/events")
      expect(again.status).toBe(200)
      await again.text()
    } finally {
      g.stop()
    }
  })

  test("the token bucket refills over time", () => {
    const bucket = new TokenBucket(1, 2, 0)
    expect(bucket.take(0).ok).toBe(true)
    const refused = bucket.take(0)
    expect(refused.ok).toBe(false)
    expect(bucket.take(600).ok).toBe(true)
  })
})
