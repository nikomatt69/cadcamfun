import { afterEach, describe, expect, test } from "bun:test"
import {
  CLOUD_CLIENT_IP_HEADER, CLOUD_DEVICE_HEADER, CLOUD_INTERNAL_HEADER, CLOUD_TRANSFER_BODY_LIMIT, CLOUD_WORKSPACE_HEADER,
  cloudPairingLink, hashToken, isCloudRoute, isCompanionRoute, newToken, routePolicy, startGateway,
  type Gateway, type TokenRecord,
} from "../src/services/companion-gateway.ts"

const internal = "private-coordinator-credential-for-tests-only"
const workspaceId = "workspace_test_123"
const active: Gateway[] = []
const upstreams: ReturnType<typeof Bun.serve>[] = []
afterEach(() => { for (const gateway of active.splice(0)) gateway.stop(); for (const server of upstreams.splice(0)) server.stop(true) })

function fixture(options: { readonly persist?: () => Promise<void>; readonly response?: () => Response } = {}) {
  const seen: { path: string; identity: string | null; session: string | null; internal: string | null; body: string; device: string | null }[] = []
  const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    seen.push({ path: new URL(request.url).pathname, identity: request.headers.get("x-identity-token"), session: request.headers.get("x-session-token"), internal: request.headers.get(CLOUD_INTERNAL_HEADER), body: await request.text(), device: request.headers.get("x-cadcamfun-companion-device") })
    return options.response?.() ?? Response.json({ ok: true })
  } })
  upstreams.push(upstream)
  const grant = newToken()
  let records: TokenRecord[] = [{ id: grant.id, name: "Phone", hash: hashToken(grant.token), createdAt: "", lastSeen: null, userId: "owner-user" }]
  const enrolled: string[] = []
  const gateway = startGateway({
    port: 0, upstream: () => ({ port: upstream.port ?? 0, token: "private-core-token" }), tokens: async () => records,
    session: () => "must-never-fallback",
    hosted: {
      workspaceId, internalToken: internal,
      verifyIdentity: async (token) => {
        if (token !== "valid-owner-token") throw new Error("Wrong or expired identity")
        return { userId: "owner-user" }
      },
      enroll: async (name, token) => {
        expect(token).toBe("valid-owner-token")
        enrolled.push(name)
        return { id: grant.id, link: cloudPairingLink({ origin: "https://cloud.example.com", workspaceId, token: grant.token, name }) }
      },
      ...(options.persist ? { persist: options.persist } : {}),
    },
  })
  active.push(gateway)
  const call = (path: string, options: { method?: string; internal?: string | null; identity?: string | null; token?: string | null; json?: unknown; headers?: Record<string, string> } = {}) => {
    const headers = new Headers(options.headers)
    const coordinator = options.internal === undefined ? internal : options.internal
    const identity = options.identity === undefined ? "valid-owner-token" : options.identity
    const token = options.token === undefined ? grant.token : options.token
    if (coordinator !== null) headers.set(CLOUD_INTERNAL_HEADER, coordinator)
    if (identity !== null) headers.set("x-identity-token", identity)
    if (token !== null) headers.set("authorization", `Bearer ${token}`)
    if (options.json !== undefined) headers.set("content-type", "application/json")
    return fetch(`http://127.0.0.1:${gateway.port}${path}`, { method: options.method ?? "GET", headers, ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }) })
  }
  return { call, seen, enrolled, grant, setRecords: (value: TokenRecord[]) => { records = value } }
}

describe("hosted scoped gateway", () => {
  test("the internal HTTP listener refuses requests that did not come from its coordinator", async () => {
    const { call, seen } = fixture()
    expect((await call("/api/projects", { internal: null })).status).toBe(401)
    expect((await call("/api/projects", { internal: "not-the-coordinator" })).status).toBe(401)
    expect(seen).toHaveLength(0)
  })

  test("readiness is private and does not require enrollment or an account refresh", async () => {
    const { call } = fixture()
    expect((await call("/internal/ready", { internal: null, identity: null, token: null })).status).toBe(401)
    const ready = await call("/internal/ready", { identity: null, token: null })
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ ready: true, workspaceId })
  })

  test("missing, forged or expired identity never falls back to the paired local account", async () => {
    const { call, seen } = fixture()
    for (const identity of [null, "expired-owner-token", "other-account-token"]) expect((await call("/api/projects", { identity })).status).toBe(401)
    expect(seen).toHaveLength(0)
    const valid = await call("/api/projects", { headers: { "x-session-token": "forged-session", [CLOUD_CLIENT_IP_HEADER]: "192.0.2.1" } })
    expect(valid.status).toBe(200)
    expect(valid.headers.get(CLOUD_WORKSPACE_HEADER)).toBe(workspaceId)
    expect(valid.headers.get(CLOUD_DEVICE_HEADER)).toBeTruthy()
    expect(seen[0]).toMatchObject({ identity: "valid-owner-token", session: null, internal: null })
  })

  test("a valid owner still needs a current device grant bound to that account", async () => {
    const { call, seen, grant, setRecords } = fixture()
    expect((await call("/api/projects", { token: null })).status).toBe(401)
    setRecords([{ id: grant.id, name: "Wrong account", hash: hashToken(grant.token), createdAt: "", lastSeen: null, userId: "another-user" }])
    expect((await call("/api/projects")).status).toBe(403)
    setRecords([])
    expect((await call("/api/projects")).status).toBe(401)
    expect(seen).toHaveLength(0)
  })

  test("owner enrollment mints a cloud pairing without a certificate pin or device bearer", async () => {
    const { call, enrolled } = fixture()
    expect((await call("/internal/pair", { method: "POST", identity: null, token: null, json: { name: "iPhone" } })).status).toBe(401)
    const paired = await call("/internal/pair", { method: "POST", token: null, json: { name: " iPhone ", host: "https://attacker.example.com" } })
    expect(paired.status).toBe(201)
    const data = await paired.json() as { link: string }
    const link = new URL(data.link)
    expect(link.searchParams.get("mode")).toBe("cloud")
    expect(link.searchParams.get("workspace")).toBe(workspaceId)
    expect(link.searchParams.get("host")).toBe("https://cloud.example.com")
    expect(link.searchParams.has("fp")).toBe(false)
    expect(enrolled).toEqual(["iPhone"])
  })

  test("invalid enrollment bodies are refused without granting a token", async () => {
    const { call, enrolled } = fixture()
    for (const json of [{}, { name: "" }, { name: 12 }, { name: "x".repeat(61) }]) expect((await call("/internal/pair", { method: "POST", token: null, json })).status).toBe(400)
    expect(enrolled).toHaveLength(0)
  })

  test("transfer and delivery routes are hosted-only; credentials and administrator routes stay private", async () => {
    const { call, seen } = fixture()
    for (const [method, path] of [["GET", "/api/cloud/remote/projects"], ["GET", "/api/cloud/remote/projects/p1"], ["PUT", "/api/cloud/remote/projects/p1"], ["POST", "/api/cloud/remote/projects/p1/receipt"], ["GET", "/api/projects/p1/cloud/status"], ["POST", "/api/projects/p1/cloud/send"]] as const) {
      expect(isCompanionRoute(method, path)).toBe(false)
      expect(isCloudRoute(method, path)).toBe(true)
      expect((await call(path, { method, ...(method === "GET" ? {} : { json: {} }) })).status).toBe(200)
    }
    const before = seen.length
    for (const [method, path] of [["GET", "/api/cloud/connection"], ["PUT", "/api/cloud/connection"], ["GET", "/api/companion"], ["POST", "/api/companion/pair"], ["PUT", "/api/ai/credentials"]] as const) expect((await call(path, { method, ...(method === "GET" ? {} : { json: {} }) })).status).toBe(403)
    expect(seen).toHaveLength(before)
    expect(routePolicy("PUT", "/api/cloud/remote/projects/p1").maxBody).toBe(CLOUD_TRANSFER_BODY_LIMIT)
  })

  test("an HTTP local listener cannot accidentally be created by omitting TLS", () => {
    expect(() => startGateway({ port: 0, upstream: () => ({ port: 1, token: "t" }), tokens: async () => [] })).toThrow("pinned TLS certificate")
  })

  test("a successful mutation waits for its durability barrier before replying", async () => {
    const entered = Promise.withResolvers<void>()
    const durable = Promise.withResolvers<void>()
    const { call } = fixture({ persist: async () => { entered.resolve(); await durable.promise } })
    let responded = false
    const request = call("/api/projects/p1/cloud/send", { method: "POST", json: {} }).then((reply) => { responded = true; return reply })
    await entered.promise
    expect(responded).toBe(false)
    durable.resolve()
    expect((await request).status).toBe(200)
  })

  test("failed persistence never reports a successful mutation", async () => {
    const { call } = fixture({ persist: async () => { throw new Error("R2 unavailable") } })
    const reply = await call("/api/projects/p1/cloud/send", { method: "POST", json: {} })
    expect(reply.status).toBe(503)
    expect(reply.headers.get("x-cadcamfun-durability-failed")).toBe("1")
    expect(await reply.text()).not.toContain("ok")
  })

  test("complete SSE frames wait for durability and split frames retain exact text", async () => {
    const entered = Promise.withResolvers<void>()
    const durable = Promise.withResolvers<void>()
    const encoder = new TextEncoder()
    const text = 'data: {"text":"caffè"}\n\ndata: {"type":"done"}\n\n'
    const bytes = encoder.encode(text)
    const { call } = fixture({
      persist: async () => { entered.resolve(); await durable.promise },
      response: () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(bytes.slice(0, 21))
        controller.enqueue(bytes.slice(21, 26))
        controller.enqueue(bytes.slice(26))
        controller.close()
      } }), { headers: { "content-type": "text/event-stream" } }),
    })
    let read = false
    const body = call("/api/projects/p1/events").then(async (response) => {
      expect(response.headers.get("x-cadcamfun-durable-stream")).toBe("1")
      const value = await response.text()
      read = true
      return value
    })
    await entered.promise
    expect(read).toBe(false)
    durable.resolve()
    expect(await body).toBe(text)
  })
})
