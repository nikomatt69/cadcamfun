import { expect, test } from "bun:test"
import { retryingWrites } from "../src/app/retrying-writes.ts"

type Step = Response | Error
/** A fetch that answers from a script and records what it was sent. */
const scripted = (steps: Step[]) => {
  const seen: Array<{ method: string; url: string; key: string | null; body: string }> = []
  const base = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    seen.push({ method: request.method, url: request.url, key: request.headers.get("idempotency-key"), body: await request.text() })
    const step = steps.shift() ?? new Response("exhausted", { status: 500 })
    if (step instanceof Error) throw step
    return step
  }, { preconnect: fetch.preconnect })
  return { base, seen }
}
const fast = { sleep: async () => undefined }
const post = (path = "/api/projects", body = '{"name":"A"}', extra: RequestInit = {}) => new Request(`http://127.0.0.1:3001${path}`, { method: "POST", body, headers: { "content-type": "application/json" }, ...extra })

test("a write lost to a network error is sent again with the same key and the whole body, and its answer returned", async () => {
  const { base, seen } = scripted([new TypeError("fetch failed"), new TypeError("fetch failed"), Response.json({ id: "p1" }, { status: 201 })])
  const response = await retryingWrites(base, fast)(post())
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ id: "p1" })
  expect(seen).toHaveLength(3)
  expect(new Set(seen.map((s) => s.key)).size).toBe(1)
  expect(seen[0]!.key).toMatch(/^[0-9a-f-]{36}$/)
  expect(seen.map((s) => s.body)).toEqual(['{"name":"A"}', '{"name":"A"}', '{"name":"A"}'])
})

test("a gateway answer (502, 503, 504) is retried; any other status, a 500 included, is returned at once", async () => {
  const gateway = scripted([new Response("", { status: 503 }), new Response("", { status: 502 }), Response.json({ ok: true })])
  expect((await retryingWrites(gateway.base, fast)(post())).status).toBe(200)
  expect(gateway.seen).toHaveLength(3)
  const refused = scripted([new Response("boom", { status: 500 }), Response.json({ ok: true })])
  expect((await retryingWrites(refused.base, fast)(post())).status).toBe(500)
  expect(refused.seen).toHaveLength(1)
  const conflict = scripted([new Response("", { status: 409 })])
  expect((await retryingWrites(conflict.base, fast)(post())).status).toBe(409)
})

test("the caller's own key is kept; the chat routes and streams are not touched", async () => {
  const own = scripted([Response.json({})])
  await retryingWrites(own.base, fast)(post("/api/projects", "{}", { headers: { "idempotency-key": "mine-1" } }))
  expect(own.seen[0]!.key).toBe("mine-1")

  const chat = scripted([new TypeError("fetch failed"), Response.json({})])
  await expect(retryingWrites(chat.base, fast)(post("/api/ai/chat", "{}"))).rejects.toThrow("fetch failed")
  expect(chat.seen).toHaveLength(1)
  expect(chat.seen[0]!.key).toBeNull()
})

test("after the last attempt the failure is surfaced: the last gateway answer, or the last network error", async () => {
  const three = { ...fast, attempts: 3 }
  const down = scripted([new Response("", { status: 503 }), new Response("", { status: 503 }), new Response("", { status: 504 })])
  expect((await retryingWrites(down.base, three)(post())).status).toBe(504)
  const dead = scripted([new TypeError("one"), new TypeError("two"), new TypeError("three")])
  await expect(retryingWrites(dead.base, three)(post())).rejects.toThrow("three")
  expect(dead.seen).toHaveLength(3)
})

test("an aborted request is not retried, and the waits double", async () => {
  const controller = new AbortController()
  const { base, seen } = scripted([new TypeError("fetch failed"), Response.json({})])
  controller.abort()
  await expect(retryingWrites(base, fast)(post("/api/projects", "{}", { signal: controller.signal }))).rejects.toThrow()
  expect(seen.length).toBeLessThanOrEqual(1)

  const waits: number[] = []
  const slow = scripted([new TypeError("a"), new TypeError("b"), Response.json({})])
  await retryingWrites(slow.base, { delayMs: 100, sleep: async (ms) => { waits.push(ms) } })(post())
  expect(waits).toEqual([100, 200])
})

test("a read that never got an answer, or got a gateway answer, is sent again; any other status is returned at once", async () => {
  const lost = scripted([new TypeError("fetch failed"), new TypeError("fetch failed"), Response.json([{ id: "p1" }])])
  const response = await retryingWrites(lost.base, fast)(new Request("http://127.0.0.1:3001/api/projects"))
  expect(await response.json()).toEqual([{ id: "p1" }])
  expect(lost.seen).toHaveLength(3)
  expect(lost.seen.every((s) => s.key === null)).toBe(true)
  for (const status of [404, 409, 500]) {
    const answered = scripted([new Response("", { status }), Response.json({})])
    expect((await retryingWrites(answered.base, fast)(new Request("http://127.0.0.1:3001/api/projects"))).status).toBe(status)
    expect(answered.seen).toHaveLength(1)
  }
})

test("a read answered 503 while the sidecar restarts is repeated until it is answered", async () => {
  const restarting = scripted([new Response("", { status: 503 }), new Response("", { status: 502 }), Response.json([])])
  expect((await retryingWrites(restarting.base, fast)(new Request("http://127.0.0.1:3001/api/projects"))).status).toBe(200)
  expect(restarting.seen).toHaveLength(3)
})

test("the default attempts wait out a restart, and the waits stop doubling at the cap", async () => {
  const waits: number[] = []
  const restart = scripted([new TypeError("a"), new TypeError("b"), new TypeError("c"), new TypeError("d"), Response.json({ ok: true })])
  const response = await retryingWrites(restart.base, { delayMs: 1000, maxDelayMs: 3000, sleep: async (ms) => { waits.push(ms) } })(new Request("http://127.0.0.1:3001/api/projects"))
  expect(response.status).toBe(200)
  expect(waits).toEqual([1000, 2000, 3000, 3000])
})

test("streams and chat writes are never repeated by this layer", async () => {
  for (const [path, method] of [["/api/events", "GET"], ["/api/projects/p1/events", "GET"], ["/api/ai/sessions/s1/stream", "GET"], ["/api/ai/chat/stream", "POST"]] as const) {
    const once = scripted([new TypeError("fetch failed"), Response.json({})])
    await expect(retryingWrites(once.base, fast)(new Request(`http://127.0.0.1:3001${path}`, { method, body: method === "POST" ? "{}" : undefined }))).rejects.toThrow("fetch failed")
    expect(once.seen).toHaveLength(1)
  }
})
